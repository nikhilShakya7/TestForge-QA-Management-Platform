import { Prisma } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";
import {
  getActiveSessionUser,
  isSuperAdmin,
  normalizeUserRole,
} from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const user = await getActiveSessionUser(request);
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    if (!isSuperAdmin(user)) {
      return NextResponse.json({ error: "Super Admin access required" }, { status: 403 });
    }

    const [users, invitations] = await Promise.all([
      prisma.user.findMany({
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isActive: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.invitation.findMany({
        where: { status: "PENDING", expiresAt: { gt: new Date() } },
        select: {
          id: true,
          email: true,
          role: true,
          expiresAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    return NextResponse.json({
      users: users.map((managedUser) => ({
        ...managedUser,
        role: normalizeUserRole(managedUser.role),
      })),
      invitations: invitations.map((invitation) => ({
        ...invitation,
        role: normalizeUserRole(invitation.role),
      })),
    });
  } catch (error) {
    console.error("GET /api/users error:", error);
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2021" || error.code === "P2022")
    ) {
      return NextResponse.json(
        {
          error:
            "The database schema is out of date. Run `npm run db:push` against the configured database, then try again.",
        },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
  }
}
