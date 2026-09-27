"use client";

import { useEffect, useState } from "react";
import { clientFetch } from "@/lib/client-fetch";
import { ReportShell, KpiBox } from "@/components/reports/report-shell";
import { formatBRL, formatNumber, formatDate } from "@/lib/format";
import { Loader2 } from "lucide-react";

interface Row {
  id: string;
  code: string;
  name: string;
  email: string | null;
  phone: string | null;
  cpf: string | null;
  tier: string;
  lifetimeValue: number;
  totalOrders: number;
  avgTicket: number;
  loyaltyPoints: number;
  firstPurchaseAt: string | null;
  lastPurchaseAt: string | null;
  daysSinceLastPurchase: number | null;
  avgRepurchaseDays: number | null;
  churnRisk: string;
  acquisitionChannel: string | null;
  isActive: boolean;
}

interface Resp {
  summary: {
    total: number;
    active: number;
    totalLTV: number;
    avgLTV: number;
    totalOrders: number;
    avgTicket: number;
    byTier: Record<string, number>;
    churnRisk: Record<string, number>;
    noPurchases: number;
  };
  rows: Row[];
}

const TIER_COLOR: Record<string, string> = {
  BRONZE: "bg-amber-100 text-amber-800",
  SILVER: "bg-gray-200 text-gray-800",
  GOLD: "bg-yellow-100 text-yellow-800",
  VIP: "bg-purple-100 text-purple-800",
};

const RISK_COLOR: Record<string, string> = {
  LOW: "text-emerald-600",
  MEDIUM: "text-amber-600",
  HIGH: "text-red-600",
  CHURNED: "text-gray-500",
};

export default function CustomersReportPage(): React.ReactNode {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    clientFetch<Resp>("/api/reports/customers")
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 className="animate-spin" /></div>;
  if (!data) return <div>Erro ao carregar dados.</div>;

  return (
    <ReportShell
      title="Análise de Clientes"
      description="LTV, ticket médio, tier, churn risk e recência"
      exportFilename="clientes"
      exportRows={data.rows as unknown as Record<string, unknown>[]}
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
        <KpiBox label="Clientes" value={formatNumber(data.summary.total)} hint={`${data.summary.active} ativos`} />
        <KpiBox label="LTV total" value={formatBRL(data.summary.totalLTV)} tone="positive" />
        <KpiBox label="LTV médio" value={formatBRL(data.summary.avgLTV)} />
        <KpiBox label="Ticket médio" value={formatBRL(data.summary.avgTicket)} />
        <KpiBox label="Pedidos totais" value={formatNumber(data.summary.totalOrders)} />
        <KpiBox label="Sem compras" value={formatNumber(data.summary.noPurchases)} tone="warning" />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border bg-white p-4">
          <h3 className="mb-3 font-semibold">Por tier</h3>
          <div className="space-y-2">
            {Object.entries(data.summary.byTier).map(([tier, count]) => (
              <div key={tier} className="flex items-center justify-between">
                <span className={`rounded px-2 py-0.5 text-xs font-medium ${TIER_COLOR[tier]}`}>{tier}</span>
                <span className="font-medium">{count}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <h3 className="mb-3 font-semibold">Churn risk</h3>
          <div className="space-y-2">
            {Object.entries(data.summary.churnRisk).map(([risk, count]) => (
              <div key={risk} className="flex items-center justify-between">
                <span className={`text-sm font-medium ${RISK_COLOR[risk]}`}>{risk}</span>
                <span className="font-medium">{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-600">
            <tr>
              <th className="px-3 py-2 text-left">Código</th>
              <th className="px-3 py-2 text-left">Cliente</th>
              <th className="px-3 py-2 text-left">Contato</th>
              <th className="px-3 py-2 text-center">Tier</th>
              <th className="px-3 py-2 text-right">LTV</th>
              <th className="px-3 py-2 text-right">Pedidos</th>
              <th className="px-3 py-2 text-right">Ticket</th>
              <th className="px-3 py-2 text-right">Pontos</th>
              <th className="px-3 py-2 text-left">1ª compra</th>
              <th className="px-3 py-2 text-left">Últ. compra</th>
              <th className="px-3 py-2 text-right">Dias</th>
              <th className="px-3 py-2 text-center">Risco</th>
              <th className="px-3 py-2 text-left">Canal</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {data.rows.map((r) => (
              <tr key={r.id} className={!r.isActive ? "opacity-60" : ""}>
                <td className="px-3 py-2 font-mono text-xs">{r.code}</td>
                <td className="px-3 py-2 font-medium">{r.name}</td>
                <td className="px-3 py-2 text-xs text-gray-600">{r.email ?? r.phone ?? "—"}</td>
                <td className="px-3 py-2 text-center">
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${TIER_COLOR[r.tier]}`}>{r.tier}</span>
                </td>
                <td className="px-3 py-2 text-right font-medium">{formatBRL(r.lifetimeValue)}</td>
                <td className="px-3 py-2 text-right">{r.totalOrders}</td>
                <td className="px-3 py-2 text-right">{formatBRL(r.avgTicket)}</td>
                <td className="px-3 py-2 text-right">{formatNumber(r.loyaltyPoints)}</td>
                <td className="px-3 py-2 text-xs">{formatDate(r.firstPurchaseAt)}</td>
                <td className="px-3 py-2 text-xs">{formatDate(r.lastPurchaseAt)}</td>
                <td className="px-3 py-2 text-right">{r.daysSinceLastPurchase ?? "—"}</td>
                <td className={`px-3 py-2 text-center text-xs font-medium ${RISK_COLOR[r.churnRisk]}`}>{r.churnRisk}</td>
                <td className="px-3 py-2 text-xs text-gray-600">{r.acquisitionChannel ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ReportShell>
  );
}
