import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { handleApiError, NotFoundError } from "@/lib/errors";
import { updateProductSchema } from "@/schemas/catalog";
import { createAuditLog, getClientIp } from "@/lib/audit";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    await requirePermission(request, "catalog", "read");
    const { id } = await params;

    const product = await prisma.product.findFirst({
      where: { id, deletedAt: null },
      include: {
        collection: { select: { id: true, name: true, code: true } },
        line: { select: { id: true, name: true, code: true } },
        category: { select: { id: true, name: true, code: true } },
        variants: {
          where: { deletedAt: null },
          include: {
            color: { select: { id: true, name: true, hexValue: true } },
            size: { select: { id: true, name: true, code: true } },
            stockPositions: { select: { locationId: true, quantity: true, reservedQty: true } },
          },
          orderBy: [{ color: { name: "asc" } }, { size: { sortOrder: "asc" } }],
          take: 100,
        },
        bom: {
          include: { rawMaterial: { select: { id: true, code: true, name: true } } },
          take: 50,
        },
      },
    });

    if (!product) throw new NotFoundError("Produto");

    return NextResponse.json(product);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const session = await requirePermission(request, "catalog", "manage");
    const { id } = await params;
    const body = await request.json();
    const input = updateProductSchema.parse(body);

    const existing = await prisma.product.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundError("Produto");

    const product = await prisma.product.update({
      where: { id },
      data: input,
    });

    await createAuditLog(
      { session, ipAddress: getClientIp(request) },
      "UPDATE",
      "Product",
      id,
      input,
    );

    return NextResponse.json(product);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const session = await requirePermission(request, "catalog", "manage");
    const { id } = await params;

    const existing = await prisma.product.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundError("Produto");

    const deletedAt = new Date();
    await prisma.$transaction([
      prisma.productVariant.updateMany({
        where: { productId: id, deletedAt: null },
        data: { deletedAt },
      }),
      prisma.product.update({ where: { id }, data: { deletedAt } }),
    ]);

    await createAuditLog(
      { session, ipAddress: getClientIp(request) },
      "DELETE",
      "Product",
      id,
    );

    return NextResponse.json({ message: "Produto removido com sucesso." });
  } catch (error) {
    return handleApiError(error);
  }
}
