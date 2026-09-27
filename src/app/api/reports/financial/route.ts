import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";
import { startOfDayUtc, endOfDayUtc } from "@/lib/date";

// Lista de lançamentos é limitada; DRE e agrupamentos cobrem o período inteiro.
const MAX_ROWS = 5000;

// DRE / Financeiro: receitas, custos, despesas no período
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requirePermission(request, "reports", "read");
    const { searchParams } = new URL(request.url);

    const now = new Date();
    const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1);
    const from = searchParams.get("from") ? startOfDayUtc(searchParams.get("from") as string) : defaultFrom;
    const to = searchParams.get("to") ? endOfDayUtc(searchParams.get("to") as string) : now;
    const where: Prisma.FinancialEntryWhereInput = {
      deletedAt: null,
      status: { not: "CANCELLED" },
      competenceDate: { gte: from, lte: to },
    };

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
    const sumByType = (t: string): number => Number(byTypeGroups.find((g) => g.type === t)?._sum.amount ?? 0);
    const entriesCount = byTypeGroups.reduce((s, g) => s + g._count._all, 0);
    const revenue = sumByType("REVENUE");
    const cogs = Math.abs(sumByType("COGS"));
    const taxes = Math.abs(sumByType("TAX"));
    const fees = Math.abs(sumByType("FEE"));
    const expenses = Math.abs(sumByType("EXPENSE"));
    const refunds = Math.abs(sumByType("REFUND"));
    const netRevenue = revenue - taxes - refunds;
    const grossProfit = netRevenue - cogs;
    const operatingProfit = grossProfit - fees - expenses;

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
          revenue, netRevenue, cogs, taxes, fees, expenses, refunds,
          grossProfit, grossMargin: revenue > 0 ? (grossProfit / revenue) * 100 : 0,
          operatingProfit, operatingMargin: revenue > 0 ? (operatingProfit / revenue) * 100 : 0,
        },
        byCategory,
        byCostCenter,
        rows,
        truncated: entriesCount > rows.length,
        rowLimit: MAX_ROWS,
      },
      { headers: { "Cache-Control": "private, max-age=0, s-maxage=120, stale-while-revalidate=300" } },
    );
  } catch (err) {
    return handleApiError(err);
  }
}
