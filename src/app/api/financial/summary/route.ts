import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";
import { startOfDayUtc, endOfDayUtc } from "@/lib/date";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requirePermission(request, "financial", "read");
    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const locationId = searchParams.get("locationId") ?? undefined;

    const startDate = from ? startOfDayUtc(from) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const endDate = to ? endOfDayUtc(to) : new Date();

    const dateFilter = { competenceDate: { gte: startDate, lte: endDate } };

    const grouped = await prisma.financialEntry.groupBy({
      by: ["type"],
      where: {
        deletedAt: null,
        status: { not: "CANCELLED" },
        ...dateFilter,
        ...(locationId && {
          order: { locationId },
        }),
      },
      _sum: { amount: true },
    });

    const sumByType = (type: string): number =>
      Number(grouped.find((g) => g.type === type)?._sum.amount ?? 0);

    const revenue = sumByType("REVENUE");
    const cogs = Math.abs(sumByType("COGS"));
    const taxes = Math.abs(sumByType("TAX"));
    const fees = Math.abs(sumByType("FEE"));
    const expenses = Math.abs(sumByType("EXPENSE"));
    const refunds = Math.abs(sumByType("REFUND"));

    const netRevenue = revenue - taxes - refunds;
    const grossProfit = netRevenue - cogs;
    const contributionMargin = grossProfit - fees;
    const operatingProfit = contributionMargin - expenses;

    return NextResponse.json({
      period: { from: startDate, to: endDate },
      dre: {
        receitaBruta: revenue,
        deducoesImpostos: taxes,
        devolucoes: refunds,
        receitaLiquida: netRevenue,
        cmv: cogs,
        lucroBruto: grossProfit,
        taxasCartao: fees,
        margemContribuicao: contributionMargin,
        despesasOperacionais: expenses,
        resultadoOperacional: operatingProfit,
      },
      margins: {
        margemBruta: revenue > 0 ? ((grossProfit / revenue) * 100).toFixed(2) : "0",
        margemContribuicao: revenue > 0 ? ((contributionMargin / revenue) * 100).toFixed(2) : "0",
        margemOperacional: revenue > 0 ? ((operatingProfit / revenue) * 100).toFixed(2) : "0",
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
