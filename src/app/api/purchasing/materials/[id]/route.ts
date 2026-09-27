import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { handleApiError, NotFoundError } from "@/lib/errors";
import { updateRawMaterialSchema } from "@/schemas/purchasing";
import { createAuditLog, getClientIp } from "@/lib/audit";
import type { Prisma } from "@prisma/client";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    await requirePermission(request, "purchasing", "read");
    const { id } = await params;

    const material = await prisma.rawMaterial.findFirst({
      where: { id, deletedAt: null },
      include: {
        primarySupplier: { select: { id: true, companyName: true } },
        backupSupplier: { select: { id: true, companyName: true } },
        bom: {
          include: { product: { select: { id: true, code: true, name: true } } },
          take: 50,
        },
      },
    });

    if (!material) throw new NotFoundError("Matéria-prima");
    return NextResponse.json(material);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const session = await requirePermission(request, "purchasing", "write");
    const { id } = await params;
    const body = await request.json();
    const input = updateRawMaterialSchema.parse(body);

    const existing = await prisma.rawMaterial.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundError("Matéria-prima");

    const material = await prisma.rawMaterial.update({
      where: { id },
      data: input as Prisma.RawMaterialUncheckedUpdateInput,
    });

    await createAuditLog(
      { session, ipAddress: getClientIp(request) },
      "UPDATE",
      "RawMaterial",
      id,
      input,
    );

    return NextResponse.json(material);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const session = await requirePermission(request, "purchasing", "write");
    const { id } = await params;

    const existing = await prisma.rawMaterial.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundError("Matéria-prima");

    await prisma.rawMaterial.update({ where: { id }, data: { deletedAt: new Date() } });

    await createAuditLog(
      { session, ipAddress: getClientIp(request) },
      "DELETE",
      "RawMaterial",
      id,
    );

    return NextResponse.json({ message: "Matéria-prima removida com sucesso." });
  } catch (error) {
    return handleApiError(error);
  }
}
