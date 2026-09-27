"use client";

import { useEffect, useState } from "react";
import { clientFetch } from "@/lib/client-fetch";
import { ReportShell, KpiBox } from "@/components/reports/report-shell";
import { formatBRL, formatNumber, formatPct } from "@/lib/format";
import { Loader2 } from "lucide-react";

interface Row {
  id: string;
  type: string;
  companyName: string;
  tradeName: string | null;
  cnpj: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  qualityScore: number;
  deliveryScore: number;
  avgScore: number;
  paymentTerms: string | null;
  minOrderValue: number | null;
  materialsCount: number;
  ordersCount: number;
  completedOrders: number;
  pendingOrders: number;
  cancelledOrders: number;
  totalSpent: number;
  avgOrderValue: number;
  isActive: boolean;
}

interface Resp {
  summary: {
    total: number;
    active: number;
    totalSpent: number;
    totalOrders: number;
    avgQuality: number;
    avgDelivery: number;
    byType: Record<string, number>;
  };
  rows: Row[];
}

export default function SuppliersReportPage(): React.ReactNode {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    clientFetch<Resp>("/api/reports/suppliers")
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 className="animate-spin" /></div>;
  if (!data) return <div>Erro ao carregar dados.</div>;

  return (
    <ReportShell
      title="Performance de Fornecedores"
      description="Pedidos, valor gasto, scores de qualidade e entrega"
      exportFilename="fornecedores"
      exportRows={data.rows as unknown as Record<string, unknown>[]}
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <KpiBox label="Fornecedores" value={formatNumber(data.summary.total)} hint={`${data.summary.active} ativos`} />
        <KpiBox label="Pedidos totais" value={formatNumber(data.summary.totalOrders)} />
        <KpiBox label="Valor gasto" value={formatBRL(data.summary.totalSpent)} tone="negative" />
        <KpiBox label="Qualidade média" value={data.summary.avgQuality.toFixed(2)} hint="0-10" />
        <KpiBox label="Entrega média" value={data.summary.avgDelivery.toFixed(2)} hint="0-10" />
        <KpiBox label="Tipos" value={Object.values(data.summary.byType).reduce((s, n) => s + n, 0).toString()} />
      </div>

      <div className="overflow-x-auto rounded-lg border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-600">
            <tr>
              <th className="px-3 py-2 text-left">Empresa</th>
              <th className="px-3 py-2 text-left">CNPJ</th>
              <th className="px-3 py-2 text-left">Tipo</th>
              <th className="px-3 py-2 text-left">Contato</th>
              <th className="px-3 py-2 text-right">Materiais</th>
              <th className="px-3 py-2 text-right">Pedidos</th>
              <th className="px-3 py-2 text-right">Recebidos</th>
              <th className="px-3 py-2 text-right">Pendentes</th>
              <th className="px-3 py-2 text-right">Total gasto</th>
              <th className="px-3 py-2 text-right">Tkt médio</th>
              <th className="px-3 py-2 text-center">Qualidade</th>
              <th className="px-3 py-2 text-center">Entrega</th>
              <th className="px-3 py-2 text-center">Score</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {data.rows.map((r) => (
              <tr key={r.id} className={!r.isActive ? "opacity-60" : ""}>
                <td className="px-3 py-2"><div className="font-medium">{r.companyName}</div>{r.tradeName && <div className="text-xs text-gray-500">{r.tradeName}</div>}</td>
                <td className="px-3 py-2 font-mono text-xs">{r.cnpj}</td>
                <td className="px-3 py-2 text-xs">{r.type}</td>
                <td className="px-3 py-2 text-xs text-gray-600">{r.contactName ?? "—"}<br />{r.phone ?? r.email ?? ""}</td>
                <td className="px-3 py-2 text-right">{r.materialsCount}</td>
                <td className="px-3 py-2 text-right">{r.ordersCount}</td>
                <td className="px-3 py-2 text-right text-emerald-600">{r.completedOrders}</td>
                <td className="px-3 py-2 text-right text-amber-600">{r.pendingOrders}</td>
                <td className="px-3 py-2 text-right font-medium">{formatBRL(r.totalSpent)}</td>
                <td className="px-3 py-2 text-right">{formatBRL(r.avgOrderValue)}</td>
                <td className="px-3 py-2 text-center">{r.qualityScore.toFixed(1)}</td>
                <td className="px-3 py-2 text-center">{r.deliveryScore.toFixed(1)}</td>
                <td className="px-3 py-2 text-center font-bold">{r.avgScore.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="border-t bg-gray-50 px-3 py-2 text-xs text-gray-500">
          Pontuação fictícia inicial (5.0) — atualizar conforme {formatPct(0)} histórico de pedidos.
        </div>
      </div>
    </ReportShell>
  );
}
