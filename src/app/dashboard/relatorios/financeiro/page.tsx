"use client";

import { useEffect, useState } from "react";
import { clientFetch } from "@/lib/client-fetch";
import { ReportShell, KpiBox } from "@/components/reports/report-shell";
import { formatBRL, formatNumber, formatPct, formatDateOnly } from "@/lib/format";
import { toLocalDateInputValue } from "@/lib/date";
import { Loader2 } from "lucide-react";

interface Row {
  id: string;
  type: string;
  category: string;
  description: string | null;
  amount: number;
  competenceDate: string;
  cashDate: string | null;
  costCenter: string | null;
  costCenterCode: string | null;
  orderCode: string | null;
}

interface Resp {
  summary: {
    from: string; to: string;
    entriesCount: number;
    revenue: number;
    netRevenue: number;
    cogs: number;
    taxes: number;
    fees: number;
    expenses: number;
    refunds: number;
    grossProfit: number;
    grossMargin: number;
    operatingProfit: number;
    operatingMargin: number;
  };
  byCategory: { type: string; category: string; count: number; total: number }[];
  byCostCenter: { name: string; count: number; total: number }[];
  rows: Row[];
  truncated: boolean;
  rowLimit: number;
}

function isoDate(d: Date): string { return toLocalDateInputValue(d); }

const TYPE_COLOR: Record<string, string> = {
  REVENUE: "text-emerald-600",
  COGS: "text-red-600",
  TAX: "text-amber-600",
  FEE: "text-amber-600",
  EXPENSE: "text-red-600",
  REFUND: "text-red-600",
};

