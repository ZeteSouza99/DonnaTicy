import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { handleApiError, NotFoundError } from "@/lib/errors";
import { getPaginationParams, paginate } from "@/lib/pagination";
import { createInventoryCountSchema } from "@/schemas/inventory";
import { createAuditLog, getClientIp } from "@/lib/audit";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requirePermission(request, "inventory", "read");
    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = getPaginationParams(searchParams);
    const locationId = searchParams.get("locationId") ?? undefined;

    const where = {
      ...(locationId && { locationId }),
    };

    const [data, total] = await Promise.all([
      prisma.inventoryCount.findMany({
        where,
        include: {
          _count: { select: { items: true } },
        },
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      prisma.inventoryCount.count({ where }),
    ]);

    return NextResponse.json(paginate(data, total, page, limit));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await requirePermission(request, "inventory", "write");
    const body = await request.json();
    const input = createInventoryCountSchema.parse(body);

    const location = await prisma.location.findFirst({
      where: { id: input.locationId, deletedAt: null },
    });
    if (!location) throw new NotFoundError("Local");

    const stockPositions = await prisma.stockPosition.findMany({
      where: { locationId: input.locationId },
      select: { variantId: true, quantity: true },
    });

    const inventoryCount = await prisma.$transaction(async (tx) => {
      const count = await tx.inventoryCount.create({
        data: {
          locationId: input.locationId,
          startedAt: new Date(),
          totalItems: stockPositions.length,
        },
      });

      if (stockPositions.length > 0) {
        await tx.inventoryCountItem.createMany({
          data: stockPositions.map((sp) => ({
            inventoryCountId: count.id,
            variantId: sp.variantId,
            expectedQty: sp.quantity,
          })),
        });
      }

      return count;
    });

    await createAuditLog(
      { session, ipAddress: getClientIp(request) },
      "CREATE",
      "InventoryCount",
      inventoryCount.id,
      { locationId: input.locationId, totalItems: stockPositions.length },
    );

    return NextResponse.json(inventoryCount, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
