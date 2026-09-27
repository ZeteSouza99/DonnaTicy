import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";
import { startOfDayUtc, endOfDayUtc } from "@/lib/date";

interface ProductSales {
  product_id: string;
  qty: number;
  revenue: number;
  cost: number;
}

// Curva ABC: classifica produtos por receita acumulada vendida no período
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requirePermission(request, "reports", "read");
    const { searchParams } = new URL(request.url);

    const now = new Date();
    const defaultFrom = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const from = searchParams.get("from") ? startOfDayUtc(searchParams.get("from") as string) : defaultFrom;
    const to = searchParams.get("to") ? endOfDayUtc(searchParams.get("to") as string) : now;

    // Agregado no banco: a memória não cresce com o número de itens vendidos no período.
    const sales = await prisma.$queryRaw<ProductSales[]>`
      SELECT v.product_id,
             SUM(oi.quantity)::int AS qty,
             SUM(oi.total_price)::float8 AS revenue,
             SUM(oi.cost_price * oi.quantity)::float8 AS cost
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      JOIN product_variants v ON v.id = oi.variant_id
      WHERE o.deleted_at IS NULL
        AND o.status <> 'CANCELLED'
        AND o.placed_at BETWEEN ${from} AND ${to}
      GROUP BY v.product_id
    `;

    const productInfo = await prisma.product.findMany({
      where: { id: { in: sales.map((s) => s.product_id) } },
      select: {
        id: true, code: true, name: true,
        category: { select: { name: true } },
        collection: { select: { name: true } },
      },
    });
    const infoById = new Map(productInfo.map((p) => [p.id, p]));

    const products = sales
      .map((s) => {
        const p = infoById.get(s.product_id);
        return {
          productId: s.product_id,
          code: p?.code ?? "",
          name: p?.name ?? "",
          category: p?.category.name ?? "",
          collection: p?.collection.name ?? "",
          qty: s.qty,
          revenue: s.revenue,
          cost: s.cost,
        };
      })
      .sort((a, b) => b.revenue - a.revenue);
    const totalRevenue = products.reduce((s, p) => s + p.revenue, 0);

    let acc = 0;
    const rows = products.map((p) => {
      acc += p.revenue;
      const accPct = totalRevenue > 0 ? (acc / totalRevenue) * 100 : 0;
      const sharePct = totalRevenue > 0 ? (p.revenue / totalRevenue) * 100 : 0;
      const profit = p.revenue - p.cost;
      const margin = p.revenue > 0 ? (profit / p.revenue) * 100 : 0;
      let abcClass: "A" | "B" | "C";
      if (accPct <= 80) abcClass = "A";
      else if (accPct <= 95) abcClass = "B";
      else abcClass = "C";
      return { ...p, profit, margin, sharePct, accPct, abcClass };
    });

    const summary = {
      from, to,
      productsCount: rows.length,
      totalRevenue,
      totalCost: rows.reduce((s, r) => s + r.cost, 0),
      totalProfit: rows.reduce((s, r) => s + r.profit, 0),
      countA: rows.filter((r) => r.abcClass === "A").length,
      countB: rows.filter((r) => r.abcClass === "B").length,
      countC: rows.filter((r) => r.abcClass === "C").length,
    };

    return NextResponse.json(
      { summary, rows },
      { headers: { "Cache-Control": "private, max-age=0, s-maxage=120, stale-while-revalidate=300" } },
    );
  } catch (err) {
    return handleApiError(err);
  }
}
