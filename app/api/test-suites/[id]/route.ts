import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  canAccessProject,
  getActiveSessionUser,
  getWriteAccessError,
} from "@/lib/auth";
import prisma from "@/lib/prisma";

const updateTestSuiteSchema = z.object({
  name: z.string().min(1, "Suite name is required").optional(),
  description: z.string().optional().nullable(),
  projectId: z.string().min(1, "Project ID is required").optional(),
});

/**
 * GET /api/test-suites/[id]
 * Get a single test suite with test case count.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getActiveSessionUser(_request);
    if (!session) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }
    const { id } = await params;

    const testSuite = await prisma.testSuite.findUnique({
      where: { id },
      include: {
        _count: { select: { testCases: true } },
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });

    if (!testSuite) {
      return NextResponse.json(
        { error: `Test suite "${id}" not found` },
        { status: 404 }
      );
    }

    if (
      testSuite.projectId
        ? !(await canAccessProject(session, testSuite.projectId))
        : testSuite.createdById !== session.userId
    ) {
      return NextResponse.json(
        { error: "You do not have access to this test suite" },
        { status: 403 }
      );
    }

    return NextResponse.json(testSuite);
  } catch (error) {
    console.error("GET /api/test-suites/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to fetch test suite" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/test-suites/[id]
 * Update test suite details.
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
    const parsed = updateTestSuiteSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const existing = await prisma.testSuite.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: `Test suite "${id}" not found` },
        { status: 404 }
      );
    }

    // Only the creator can update
    if (existing.createdById !== session.userId) {
      return NextResponse.json(
        { error: "Not authorized to update this test suite" },
        { status: 403 }
      );
    }

    // If projectId is provided and changed, verify the project exists
    if (
      parsed.data.projectId !== undefined &&
      parsed.data.projectId !== null
    ) {
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

    const testSuite = await prisma.testSuite.update({
      where: { id },
      data: {
        ...(parsed.data.name !== undefined && { name: parsed.data.name }),
        ...(parsed.data.description !== undefined && {
          description: parsed.data.description,
        }),
        ...(parsed.data.projectId !== undefined && {
          projectId: parsed.data.projectId,
        }),
      },
      include: {
        _count: { select: { testCases: true } },
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });

    return NextResponse.json(testSuite);
  } catch (error) {
    console.error("PATCH /api/test-suites/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to update test suite" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/test-suites/[id]
 * Archive/delete a test suite. Blocked if it has test cases.
 */
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

    const existing = await prisma.testSuite.findUnique({
      where: { id },
      include: {
        _count: { select: { testCases: true } },
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: `Test suite "${id}" not found` },
        { status: 404 }
      );
    }

    // Only the creator can delete
    if (existing.createdById !== session.userId) {
      return NextResponse.json(
        { error: "Not authorized to delete this test suite" },
        { status: 403 }
      );
    }

    // Safeguard: prevent deletion if suite has test cases
    if (existing._count.testCases > 0) {
      return NextResponse.json(
        {
          error: `Cannot delete test suite "${existing.name}": it contains ${existing._count.testCases} test case(s). Remove or reassign them first.`,
        },
        { status: 409 }
      );
    }

    await prisma.testSuite.delete({
      where: { id },
    });

    return NextResponse.json({
      message: `Test suite "${existing.name}" deleted successfully`,
    });
  } catch (error) {
    console.error("DELETE /api/test-suites/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to delete test suite" },
      { status: 500 }
    );
  }
}
