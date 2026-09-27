"use client";

import { useEffect, useState } from "react";
import { clientFetch } from "@/lib/client-fetch";
import { ReportShell, KpiBox } from "@/components/reports/report-shell";
import { formatBRL, formatNumber, formatDate } from "@/lib/format";
import { Loader2 } from "lucide-react";

interface Row {
  positionId: string;
  locationCode: string;
  locationName: string;
  locationType: string;
  sku: string;
  productCode: string;
  productName: string;
  collection: string;
  category: string;
  color: string;
  colorHex: string;
  size: string;
  quantity: number;
  reserved: number;
  available: number;
  minStock: number;
  safetyStock: number;
  maxStock: number;
  stockValueCost: number;
  stockValueRetail: number;
  lastCountAt: string | null;
  belowMin: boolean;
  belowSafety: boolean;
}

interface Resp {
  summary: {
    positionsCount: number;
    totalQty: number;
    totalReserved: number;
    totalAvailable: number;
    totalValueCost: number;
    totalValueRetail: number;
    belowMinCount: number;
    belowSafetyCount: number;
    zeroStockCount: number;
  };
  byLocation: { code: string; name: string; qty: number; value: number; items: number }[];
  rows: Row[];
}

export default function InventoryReportPage(): React.ReactNode {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "belowMin" | "belowSafety" | "zero">("all");

  useEffect(() => {
    clientFetch<Resp>("/api/reports/inventory")
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 className="animate-spin" /></div>;
  if (!data) return <div>Erro ao carregar dados.</div>;

  const filtered = data.rows.filter((r) => {
    if (filter === "belowMin") return r.belowMin;
    if (filter === "belowSafety") return r.belowSafety;
    if (filter === "zero") return r.quantity === 0;
    return true;
  });

  return (
    <ReportShell
      title="Estoque Detalhado"
      description="Posições por SKU × local com alertas e valor"
      exportFilename="estoque-detalhado"
      exportRows={filtered as unknown as Record<string, unknown>[]}
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <KpiBox label="Posições" value={formatNumber(data.summary.positionsCount)} />
        <KpiBox label="Qtd. total" value={formatNumber(data.summary.totalQty)} />
        <KpiBox label="Disponível" value={formatNumber(data.summary.totalAvailable)} />
        <KpiBox label="Valor a custo" value={formatBRL(data.summary.totalValueCost)} />
        <KpiBox label="Valor a varejo" value={formatBRL(data.summary.totalValueRetail)} tone="positive" />
        <KpiBox label="Alertas" value={formatNumber(data.summary.belowMinCount + data.summary.zeroStockCount)} tone="warning" hint={`${data.summary.belowMinCount} abaixo mín · ${data.summary.zeroStockCount} zerados`} />
      </div>

      <div className="rounded-lg border bg-white p-4">
        <h3 className="mb-3 font-semibold">Por local</h3>
        <table className="w-full text-sm">
          <thead className="text-xs uppercase text-gray-600">
            <tr><th className="px-3 py-2 text-left">Código</th><th className="px-3 py-2 text-left">Local</th><th className="px-3 py-2 text-right">SKUs</th><th className="px-3 py-2 text-right">Qtd</th><th className="px-3 py-2 text-right">Valor (custo)</th></tr>
          </thead>
          <tbody className="divide-y">
            {data.byLocation.map((l) => (
              <tr key={l.code}>
                <td className="px-3 py-2 font-mono text-xs">{l.code}</td>
                <td className="px-3 py-2">{l.name}</td>
                <td className="px-3 py-2 text-right">{l.items}</td>
                <td className="px-3 py-2 text-right">{formatNumber(l.qty)}</td>
                <td className="px-3 py-2 text-right">{formatBRL(l.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          { id: "all", label: `Todos (${data.rows.length})` },
          { id: "belowMin", label: `Abaixo mínimo (${data.summary.belowMinCount})` },
          { id: "belowSafety", label: `Abaixo segurança (${data.summary.belowSafetyCount})` },
          { id: "zero", label: `Zerados (${data.summary.zeroStockCount})` },
        ].map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id as typeof filter)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${filter === f.id ? "bg-brand-600 text-white" : "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-600">
            <tr>
              <th className="px-3 py-2 text-left">Local</th>
              <th className="px-3 py-2 text-left">SKU</th>
              <th className="px-3 py-2 text-left">Produto</th>
              <th className="px-3 py-2 text-left">Cor / Tam.</th>
              <th className="px-3 py-2 text-right">Qtd</th>
              <th className="px-3 py-2 text-right">Reserv.</th>
              <th className="px-3 py-2 text-right">Disp.</th>
              <th className="px-3 py-2 text-right">Mín</th>
              <th className="px-3 py-2 text-right">Seg.</th>
              <th className="px-3 py-2 text-right">Máx</th>
              <th className="px-3 py-2 text-right">Vlr custo</th>
              <th className="px-3 py-2 text-left">Últ. cont.</th>
              <th className="px-3 py-2 text-left">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.map((r) => (
              <tr key={r.positionId} className={r.belowMin ? "bg-red-50" : r.belowSafety ? "bg-amber-50" : ""}>
                <td className="px-3 py-2 text-xs">{r.locationCode}</td>
                <td className="px-3 py-2 font-mono text-xs">{r.sku}</td>
                <td className="px-3 py-2"><div className="font-medium">{r.productName}</div><div className="text-xs text-gray-500">{r.collection} · {r.category}</div></td>
                <td className="px-3 py-2 text-xs"><span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded-full border" style={{ background: r.colorHex }} />{r.color}</span> · {r.size}</td>
                <td className="px-3 py-2 text-right font-medium">{formatNumber(r.quantity)}</td>
                <td className="px-3 py-2 text-right">{formatNumber(r.reserved)}</td>
                <td className="px-3 py-2 text-right">{formatNumber(r.available)}</td>
                <td className="px-3 py-2 text-right text-xs">{r.minStock}</td>
                <td className="px-3 py-2 text-right text-xs">{r.safetyStock}</td>
                <td className="px-3 py-2 text-right text-xs">{r.maxStock}</td>
                <td className="px-3 py-2 text-right">{formatBRL(r.stockValueCost)}</td>
                <td className="px-3 py-2 text-xs">{formatDate(r.lastCountAt)}</td>
                <td className="px-3 py-2 text-xs">
                  {r.quantity === 0 ? <span className="text-red-600">Zerado</span> : r.belowMin ? <span className="text-red-600">↓ mín</span> : r.belowSafety ? <span className="text-amber-600">↓ seg.</span> : <span className="text-emerald-600">OK</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ReportShell>
  );
}
