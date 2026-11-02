import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getActiveSessionUser, getCurrentUser, getWriteAccessError } from "@/lib/auth";
import prisma from "@/lib/prisma";

const projectSchema = z.object({
  name: z.string().min(1, "Project name is required").max(100, "Name too long"),
  key: z
    .string()
    .min(1, "Project key is required")
    .max(10, "Key too long")
    .regex(
      /^[A-Z0-9]+$/,
      "Key must be uppercase alphanumeric (e.g. ECM, SMS)"
    ),
  description: z.string().max(500, "Description too long").optional(),
  status: z.enum(["ACTIVE", "ARCHIVED"]).default("ACTIVE"),
});

const querySchema = z
  .object({
    search: z.string().optional(),
    status: z.string().optional(),
    sortBy: z.string().default("createdAt"),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
    page: z.string().default("1"),
    pageSize: z.string().default("20"),
  })
  .partial();

/**
 * GET /api/projects
 * List all projects for the authenticated user with optional search, filter, sort, and pagination.
 */
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
      status,
      sortBy = "createdAt",
      sortOrder = "desc",
      page = "1",
      pageSize = "20",
    } = parsed.data;

    const where: Record<string, unknown> =
      session.role === "SUPER_ADMIN"
        ? {}
        : {
            OR: [
              { createdById: session.userId },
              { projectMembers: { some: { userId: session.userId } } },
            ],
          };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" as const } },
        { key: { contains: search, mode: "insensitive" as const } },
        { description: { contains: search, mode: "insensitive" as const } },
      ];
    }

    if (status) {
      where.status = status;
    }

    const take = Math.min(parseInt(pageSize, 10), 100);
    const skip = (parseInt(page, 10) - 1) * take;

    const [projects, total] = await prisma.$transaction([
      prisma.project.findMany({
        where,
        include: {
          _count: {
            select: {
              testCases: true,
              testRuns: true,
              defects: true,
            },
          },
          createdBy: { select: { id: true, name: true, email: true } },
        },
        orderBy: { [sortBy]: sortOrder },
        skip,
        take,
      }),
      prisma.project.count({ where }),
    ]);

    const projectIds = projects.map((project) => project.id);
    const testRuns = projectIds.length
      ? await prisma.testRun.findMany({
          where: {
            projectId: { in: projectIds },
          },
          select: { id: true, projectId: true },
        })
      : [];
    const runProjectIds = new Map(
      testRuns.map((run) => [run.id, run.projectId])
    );
    const executionGroups = testRuns.length
      ? await prisma.testExecution.groupBy({
          by: ["testRunId", "status"],
          _count: { _all: true },
          where: { testRunId: { in: testRuns.map((run) => run.id) } },
        })
      : [];
    const executionMetrics = new Map<
      string,
      { total: number; passed: number }
    >();
    for (const group of executionGroups) {
      const projectId = runProjectIds.get(group.testRunId);
      if (!projectId) continue;

      const metrics = executionMetrics.get(projectId) ?? {
        total: 0,
        passed: 0,
      };
      metrics.total += group._count._all;
      if (group.status.trim().toLowerCase() === "passed") {
        metrics.passed += group._count._all;
      }
      executionMetrics.set(projectId, metrics);
    }

    return NextResponse.json({
      data: projects.map((project) => {
        const metrics = executionMetrics.get(project.id);
        return {
          ...project,
          passRate: metrics?.total
            ? Math.round((metrics.passed / metrics.total) * 100)
            : 0,
        };
      }),
      meta: {
        total,
        page: parseInt(page, 10),
        pageSize: take,
        totalPages: Math.ceil(total / take),
      },
    });
  } catch (error) {
    console.error("GET /api/projects error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch projects" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/projects
 * Create a new project.
 * Only SUPER_ADMIN and PROJECT_ADMIN can create projects.
 * QA_TESTER and VIEWER cannot create projects.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getActiveSessionUser(request);
    if (!session) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }
    const writeError = getWriteAccessError(session);
    if (writeError) return writeError;

    const body = await request.json();
    const parsed = projectSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // Check for duplicate key
    const existingKey = await prisma.project.findUnique({
      where: { key: parsed.data.key },
    });

    if (existingKey) {
      return NextResponse.json(
        { error: `Project key "${parsed.data.key}" already exists` },
        { status: 409 }
      );
    }

    const user = await getCurrentUser(session.userId);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const project = await prisma.project.create({
      data: {
        name: parsed.data.name,
        key: parsed.data.key,
        description: parsed.data.description ?? null,
        status: parsed.data.status,
        createdById: user.id,
      },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });

    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    console.error("POST /api/projects error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create project" },
      { status: 500 }
    );
  }
}
