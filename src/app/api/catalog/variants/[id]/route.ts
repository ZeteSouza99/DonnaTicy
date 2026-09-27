import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { handleApiError, NotFoundError } from "@/lib/errors";
import { updateVariantSchema } from "@/schemas/catalog";
import { createAuditLog, getClientIp } from "@/lib/audit";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    await requirePermission(request, "catalog", "read");
    const { id } = await params;

    const variant = await prisma.productVariant.findFirst({
      where: { id, deletedAt: null },
      include: {
        product: { select: { id: true, code: true, name: true, basePrice: true } },
        color: { select: { id: true, name: true, hexValue: true } },
        size: { select: { id: true, name: true, code: true } },
        stockPositions: {
          include: { location: { select: { id: true, name: true, code: true } } },
        },
      },
    });

    if (!variant) throw new NotFoundError("Variante");
    return NextResponse.json(variant);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const session = await requirePermission(request, "catalog", "manage");
    const { id } = await params;
    const body = await request.json();
    const input = updateVariantSchema.parse(body);

    const existing = await prisma.productVariant.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundError("Variante");

    const variant = await prisma.productVariant.update({
      where: { id },
      data: input,
      include: {
        product: { select: { id: true, code: true, name: true } },
        color: { select: { id: true, name: true, hexValue: true } },
        size: { select: { id: true, name: true, code: true } },
      },
    });

    await createAuditLog(
      { session, ipAddress: getClientIp(request) },
      "UPDATE",
      "ProductVariant",
      id,
      input,
    );

    return NextResponse.json(variant);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const session = await requirePermission(request, "catalog", "manage");
    const { id } = await params;

    const existing = await prisma.productVariant.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundError("Variante");

    await prisma.productVariant.update({ where: { id }, data: { deletedAt: new Date() } });

    await createAuditLog(
      { session, ipAddress: getClientIp(request) },
      "DELETE",
      "ProductVariant",
      id,
    );

    return NextResponse.json({ message: "Variante removida com sucesso." });
  } catch (error) {
    return handleApiError(error);
  }
}
