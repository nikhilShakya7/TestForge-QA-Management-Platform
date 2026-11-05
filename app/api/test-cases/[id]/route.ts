import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
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
