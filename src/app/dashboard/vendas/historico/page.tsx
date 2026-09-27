"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Search, ClipboardList, Receipt, Repeat } from "lucide-react";
import { clientFetch } from "@/lib/client-fetch";
import { useDebounce } from "@/hooks/use-debounce";
import { DataTable } from "@/components/ui/data-table";
import { Pagination } from "@/components/ui/pagination";
import { LoadingSpinner, EmptyState, ErrorMessage } from "@/components/ui/feedback";

interface Order {
  id: string;
  code: string;
  status: string;
  channel: string;
  total: number;
  placedAt: string;
  customer?: { fullName: string };
  location?: { name: string };
}

interface OrdersResponse {
  data: Order[];
  total: number;
  page: number;
  totalPages: number;
}

interface Exchange {
  id: string;
  code: string;
  amountReturned: number;
  amountNew: number;
  difference: number;
  settlementType: string;
  paymentMethod: string | null;
  createdAt: string;
  order: { id: string; code: string };
  customer?: { fullName: string };
  location?: { name: string };
  storeCredit?: { code: string; remainingAmount: number } | null;
}

interface ExchangesResponse {
  data: Exchange[];
  total: number;
  page: number;
  totalPages: number;
}

const SETTLEMENT_LABELS: Record<string, string> = {
  CHARGED: "Diferença cobrada",
  STORE_CREDIT: "Vale-troca",
  EVEN: "Sem diferença",
};

const SETTLEMENT_COLORS: Record<string, string> = {
  CHARGED: "bg-blue-100 text-blue-800",
  STORE_CREDIT: "bg-purple-100 text-purple-800",
  EVEN: "bg-gray-100 text-gray-700",
};

const PAYMENT_LABELS: Record<string, string> = {
  CASH: "Dinheiro",
  PIX: "Pix",
  DEBIT: "Débito",
  DEBIT_CARD: "Débito",
  CREDIT: "Crédito",
  CREDIT_CARD: "Crédito",
};

const STATUS_LABELS: Record<string, string> = {
  PENDING_PAYMENT: "Aguardando Pgto",
  PAID: "Pago",
  PICKING: "Separação",
  PACKED: "Embalado",
  SHIPPED: "Enviado",
  IN_TRANSIT: "Em Trânsito",
  OUT_FOR_DELIVERY: "Saiu p/ Entrega",
  DELIVERED: "Entregue",
  CANCELLED: "Cancelado",
};

const STATUS_COLORS: Record<string, string> = {
  PENDING_PAYMENT: "bg-yellow-100 text-yellow-800",
  PAID: "bg-blue-100 text-blue-800",
  PICKING: "bg-indigo-100 text-indigo-800",
  PACKED: "bg-purple-100 text-purple-800",
  SHIPPED: "bg-cyan-100 text-cyan-800",
  IN_TRANSIT: "bg-cyan-100 text-cyan-800",
  OUT_FOR_DELIVERY: "bg-teal-100 text-teal-800",
  DELIVERED: "bg-green-100 text-green-800",
  CANCELLED: "bg-red-100 text-red-800",
};

// Status considerados "Vendas concluídas"
const SALES_STATUSES = [
  "PAID",
  "PICKING",
  "PACKED",
  "SHIPPED",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
];

type Tab = "pedidos" | "vendas" | "trocas";

