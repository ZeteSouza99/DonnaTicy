import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { handleApiError, NotFoundError, ValidationError } from "@/lib/errors";
import { updateStockPositionSchema } from "@/schemas/inventory";
import { createAuditLog, getClientIp } from "@/lib/audit";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    await requirePermission(request, "inventory", "read");
    const { id } = await params;

    const position = await prisma.stockPosition.findUnique({
      where: { id },
      include: {
        variant: {
          select: {
            id: true,
            sku: true,
            product: { select: { id: true, code: true, name: true } },
            color: { select: { name: true, hexValue: true } },
            size: { select: { name: true, code: true } },
          },
        },
        location: { select: { id: true, name: true, code: true, type: true } },
      },
    });

    if (!position) throw new NotFoundError("Posição de estoque");

    return NextResponse.json(position);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const session = await requirePermission(request, "inventory", "write");
    const { id } = await params;

    const existing = await prisma.stockPosition.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError("Posição de estoque");

    const body = await request.json();
    const input = updateStockPositionSchema.parse(body);

    // Baixar o físico abaixo do reservado deixaria pedidos pagos sem peça para separar.
    const adjusted = await prisma.stockPosition.updateMany({
      where: { id, ...(input.quantity !== undefined && { reservedQty: { lte: input.quantity } }) },
      data: input,
    });
    if (adjusted.count === 0) {
      throw new ValidationError("A quantidade não pode ficar abaixo do saldo reservado para pedidos.");
    }

    const updated = await prisma.stockPosition.findUniqueOrThrow({
      where: { id },
      include: {
        variant: {
          select: {
            id: true,
            sku: true,
            product: { select: { id: true, code: true, name: true } },
            color: { select: { name: true, hexValue: true } },
            size: { select: { name: true, code: true } },
          },
        },
        location: { select: { id: true, name: true, code: true, type: true } },
      },
    });

    await createAuditLog(
      { session, ipAddress: getClientIp(request) },
      "UPDATE",
      "StockPosition",
      id,
      { ...input, sku: updated.variant.sku },
    );

    return NextResponse.json(updated);
  } catch (error) {
    return handleApiError(error);
  }
}
