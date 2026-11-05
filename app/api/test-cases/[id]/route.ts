import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  canAccessProject,
  getActiveSessionUser,
  getWriteAccessError,
} from "@/lib/auth";
import prisma from "@/lib/prisma";

const updateTestCaseSchema = z.object({
  testCaseId: z.string().min(1, "Test case ID is required").optional(),
  title: z.string().min(1, "Title is required").optional(),
  description: z.string().nullable().optional(),
  preconditions: z.string().nullable().optional(),
  steps: z.string().min(1, "Steps are required").optional(),
  expectedResult: z.string().min(1, "Expected result is required").optional(),
  priority: z.enum(["Low", "Medium", "High", "Critical"]).optional(),
  status: z.enum(["Draft", "Active", "Archived"]).optional(),
  suiteId: z.string().nullable().optional(),
  projectId: z.string().min(1, "Project ID is required").optional(),
});

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
        { error: `Test case with id "${id}" not found` },
        { status: 404 }
      );
    }

    const canAccessTestCase = testCase.projectId
      ? await canAccessProject(session, testCase.projectId)
      : testCase.createdById === session.userId;
    if (!canAccessTestCase) {
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

    const parsed = updateTestCaseSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { id } = await params;
    const existing = await prisma.testCase.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: `Test case with id "${id}" not found` },
        { status: 404 }
      );
    }

    const canAccessTestCase = existing.projectId
      ? await canAccessProject(session, existing.projectId)
      : existing.createdById === session.userId;
    if (!canAccessTestCase) {
      return NextResponse.json(
        { error: "You do not have access to update this test case" },
        { status: 403 }
      );
    }

    const { projectId, suiteId, testCaseId, ...fields } = parsed.data;
    const targetProjectId = projectId ?? existing.projectId;
    if (targetProjectId) {
      const targetProject = await prisma.project.findUnique({
        where: { id: targetProjectId },
        select: { id: true },
      });
      if (!targetProject) {
        return NextResponse.json(
          { error: `Project with id "${targetProjectId}" not found` },
          { status: 404 }
        );
      }
      if (!(await canAccessProject(session, targetProjectId))) {
        return NextResponse.json(
          { error: "You do not have access to the selected project" },
          { status: 403 }
        );
      }
    }

    if (testCaseId && testCaseId !== existing.testCaseId) {
      const duplicate = await prisma.testCase.findUnique({
        where: { testCaseId },
        select: { id: true },
      });
      if (duplicate) {
        return NextResponse.json(
          { error: `Test case ID "${testCaseId}" already exists` },
          { status: 409 }
        );
      }
    }

    const targetSuiteId = suiteId !== undefined ? suiteId : existing.suiteId;
    if (targetSuiteId) {
      const suite = await prisma.testSuite.findUnique({
        where: { id: targetSuiteId },
        select: { id: true, projectId: true },
      });
      if (!suite) {
        return NextResponse.json(
          { error: `Test suite with id "${targetSuiteId}" not found` },
          { status: 404 }
        );
      }
      if (suite.projectId !== targetProjectId) {
        return NextResponse.json(
          { error: "The selected test suite does not belong to this project" },
          { status: 400 }
        );
      }
    }

    const testCase = await prisma.testCase.update({
      where: { id },
      data: {
        ...fields,
        ...(testCaseId !== undefined ? { testCaseId } : {}),
        ...(projectId !== undefined ? { projectId } : {}),
        ...(suiteId !== undefined ? { suiteId } : {}),
      },
      include: {
        suite: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });

    return NextResponse.json(testCase);
  } catch (error) {
    console.error("PATCH /api/test-cases/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to update test case" },
      { status: 500 }
    );
  }
}

export async function DELETE(
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

    // Check if test case exists
    const existing = await prisma.testCase.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: `Test case with id "${id}" not found` },
        { status: 404 }
      );
    }

    const canAccessTestCase = existing.projectId
      ? await canAccessProject(session, existing.projectId)
      : existing.createdById === session.userId;
    if (!canAccessTestCase) {
      return NextResponse.json(
        { error: "You do not have access to delete this test case" },
        { status: 403 }
      );
    }

    // Check if test case is referenced by executions
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

    // Check if test case is referenced by defects
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
