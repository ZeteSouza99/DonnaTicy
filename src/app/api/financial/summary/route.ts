import { NextRequest, NextResponse } from "next/server";
import { financialTotals } from "@/services/reporting-service";
import { requirePermission } from "@/lib/auth";
import { handleApiError, ValidationError } from "@/lib/errors";
import { startOfDayInZone, endOfDayInZone, startOfMonthInZone } from "@/lib/date";
import { serverEnv } from "@/lib/env";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requirePermission(request, "financial", "read");
    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const locationId = searchParams.get("locationId") ?? undefined;

    const now = new Date();
    const startDate = from ? startOfDayInZone(from, serverEnv().APP_TIMEZONE) : startOfMonthInZone(now, serverEnv().APP_TIMEZONE);
    const endDate = to ? endOfDayInZone(to, serverEnv().APP_TIMEZONE) : now;

    if (!Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime()) || startDate > endDate) throw new ValidationError("Informe um período válido.");
    const { revenue, cogs, taxes, fees, expenses, refunds, netRevenue, grossProfit, contributionMargin, operatingProfit } = await financialTotals(startDate, endDate, locationId);

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
