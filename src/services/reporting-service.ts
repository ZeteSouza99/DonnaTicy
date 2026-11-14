import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export const RECOGNIZED_STATUSES = ["PAID", "PICKING", "PACKED", "SHIPPED", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED"] as const;
export function recognizedOrders(from: Date, to: Date, locationId?: string): Prisma.OrderWhereInput {
  return { deletedAt: null, status: { in: [...RECOGNIZED_STATUSES] }, placedAt: { gte: from, lte: to }, ...(locationId && { locationId }) };
}
export function financialWhere(from: Date, to: Date, locationId?: string): Prisma.FinancialEntryWhereInput {
  return { deletedAt: null, status: { not: "CANCELLED" }, competenceDate: { gte: from, lte: to },
    AND: [
      { OR: [{ orderId: null }, { order: { deletedAt: null, status: { not: "PENDING_PAYMENT" } } }] },
      ...(locationId ? [{ OR: [{ locationId }, { locationId: null, order: { locationId } }] }] : []),
    ],
  };
}

/** CMV automático por custo histórico; lançamentos manuais só complementam vendas sem vínculo. */
export async function costOfSales(from: Date, to: Date, locationId?: string, financial = true): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ value: Prisma.Decimal }>>`
    SELECT COALESCE(SUM(amount), 0) AS value FROM (
      SELECT oi.cost_price * oi.quantity AS amount FROM order_items oi JOIN orders o ON o.id = oi.order_id
      WHERE o.deleted_at IS NULL AND (o.status::text NOT IN ('CANCELLED', 'PENDING_PAYMENT') OR (${financial} AND o.status::text = 'CANCELLED' AND o.paid_at IS NOT NULL))
        AND o.placed_at BETWEEN ${from} AND ${to}
        AND (${locationId ?? null}::text IS NULL OR o.location_id = ${locationId ?? null})
      UNION ALL
      SELECT -(oi.cost_price * oi.quantity) AS amount FROM order_items oi JOIN orders o ON o.id = oi.order_id
      WHERE ${financial} AND o.deleted_at IS NULL AND o.status::text = 'CANCELLED' AND o.paid_at IS NOT NULL
        AND o.cancelled_at BETWEEN ${from} AND ${to}
        AND (${locationId ?? null}::text IS NULL OR o.location_id = ${locationId ?? null})
      UNION ALL
      SELECT -(oi.cost_price * ri.quantity) AS amount
      FROM return_request_items ri JOIN return_requests r ON r.id = ri.return_request_id
      JOIN order_items oi ON oi.id = ri.order_item_id JOIN orders o ON o.id = r.order_id
      WHERE ${financial} AND r.status::text = 'RESOLVED' AND r.deleted_at IS NULL AND o.deleted_at IS NULL AND o.status::text <> 'CANCELLED'
        AND COALESCE(ri.inspection_result, r.inspection_result)::text IN ('APPROVED', 'APPROVED_WITH_NOTE')
        AND r.resolved_at BETWEEN ${from} AND ${to}
        AND (${locationId ?? null}::text IS NULL OR o.location_id = ${locationId ?? null})
      UNION ALL
      SELECT -(oi.cost_price * (item->>'quantity')::int) AS amount
      FROM exchanges e CROSS JOIN LATERAL jsonb_array_elements(e.returned_items) item
      JOIN order_items oi ON oi.id = item->>'orderItemId'
      WHERE ${financial} AND e.created_at BETWEEN ${from} AND ${to}
        AND (${locationId ?? null}::text IS NULL OR e.location_id = ${locationId ?? null})
      UNION ALL
      SELECT COALESCE((item->>'costPrice')::numeric, p.cost_price) * (item->>'quantity')::int AS amount
      FROM exchanges e CROSS JOIN LATERAL jsonb_array_elements(e.new_items) item
      JOIN product_variants v ON v.id = item->>'variantId' JOIN products p ON p.id = v.product_id
      WHERE ${financial} AND e.created_at BETWEEN ${from} AND ${to}
        AND (${locationId ?? null}::text IS NULL OR e.location_id = ${locationId ?? null})
    ) costs
  `;
  return Number(rows[0]?.value ?? 0);
}

export async function financialTotals(from: Date, to: Date, locationId?: string) {
  const where = financialWhere(from, to, locationId);
  const [groups, automaticCogs, credits] = await Promise.all([
    prisma.financialEntry.groupBy({ by: ["type"], where, _sum: { amount: true } }),
    costOfSales(from, to, locationId),
    prisma.$queryRaw<Array<{ value: Prisma.Decimal }>>`
      SELECT COALESCE(SUM(c.amount),0) AS value FROM store_credits c JOIN orders o ON o.id = c.origin_order_id
      WHERE c.created_at BETWEEN ${from} AND ${to} AND o.deleted_at IS NULL AND o.status::text <> 'CANCELLED'
      AND c.status::text <> 'CANCELLED' AND (${locationId ?? null}::text IS NULL OR o.location_id = ${locationId ?? null})
    `,
  ]);
  const sum = (type: string) => Number(groups.find((g) => g.type === type)?._sum.amount ?? 0);
  // Um CMV vinculado a pedido já é representado pelo custo histórico dos itens.
  const manualCogs = await prisma.financialEntry.aggregate({ where: { ...where, type: "COGS", orderId: null }, _sum: { amount: true } });
  const revenue = sum("REVENUE");
  const cogs = automaticCogs + Number(manualCogs._sum.amount ?? 0);
  const taxes = sum("TAX"), fees = sum("FEE"), expenses = sum("EXPENSE");
  const creditRefunds = Number(credits[0]?.value ?? 0);
  const refunds = sum("REFUND") + creditRefunds;
  const netRevenue = revenue - taxes - refunds;
  const grossProfit = netRevenue - cogs;
  const contributionMargin = grossProfit - fees;
  return { revenue, cogs, automaticCogs, creditRefunds, taxes, fees, expenses, refunds, netRevenue, grossProfit, contributionMargin,
    operatingProfit: contributionMargin - expenses };
}
