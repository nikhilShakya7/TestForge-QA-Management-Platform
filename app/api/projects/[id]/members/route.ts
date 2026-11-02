import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  canManageProject,
  getActiveSessionUser,
  isSuperAdmin,
  normalizeUserRole,
} from "@/lib/auth";
import prisma from "@/lib/prisma";

const addMemberSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(["PROJECT_ADMIN", "QA_TESTER", "VIEWER"]),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await getActiveSessionUser(request);
    if (!actor) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const { id: projectId } = await params;
    if (!(await canManageProject(actor, projectId))) {
      return NextResponse.json({ error: "Project admin access required" }, { status: 403 });
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const [members, availableUsers] = await Promise.all([
      prisma.projectMember.findMany({
        where: { projectId },
        select: {
          role: true,
          joinedAt: true,
          user: {
            select: { id: true, name: true, email: true, role: true, isActive: true },
          },
        },
        orderBy: { joinedAt: "asc" },
      }),
      prisma.user.findMany({
        where: {
          isActive: true,
          ...(isSuperAdmin(actor) ? {} : { role: { not: "SUPER_ADMIN" } }),
          projectMembers: { none: { projectId } },
        },
        select: { id: true, name: true, email: true, role: true },
        orderBy: { email: "asc" },
      }),
    ]);

    return NextResponse.json({
      members: members.map((member) => ({
        ...member.user,
        role: normalizeUserRole(member.user.role),
        projectRole: normalizeUserRole(member.role),
        joinedAt: member.joinedAt,
      })),
      availableUsers: availableUsers.map((user) => ({
        ...user,
        role: normalizeUserRole(user.role),
      })),
      canAssignProjectAdmin: isSuperAdmin(actor),
    });
  } catch (error) {
    console.error("GET /api/projects/[id]/members error:", error);
    return NextResponse.json({ error: "Failed to fetch project members" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await getActiveSessionUser(request);
    if (!actor) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const { id: projectId } = await params;
    if (!(await canManageProject(actor, projectId))) {
      return NextResponse.json({ error: "Project admin access required" }, { status: 403 });
    }

    const parsed = addMemberSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid project member", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    if (parsed.data.role === "PROJECT_ADMIN" && !isSuperAdmin(actor)) {
      return NextResponse.json(
        { error: "Only a Super Admin can assign the Project Admin role." },
        { status: 403 }
      );
    }

    const [project, user] = await Promise.all([
      prisma.project.findUnique({ where: { id: projectId }, select: { id: true } }),
      prisma.user.findUnique({
        where: { id: parsed.data.userId },
        select: { id: true, name: true, email: true, role: true, isActive: true },
      }),
    ]);

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    if (!user || !user.isActive) {
      return NextResponse.json({ error: "Active user not found" }, { status: 404 });
    }
    if (user.role === "SUPER_ADMIN" && !isSuperAdmin(actor)) {
      return NextResponse.json(
        { error: "Only a Super Admin can add another Super Admin to a project." },
        { status: 403 }
      );
    }

    const member = await prisma.projectMember.upsert({
      where: {
        userId_projectId: { userId: user.id, projectId },
      },
      create: {
        userId: user.id,
        projectId,
        role: parsed.data.role,
      },
      update: { role: parsed.data.role },
      select: {
        role: true,
        joinedAt: true,
        user: { select: { id: true, name: true, email: true, role: true } },
      },
    });

    return NextResponse.json(
      {
        member: {
          ...member.user,
          role: normalizeUserRole(member.user.role),
          projectRole: normalizeUserRole(member.role),
          joinedAt: member.joinedAt,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/projects/[id]/members error:", error);
    return NextResponse.json({ error: "Failed to add project member" }, { status: 500 });
  }
}
