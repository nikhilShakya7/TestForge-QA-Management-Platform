import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getActiveSessionUser } from "@/lib/auth";
import prisma from "@/lib/prisma";

const testRunSchema = z.object({
  name: z.string().min(1, "Test run name is required"),
  description: z.string().optional(),
  suiteId: z.string().optional().nullable(),
  projectId: z.string().min(1, "Project ID is required"),
});

export async function GET(request: NextRequest) {
  try {
    const session = await getActiveSessionUser(request);
    if (!session) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const suiteId = searchParams.get("suiteId") || undefined;
    const status = searchParams.get("status") || undefined;
    const projectId = searchParams.get("projectId") || undefined;

    const testRuns = await prisma.testRun.findMany({
      relationLoadStrategy: "join",
      where: {
        createdById: session.userId,
        ...(projectId ? { projectId } : {}),
        ...(suiteId ? { suiteId } : {}),
        ...(status ? { status } : {}),
      },
      include: {
        suite: {
          select: {
            id: true,
            name: true,
          },
        },
        project: {
          select: {
            _count: { select: { testCases: true } },
          },
        },
        createdBy: { select: { id: true, name: true, email: true } },
        _count: { select: { executions: true } },
        executions: {
          select: {
            status: true,
            executedAt: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Add execution status breakdown to each test run
    const testRunsWithStats = testRuns.map((run) => {
      const executions = run.executions as Array<{
        status: string;
        executedAt: Date;
      }>;
      const passed = executions.filter(
        (execution) => execution.status.trim().toLowerCase() === "passed"
      ).length;
      const failed = executions.filter(
        (execution) => execution.status.trim().toLowerCase() === "failed"
      ).length;
      const blocked = executions.filter(
        (execution) => execution.status.trim().toLowerCase() === "blocked"
      ).length;

      return {
        ...run,
        executions: undefined, // Remove raw executions from response
        lastExecutedAt: executions.reduce<Date | null>(
          (latest, execution) =>
            !latest || execution.executedAt > latest
              ? execution.executedAt
              : latest,
          null
        ),
        _count: {
          ...run._count,
          executions_by_status: { passed, failed, blocked },
        },
      };
    });

    return NextResponse.json(testRunsWithStats);
  } catch (error) {
    console.error("GET /api/test-runs error:", error);
    return NextResponse.json({ error: "Failed to fetch test runs" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getActiveSessionUser(request);
    if (!session) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = testRunSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // Create the test run - allow all authenticated users (SUPER_ADMIN, PROJECT_ADMIN, QA_TESTER, VIEWER)
    const testRun = await prisma.testRun.create({
      data: {
        name: parsed.data.name,
        description: parsed.data.description,
        suiteId: parsed.data.suiteId,
        projectId: parsed.data.projectId,
        createdById: session.userId,
      },
      include: {
        suite: {
          select: {
            id: true,
            name: true,
          },
        },
        project: {
          select: {
            _count: { select: { testCases: true } },
          },
        },
        createdBy: { select: { id: true, name: true, email: true } },
        _count: { select: { executions: true } },
        executions: {
          select: {
            status: true,
            executedAt: true,
          },
        },
      },
    });

    return NextResponse.json(testRun);
  } catch (error) {
    console.error("POST /api/test-runs error:", error);
    return NextResponse.json({ error: "Failed to create test run" }, { status: 500 });
  }
}
