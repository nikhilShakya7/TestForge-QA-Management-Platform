import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  canAccessProject,
  getActiveSessionUser,
  getWriteAccessError,
} from "@/lib/auth";
import prisma from "@/lib/prisma";

const updateTestCaseSchema = z.object({
  title: z.string().min(1, "Title is required").optional(),
  description: z.string().optional().nullable(),
  preconditions: z.string().optional().nullable(),
  steps: z.string().min(1, "Steps are required").optional(),
  expectedResult: z.string().min(1, "Expected result is required").optional(),
  priority: z.enum(["Low", "Medium", "High", "Critical"]).optional(),
  status: z.enum(["Draft", "Active", "Archived"]).optional(),
  suiteId: z.string().optional().nullable(),
  projectId: z.string().min(1, "Project ID is required").optional(),
});

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Require authentication
    const session = await getActiveSessionUser(request);
    if (!session) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }
    const writeError = getWriteAccessError(session);
    if (writeError) return writeError;

    const { id } = await params;

    // Check if the test case exists AND belongs to the authenticated user
    const existing = await prisma.testCase.findUnique({
      where: { id, createdById: session.userId },
    });

    if (!existing) {
      return NextResponse.json(
        { error: `Test case with id "${id}" not found` },
        { status: 404 }
      );
    }

    // Check if test executions reference this test case
    const executionCount = await prisma.testExecution.count({
      where: { testCaseId: id },
    });

    if (executionCount > 0) {
      return NextResponse.json(
        {
          error: `Cannot delete test case "${existing.testCaseId}": it is referenced by ${executionCount} test execution(s). Remove those executions first.`,
        },
        { status: 409 }
      );
    }

    // Check if defects reference this test case
    const defectCount = await prisma.defect.count({
      where: { testCaseId: id },
    });

    if (defectCount > 0) {
      return NextResponse.json(
        {
          error: `Cannot delete test case "${existing.testCaseId}": it is referenced by ${defectCount} defect(s). Remove those defects first.`,
        },
        { status: 409 }
      );
    }

    await prisma.testCase.delete({
      where: { id },
    });

    return NextResponse.json({ message: "Test case deleted successfully" });
  } catch (error) {
    console.error("DELETE /api/test-cases/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to delete test case" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/test-cases/[id]
 * Get a single test case by ID.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getActiveSessionUser(request);
    if (!session) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }
    const { id } = await params;

    const testCase = await prisma.testCase.findUnique({
      where: { id },
      include: {
        suite: { select: { id: true, name: true } },
        project: { select: { id: true, name: true, key: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        executions: {
          include: {
            executedBy: { select: { id: true, name: true, email: true } },
          },
          orderBy: { executedAt: "desc" },
        },
      },
    });

    if (!testCase) {
      return NextResponse.json(
        { error: `Test case "${id}" not found` },
        { status: 404 }
      );
    }

    if (
      testCase.projectId
        ? !(await canAccessProject(session, testCase.projectId))
        : testCase.createdById !== session.userId
    ) {
      return NextResponse.json(
        { error: "You do not have access to this test case" },
        { status: 403 }
      );
    }

    return NextResponse.json(testCase);
  } catch (error) {
    console.error("GET /api/test-cases/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to fetch test case" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/test-cases/[id]
 * Update an existing test case. Historical execution results are preserved.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;

    const body = await request.json();
    const parsed = updateTestCaseSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // Check if the test case exists AND belongs to the authenticated user
    const existing = await prisma.testCase.findUnique({
      where: { id, createdById: session.userId },
    });

    if (!existing) {
      return NextResponse.json(
        { error: `Test case with id "${id}" not found` },
        { status: 404 }
      );
    }

    // If suiteId is provided and changed, verify the suite exists
    if (parsed.data.suiteId !== undefined && parsed.data.suiteId !== null) {
      const suite = await prisma.testSuite.findUnique({
        where: { id: parsed.data.suiteId },
      });
      if (!suite) {
        return NextResponse.json(
          { error: `Test suite with id "${parsed.data.suiteId}" not found` },
          { status: 404 }
        );
      }
    }

    // If projectId is provided, verify the project exists
    if (parsed.data.projectId !== undefined && parsed.data.projectId !== null) {
      const project = await prisma.project.findUnique({
        where: { id: parsed.data.projectId },
      });
      if (!project) {
        return NextResponse.json(
          { error: `Project with id "${parsed.data.projectId}" not found` },
          { status: 404 }
        );
      }
    }

    const updatedTestCase = await prisma.testCase.update({
      where: { id },
      data: {
        ...(parsed.data.title !== undefined && { title: parsed.data.title }),
        ...(parsed.data.description !== undefined && {
          description: parsed.data.description,
        }),
        ...(parsed.data.preconditions !== undefined && {
          preconditions: parsed.data.preconditions,
        }),
        ...(parsed.data.steps !== undefined && { steps: parsed.data.steps }),
        ...(parsed.data.expectedResult !== undefined && {
          expectedResult: parsed.data.expectedResult,
        }),
        ...(parsed.data.priority !== undefined && {
          priority: parsed.data.priority,
        }),
        ...(parsed.data.status !== undefined && { status: parsed.data.status }),
        ...(parsed.data.suiteId !== undefined && {
          suiteId: parsed.data.suiteId,
        }),
        ...(parsed.data.projectId !== undefined && {
          projectId: parsed.data.projectId,
        }),
      },
      include: {
        suite: { select: { id: true, name: true } },
        project: { select: { id: true, name: true, key: true } },
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });

    return NextResponse.json(updatedTestCase);
  } catch (error) {
    console.error("PATCH /api/test-cases/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to update test case" },
      { status: 500 }
    );
  }
}
