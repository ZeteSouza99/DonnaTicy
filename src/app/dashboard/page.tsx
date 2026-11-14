"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, ShoppingBag, Wallet, Target, TrendingUp, RefreshCw, AlertTriangle, Users, RotateCcw, Plus, Package } from "lucide-react";
import { useApiQuery } from "@/hooks/use-api-query";
import { useSessionUser } from "@/components/layout/session-context";
import { PageHeader } from "@/components/ui/page-header";
import { LoadingSpinner, ErrorMessage } from "@/components/ui/feedback";
import { SalesChart } from "@/components/dashboard/sales-chart";
import { formatBRL } from "@/lib/format";
import { can } from "@/lib/permissions";

type DashboardData = {
 period: { from: string; to: string; previousFrom: string; previousTo: string };
 settings: { monthlySalesGoal: number; activeCustomerDays: number };
 kpis: { faturamentoMes: number; crescimentoVsMesAnterior: number | null; ticketMedio: number; margemBruta: number; totalPedidosMes: number; totalClientes: number; novosClientesMes: number; alertasEstoqueBaixo: number; devolucoesEmAberto: number };
 breakdowns: { daily: Array<{ day: string; total: number }>; pedidosPorStatus: Array<{ status: string; count: number }>; pedidosPorCanal: Array<{ channel: string; count: number; total: number }>; topProdutos: Array<{ variantId: string; name: string; sku: string; quantidadeVendida: number; faturamento: number }> };
};
const channels: Record<string, string> = { STORE: "Loja física", ECOMMERCE: "E-commerce", CLICK_COLLECT: "Retirada", WHATSAPP: "WhatsApp", MARKETPLACE: "Marketplace" };
export default function DashboardPage() {
 const user = useSessionUser();
 const [from, setFrom] = useState(""), [to, setTo] = useState(""), [location, setLocation] = useState("");
 const params = new URLSearchParams(); if(from) params.set("from", from); if(to) params.set("to", to); if(location) params.set("locationId", location);
 const { data, error, loading, refresh } = useApiQuery<DashboardData>(`/api/dashboard/kpis?${params}`);
 const { data: locations } = useApiQuery<{ data: Array<{ id: string; name: string }> }>(can(user.role, "inventory", "read") ? "/api/inventory/locations?limit=100" : null);
 if (!data && loading) return <LoadingSpinner />;
 if (!data) return <ErrorMessage message={error ?? "Indicadores indisponíveis."} onRetry={refresh} />;
 const k = data.kpis;
 const stats = [
  { label: "Vendas confirmadas", value: formatBRL(k.faturamentoMes), icon: Wallet, detail: k.crescimentoVsMesAnterior === null ? "Sem base no período anterior" : `${k.crescimentoVsMesAnterior > 0 ? "+" : ""}${k.crescimentoVsMesAnterior}% no período comparável` },
  { label: "Pedidos confirmados", value: k.totalPedidosMes.toLocaleString("pt-BR"), icon: ShoppingBag, detail: "Pagos e em atendimento" },
  { label: "Ticket médio", value: formatBRL(k.ticketMedio), icon: Target, detail: "Por pedido confirmado" },
  { label: "Margem sobre vendas", value: `${k.margemBruta.toLocaleString("pt-BR")}%`, icon: TrendingUp, detail: "Vendas menos CMV do período" },
 ];
 const maxChannel = Math.max(...data.breakdowns.pedidosPorCanal.map((c) => c.total),1);
 const goal = data.settings.monthlySalesGoal;
 return <div className="space-y-6" aria-busy={loading}>
  <PageHeader title="Visão geral" description={`Olá, ${user.name.split(" ")[0]}. Acompanhe o movimento da sua operação.`} actions={<>{can(user.role,"orders","write") && <Link href="/dashboard/vendas" className="btn-primary"><Plus size={17} />Nova venda</Link>}<button className="btn-secondary" onClick={refresh} aria-label="Atualizar indicadores"><RefreshCw size={16} className={loading ? "animate-spin" : ""} /></button></>} />
  <div className="grid grid-cols-2 items-end gap-3 rounded-xl sm:flex sm:flex-wrap border border-gray-200 bg-white p-3">
   <label className="min-w-0 flex-1"><span className="field-label">De</span><input type="date" aria-label="Data inicial" className="field-input" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
   <label className="min-w-0 flex-1"><span className="field-label">Até</span><input type="date" aria-label="Data final" className="field-input" value={to} onChange={(e) => setTo(e.target.value)} /></label>
   {locations && <label className="min-w-0 flex-1"><span className="field-label">Local de estoque</span><select className="field-input" value={location} onChange={(e) => setLocation(e.target.value)}><option value="">Todos os locais</option>{locations.data.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>}
   <button className="btn-secondary" onClick={() => { setFrom(""); setTo(""); setLocation(""); }}>Este mês</button>
  </div>
  {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
  <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{stats.map(({label,value,detail,icon:Icon}) => <article key={label} className="panel !p-4 sm:!p-5"><div className="flex items-center justify-between gap-2"><span className="text-xs font-medium text-gray-500">{label}</span><Icon size={17} className="shrink-0 text-brand-600" /></div><p className="stat-value mt-4">{value}</p><p className="mt-2 text-[11px] leading-relaxed text-gray-500">{detail}</p></article>)}</div>
  <div className="grid gap-6 xl:grid-cols-[minmax(0,1.75fr)_minmax(260px,1fr)]">
   <section className="panel min-w-0"><div className="flex items-center justify-between"><div><h2 className="panel-title">Evolução das vendas</h2><p className="mt-1 text-xs text-gray-500">Pedidos confirmados no período selecionado</p></div><span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700">{k.totalPedidosMes} {k.totalPedidosMes === 1 ? "pedido" : "pedidos"}</span></div><SalesChart points={data.breakdowns.daily} /></section>
   <section className="panel"><h2 className="panel-title">Atenção na operação</h2><p className="mt-1 text-xs text-gray-500">Pendências para acompanhar hoje</p><div className="mt-5 space-y-3">
    {can(user.role,"inventory","read") && <Link className="flex items-center gap-3 rounded-xl bg-amber-50 p-4" href="/dashboard/estoque?belowMin=true"><AlertTriangle size={20} className="text-amber-700" /><span className="flex-1"><strong className="block text-sm text-gray-900">{k.alertasEstoqueBaixo} alertas de estoque</strong><span className="text-xs text-gray-600">Saldo disponível abaixo do mínimo</span></span><ArrowUpRight size={16} /></Link>}
    {can(user.role,"logistics","read") && <Link className="flex items-center gap-3 rounded-xl bg-gray-50 p-4" href="/dashboard/logistica"><RotateCcw size={20} className="text-gray-500" /><span className="flex-1"><strong className="block text-sm text-gray-900">{k.devolucoesEmAberto} devoluções abertas</strong><span className="text-xs text-gray-600">Acompanhar atendimento</span></span><ArrowUpRight size={16} /></Link>}
    <div className="flex items-center gap-3 rounded-xl bg-brand-50 p-4"><Users size={20} className="text-brand-600" /><span><strong className="block text-sm text-gray-900">{k.totalClientes} {k.totalClientes === 1 ? "cliente ativo" : "clientes ativos"}</strong><span className="text-xs text-gray-600">Compraram nos últimos {data.settings.activeCustomerDays} dias</span></span></div>
   </div><div className="mt-6 border-t pt-5"><div className="flex items-center justify-between"><h3 className="text-xs font-semibold text-gray-700">Meta mensal</h3>{goal > 0 && !from && !to && <span className="text-xs font-semibold text-brand-700">{Math.round(k.faturamentoMes / goal * 100)}%</span>}</div>{goal > 0 && !from && !to ? <><div className="my-3 h-2 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full bg-brand-600" style={{width: `${Math.min(100,k.faturamentoMes/goal*100)}%`}} /></div><p className="text-xs text-gray-500">{formatBRL(k.faturamentoMes)} de {formatBRL(goal)}{location && " · meta geral da operação"}</p></> : <p className="mt-3 text-xs text-gray-500">{from || to ? "Selecione Este mês para acompanhar a meta." : "Defina a meta em Configurações → Parâmetros."}</p>}</div></section>
  </div>
  <div className="grid gap-6 lg:grid-cols-2"><section className="panel"><h2 className="panel-title">Produtos mais vendidos</h2><div className="mt-4 divide-y divide-gray-100">{!data.breakdowns.topProdutos.length && <p className="py-8 text-sm text-gray-500">Nenhuma venda de produto no período.</p>}{data.breakdowns.topProdutos.map((p,i) => <div key={p.variantId} className="flex items-center gap-3 py-4"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-50 text-xs font-semibold text-gray-500">{String(i+1).padStart(2,"0")}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-gray-800">{p.name}</p><p className="mt-1 truncate text-xs text-gray-500">{p.sku} · {p.quantidadeVendida} {p.quantidadeVendida === 1 ? "unidade" : "unidades"}</p></div><span className="text-sm font-semibold tabular-nums">{formatBRL(p.faturamento)}</span></div>)}</div></section>
   <section className="panel"><h2 className="panel-title">Vendas por canal</h2><div className="mt-6 space-y-5">{!data.breakdowns.pedidosPorCanal.length && <div className="py-8 text-sm text-gray-500"><Package size={24} className="mb-3" />Os canais aparecem após a primeira venda.</div>}{data.breakdowns.pedidosPorCanal.map((c) => <div key={c.channel}><div className="mb-2 flex justify-between text-sm"><span className="text-gray-600">{channels[c.channel] ?? c.channel}</span><strong className="font-semibold">{formatBRL(c.total)}</strong></div><div className="h-2 rounded-full bg-gray-100"><div className="h-full rounded-full bg-brand-500" style={{width:`${c.total/maxChannel*100}%`}} /></div><p className="mt-1 text-[11px] text-gray-500">{c.count} {c.count === 1 ? "pedido" : "pedidos"}</p></div>)}</div></section></div>
 </div>;
}
