import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await requireAuth(request);
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: session.sub },
      select: { name: true, mfaEnabled: true, mustChangePassword: true },
    });
    return NextResponse.json({
      id: session.sub,
      email: session.email,
      role: session.role,
      locationId: session.locationId,
      ...user,
    });
  } catch (error) {
    return handleApiError(error, request);
  }
}
