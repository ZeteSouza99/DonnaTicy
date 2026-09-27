import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";

// Catálogo detalhado: produto + variantes + estoque agregado + valor em estoque
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requirePermission(request, "reports", "read");

    const products = await prisma.product.findMany({
      where: { deletedAt: null },
      include: {
        collection: { select: { name: true, code: true } },
        line: { select: { name: true } },
        category: { select: { name: true } },
        variants: {
          where: { deletedAt: null },
          include: {
            color: { select: { name: true, hexValue: true } },
            size: { select: { name: true, sortOrder: true } },
            stockPositions: { select: { quantity: true, reservedQty: true } },
          },
        },
      },
      orderBy: [{ collection: { name: "asc" } }, { name: "asc" }],
    });

    const rows = products.map((p) => {
      const costPrice = Number(p.costPrice);
      const basePrice = Number(p.basePrice);
      const variants = p.variants.map((v) => {
        const stock = v.stockPositions.reduce((s, sp) => s + sp.quantity, 0);
        const reserved = v.stockPositions.reduce((s, sp) => s + sp.reservedQty, 0);
        const stockValue = stock * costPrice;
        return {
          id: v.id,
          sku: v.sku,
          color: v.color.name,
          colorHex: v.color.hexValue,
          size: v.size.name,
          sizeSort: v.size.sortOrder,
          additionalCost: Number(v.additionalCost),
          stock,
          reserved,
          available: stock - reserved,
          stockValue,
        };
      });

      const totalStock = variants.reduce((s, v) => s + v.stock, 0);
      const totalAvailable = variants.reduce((s, v) => s + v.available, 0);
      const totalValue = variants.reduce((s, v) => s + v.stockValue, 0);

      return {
        id: p.id,
        code: p.code,
        name: p.name,
        collection: p.collection.name,
        line: p.line.name,
        category: p.category.name,
        costPrice,
        basePrice,
        markup: p.markup,
        marginAbs: basePrice - costPrice,
        marginPct: basePrice > 0 ? ((basePrice - costPrice) / basePrice) * 100 : 0,
        abcClass: p.abcClass,
        seasonality: p.seasonality,
        variantsCount: variants.length,
        totalStock,
        totalAvailable,
        totalValue,
        variants: variants.sort((a, b) => a.sizeSort - b.sizeSort || a.color.localeCompare(b.color)),
      };
    });

    const summary = {
      productsCount: rows.length,
      variantsCount: rows.reduce((s, r) => s + r.variantsCount, 0),
      totalStock: rows.reduce((s, r) => s + r.totalStock, 0),
      totalAvailable: rows.reduce((s, r) => s + r.totalAvailable, 0),
      totalCostValue: rows.reduce((s, r) => s + r.totalValue, 0),
      potentialRevenue: rows.reduce((s, r) => s + r.totalStock * r.basePrice, 0),
    };

    return NextResponse.json(
      { summary, rows },
      { headers: { "Cache-Control": "private, max-age=0, s-maxage=120, stale-while-revalidate=300" } },
    );
  } catch (err) {
    return handleApiError(err);
  }
}
