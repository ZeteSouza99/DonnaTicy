"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, Trash2, Loader2 } from "lucide-react";
import { clientFetch } from "@/lib/client-fetch";
import { useDebounce } from "@/hooks/use-debounce";
import { DataTable } from "@/components/ui/data-table";
import { Pagination } from "@/components/ui/pagination";
import { LoadingSpinner, EmptyState, ErrorMessage } from "@/components/ui/feedback";

interface Customer {
  id: string;
  code: string;
  fullName: string;
  email: string | null;
  phone: string;
  tier: string;
  lifetimeValue: number;
  totalOrders: number;
  churnRisk: string | null;
}

interface CustomersResponse {
  data: Customer[];
  total: number;
  page: number;
  totalPages: number;
}

const TIER_COLORS: Record<string, string> = {
  BRONZE: "bg-orange-100 text-orange-800",
  SILVER: "bg-gray-200 text-gray-700",
  GOLD: "bg-yellow-100 text-yellow-800",
  VIP: "bg-brand-100 text-brand-800",
};

export default function ClientesPage(): React.ReactNode {
  const router = useRouter();
  const [customers, setCustomers] = useState<CustomersResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 500);
  const [page, setPage] = useState(1);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  const fetchCustomers = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      if (debouncedSearch) params.set("search", debouncedSearch);
      const data = await clientFetch<CustomersResponse>(`/api/customers?${params}`);
      setCustomers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar clientes.");
    } finally {
      setIsLoading(false);
    }
  }, [page, debouncedSearch]);

  useEffect(() => { fetchCustomers(); }, [fetchCustomers]);

  async function handleDelete(customer: Customer): Promise<void> {
    if (!confirm(`Excluir o cliente "${customer.fullName}"? Esta ação não pode ser desfeita.`)) return;

    setDeletingId(customer.id);
    setError(null);
    try {
      await clientFetch(`/api/customers/${customer.id}`, { method: "DELETE" });
      await fetchCustomers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao excluir cliente.");
    } finally {
      setDeletingId(null);
    }
  }

  const columns = [
    { key: "code", label: "Código" },
    { key: "fullName", label: "Nome" },
    { key: "phone", label: "Telefone" },
    { key: "email", label: "E-mail", render: (c: Customer) => c.email ?? "—" },
    {
      key: "tier",
      label: "Tier",
      render: (c: Customer) => (
        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${TIER_COLORS[c.tier] ?? "bg-gray-100 text-gray-700"}`}>
          {c.tier}
        </span>
      ),
    },
    {
      key: "lifetimeValue",
      label: "LTV",
      render: (c: Customer) =>
        c.lifetimeValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
    },
    { key: "totalOrders", label: "Pedidos" },
    {
      key: "churnRisk",
      label: "Risco",
      render: (c: Customer) => {
        if (!c.churnRisk) return "—";
        const color = c.churnRisk === "HIGH" ? "text-red-600" : c.churnRisk === "MEDIUM" ? "text-yellow-600" : "text-green-600";
        return <span className={`text-xs font-semibold ${color}`}>{c.churnRisk}</span>;
      },
    },
    {
      key: "actions",
      label: "",
      render: (c: Customer) => (
        <button
          onClick={(e) => { e.stopPropagation(); handleDelete(c); }}
          disabled={deletingId === c.id}
          title="Excluir"
          className="rounded p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
        >
          {deletingId === c.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Clientes</h1>
        <button
          onClick={() => router.push("/dashboard/clientes/novo")}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
        >
          <Plus size={16} />
          Novo Cliente
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
        <input
          type="text"
          placeholder="Buscar por nome, e-mail, telefone ou CPF..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-4 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
      </div>

      {isLoading && !customers && <LoadingSpinner />}
      {error && !customers && <ErrorMessage message={error} onRetry={fetchCustomers} />}
      {!isLoading && !error && customers && customers.data.length === 0 && (
        <EmptyState title="Nenhum cliente encontrado" description="Cadastre o primeiro cliente da loja." />
      )}
      {customers && customers.data.length > 0 && (
        <div className={isLoading ? "opacity-50 transition-opacity" : "transition-opacity"}>
          <DataTable
            columns={columns}
            data={customers.data}
            keyExtractor={(c) => c.id}
            onRowClick={(c) => router.push(`/dashboard/clientes/${c.id}`)}
          />
          <Pagination page={customers.page} totalPages={customers.totalPages} onPageChange={setPage} />
        </div>
      )}
    </div>
  );
}
