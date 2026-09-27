import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";
import { startOfDayUtc, endOfDayUtc } from "@/lib/date";
import { can } from "@/lib/permissions";

// Detalhe por pedido é limitado; totais e agrupamentos cobrem o período inteiro.
const MAX_ROWS = 2000;

/** Mantém só os 3 dígitos centrais (LGPD): ***.456.789-** */
function maskCpf(cpf: string | null): string | null {
  const digits = cpf?.replace(/\D/g, "") ?? "";
  return digits.length === 11 ? `***.${digits.slice(3, 6)}.${digits.slice(6, 9)}-**` : cpf && "***";
}

// Vendas detalhadas no período (default: últimos 30 dias)
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await requirePermission(request, "reports", "read");
    const showDocument = can(session.role, "customers", "write");
    const { searchParams } = new URL(request.url);

    const now = new Date();
    const defaultFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const from = searchParams.get("from") ? startOfDayUtc(searchParams.get("from") as string) : defaultFrom;
    const to = searchParams.get("to") ? endOfDayUtc(searchParams.get("to") as string) : now;
    const where: Prisma.OrderWhereInput = { deletedAt: null, placedAt: { gte: from, lte: to } };

    const [totals, itemTotals, channelGroups, statusGroups] = await Promise.all([
      prisma.order.aggregate({
        where,
        _count: { _all: true },
        _sum: { total: true, shippingCost: true, discountTotal: true },
      }),
      prisma.$queryRaw<Array<{ items: number; cost: number }>>`
        SELECT COALESCE(SUM(oi.quantity), 0)::int AS items,
               COALESCE(SUM(oi.cost_price * oi.quantity), 0)::float8 AS cost
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        WHERE o.deleted_at IS NULL AND o.placed_at BETWEEN ${from} AND ${to}
      `,
      prisma.order.groupBy({ by: ["channel"], where, _count: { _all: true }, _sum: { total: true } }),
      prisma.order.groupBy({ by: ["status"], where, _count: { _all: true }, _sum: { total: true } }),
    ]);

    const orders = await prisma.order.findMany({
      where,
      include: {
        customer: { select: { fullName: true, cpf: true, tier: true } },
        location: { select: { name: true, code: true } },
        seller: { select: { name: true } },
        items: {
          include: {
            variant: {
              include: {
                color: { select: { name: true } },
                size: { select: { name: true } },
                product: { select: { code: true, name: true, category: { select: { name: true } } } },
              },
            },
          },
        },
        payments: { select: { method: true, grossAmount: true, netAmount: true, status: true, installments: true } },
      },
      orderBy: { placedAt: "desc" },
      take: MAX_ROWS,
    });

    const rows = orders.map((o) => {
      const total = Number(o.total);
      const shipping = Number(o.shippingCost);
      const itemsCount = o.items.reduce((s, i) => s + i.quantity, 0);
      const cost = o.items.reduce((s, i) => s + Number(i.costPrice) * i.quantity, 0);
      const profit = total - cost - shipping;
      const margin = total > 0 ? (profit / total) * 100 : 0;
      return {
        id: o.id,
        code: o.code,
        placedAt: o.placedAt,
        paidAt: o.paidAt,
        deliveredAt: o.deliveredAt,
        channel: o.channel,
        status: o.status,
        customerName: o.customer.fullName,
        customerDocument: showDocument ? o.customer.cpf : maskCpf(o.customer.cpf),
        customerTier: o.customer.tier,
        sellerName: o.seller?.name ?? null,
        locationCode: o.location?.code ?? null,
        locationName: o.location?.name ?? null,
        subtotal: Number(o.subtotal),
        discount: Number(o.discountTotal),
        shipping,
        total,
        cost,
        profit,
        margin,
        itemsCount,
        items: o.items.map((i) => ({
          sku: i.variant.sku,
          productCode: i.variant.product.code,
          productName: i.variant.product.name,
          category: i.variant.product.category.name,
          color: i.variant.color.name,
          size: i.variant.size.name,
          quantity: i.quantity,
          unitPrice: Number(i.unitPrice),
          discount: Number(i.discount),
          totalPrice: Number(i.totalPrice),
          costPrice: Number(i.costPrice),
        })),
        payments: o.payments.map((p) => ({
          method: p.method,
          gross: Number(p.grossAmount),
          net: Number(p.netAmount),
          installments: p.installments,
          status: p.status,
        })),
      };
    });

    const ordersCount = totals._count._all;
    const grossRevenue = Number(totals._sum.total ?? 0);
    const totalShipping = Number(totals._sum.shippingCost ?? 0);
    const totalCost = itemTotals[0]?.cost ?? 0;
    const summary = {
      from,
      to,
      ordersCount,
      itemsCount: itemTotals[0]?.items ?? 0,
      grossRevenue,
      totalCost,
      totalShipping,
      totalDiscount: Number(totals._sum.discountTotal ?? 0),
      totalProfit: grossRevenue - totalCost - totalShipping,
      avgTicket: ordersCount > 0 ? grossRevenue / ordersCount : 0,
    };

    const byChannel = channelGroups.map((g) => ({ channel: g.channel, count: g._count._all, revenue: Number(g._sum.total ?? 0) }));
    const byStatus = statusGroups.map((g) => ({ status: g.status, count: g._count._all, revenue: Number(g._sum.total ?? 0) }));

    return NextResponse.json(
      { summary, byChannel, byStatus, rows, truncated: ordersCount > rows.length, rowLimit: MAX_ROWS },
      { headers: { "Cache-Control": "private, max-age=0, s-maxage=120, stale-while-revalidate=300" } },
    );
  } catch (err) {
    return handleApiError(err);
  }
}
