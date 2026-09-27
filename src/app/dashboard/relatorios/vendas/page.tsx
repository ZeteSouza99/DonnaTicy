"use client";

import { useEffect, useState, Fragment } from "react";
import { clientFetch } from "@/lib/client-fetch";
import { ReportShell, KpiBox } from "@/components/reports/report-shell";
import { formatBRL, formatNumber, formatPct, formatDateTime } from "@/lib/format";
import { toLocalDateInputValue } from "@/lib/date";
import { Loader2 } from "lucide-react";

interface Item {
  sku: string;
  productCode: string;
  productName: string;
  category: string;
  color: string;
  size: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  totalPrice: number;
  costPrice: number;
}

interface Payment {
  method: string;
  gross: number;
  net: number;
  installments: number;
  status: string;
}

interface Row {
  id: string;
  code: string;
  placedAt: string;
  paidAt: string | null;
  deliveredAt: string | null;
  channel: string;
  status: string;
  customerName: string;
  customerDocument: string | null;
  customerTier: string;
  sellerName: string | null;
  locationName: string | null;
  subtotal: number;
  discount: number;
  shipping: number;
  total: number;
  cost: number;
  profit: number;
  margin: number;
  itemsCount: number;
  items: Item[];
  payments: Payment[];
}

interface Resp {
  summary: {
    from: string; to: string;
    ordersCount: number;
    itemsCount: number;
    grossRevenue: number;
    totalCost: number;
    totalShipping: number;
    totalDiscount: number;
    totalProfit: number;
    avgTicket: number;
  };
  byChannel: { channel: string; count: number; revenue: number }[];
  byStatus: { status: string; count: number; revenue: number }[];
  rows: Row[];
  truncated: boolean;
  rowLimit: number;
}

function isoDate(d: Date): string { return toLocalDateInputValue(d); }

