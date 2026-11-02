import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  getActiveSessionUser,
  getCurrentUser,
  getWriteAccessError,
} from "@/lib/auth";
import prisma from "@/lib/prisma";

/**
 * Validation schema for creating/updating a test case.
 * Steps are stored as a JSON string in the database.
 */
const testCaseSchema = z.object({
  testCaseId: z.string().min(1, "Test case ID is required"),
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  preconditions: z.string().optional(),
  steps: z.string().min(1, "Steps are required"),
  expectedResult: z.string().min(1, "Expected result is required"),
  priority: z.enum(["Low", "Medium", "High", "Critical"]).default("Medium"),
  status: z.enum(["Draft", "Active", "Archived"]).default("Draft"),
  suiteId: z.string().optional().nullable(),
  projectId: z.string().min(1, "Project ID is required"),
});

/**
 * Validation for query parameters on GET.
 */
const querySchema = z
  .object({
    search: z.string().optional(),
    priority: z.string().optional(),
    status: z.string().optional(),
    suiteId: z.string().optional(),
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
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
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
      priority,
      status,
      suiteId,
      projectId,
      sortBy = "createdAt",
      sortOrder = "desc",
      page = "1",
      pageSize = "20",
    } = parsed.data;

    const where: Record<string, unknown> = {
      createdById: session.userId,
    };

    if (projectId) {
      where.projectId = projectId;
    }

    if (search) {
      where.OR = [
        { testCaseId: { contains: search, mode: "insensitive" as const } },
        { title: { contains: search, mode: "insensitive" as const } },
        { description: { contains: search, mode: "insensitive" as const } },
      ];
    }

    if (priority) {
      where.priority = priority;
    }

    if (status) {
      where.status = status;
    }

    if (suiteId) {
      where.suiteId = suiteId;
    }

    const take = Math.min(parseInt(pageSize, 10), 100);
    const skip = (parseInt(page, 10) - 1) * take;

    const [testCases, total] = await Promise.all([
      prisma.testCase.findMany({
        relationLoadStrategy: "join",
        where,
        include: {
          suite: { select: { id: true, name: true } },
          createdBy: { select: { id: true, name: true, email: true } },
        },
        orderBy: { [sortBy]: sortOrder },
        skip,
        take,
      }),
      prisma.testCase.count({ where }),
    ]);

    return NextResponse.json({
      data: testCases,
      meta: {
        total,
        page: parseInt(page, 10),
        pageSize: take,
        totalPages: Math.ceil(total / take),
      },
    });
  } catch (error) {
    console.error("GET /api/test-cases error:", error);
    return NextResponse.json(
      { error: "Failed to fetch test cases" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = testCaseSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { suiteId, ...data } = parsed.data;

    // Resolve the authenticated user from the session cookie
    const session = await getActiveSessionUser(request);
    if (!session) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }
    

    const [existing, suite, user] = await Promise.all([
      prisma.testCase.findUnique({
        where: { testCaseId: data.testCaseId },
      }),
      suiteId
        ? prisma.testSuite.findUnique({ where: { id: suiteId } })
        : Promise.resolve(null),
      getCurrentUser(session.userId),
    ]);

    if (existing) {
      return NextResponse.json(
        { error: `Test case ID "${data.testCaseId}" already exists` },
        { status: 409 }
      );
    }

    if (suiteId && !suite) {
      return NextResponse.json(
        { error: `Test suite with id "${suiteId}" not found` },
        { status: 404 }
      );
    }

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const testCase = await prisma.testCase.create({
      data: {
        ...data,
        suiteId: suiteId ?? null,
        projectId: data.projectId,
        createdById: user.id,
      },
      include: {
        suite: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });

    return NextResponse.json(testCase, { status: 201 });
  } catch (error) {
    console.error("POST /api/test-cases error:", error);
    return NextResponse.json(
      { error: "Failed to create test case" },
      { status: 500 }
    );
  }
}