export default function FinancialReportPage(): React.ReactNode {
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const [from, setFrom] = useState(isoDate(monthStart));
  const [to, setTo] = useState(isoDate(today));
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  const load = (): void => {
    setLoading(true);
    clientFetch<Resp>(`/api/reports/financial?from=${from}&to=${to}`)
      .then(setData)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  return (
    <ReportShell
      title="DRE Gerencial"
      description="Receitas, devoluções, custos, impostos, taxas e despesas por competência"
      exportFilename="dre-financeiro"
      exportRows={(data?.rows ?? []) as unknown as Record<string, unknown>[]}
      toolbar={
        <div className="flex items-center gap-2">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-lg border px-2 py-1 text-sm" />
          <span className="text-sm text-gray-500">até</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-lg border px-2 py-1 text-sm" />
          <button type="button" onClick={load} className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700">Filtrar</button>
        </div>
      }
    >
      {loading || !data ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="animate-spin" /></div>
      ) : (
        <>
          <div className="rounded-lg border bg-white p-5">
            <h3 className="mb-4 text-lg font-semibold">Demonstração de Resultado</h3>
            <p className="mb-3 text-xs text-gray-500">Lançamentos CANCELLED não compõem o resultado. Reembolsos pendentes já deduzem a receita, sem nova dedução na baixa.</p>
            <table className="w-full text-sm">
              <tbody className="divide-y">
                <tr><td className="py-2 font-medium">Receita bruta</td><td className="py-2 text-right text-emerald-600">{formatBRL(data.summary.revenue)}</td></tr>
                <tr><td className="py-2 pl-4 text-gray-600">(–) Impostos</td><td className="py-2 text-right text-red-600">{formatBRL(data.summary.taxes)}</td></tr>
                <tr><td className="py-2 pl-4 text-gray-600">(–) Devoluções</td><td className="py-2 text-right text-red-600">{formatBRL(data.summary.refunds)}</td></tr>
                <tr className="font-semibold"><td className="py-2">= Receita líquida</td><td className="py-2 text-right">{formatBRL(data.summary.netRevenue)}</td></tr>
                <tr><td className="py-2 pl-4 text-gray-600">(–) CMV</td><td className="py-2 text-right text-red-600">{formatBRL(data.summary.cogs)}</td></tr>
                <tr className="font-semibold"><td className="py-2">= Lucro bruto</td><td className="py-2 text-right">{formatBRL(data.summary.grossProfit)} <span className="text-xs text-gray-500">({formatPct(data.summary.grossMargin)})</span></td></tr>
                <tr><td className="py-2 pl-4 text-gray-600">(–) Taxas</td><td className="py-2 text-right text-red-600">{formatBRL(data.summary.fees)}</td></tr>
                <tr><td className="py-2 pl-4 text-gray-600">(–) Despesas</td><td className="py-2 text-right text-red-600">{formatBRL(data.summary.expenses)}</td></tr>
                <tr className="border-t-2 font-bold"><td className="py-2">= Resultado operacional</td><td className={`py-2 text-right ${data.summary.operatingProfit >= 0 ? "text-emerald-600" : "text-red-600"}`}>{formatBRL(data.summary.operatingProfit)} <span className="text-xs">({formatPct(data.summary.operatingMargin)})</span></td></tr>
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <KpiBox label="Lançamentos" value={formatNumber(data.summary.entriesCount)} />
            <KpiBox label="Margem bruta" value={formatPct(data.summary.grossMargin)} tone="positive" />
            <KpiBox label="Margem operacional" value={formatPct(data.summary.operatingMargin)} tone={data.summary.operatingMargin >= 0 ? "positive" : "negative"} />
            <KpiBox label="Resultado" value={formatBRL(data.summary.operatingProfit)} tone={data.summary.operatingProfit >= 0 ? "positive" : "negative"} />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border bg-white p-4">
              <h3 className="mb-3 font-semibold">Por categoria</h3>
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-gray-600"><tr><th className="px-2 py-1 text-left">Tipo</th><th className="px-2 py-1 text-left">Categoria</th><th className="px-2 py-1 text-right">Qtd</th><th className="px-2 py-1 text-right">Total</th></tr></thead>
                <tbody className="divide-y">
                  {data.byCategory.map((c) => (
                    <tr key={`${c.type}-${c.category}`}>
                      <td className={`px-2 py-1 text-xs font-medium ${TYPE_COLOR[c.type]}`}>{c.type}</td>
                      <td className="px-2 py-1">{c.category}</td>
                      <td className="px-2 py-1 text-right">{c.count}</td>
                      <td className="px-2 py-1 text-right">{formatBRL(c.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="rounded-lg border bg-white p-4">
              <h3 className="mb-3 font-semibold">Por centro de custo</h3>
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-gray-600"><tr><th className="px-2 py-1 text-left">Centro</th><th className="px-2 py-1 text-right">Qtd</th><th className="px-2 py-1 text-right">Total</th></tr></thead>
                <tbody className="divide-y">
                  {data.byCostCenter.map((c) => (
                    <tr key={c.name}><td className="px-2 py-1">{c.name}</td><td className="px-2 py-1 text-right">{c.count}</td><td className="px-2 py-1 text-right">{formatBRL(c.total)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {data.truncated && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
              Exibindo os {formatNumber(data.rowLimit)} lançamentos mais recentes. A DRE acima considera o período inteiro;
              reduza o período para ver (e exportar) todos os lançamentos.
            </p>
          )}

          <div className="overflow-x-auto rounded-lg border bg-white">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-600">
                <tr>
                  <th className="px-3 py-2 text-left">Tipo</th>
                  <th className="px-3 py-2 text-left">Categoria</th>
                  <th className="px-3 py-2 text-left">Descrição</th>
                  <th className="px-3 py-2 text-left">Centro</th>
                  <th className="px-3 py-2 text-left">Pedido</th>
                  <th className="px-3 py-2 text-left">Competência</th>
                  <th className="px-3 py-2 text-left">Caixa</th>
                  <th className="px-3 py-2 text-right">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.rows.map((r) => (
                  <tr key={r.id}>
                    <td className={`px-3 py-2 text-xs font-medium ${TYPE_COLOR[r.type]}`}>{r.type}</td>
                    <td className="px-3 py-2 text-xs">{r.category}</td>
                    <td className="px-3 py-2">{r.description ?? "—"}</td>
                    <td className="px-3 py-2 text-xs text-gray-600">{r.costCenter ?? "—"}</td>
                    <td className="px-3 py-2 font-mono text-xs">{r.orderCode ?? "—"}</td>
                    <td className="px-3 py-2 text-xs">{formatDateOnly(r.competenceDate)}</td>
                    <td className="px-3 py-2 text-xs">{formatDateOnly(r.cashDate)}</td>
                    <td className={`px-3 py-2 text-right font-medium ${TYPE_COLOR[r.type]}`}>{formatBRL(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </ReportShell>
  );
}
