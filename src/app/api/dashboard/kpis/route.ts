import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requirePermission(request, "dashboard", "read");
    const { searchParams } = new URL(request.url);
    const locationId = searchParams.get("locationId") ?? undefined;

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfPreviousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfPreviousMonth = new Date(now.getFullYear(), now.getMonth(), 0);

    const locationFilter = locationId ? { locationId } : {};

    const [
      currentAgg,
      previousAgg,
      cmvRows,
      ordersByStatus,
      ordersByChannel,
      topProducts,
      totalCustomers,
      newCustomersMonth,
      lowStockCount,
      pendingReturns,
    ] = await Promise.all([
      // Current month revenue + order count
      prisma.order.aggregate({
        where: {
          deletedAt: null,
          placedAt: { gte: startOfMonth },
          status: { not: "CANCELLED" },
          ...locationFilter,
        },
        _sum: { total: true },
        _count: { id: true },
      }),
      // Previous month revenue
      prisma.order.aggregate({
        where: {
          deletedAt: null,
          placedAt: { gte: startOfPreviousMonth, lte: endOfPreviousMonth },
          status: { not: "CANCELLED" },
          ...locationFilter,
        },
        _sum: { total: true },
      }),
      // CMV do mês corrente
      prisma.$queryRaw<[{ cmv: number | null }]>`
        SELECT COALESCE(SUM(oi.cost_price * oi.quantity), 0)::float AS cmv
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        WHERE o.deleted_at IS NULL
          AND o.placed_at >= ${startOfMonth}
          AND o.status::text <> 'CANCELLED'
          AND (${locationId ?? null}::text IS NULL OR o.location_id = ${locationId ?? null})
      `,
      // Orders by status
      prisma.order.groupBy({
        by: ["status"],
        where: { deletedAt: null, placedAt: { gte: startOfMonth }, ...locationFilter },
        _count: { id: true },
      }),
      // Orders by channel
      prisma.order.groupBy({
        by: ["channel"],
        where: {
          deletedAt: null,
          placedAt: { gte: startOfMonth },
          status: { not: "CANCELLED" },
          ...locationFilter,
        },
        _count: { id: true },
        _sum: { total: true },
      }),
      // Top products
      prisma.orderItem.groupBy({
        by: ["variantId"],
        where: {
          order: {
            deletedAt: null,
            placedAt: { gte: startOfMonth },
            status: { not: "CANCELLED" },
            ...locationFilter,
          },
        },
        _sum: { quantity: true, totalPrice: true },
        orderBy: { _sum: { totalPrice: "desc" } },
        take: 10,
      }),
      // Customer stats
      prisma.customer.count({ where: { deletedAt: null } }),
      prisma.customer.count({
        where: { deletedAt: null, createdAt: { gte: startOfMonth } },
      }),
      // Stock alerts (below minimum)
      prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*) as count FROM stock_positions WHERE quantity <= min_stock AND min_stock > 0
      `,
      // Pending returns
      prisma.returnRequest.count({
        where: { deletedAt: null, status: { in: ["REQUESTED", "POSTAGE_GENERATED", "POSTED", "RECEIVED", "INSPECTING"] } },
      }),
    ]);

    const currentRevenue = Number(currentAgg._sum.total ?? 0);
    const currentOrderCount = currentAgg._count.id;
    const previousRevenue = Number(previousAgg._sum.total ?? 0);
    const revenueGrowth =
      previousRevenue > 0 ? ((currentRevenue - previousRevenue) / previousRevenue) * 100 : 0;

    const currentCMV = Number(cmvRows[0]?.cmv ?? 0);
    const grossProfit = currentRevenue - currentCMV;
    const grossMargin = currentRevenue > 0 ? (grossProfit / currentRevenue) * 100 : 0;

    const avgTicket = currentOrderCount > 0 ? currentRevenue / currentOrderCount : 0;

    return NextResponse.json(
      {
        period: { from: startOfMonth, to: now },
      kpis: {
        faturamentoMes: currentRevenue,
        crescimentoVsMesAnterior: Number(revenueGrowth.toFixed(2)),
        margemBruta: Number(grossMargin.toFixed(2)),
        ticketMedio: Number(avgTicket.toFixed(2)),
        totalPedidosMes: currentOrderCount,
        totalClientes: totalCustomers,
        novosClientesMes: newCustomersMonth,
        alertasEstoqueBaixo: Number(lowStockCount[0]?.count ?? 0),
        devolucoesEmAberto: pendingReturns,
      },
      breakdowns: {
        pedidosPorStatus: ordersByStatus.map((g) => ({
          status: g.status,
          count: g._count.id,
        })),
        pedidosPorCanal: ordersByChannel.map((g) => ({
          channel: g.channel,
          count: g._count.id,
          total: Number(g._sum.total ?? 0),
        })),
        topProdutos: topProducts.map((p) => ({
          variantId: p.variantId,
          quantidadeVendida: p._sum.quantity ?? 0,
          faturamento: Number(p._sum.totalPrice ?? 0),
        })),
      },
      },
      { headers: { "Cache-Control": "private, max-age=0, s-maxage=60, stale-while-revalidate=300" } },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
