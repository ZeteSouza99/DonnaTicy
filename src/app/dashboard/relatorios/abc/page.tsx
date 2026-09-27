"use client";

import { useEffect, useState } from "react";
import { clientFetch } from "@/lib/client-fetch";
import { ReportShell, KpiBox } from "@/components/reports/report-shell";
import { formatBRL, formatNumber, formatPct } from "@/lib/format";
import { toLocalDateInputValue } from "@/lib/date";
import { Loader2 } from "lucide-react";

interface Row {
  productId: string;
  code: string;
  name: string;
  category: string;
  collection: string;
  qty: number;
  revenue: number;
  cost: number;
  profit: number;
  margin: number;
  sharePct: number;
  accPct: number;
  abcClass: "A" | "B" | "C";
}

interface Resp {
  summary: {
    from: string; to: string;
    productsCount: number;
    totalRevenue: number;
    totalCost: number;
    totalProfit: number;
    countA: number;
    countB: number;
    countC: number;
  };
  rows: Row[];
}

function isoDate(d: Date): string {
  return toLocalDateInputValue(d);
}

export default function AbcReportPage(): React.ReactNode {
  const today = new Date();
  const ago = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000);
  const [from, setFrom] = useState(isoDate(ago));
  const [to, setTo] = useState(isoDate(today));
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  const load = (): void => {
    setLoading(true);
    clientFetch<Resp>(`/api/reports/abc?from=${from}&to=${to}`)
      .then(setData)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  return (
    <ReportShell
      title="Curva ABC"
      description="Classificação por receita acumulada (A ≤80% · B ≤95% · C resto)"
      exportFilename="curva-abc"
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
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
            <KpiBox label="Produtos vendidos" value={formatNumber(data.summary.productsCount)} />
            <KpiBox label="Receita total" value={formatBRL(data.summary.totalRevenue)} tone="positive" />
            <KpiBox label="Custo total" value={formatBRL(data.summary.totalCost)} />
            <KpiBox label="Lucro total" value={formatBRL(data.summary.totalProfit)} tone="positive" />
            <KpiBox label="Classe A" value={formatNumber(data.summary.countA)} hint="80% receita" />
            <KpiBox label="Classe B" value={formatNumber(data.summary.countB)} hint="15% receita" />
            <KpiBox label="Classe C" value={formatNumber(data.summary.countC)} hint="5% receita" />
          </div>

          <div className="overflow-x-auto rounded-lg border bg-white">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-600">
                <tr>
                  <th className="px-3 py-2 text-center">Classe</th>
                  <th className="px-3 py-2 text-left">Código</th>
                  <th className="px-3 py-2 text-left">Produto</th>
                  <th className="px-3 py-2 text-left">Coleção</th>
                  <th className="px-3 py-2 text-right">Qtd vendida</th>
                  <th className="px-3 py-2 text-right">Receita</th>
                  <th className="px-3 py-2 text-right">Custo</th>
                  <th className="px-3 py-2 text-right">Lucro</th>
                  <th className="px-3 py-2 text-right">Margem</th>
                  <th className="px-3 py-2 text-right">% receita</th>
                  <th className="px-3 py-2 text-right">% acum.</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.rows.map((r) => (
                  <tr key={r.productId}>
                    <td className="px-3 py-2 text-center">
                      <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${r.abcClass === "A" ? "bg-emerald-100 text-emerald-700" : r.abcClass === "B" ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-600"}`}>{r.abcClass}</span>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{r.code}</td>
                    <td className="px-3 py-2 font-medium">{r.name}</td>
                    <td className="px-3 py-2 text-xs text-gray-600">{r.collection}</td>
                    <td className="px-3 py-2 text-right">{formatNumber(r.qty)}</td>
                    <td className="px-3 py-2 text-right">{formatBRL(r.revenue)}</td>
                    <td className="px-3 py-2 text-right">{formatBRL(r.cost)}</td>
                    <td className="px-3 py-2 text-right text-emerald-600">{formatBRL(r.profit)}</td>
                    <td className="px-3 py-2 text-right">{formatPct(r.margin)}</td>
                    <td className="px-3 py-2 text-right">{formatPct(r.sharePct, 2)}</td>
                    <td className="px-3 py-2 text-right font-medium">{formatPct(r.accPct, 2)}</td>
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
