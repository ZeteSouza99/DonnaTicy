import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { startOfMonthInZone, comparableMonthEnd, startOfDayInZone, endOfDayInZone } from "@/lib/date";
import { serverEnv } from "@/lib/env";
import { handleApiError, ValidationError } from "@/lib/errors";
import { recognizedOrders, costOfSales } from "@/services/reporting-service";
import { lowStockCount } from "@/services/stock-query-service";
import { getOperationalSettings } from "@/services/settings-service";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requirePermission(request, "dashboard", "read");
    const params = request.nextUrl.searchParams;
    const locationId = params.get("locationId") || undefined;
    const now = new Date(), zone = serverEnv().APP_TIMEZONE;
    const from = params.get("from") ? startOfDayInZone(params.get("from")!, zone) : startOfMonthInZone(now, zone);
    const to = params.get("to") ? endOfDayInZone(params.get("to")!, zone) : now;
    if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from > to || to.getTime() - from.getTime() > 366 * 86_400_000) throw new ValidationError("Escolha um período válido de até 12 meses.");
    const previousFrom = params.get("from") ? new Date(from.getTime() - (to.getTime() - from.getTime()) - 1) : startOfMonthInZone(now, zone, -1);
    const previousTo = params.get("from") ? new Date(from.getTime() - 1) : comparableMonthEnd(now, zone);
    const settings = await getOperationalSettings();
    const where = recognizedOrders(from, to, locationId);
    const location = locationId ? { locationId } : {};
    const [current, previous, cmv, statuses, channels, customers, newCustomers, lowStock, returns, daily, top] = await Promise.all([
      prisma.order.aggregate({ where, _sum: { total: true }, _count: { id: true } }),
      prisma.order.aggregate({ where: recognizedOrders(previousFrom, previousTo, locationId), _sum: { total: true } }),
      costOfSales(from, to, locationId, false),
      prisma.order.groupBy({ by: ["status"], where: { deletedAt: null, placedAt: { gte: from, lte: to }, ...location }, _count: { id: true } }),
      prisma.order.groupBy({ by: ["channel"], where, _sum: { total: true }, _count: { id: true } }),
      prisma.customer.count({ where: { deletedAt: null, isActive: true, phone: { not: "00000000000" }, orders: { some: recognizedOrders(new Date(to.getTime() - settings.activeCustomerDays * 86_400_000), to, locationId) } } }),
      prisma.customer.count({ where: { deletedAt: null, phone: { not: "00000000000" }, createdAt: { gte: from, lte: to }, ...(locationId && { orders: { some: { locationId } } }) } }),
      lowStockCount(locationId),
      prisma.returnRequest.count({ where: { deletedAt: null, status: { notIn: ["RESOLVED", "REJECTED"] }, ...(locationId && { order: { locationId } }) } }),
      prisma.$queryRaw<Array<{ day: string; total: number }>>`SELECT to_char(placed_at AT TIME ZONE 'UTC' AT TIME ZONE ${zone}, 'YYYY-MM-DD') AS day, SUM(total)::float8 AS total FROM orders WHERE deleted_at IS NULL AND status::text NOT IN ('CANCELLED','PENDING_PAYMENT') AND placed_at BETWEEN ${from} AND ${to} AND (${locationId ?? null}::text IS NULL OR location_id = ${locationId ?? null}) GROUP BY day ORDER BY day`,
      prisma.orderItem.groupBy({ by: ["variantId"], where: { order: where }, _sum: { quantity: true, totalPrice: true }, orderBy: { _sum: { totalPrice: "desc" } }, take: 5 }),
    ]);
    const variants = await prisma.productVariant.findMany({ where: { id: { in: top.map((p) => p.variantId) } }, select: { id: true, sku: true, product: { select: { name: true } }, color: { select: { name: true } }, size: { select: { name: true } } } });
    const revenue = Number(current._sum.total ?? 0), prev = Number(previous._sum.total ?? 0);
    const dailyValues = new Map(daily.map(row => [row.day, row.total]));
    const dayFormat = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" });
    const dailySeries = [];
    for (let day = from.getTime(); day <= to.getTime(); day += 86400000) {
      const key = dayFormat.format(new Date(day)); dailySeries.push({ day: key, total: dailyValues.get(key) ?? 0 });
    }
    return NextResponse.json({
      period: { from, to, previousFrom, previousTo },
      settings: { monthlySalesGoal: settings.monthlySalesGoal, activeCustomerDays: settings.activeCustomerDays },
      kpis: { faturamentoMes: revenue, crescimentoVsMesAnterior: prev > 0 ? Math.round((revenue - prev) / prev * 10000) / 100 : null,
        margemBruta: revenue ? Math.round((revenue - cmv) / revenue * 10000) / 100 : 0,
        ticketMedio: current._count.id ? revenue / current._count.id : 0, totalPedidosMes: current._count.id,
        totalClientes: customers, novosClientesMes: newCustomers, alertasEstoqueBaixo: lowStock, devolucoesEmAberto: returns },
      breakdowns: { daily: dailySeries, pedidosPorStatus: statuses.map((s) => ({ status: s.status, count: s._count.id })),
        pedidosPorCanal: channels.map((c) => ({ channel: c.channel, count: c._count.id, total: Number(c._sum.total ?? 0) })),
        topProdutos: top.map((p) => ({ variantId: p.variantId, name: variants.find((v) => v.id === p.variantId)?.product.name ?? "Produto", sku: variants.find((v) => v.id === p.variantId)?.sku, quantidadeVendida: p._sum.quantity ?? 0, faturamento: Number(p._sum.totalPrice ?? 0) })) },
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return handleApiError(error, request); }
}
