import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  getActiveSessionUser,
  getCurrentUser,
  getAccessibleProjectIds,
  canAccessProject,
  getWriteAccessError,
} from "@/lib/auth";
import prisma from "@/lib/prisma";

const defectSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  reproSteps: z.string().optional(),
  expectedResult: z.string().optional(),
  actualResult: z.string().optional(),
  severity: z.enum(["Low", "Medium", "High", "Critical"]).default("Medium"),
  priority: z.enum(["Low", "Medium", "High", "Critical"]).default("Medium"),
  status: z.enum(["Open", "InProgress", "Resolved", "Closed"]).default("Open"),
  testCaseId: z.string().optional().nullable(),
  projectId: z.string().min(1, "Project ID is required"),
});

const querySchema = z
  .object({
    search: z.string().optional(),
    status: z.string().optional(),
    severity: z.string().optional(),
    priority: z.string().optional(),
    testCaseId: z.string().optional(),
    projectId: z.string().optional(),
    sortBy: z.string().default("createdAt"),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
    page: z.string().default("1"),
    pageSize: z.string().default("20"),
  })
  .partial();

export async function GET(request: NextRequest) {
  try {
    const session = await getActiveSessionUser(request);
    if (!session) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const raw = Object.fromEntries(searchParams.entries());
    const parsed = querySchema.safeParse(raw);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid query parameters", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const {
      search,
      status,
      severity,
      priority,
      testCaseId,
      projectId,
      sortBy = "createdAt",
      sortOrder = "desc",
      page = "1",
      pageSize = "20",
    } = parsed.data;

    if (projectId && !(await canAccessProject(session, projectId))) {
      return NextResponse.json(
        { error: "You do not have access to this project" },
        { status: 403 }
      );
    }

    const accessibleProjectIds = await getAccessibleProjectIds(session);
    const where: Record<string, unknown> = {
      OR: [
        { reportedById: session.userId },
        { projectId: { in: accessibleProjectIds } },
      ],
    };

    if (projectId) {
      where.projectId = projectId;
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" as const } },
        { description: { contains: search, mode: "insensitive" as const } },
      ];
    }

    if (status) {
      where.status = status;
    }

    if (severity) {
      where.severity = severity;
    }

    if (priority) {
      where.priority = priority;
    }

    if (testCaseId) {
      where.testCaseId = testCaseId;
    }

    const take = Math.min(parseInt(pageSize, 10), 100);
    const skip = (parseInt(page, 10) - 1) * take;

    const [defects, total] = await prisma.$transaction([
      prisma.defect.findMany({
        where,
        include: {
          testCase: { select: { id: true, testCaseId: true, title: true } },
          reportedBy: { select: { id: true, name: true, email: true } },
          assignee: { select: { id: true, name: true, email: true } },
        },
        orderBy: { [sortBy]: sortOrder },
        skip,
        take,
      }),
      prisma.defect.count({ where }),
    ]);

    return NextResponse.json({
      data: defects,
      meta: {
        total,
        page: parseInt(page, 10),
        pageSize: take,
        totalPages: Math.ceil(total / take),
      },
    });
  } catch (error) {
    console.error("GET /api/defects error:", error);
    return NextResponse.json({ error: "Failed to fetch defects" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getActiveSessionUser(request);
    if (!session) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    const writeError = getWriteAccessError(session);
    if (writeError) return writeError;

    const body = await request.json();
    const parsed = defectSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const user = await getCurrentUser(session.userId);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // If testCaseId is provided, verify it exists
    if (parsed.data.testCaseId) {
      const testCase = await prisma.testCase.findUnique({
        where: { id: parsed.data.testCaseId },
      });
      if (!testCase) {
        return NextResponse.json(
          { error: `Test case "${parsed.data.testCaseId}" not found` },
          { status: 404 }
        );
      }
    }

    const defect = await prisma.defect.create({
      data: {
        title: parsed.data.title,
        description: parsed.data.description ?? null,
        reproSteps: parsed.data.reproSteps ?? null,
        expectedResult: parsed.data.expectedResult ?? null,
        actualResult: parsed.data.actualResult ?? null,
        severity: parsed.data.severity,
        priority: parsed.data.priority,
        status: parsed.data.status,
        testCaseId: parsed.data.testCaseId ?? null,
        projectId: parsed.data.projectId,
        reportedById: user.id,
      },
      include: {
        testCase: { select: { id: true, testCaseId: true, title: true } },
        reportedBy: { select: { id: true, name: true, email: true } },
        assignee: { select: { id: true, name: true, email: true } },
      },
    });

    return NextResponse.json(defect, { status: 201 });
  } catch (error) {
    console.error("POST /api/defects error:", error);
    return NextResponse.json({ error: "Failed to create defect" }, { status: 500 });
  }
}
