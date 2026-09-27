import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { handleApiError, NotFoundError } from "@/lib/errors";
import { updateLocationSchema } from "@/schemas/inventory";
import { createAuditLog, getClientIp } from "@/lib/audit";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    await requirePermission(request, "inventory", "read");
    const { id } = await params;

    const location = await prisma.location.findFirst({
      where: { id, deletedAt: null },
      include: {
        _count: { select: { stockPositions: true, orders: true } },
      },
    });

    if (!location) throw new NotFoundError("Local");
    return NextResponse.json(location);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const session = await requirePermission(request, "inventory", "manage");
    const { id } = await params;
    const body = await request.json();
    const input = updateLocationSchema.parse(body);

    const existing = await prisma.location.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundError("Local");

    const location = await prisma.location.update({ where: { id }, data: input });

    await createAuditLog(
      { session, ipAddress: getClientIp(request) },
      "UPDATE",
      "Location",
      id,
      input,
    );

    return NextResponse.json(location);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const session = await requirePermission(request, "inventory", "manage");
    const { id } = await params;

    const existing = await prisma.location.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundError("Local");

    await prisma.location.update({ where: { id }, data: { deletedAt: new Date() } });

    await createAuditLog(
      { session, ipAddress: getClientIp(request) },
      "DELETE",
      "Location",
      id,
    );

    return NextResponse.json({ message: "Local removido com sucesso." });
  } catch (error) {
    return handleApiError(error);
  }
}
