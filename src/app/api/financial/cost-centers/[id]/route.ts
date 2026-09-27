import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { handleApiError, NotFoundError } from "@/lib/errors";
import { updateCostCenterSchema } from "@/schemas/financial";
import { createAuditLog, getClientIp } from "@/lib/audit";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    await requirePermission(request, "financial", "read");
    const { id } = await params;

    const costCenter = await prisma.costCenter.findFirst({
      where: { id, deletedAt: null },
      include: {
        location: { select: { id: true, name: true } },
        _count: { select: { financialEntries: true } },
      },
    });

    if (!costCenter) throw new NotFoundError("Centro de custo");
    return NextResponse.json(costCenter);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const session = await requirePermission(request, "financial", "manage");
    const { id } = await params;
    const body = await request.json();
    const input = updateCostCenterSchema.parse(body);

    const existing = await prisma.costCenter.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundError("Centro de custo");

    const costCenter = await prisma.costCenter.update({
      where: { id },
      data: input,
      include: { location: { select: { id: true, name: true } } },
    });

    await createAuditLog(
      { session, ipAddress: getClientIp(request) },
      "UPDATE",
      "CostCenter",
      id,
      input,
    );

    return NextResponse.json(costCenter);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const session = await requirePermission(request, "financial", "manage");
    const { id } = await params;

    const existing = await prisma.costCenter.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundError("Centro de custo");

    await prisma.costCenter.update({ where: { id }, data: { deletedAt: new Date() } });

    await createAuditLog(
      { session, ipAddress: getClientIp(request) },
      "DELETE",
      "CostCenter",
      id,
    );

    return NextResponse.json({ message: "Centro de custo removido com sucesso." });
  } catch (error) {
    return handleApiError(error);
  }
}
