import { NextRequest, NextResponse } from "next/server";
import { financialTotals, financialWhere } from "@/services/reporting-service";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { handleApiError, ValidationError } from "@/lib/errors";
import { startOfDayInZone, endOfDayInZone, startOfMonthInZone } from "@/lib/date";
import { serverEnv } from "@/lib/env";

// Lista de lançamentos é limitada; DRE e agrupamentos cobrem o período inteiro.
const MAX_ROWS = 5000;

// DRE / Financeiro: receitas, custos, despesas no período
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requirePermission(request, "reports", "read");
    const { searchParams } = new URL(request.url);

    const now = new Date();
    const defaultFrom = startOfMonthInZone(now, serverEnv().APP_TIMEZONE);
    const from = searchParams.get("from") ? startOfDayInZone(searchParams.get("from") as string, serverEnv().APP_TIMEZONE) : defaultFrom;
    const to = searchParams.get("to") ? endOfDayInZone(searchParams.get("to") as string, serverEnv().APP_TIMEZONE) : now;
    const locationId = searchParams.get("locationId") || undefined;
    if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from > to) throw new ValidationError("Informe um período válido.");
    const where = financialWhere(from, to, locationId);
    const [byTypeGroups, categoryGroups, costCenterGroups, entries] = await Promise.all([
      prisma.financialEntry.groupBy({ by: ["type"], where, _count: { _all: true }, _sum: { amount: true } }),
      prisma.financialEntry.groupBy({ by: ["type", "category"], where, _count: { _all: true }, _sum: { amount: true } }),
      prisma.financialEntry.groupBy({ by: ["costCenterId"], where, _count: { _all: true }, _sum: { amount: true } }),
      prisma.financialEntry.findMany({
        where,
        include: {
          costCenter: { select: { name: true, code: true, type: true } },
          order: { select: { code: true } },
        },
        orderBy: { competenceDate: "desc" },
        take: MAX_ROWS,
      }),
    ]);

    const rows = entries.map((e) => ({
      id: e.id,
      type: e.type,
      category: e.category,
      description: e.description,
      amount: Number(e.amount),
      competenceDate: e.competenceDate,
      cashDate: e.cashDate,
      costCenter: e.costCenter?.name ?? null,
      costCenterCode: e.costCenter?.code ?? null,
      orderCode: e.order?.code ?? null,
    }));

    // DRE
    const entriesCount = byTypeGroups.reduce((s, g) => s + g._count._all, 0);
    const { revenue, cogs, automaticCogs, creditRefunds, taxes, fees, expenses, refunds, netRevenue, grossProfit, operatingProfit } = await financialTotals(from, to, locationId);

    const byCategory = categoryGroups
      .map((g) => ({ type: g.type, category: g.category, count: g._count._all, total: Number(g._sum.amount ?? 0) }))
      .sort((a, b) => b.total - a.total);

    const costCenterIds = costCenterGroups.flatMap((g) => (g.costCenterId ? [g.costCenterId] : []));
    const costCenterNames = new Map(
      (await prisma.costCenter.findMany({ where: { id: { in: costCenterIds } }, select: { id: true, name: true } }))
        .map((c) => [c.id, c.name]),
    );
    const byCostCenter = costCenterGroups
      .map((g) => ({
        name: (g.costCenterId && costCenterNames.get(g.costCenterId)) || "(sem centro)",
        count: g._count._all,
        total: Number(g._sum.amount ?? 0),
      }))
      .sort((a, b) => b.total - a.total);

    return NextResponse.json(
      {
        summary: {
          from, to,
          entriesCount,
          revenue, netRevenue, cogs, automaticCogs, creditRefunds, taxes, fees, expenses, refunds,
          grossProfit, grossMargin: revenue > 0 ? (grossProfit / revenue) * 100 : 0,
          operatingProfit, operatingMargin: revenue > 0 ? (operatingProfit / revenue) * 100 : 0,
        },
        byCategory,
        byCostCenter,
        rows,
        truncated: entriesCount > rows.length,
        rowLimit: MAX_ROWS,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (err) {
    return handleApiError(err);
  }
}
