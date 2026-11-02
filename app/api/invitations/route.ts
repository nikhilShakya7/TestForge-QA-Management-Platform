import { Prisma } from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getActiveSessionUser, isSuperAdmin } from "@/lib/auth";
import prisma from "@/lib/prisma";

const createInvitationSchema = z.object({
  email: z.string().trim().email().transform((email) => email.toLowerCase()),
  role: z.enum(["PROJECT_ADMIN", "QA_TESTER", "VIEWER"]),
});

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function POST(request: NextRequest) {
  try {
    const user = await getActiveSessionUser(request);
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    if (!isSuperAdmin(user)) {
      return NextResponse.json({ error: "Super Admin access required" }, { status: 403 });
    }

    const parsed = createInvitationSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid invitation", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { email, role } = parsed.data;
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return NextResponse.json(
        { error: "This email already has an account. Update its role from the users list." },
        { status: 409 }
      );
    }

    const pendingInvitation = await prisma.invitation.findFirst({
      where: {
        email,
        status: "PENDING",
        expiresAt: { gt: new Date() },
      },
      select: { id: true },
    });
    if (pendingInvitation) {
      return NextResponse.json(
        { error: "There is already a pending invitation for this email." },
        { status: 409 }
      );
    }

    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const invitation = await prisma.invitation.create({
      data: {
        email,
        role,
        tokenHash: hashToken(token),
        expiresAt,
      },
      select: { id: true, email: true, role: true, expiresAt: true },
    });

    return NextResponse.json(
      {
        invitation,
        inviteUrl: `${request.nextUrl.origin}/auth/register?invite=${token}`,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/invitations error:", error);
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
    return NextResponse.json({ error: "Failed to create invitation" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await getActiveSessionUser(request);
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    if (!isSuperAdmin(user)) {
      return NextResponse.json({ error: "Super Admin access required" }, { status: 403 });
    }

    const { id } = await request.json();
    if (typeof id !== "string" || !id) {
      return NextResponse.json({ error: "Invitation ID is required" }, { status: 400 });
    }

    const result = await prisma.invitation.updateMany({
      where: { id, status: "PENDING" },
      data: { status: "CANCELLED" },
    });

    if (!result.count) {
      return NextResponse.json(
        { error: "Pending invitation not found" },
        { status: 404 }
      );
    }
    return NextResponse.json({ message: "Invitation cancelled" });
  } catch (error) {
    console.error("DELETE /api/invitations error:", error);
    return NextResponse.json({ error: "Failed to cancel invitation" }, { status: 500 });
  }
}
