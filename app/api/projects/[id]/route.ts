import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  canAccessProject,
  getActiveSessionUser,
  getWriteAccessError,
} from "@/lib/auth";
import prisma from "@/lib/prisma";

const updateProjectSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  key: z.string().min(1).max(10).regex(/^[A-Z0-9]+$/).optional(),
  description: z.string().max(500).optional().nullable(),
  status: z.enum(["ACTIVE", "ARCHIVED"]).optional(),
});

/**
 * GET /api/projects/[id]
 * Get a single project with counts of related entities.
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

    const project = await prisma.project.findUnique({
      where: { id },
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
    });

    if (!project) {
      return NextResponse.json(
        { error: `Project "${id}" not found` },
        { status: 404 }
      );
    }

    if (!(await canAccessProject(session, id))) {
      return NextResponse.json(
        { error: "You do not have access to this project" },
        { status: 403 }
      );
    }

    return NextResponse.json(project);
  } catch (error) {
    console.error("GET /api/projects/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to fetch project" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/projects/[id]
 * Update project details (name, description, status).
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
    const parsed = updateProjectSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const existing = await prisma.project.findUnique({ where: { id } });

    if (!existing) {
      return NextResponse.json(
        { error: `Project "${id}" not found` },
        { status: 404 }
      );
    }

    // Only the creator can update
    if (existing.createdById !== session.userId) {
      return NextResponse.json(
        { error: "Not authorized to update this project" },
        { status: 403 }
      );
    }

    // Check for duplicate key if key is being changed
    if (parsed.data.key && parsed.data.key !== existing.key) {
      const existingKey = await prisma.project.findUnique({
        where: { key: parsed.data.key },
      });
      if (existingKey) {
        return NextResponse.json(
          { error: `Project key "${parsed.data.key}" already exists` },
          { status: 409 }
        );
      }
    }

    const project = await prisma.project.update({
      where: { id },
      data: {
        ...(parsed.data.name !== undefined && { name: parsed.data.name }),
        ...(parsed.data.key !== undefined && { key: parsed.data.key }),
        ...(parsed.data.description !== undefined && {
          description: parsed.data.description,
        }),
        ...(parsed.data.status !== undefined && {
          status: parsed.data.status,
        }),
      },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });

    return NextResponse.json(project);
  } catch (error) {
    console.error("PATCH /api/projects/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to update project" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/projects/[id]
 * Archive a project (soft delete). Cannot archive if it has related data.
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

    const existing = await prisma.project.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            testCases: true,
            testRuns: true,
            defects: true,
          },
        },
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: `Project "${id}" not found` },
        { status: 404 }
      );
    }

    // Only the creator can delete/archive
    if (existing.createdById !== session.userId) {
      return NextResponse.json(
        { error: "Not authorized to delete this project" },
        { status: 403 }
      );
    }

    // Safeguard: prevent archiving if project has related data
    const hasData =
      existing._count.testCases > 0 ||
      existing._count.testRuns > 0 ||
      existing._count.defects > 0;

    if (hasData) {
      return NextResponse.json(
        {
          error: `Cannot archive project "${existing.name}": it contains ${existing._count.testCases} test case(s), ${existing._count.testRuns} test run(s), and ${existing._count.defects} defect(s). Remove or reassign them first.`,
        },
        { status: 409 }
      );
    }

    await prisma.project.update({
      where: { id },
      data: { status: "ARCHIVED" },
    });

    return NextResponse.json({
      message: `Project "${existing.name}" archived successfully`,
    });
  } catch (error) {
    console.error("DELETE /api/projects/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to archive project" },
      { status: 500 }
    );
  }
}