export default function SalesReportPage(): React.ReactNode {
  const today = new Date();
  const ago = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
  const [from, setFrom] = useState(isoDate(ago));
  const [to, setTo] = useState(isoDate(today));
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = (): void => {
    setLoading(true);
    clientFetch<Resp>(`/api/reports/sales?from=${from}&to=${to}`)
      .then(setData)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const toggle = (id: string): void => {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id); else next.add(id);
    setExpanded(next);
  };

  const exportRows = data?.rows.flatMap((o) =>
    o.items.map((i) => ({
      pedido: o.code,
      data: o.placedAt,
      cliente: o.customerName,
      canal: o.channel,
      status: o.status,
      sku: i.sku,
      produto: i.productName,
      cor: i.color,
      tam: i.size,
      qtd: i.quantity,
      preco_unit: i.unitPrice,
      desconto: i.discount,
      total_item: i.totalPrice,
      total_pedido: o.total,
    })),
  ) ?? [];

  return (
    <ReportShell
      title="Vendas por Período"
      description="Pedidos com itens, pagamentos e margem"
      exportFilename="vendas-detalhadas"
      exportRows={exportRows}
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
            <KpiBox label="Pedidos" value={formatNumber(data.summary.ordersCount)} />
            <KpiBox label="Itens" value={formatNumber(data.summary.itemsCount)} />
            <KpiBox label="Receita bruta" value={formatBRL(data.summary.grossRevenue)} tone="positive" />
            <KpiBox label="Custo" value={formatBRL(data.summary.totalCost)} />
            <KpiBox label="Frete" value={formatBRL(data.summary.totalShipping)} />
            <KpiBox label="Lucro" value={formatBRL(data.summary.totalProfit)} tone="positive" />
            <KpiBox label="Ticket médio" value={formatBRL(data.summary.avgTicket)} />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border bg-white p-4">
              <h3 className="mb-3 font-semibold">Por canal</h3>
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-gray-600"><tr><th className="px-2 py-1 text-left">Canal</th><th className="px-2 py-1 text-right">Pedidos</th><th className="px-2 py-1 text-right">Receita</th></tr></thead>
                <tbody className="divide-y">
                  {data.byChannel.map((c) => (
                    <tr key={c.channel}><td className="px-2 py-1">{c.channel}</td><td className="px-2 py-1 text-right">{c.count}</td><td className="px-2 py-1 text-right">{formatBRL(c.revenue)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="rounded-lg border bg-white p-4">
              <h3 className="mb-3 font-semibold">Por status</h3>
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-gray-600"><tr><th className="px-2 py-1 text-left">Status</th><th className="px-2 py-1 text-right">Pedidos</th><th className="px-2 py-1 text-right">Receita</th></tr></thead>
                <tbody className="divide-y">
                  {data.byStatus.map((s) => (
                    <tr key={s.status}><td className="px-2 py-1">{s.status}</td><td className="px-2 py-1 text-right">{s.count}</td><td className="px-2 py-1 text-right">{formatBRL(s.revenue)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {data.truncated && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
              Exibindo os {formatNumber(data.rowLimit)} pedidos mais recentes. Os totais acima consideram o período inteiro;
              reduza o período para ver (e exportar) todos os pedidos.
            </p>
          )}

          <div className="overflow-x-auto rounded-lg border bg-white">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-600">
                <tr>
                  <th className="px-3 py-2 text-left">Pedido</th>
                  <th className="px-3 py-2 text-left">Data</th>
                  <th className="px-3 py-2 text-left">Cliente</th>
                  <th className="px-3 py-2 text-left">Canal</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-right">Itens</th>
                  <th className="px-3 py-2 text-right">Subtotal</th>
                  <th className="px-3 py-2 text-right">Desc.</th>
                  <th className="px-3 py-2 text-right">Frete</th>
                  <th className="px-3 py-2 text-right">Total</th>
                  <th className="px-3 py-2 text-right">Custo</th>
                  <th className="px-3 py-2 text-right">Lucro</th>
                  <th className="px-3 py-2 text-right">Margem</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.rows.map((o) => (
                  <Fragment key={o.id}>
                    <tr>
                      <td className="px-3 py-2 font-mono text-xs">{o.code}</td>
                      <td className="px-3 py-2 text-xs">{formatDateTime(o.placedAt)}</td>
                      <td className="px-3 py-2"><div className="font-medium">{o.customerName}</div>{o.sellerName && <div className="text-xs text-gray-500">vend: {o.sellerName}</div>}</td>
                      <td className="px-3 py-2 text-xs">{o.channel}</td>
                      <td className="px-3 py-2 text-xs">{o.status}</td>
                      <td className="px-3 py-2 text-right">{o.itemsCount}</td>
                      <td className="px-3 py-2 text-right">{formatBRL(o.subtotal)}</td>
                      <td className="px-3 py-2 text-right">{formatBRL(o.discount)}</td>
                      <td className="px-3 py-2 text-right">{formatBRL(o.shipping)}</td>
                      <td className="px-3 py-2 text-right font-medium">{formatBRL(o.total)}</td>
                      <td className="px-3 py-2 text-right">{formatBRL(o.cost)}</td>
                      <td className="px-3 py-2 text-right text-emerald-600">{formatBRL(o.profit)}</td>
                      <td className="px-3 py-2 text-right">{formatPct(o.margin)}</td>
                      <td className="px-3 py-2 text-right">
                        <button type="button" onClick={() => toggle(o.id)} className="text-xs text-brand-600 hover:underline">{expanded.has(o.id) ? "Ocultar" : "Detalhes"}</button>
                      </td>
                    </tr>
                    {expanded.has(o.id) && (
                      <tr className="bg-gray-50">
                        <td colSpan={14} className="px-6 py-3">
                          <div className="grid gap-3 md:grid-cols-2">
                            <div>
                              <h4 className="mb-2 text-xs font-semibold uppercase text-gray-600">Itens</h4>
                              <table className="w-full text-xs">
                                <thead><tr className="text-gray-500"><th className="px-2 py-1 text-left">SKU</th><th className="px-2 py-1 text-left">Produto</th><th className="px-2 py-1 text-right">Qtd</th><th className="px-2 py-1 text-right">Unit</th><th className="px-2 py-1 text-right">Total</th></tr></thead>
                                <tbody>
                                  {o.items.map((i, idx) => (
                                    <tr key={idx}><td className="px-2 py-1 font-mono">{i.sku}</td><td className="px-2 py-1">{i.productName} ({i.color}/{i.size})</td><td className="px-2 py-1 text-right">{i.quantity}</td><td className="px-2 py-1 text-right">{formatBRL(i.unitPrice)}</td><td className="px-2 py-1 text-right">{formatBRL(i.totalPrice)}</td></tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            <div>
                              <h4 className="mb-2 text-xs font-semibold uppercase text-gray-600">Pagamentos</h4>
                              <table className="w-full text-xs">
                                <thead><tr className="text-gray-500"><th className="px-2 py-1 text-left">Método</th><th className="px-2 py-1 text-right">Bruto</th><th className="px-2 py-1 text-right">Líquido</th><th className="px-2 py-1 text-right">Parc.</th><th className="px-2 py-1 text-left">Status</th></tr></thead>
                                <tbody>
                                  {o.payments.map((p, idx) => (
                                    <tr key={idx}><td className="px-2 py-1">{p.method}</td><td className="px-2 py-1 text-right">{formatBRL(p.gross)}</td><td className="px-2 py-1 text-right">{formatBRL(p.net)}</td><td className="px-2 py-1 text-right">{p.installments}x</td><td className="px-2 py-1">{p.status}</td></tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </ReportShell>
  );
}