function HistoricoContent(): React.ReactNode {
  const router = useRouter();
  const params = useSearchParams();
  const paramTab = params.get("aba");
  const initialTab: Tab = paramTab === "vendas" ? "vendas" : paramTab === "trocas" ? "trocas" : "pedidos";

  const [tab, setTab] = useState<Tab>(initialTab);
  const [orders, setOrders] = useState<OrdersResponse | null>(null);
  const [exchanges, setExchanges] = useState<ExchangesResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 500);
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
    setStatusFilter("");
  }, [debouncedSearch, tab]);

  const fetchOrders = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      if (tab === "trocas") {
        const sp = new URLSearchParams({ page: String(page), limit: "20" });
        const data = await clientFetch<ExchangesResponse>(`/api/sales/exchanges?${sp}`);
        setExchanges(data);
        return;
      }
      const sp = new URLSearchParams({ page: String(page), limit: "20" });
      if (debouncedSearch) sp.set("search", debouncedSearch);

      // Filtro server-side: na aba "vendas" sem status específico, envia a lista completa
      if (statusFilter) {
        sp.set("status", statusFilter);
      } else if (tab === "vendas") {
        sp.set("status", SALES_STATUSES.join(","));
      }

      const data = await clientFetch<OrdersResponse>(`/api/orders?${sp}`);
      setOrders(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar histórico.");
    } finally {
      setIsLoading(false);
    }
  }, [page, debouncedSearch, statusFilter, tab]);

  useEffect(() => {
    void fetchOrders();
  }, [fetchOrders]);

  const columns = [
    { key: "code", label: "Nº Pedido" },
    {
      key: "customer",
      label: "Cliente",
      render: (o: Order) => o.customer?.fullName ?? "Não informado",
    },
    {
      key: "status",
      label: "Status",
      render: (o: Order) => (
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_COLORS[o.status] ?? "bg-gray-100 text-gray-700"}`}
        >
          {STATUS_LABELS[o.status] ?? o.status}
        </span>
      ),
    },
    { key: "channel", label: "Canal" },
    {
      key: "total",
      label: "Total",
      render: (o: Order) =>
        Number(o.total ?? 0).toLocaleString("pt-BR", {
          style: "currency",
          currency: "BRL",
        }),
    },
    {
      key: "placedAt",
      label: "Data",
      render: (o: Order) => new Date(o.placedAt).toLocaleDateString("pt-BR"),
    },
    { key: "location", label: "Loja", render: (o: Order) => o.location?.name ?? "—" },
  ];

  const brl = (v: number): string =>
    Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const exchangeColumns = [
    { key: "code", label: "Nº Troca" },
    { key: "order", label: "Pedido", render: (e: Exchange) => e.order.code },
    {
      key: "customer",
      label: "Cliente",
      render: (e: Exchange) => e.customer?.fullName ?? "Não informado",
    },
    {
      key: "settlementType",
      label: "Acerto",
      render: (e: Exchange) => (
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${SETTLEMENT_COLORS[e.settlementType] ?? "bg-gray-100 text-gray-700"}`}
        >
          {SETTLEMENT_LABELS[e.settlementType] ?? e.settlementType}
          {e.storeCredit ? ` (${e.storeCredit.code})` : ""}
        </span>
      ),
    },
    { key: "amountReturned", label: "Devolvido", render: (e: Exchange) => brl(e.amountReturned) },
    { key: "amountNew", label: "Novo", render: (e: Exchange) => brl(e.amountNew) },
    {
      key: "difference",
      label: "Diferença",
      render: (e: Exchange) => (
        <span className={e.difference > 0 ? "font-medium text-green-700" : e.difference < 0 ? "font-medium text-purple-700" : ""}>
          {brl(e.difference)}
        </span>
      ),
    },
    {
      key: "paymentMethod",
      label: "Pagamento",
      render: (e: Exchange) =>
        e.paymentMethod ? (PAYMENT_LABELS[e.paymentMethod] ?? e.paymentMethod) : "—",
    },
    {
      key: "createdAt",
      label: "Data",
      render: (e: Exchange) => new Date(e.createdAt).toLocaleDateString("pt-BR"),
    },
  ];

  const statusOptions =
    tab === "vendas"
      ? Object.entries(STATUS_LABELS).filter(([k]) => SALES_STATUSES.includes(k))
      : Object.entries(STATUS_LABELS);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push("/dashboard/vendas")}
            className="rounded-lg p-2 text-gray-700 hover:bg-gray-200"
            aria-label="Voltar ao PDV"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-2xl font-bold text-gray-900">Histórico</h1>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        <button
          type="button"
          onClick={() => setTab("pedidos")}
          className={`inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition ${
            tab === "pedidos"
              ? "border-brand-600 text-brand-700"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <ClipboardList size={14} />
          Histórico de Pedidos
        </button>
        <button
          type="button"
          onClick={() => setTab("vendas")}
          className={`inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition ${
            tab === "vendas"
              ? "border-brand-600 text-brand-700"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <Receipt size={14} />
          Histórico de Vendas
        </button>
        <button
          type="button"
          onClick={() => setTab("trocas")}
          className={`inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition ${
            tab === "trocas"
              ? "border-brand-600 text-brand-700"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <Repeat size={14} />
          Trocas
        </button>
      </div>

      {tab !== "trocas" && (
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative min-w-50 flex-1">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            size={18}
          />
          <input
            type="text"
            placeholder="Buscar por nº pedido ou cliente..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-4 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          aria-label="Filtrar por status"
        >
          <option value="">{tab === "vendas" ? "Todas as vendas" : "Todos os status"}</option>
          {statusOptions.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      )}

      {tab === "trocas" ? (
        <>
          {isLoading && !exchanges && <LoadingSpinner />}
          {error && !exchanges && <ErrorMessage message={error} onRetry={fetchOrders} />}
          {!isLoading && !error && exchanges && exchanges.data.length === 0 && (
            <EmptyState
              title="Nenhuma troca registrada"
              description="As trocas realizadas no PDV aparecerão aqui."
            />
          )}
          {exchanges && exchanges.data.length > 0 && (
            <div className={isLoading ? "opacity-50 transition-opacity" : "transition-opacity"}>
              <DataTable
                columns={exchangeColumns}
                data={exchanges.data}
                keyExtractor={(e) => e.id}
                onRowClick={(e) => router.push(`/dashboard/vendas/${e.order.id}`)}
              />
              <Pagination
                page={exchanges.page}
                totalPages={exchanges.totalPages}
                onPageChange={setPage}
              />
            </div>
          )}
        </>
      ) : (
        <>
      {isLoading && !orders && <LoadingSpinner />}
      {error && !orders && <ErrorMessage message={error} onRetry={fetchOrders} />}
      {!isLoading && !error && orders && orders.data.length === 0 && (
        <EmptyState
          title={tab === "vendas" ? "Nenhuma venda encontrada" : "Nenhum pedido encontrado"}
          description="Nenhum registro corresponde aos filtros selecionados."
        />
      )}
      {orders && orders.data.length > 0 && (
        <div className={isLoading ? "opacity-50 transition-opacity" : "transition-opacity"}>
          <DataTable
            columns={columns}
            data={orders.data}
            keyExtractor={(o) => o.id}
            onRowClick={(o) => router.push(`/dashboard/vendas/${o.id}`)}
          />
          <Pagination
            page={orders.page}
            totalPages={orders.totalPages}
            onPageChange={setPage}
          />
        </div>
      )}
        </>
      )}
    </div>
  );
}

export default function HistoricoPage(): React.ReactNode {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <HistoricoContent />
    </Suspense>
  );
}
