import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { handleApiError, NotFoundError } from "@/lib/errors";
import { createAuditLog, getClientIp } from "@/lib/audit";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    await requirePermission(request, "inventory", "read");
    const { id } = await params;

    const count = await prisma.inventoryCount.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            inventoryCount: false,
          },
          take: 200,
        },
      },
    });

    if (!count) throw new NotFoundError("Contagem de inventário");
    return NextResponse.json(count);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const session = await requirePermission(request, "inventory", "write");
    const { id } = await params;
    const body = await request.json();

    const existing = await prisma.inventoryCount.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError("Contagem de inventário");
    if (existing.completedAt) {
      return NextResponse.json(
        { error: "Contagem já finalizada." },
        { status: 400 },
      );
    }

    const items = body.items as Array<{ variantId: string; countedQty: number }>;
    if (!items || !Array.isArray(items)) {
      return NextResponse.json(
        { error: "Items é obrigatório e deve ser um array." },
        { status: 400 },
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      for (const item of items) {
        await tx.inventoryCountItem.updateMany({
          where: { inventoryCountId: id, variantId: item.variantId },
          data: {
            countedQty: item.countedQty,
            divergence: item.countedQty - (await tx.inventoryCountItem.findFirst({
              where: { inventoryCountId: id, variantId: item.variantId },
              select: { expectedQty: true },
            }).then(r => r?.expectedQty ?? 0)),
          },
        });
      }

      const allItems = await tx.inventoryCountItem.findMany({
        where: { inventoryCountId: id },
      });

      const countedItems = allItems.filter(i => i.countedQty !== null).length;
      const discrepancies = allItems.filter(i => i.divergence !== null && i.divergence !== 0).length;
      const accuracy = countedItems > 0
        ? (countedItems - discrepancies) / countedItems * 100
        : null;

      const isComplete = countedItems === allItems.length;

      return tx.inventoryCount.update({
        where: { id },
        data: {
          countedItems,
          discrepancies,
          accuracy,
          ...(isComplete && { completedAt: new Date() }),
        },
      });
    });

    await createAuditLog(
      { session, ipAddress: getClientIp(request) },
      "UPDATE",
      "InventoryCount",
      id,
      { itemsUpdated: items.length },
    );

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
