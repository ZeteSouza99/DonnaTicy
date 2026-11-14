import { NextRequest, NextResponse } from "next/server";
import { lowStockCount, lowStockWhere, stockJoins } from "@/services/stock-query-service";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";
import { getPaginationParams, paginate } from "@/lib/pagination";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requirePermission(request, "inventory", "read");
    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = getPaginationParams(searchParams);
    const locationId = searchParams.get("locationId") ?? undefined;
    const variantId = searchParams.get("variantId") ?? undefined;
    const belowMin = searchParams.get("belowMin") === "true";

    const search = searchParams.get("search")?.trim();
    const baseWhere = {
      location: { isActive: true, deletedAt: null },
      ...(search && { OR: [{ variant: { sku: { contains: search, mode: "insensitive" as const } } }, { variant: { product: { name: { contains: search, mode: "insensitive" as const } } } }] }),
      variant: { deletedAt: null, product: { deletedAt: null } },
      ...(locationId && { locationId }),
      ...(variantId && { variantId }),
    };

    const includeRelations = {
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
    };

    if (belowMin) {
      const [ids, total] = await Promise.all([
        prisma.$queryRaw<Array<{ id: string }>>`SELECT sp.id ${stockJoins} WHERE ${lowStockWhere(locationId, variantId, search)} ORDER BY sp.updated_at DESC, sp.id ASC LIMIT ${limit} OFFSET ${skip}`,
        lowStockCount(locationId, variantId, search),
      ]);
      const data = await prisma.stockPosition.findMany({ where: { id: { in: ids.map((i) => i.id) } }, include: includeRelations, orderBy: [{ updatedAt: "desc" }, { id: "asc" }] });
      return NextResponse.json(paginate(data.map((s) => ({ ...s, available: s.quantity - s.reservedQty })), total, page, limit));
    }

    const [data, total] = await Promise.all([
      prisma.stockPosition.findMany({
        where: baseWhere,
        include: includeRelations,
        skip,
        take: limit,
        orderBy: { updatedAt: "desc" },
      }),
      prisma.stockPosition.count({ where: baseWhere }),
    ]);

    return NextResponse.json(paginate(data.map((s) => ({ ...s, available: s.quantity - s.reservedQty })), total, page, limit));
  } catch (error) {
    return handleApiError(error);
  }
}
