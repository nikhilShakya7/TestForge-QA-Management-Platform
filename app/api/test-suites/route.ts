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

const testSuiteSchema = z.object({
  name: z.string().min(1, "Suite name is required"),
  description: z.string().optional(),
  projectId: z.string().min(1, "Project ID is required"),
});

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
    const projectId = searchParams.get("projectId") || undefined;
    if (projectId && !(await canAccessProject(session, projectId))) {
      return NextResponse.json(
        { error: "You do not have access to this project" },
        { status: 403 }
      );
    }

    const accessibleProjectIds = await getAccessibleProjectIds(session);

    const testSuites = await prisma.testSuite.findMany({
      relationLoadStrategy: "join",
      where: {
        OR: [
          { createdById: session.userId },
          { projectId: { in: accessibleProjectIds } },
        ],
        ...(projectId ? { projectId } : {}),
      },
      include: {
        _count: { select: { testCases: true } },
        createdBy: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(testSuites);
  } catch (error) {
    console.error("GET /api/test-suites error:", error);
    return NextResponse.json(
      { error: "Failed to fetch test suites" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = testSuiteSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // Resolve the authenticated user from the session cookie
    const session = await getActiveSessionUser(request);
    if (!session) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }
    const writeError = getWriteAccessError(session);
    if (writeError) return writeError;

    const user = await getCurrentUser(session.userId);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const testSuite = await prisma.testSuite.create({
      data: {
        ...parsed.data,
        createdById: user.id,
      },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });

    return NextResponse.json(testSuite, { status: 201 });
  } catch (error) {
    console.error("POST /api/test-suites error:", error);
    return NextResponse.json(
      { error: "Failed to create test suite" },
      { status: 500 }
    );
  }
}
