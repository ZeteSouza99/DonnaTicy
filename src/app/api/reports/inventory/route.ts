import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";
import { availableAt } from "@/lib/stock";

// Estoque detalhado por variante × local
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requirePermission(request, "reports", "read");

    const positions = await prisma.stockPosition.findMany({
      include: {
        location: { select: { name: true, code: true, type: true } },
        variant: {
          include: {
            color: { select: { name: true, hexValue: true } },
            size: { select: { name: true, sortOrder: true } },
            product: {
              select: {
                code: true,
                name: true,
                costPrice: true,
                basePrice: true,
                category: { select: { name: true } },
                collection: { select: { name: true } },
              },
            },
          },
        },
      },
      orderBy: [{ location: { code: "asc" } }, { variant: { product: { name: "asc" } } }],
    });

    const rows = positions.map((p) => ({
      positionId: p.id,
      locationCode: p.location.code,
      locationName: p.location.name,
      locationType: p.location.type,
      sku: p.variant.sku,
      productCode: p.variant.product.code,
      productName: p.variant.product.name,
      collection: p.variant.product.collection.name,
      category: p.variant.product.category.name,
      color: p.variant.color.name,
      colorHex: p.variant.color.hexValue,
      size: p.variant.size.name,
      sizeSort: p.variant.size.sortOrder,
      quantity: p.quantity,
      reserved: p.reservedQty,
      available: availableAt(p),
      minStock: p.minStock,
      safetyStock: p.safetyStock,
      maxStock: p.maxStock,
      costPrice: Number(p.variant.product.costPrice),
      basePrice: Number(p.variant.product.basePrice),
      stockValueCost: p.quantity * Number(p.variant.product.costPrice),
      stockValueRetail: p.quantity * Number(p.variant.product.basePrice),
      lastCountAt: p.lastCountAt,
      belowMin: p.minStock > 0 && p.quantity < p.minStock,
      belowSafety: p.safetyStock > 0 && p.quantity < p.safetyStock,
    }));

    const summary = {
      positionsCount: rows.length,
      totalQty: rows.reduce((s, r) => s + r.quantity, 0),
      totalReserved: rows.reduce((s, r) => s + r.reserved, 0),
      totalAvailable: rows.reduce((s, r) => s + r.available, 0),
      totalValueCost: rows.reduce((s, r) => s + r.stockValueCost, 0),
      totalValueRetail: rows.reduce((s, r) => s + r.stockValueRetail, 0),
      belowMinCount: rows.filter((r) => r.belowMin).length,
      belowSafetyCount: rows.filter((r) => r.belowSafety).length,
      zeroStockCount: rows.filter((r) => r.quantity === 0).length,
    };

    // Agregado por local
    const byLocation = Array.from(
      rows.reduce((m, r) => {
        const cur = m.get(r.locationCode) ?? { code: r.locationCode, name: r.locationName, qty: 0, value: 0, items: 0 };
        cur.qty += r.quantity;
        cur.value += r.stockValueCost;
        cur.items += 1;
        m.set(r.locationCode, cur);
        return m;
      }, new Map<string, { code: string; name: string; qty: number; value: number; items: number }>()).values(),
    );

    return NextResponse.json(
      { summary, byLocation, rows },
      { headers: { "Cache-Control": "private, max-age=0, s-maxage=120, stale-while-revalidate=300" } },
    );
  } catch (err) {
    return handleApiError(err);
  }
}
