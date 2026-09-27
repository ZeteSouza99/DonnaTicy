"use client";

import { useEffect, useState, useCallback } from "react";
import {
  DollarSign,
  ShoppingCart,
  Users,
  AlertTriangle,
  TrendingUp,
  Package,
  RotateCcw,
  Target,
} from "lucide-react";
import { KpiCard } from "@/components/ui/kpi-card";
import { LoadingSpinner, ErrorMessage } from "@/components/ui/feedback";

interface DashboardKpis {
  kpis: {
    faturamentoMes: number;
    crescimentoVsMesAnterior: number;
    margemBruta: number;
    ticketMedio: number;
    totalPedidosMes: number;
    totalClientes: number;
    novosClientesMes: number;
    alertasEstoqueBaixo: number;
    devolucoesEmAberto: number;
  };
  breakdowns: {
    pedidosPorStatus: Array<{ status: string; count: number }>;
    pedidosPorCanal: Array<{ channel: string; count: number; total: number }>;
    topProdutos: Array<{ variantId: string; quantidadeVendida: number; faturamento: number }>;
  };
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

const STATUS_LABELS: Record<string, string> = {
  PENDING_PAYMENT: "Aguardando Pagamento",
  PAID: "Pago",
  PICKING: "Separando",
  PACKED: "Embalado",
  SHIPPED: "Enviado",
  IN_TRANSIT: "Em Trânsito",
  OUT_FOR_DELIVERY: "Saiu para Entrega",
  DELIVERED: "Entregue",
  CANCELLED: "Cancelado",
};

const CHANNEL_LABELS: Record<string, string> = {
  STORE: "Loja Física",
  ECOMMERCE: "E-commerce",
  CLICK_COLLECT: "Click & Collect",
  WHATSAPP: "WhatsApp",
  MARKETPLACE: "Marketplace",
};

const STATUS_COLORS: Record<string, string> = {
  PENDING_PAYMENT: "bg-amber-400",
  PAID: "bg-emerald-400",
  PICKING: "bg-blue-400",
  PACKED: "bg-indigo-400",
  SHIPPED: "bg-brand-400",
  IN_TRANSIT: "bg-cyan-400",
  OUT_FOR_DELIVERY: "bg-sky-400",
  DELIVERED: "bg-emerald-500",
  CANCELLED: "bg-rose-400",
};

const CHANNEL_COLORS: Record<string, string> = {
  STORE: "bg-brand-500",
  ECOMMERCE: "bg-blue-500",
  CLICK_COLLECT: "bg-emerald-500",
  WHATSAPP: "bg-green-500",
  MARKETPLACE: "bg-amber-500",
};

export default function DashboardPage(): React.JSX.Element {
  const [data, setData] = useState<DashboardKpis | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboard/kpis");
      if (!res.ok) throw new Error("Falha ao carregar dados");
      const json = await res.json();
      setData(json);
    } catch {
      setError("Não foi possível carregar os dados do dashboard.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (isLoading) return <div className="flex h-64 items-center justify-center"><LoadingSpinner /></div>;
  if (error) return <ErrorMessage message={error} onRetry={fetchData} />;
  if (!data) return <ErrorMessage message="Dados não disponíveis." />;

  const { kpis, breakdowns } = data;

  const maxStatusCount = Math.max(...breakdowns.pedidosPorStatus.map((s) => s.count), 1);
  const maxChannelTotal = Math.max(...breakdowns.pedidosPorCanal.map((c) => c.total), 1);

  return (
    <div className="space-y-8 pb-10">
      
      {/* Header section (optional inside main if needed, but keeping it clean) */}
      <div className="mb-4">
        <h1 className="text-2xl tracking-tight font-extrabold text-gray-900">Visão Geral</h1>
        <p className="text-sm font-medium text-gray-500 mt-1">Acompanhe seus principais indicadores de performance.</p>
      </div>

      {/* KPI Cards — Row 1 */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="Faturamento"
          value={formatCurrency(kpis.faturamentoMes)}
          trend={kpis.crescimentoVsMesAnterior}
          subtitle="vs. mês anterior"
          icon={<DollarSign className="h-[22px] w-[22px]" />}
          color="green"
        />
        <KpiCard
          title="Pedidos"
          value={kpis.totalPedidosMes}
          subtitle="neste mês"
          icon={<ShoppingCart className="h-[22px] w-[22px]" />}
          color="blue"
        />
        <KpiCard
          title="Ticket Médio"
          value={formatCurrency(kpis.ticketMedio)}
          icon={<Target className="h-[22px] w-[22px]" />}
          color="brand"
        />
        <KpiCard
          title="Margem Bruta"
          value={`${kpis.margemBruta}%`}
          icon={<TrendingUp className="h-[22px] w-[22px]" />}
          color="green"
        />
      </div>

      {/* KPI Cards — Row 2 */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="Clientes Ativos"
          value={kpis.totalClientes}
          subtitle={`+${kpis.novosClientesMes} novos`}
          icon={<Users className="h-[22px] w-[22px]" />}
          color="blue"
        />
        <KpiCard
          title="Alertas Estoque"
          value={kpis.alertasEstoqueBaixo}
          subtitle="abaixo do mínimo"
          icon={<AlertTriangle className="h-[22px] w-[22px]" />}
          color={kpis.alertasEstoqueBaixo > 0 ? "red" : "green"}
        />
        <KpiCard
          title="Devoluções"
          value={kpis.devolucoesEmAberto}
          subtitle="em processamento"
          icon={<RotateCcw className="h-[22px] w-[22px]" />}
          color={kpis.devolucoesEmAberto > 5 ? "orange" : "brand"}
        />
        <KpiCard
          title="Novos Clientes"
          value={kpis.novosClientesMes}
          subtitle="neste mês"
          icon={<Package className="h-[22px] w-[22px]" />}
          color="brand"
        />
      </div>

      {/* Breakdowns */}
      <div className="grid grid-cols-1 gap-8 xl:grid-cols-2 pb-6">
        {/* Orders by Status */}
        <div className="group overflow-hidden rounded-[24px] bg-white p-7 shadow-[var(--shadow-premium)] transition-shadow duration-300 hover:shadow-[var(--shadow-premium-hover)]">
          <div className="mb-6 flex items-baseline justify-between">
            <div>
              <h2 className="text-[16px] font-bold tracking-tight text-gray-900">Pedidos por Status</h2>
              <p className="mt-1 text-[13px] font-medium text-gray-400">Distribuição dos pedidos no mês</p>
            </div>
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-50 text-gray-400 group-hover:bg-brand-50 group-hover:text-brand-600 transition-colors">
              <Package className="h-4 w-4" />
            </span>
          </div>

          <div className="space-y-5">
            {breakdowns.pedidosPorStatus.length === 0 ? (
              <p className="text-[14px] font-medium text-gray-400 text-center py-6 bg-gray-50/50 rounded-xl">Nenhum pedido no período.</p>
            ) : (
              breakdowns.pedidosPorStatus.map((item) => (
                <div key={item.status} className="space-y-2">
                  <div className="flex items-center justify-between text-[13.5px]">
                    <span className="font-semibold text-gray-700">
                      {STATUS_LABELS[item.status] ?? item.status}
                    </span>
                    <span className="font-bold text-gray-900 bg-gray-50 px-2 py-0.5 rounded-md">{item.count}</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100 shadow-inner">
                    <div
                      className={`h-full rounded-full transition-all duration-1000 ease-out ${STATUS_COLORS[item.status] ?? "bg-gray-400"}`}
                      style={{ width: `${(item.count / maxStatusCount) * 100}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Orders by Channel */}
        <div className="group overflow-hidden rounded-[24px] bg-white p-7 shadow-[var(--shadow-premium)] transition-shadow duration-300 hover:shadow-[var(--shadow-premium-hover)]">
          <div className="mb-6 flex items-baseline justify-between">
            <div>
              <h2 className="text-[16px] font-bold tracking-tight text-gray-900">Vendas por Canal</h2>
              <p className="mt-1 text-[13px] font-medium text-gray-400">Faturamento por canal de venda</p>
            </div>
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-50 text-gray-400 group-hover:bg-brand-50 group-hover:text-brand-600 transition-colors">
              <ShoppingCart className="h-4 w-4" />
            </span>
          </div>

          <div className="space-y-5">
            {breakdowns.pedidosPorCanal.length === 0 ? (
              <p className="text-[14px] font-medium text-gray-400 text-center py-6 bg-gray-50/50 rounded-xl">Nenhuma venda no período.</p>
            ) : (
              breakdowns.pedidosPorCanal.map((item) => (
                <div key={item.channel} className="space-y-2">
                  <div className="flex items-center justify-between text-[13.5px]">
                    <div className="flex items-center gap-2.5">
                      <div className={`h-2.5 w-2.5 rounded-full ring-2 ring-white shadow-sm ${CHANNEL_COLORS[item.channel] ?? "bg-gray-400"}`} />
                      <span className="font-semibold text-gray-700">
                        {CHANNEL_LABELS[item.channel] ?? item.channel}
                      </span>
                      <span className="text-[12px] font-medium text-gray-400">({item.count})</span>
                    </div>
                    <span className="font-bold text-gray-900 tracking-tight">
                      {formatCurrency(item.total)}
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100 shadow-inner">
                    <div
                      className={`h-full rounded-full transition-all duration-1000 ease-out ${CHANNEL_COLORS[item.channel] ?? "bg-gray-400"}`}
                      style={{ width: `${(item.total / maxChannelTotal) * 100}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
