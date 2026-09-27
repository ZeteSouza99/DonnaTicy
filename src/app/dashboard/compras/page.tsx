"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, Pencil, Trash2, Save, X, Loader2 } from "lucide-react";
import { clientFetch } from "@/lib/client-fetch";
import { formatDateOnly } from "@/lib/format";
import { useDebounce } from "@/hooks/use-debounce";
import { DataTable } from "@/components/ui/data-table";
import { Pagination } from "@/components/ui/pagination";
import { LoadingSpinner, EmptyState, ErrorMessage } from "@/components/ui/feedback";

interface Supplier {
  id: string;
  companyName: string;
  tradeName: string | null;
  type: string;
  cnpj: string;
  contactName: string | null;
  phone: string | null;
  qualityScore: number;
  deliveryScore: number;
}

interface SuppliersResponse {
  data: Supplier[];
  total: number;
  page: number;
  totalPages: number;
}

interface PurchaseOrder {
  id: string;
  code: string;
  status: string;
  totalAmount: number;
  expectedAt: string | null;
  supplier: { tradeName: string | null; companyName: string };
}

interface PurchaseOrdersResponse {
  data: PurchaseOrder[];
  total: number;
  page: number;
  totalPages: number;
}

const SUPPLIER_TYPE_LABELS: Record<string, string> = {
  FABRIC_SUPPLIER: "Fornecedor de Tecido",
  TRIM_SUPPLIER: "Fornecedor de Aviamentos",
  CMT_FACTORY: "Confecção (CMT)",
  FULL_PACKAGE: "Full Package",
};

interface SupplierEdit {
  companyName: string;
  tradeName: string;
  type: string;
  cnpj: string;
}

const INPUT_CELL =
  "w-full rounded border border-brand-300 bg-brand-50 px-2 py-1 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500";

export default function ComprasPage(): React.ReactNode {
  const router = useRouter();
  const [tab, setTab] = useState<"suppliers" | "orders">("suppliers");
  const [suppliers, setSuppliers] = useState<SuppliersResponse | null>(null);
  const [orders, setOrders] = useState<PurchaseOrdersResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 500);
  const [page, setPage] = useState(1);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<SupplierEdit | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, tab]);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (tab === "suppliers") {
        const data = await clientFetch<SuppliersResponse>(`/api/purchasing/suppliers?${params}`);
        setSuppliers(data);
      } else {
        const data = await clientFetch<PurchaseOrdersResponse>(`/api/purchasing/orders?${params}`);
        setOrders(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar dados.");
    } finally {
      setIsLoading(false);
    }
  }, [tab, page, debouncedSearch]);

  useEffect(() => { fetchData(); }, [fetchData]);

  function startEditing(s: Supplier): void {
    setEditingId(s.id);
    setEditForm({
      companyName: s.companyName,
      tradeName: s.tradeName ?? "",
      type: s.type,
      cnpj: s.cnpj,
    });
    setError(null);
  }

  async function saveSupplier(id: string): Promise<void> {
    if (!editForm) return;
    setBusyId(id);
    setError(null);
    try {
      await clientFetch(`/api/purchasing/suppliers/${id}`, {
        method: "PUT",
        body: {
          companyName: editForm.companyName.trim(),
          tradeName: editForm.tradeName.trim() || undefined,
          type: editForm.type,
          cnpj: editForm.cnpj.replace(/\D/g, ""),
        },
      });
      setEditingId(null);
      setEditForm(null);
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar fornecedor.");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteSupplier(s: Supplier): Promise<void> {
    if (!confirm(`Excluir o fornecedor "${s.companyName}"?`)) return;
    setBusyId(s.id);
    setError(null);
    try {
      await clientFetch(`/api/purchasing/suppliers/${s.id}`, { method: "DELETE" });
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao excluir fornecedor.");
    } finally {
      setBusyId(null);
    }
  }

  const supplierColumns = [
    {
      key: "companyName",
      label: "Razão Social",
      render: (s: Supplier) =>
        editingId === s.id && editForm ? (
          <input value={editForm.companyName} disabled={busyId === s.id} className={INPUT_CELL}
            onChange={(e) => setEditForm({ ...editForm, companyName: e.target.value })} />
        ) : s.companyName,
    },
    {
      key: "tradeName",
      label: "Nome Fantasia",
      render: (s: Supplier) =>
        editingId === s.id && editForm ? (
          <input value={editForm.tradeName} disabled={busyId === s.id} className={INPUT_CELL}
            onChange={(e) => setEditForm({ ...editForm, tradeName: e.target.value })} />
        ) : s.tradeName ?? "—",
    },
    {
      key: "type",
      label: "Tipo",
      render: (s: Supplier) =>
        editingId === s.id && editForm ? (
          <select value={editForm.type} disabled={busyId === s.id} className={INPUT_CELL}
            onChange={(e) => setEditForm({ ...editForm, type: e.target.value })}>
            {Object.entries(SUPPLIER_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        ) : SUPPLIER_TYPE_LABELS[s.type] ?? s.type,
    },
    {
      key: "cnpj",
      label: "CNPJ",
      render: (s: Supplier) =>
        editingId === s.id && editForm ? (
          <input value={editForm.cnpj} disabled={busyId === s.id} className={INPUT_CELL}
            onChange={(e) => setEditForm({ ...editForm, cnpj: e.target.value })} />
        ) : s.cnpj,
    },
    { key: "qualityScore", label: "Qualidade", render: (s: Supplier) => `${s.qualityScore}/5` },
    { key: "deliveryScore", label: "Entrega", render: (s: Supplier) => `${s.deliveryScore}/5` },
    {
      key: "actions",
      label: "",
      render: (s: Supplier) =>
        editingId === s.id ? (
          <div className="flex items-center gap-1">
            <button onClick={() => saveSupplier(s.id)} disabled={busyId === s.id} title="Salvar"
              className="rounded p-1.5 text-green-600 hover:bg-green-100 disabled:opacity-50">
              {busyId === s.id ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            </button>
            <button onClick={() => { setEditingId(null); setEditForm(null); }} disabled={busyId === s.id} title="Cancelar"
              className="rounded p-1.5 text-gray-500 hover:bg-gray-100 disabled:opacity-50">
              <X size={16} />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <button onClick={() => startEditing(s)} disabled={busyId === s.id} title="Editar"
              className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-brand-600 disabled:opacity-50">
              <Pencil size={16} />
            </button>
            <button onClick={() => deleteSupplier(s)} disabled={busyId === s.id} title="Excluir"
              className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50">
              {busyId === s.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
            </button>
          </div>
        ),
    },
  ];

  const orderColumns = [
    { key: "code", label: "Nº Pedido" },
    { key: "supplier", label: "Fornecedor", render: (o: PurchaseOrder) => o.supplier.tradeName ?? o.supplier.companyName },
    {
      key: "status",
      label: "Status",
      render: (o: PurchaseOrder) => (
        <span className="inline-flex rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-800">
          {o.status}
        </span>
      ),
    },
    {
      key: "totalAmount",
      label: "Total",
      render: (o: PurchaseOrder) => o.totalAmount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
    },
    {
      key: "expectedAt",
      label: "Entrega Prevista",
      render: (o: PurchaseOrder) => o.expectedAt ? formatDateOnly(o.expectedAt) : "—",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Compras</h1>
        <button
          onClick={() => router.push(tab === "suppliers" ? "/dashboard/compras/fornecedor/novo" : "/dashboard/compras/pedido/novo")}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
        >
          <Plus size={16} />
          {tab === "suppliers" ? "Novo Fornecedor" : "Novo Pedido"}
        </button>
      </div>

      <div className="flex border-b border-gray-200">
        <button
          onClick={() => { setTab("suppliers"); setSearch(""); }}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === "suppliers" ? "border-brand-600 text-brand-600" : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Fornecedores
        </button>
        <button
          onClick={() => { setTab("orders"); setSearch(""); }}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === "orders" ? "border-brand-600 text-brand-600" : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Pedidos de Compra
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
        <input
          type="text"
          placeholder={tab === "suppliers" ? "Buscar fornecedores..." : "Buscar pedidos..."}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-4 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
      </div>

      {isLoading && (!suppliers && tab === "suppliers") && <LoadingSpinner />}
      {isLoading && (!orders && tab === "orders") && <LoadingSpinner />}
      {error && (!suppliers && !orders) && <ErrorMessage message={error} onRetry={fetchData} />}

      {!isLoading && !error && tab === "suppliers" && suppliers && suppliers.data.length === 0 && (
        <EmptyState title="Nenhum fornecedor" description="Cadastre o primeiro fornecedor." />
      )}
      
      {tab === "suppliers" && suppliers && suppliers.data.length > 0 && (
        <div className={isLoading ? "opacity-50 transition-opacity" : "transition-opacity"}>
          <DataTable columns={supplierColumns} data={suppliers.data} keyExtractor={(s) => s.id} />
          <Pagination page={suppliers.page} totalPages={suppliers.totalPages} onPageChange={setPage} />
        </div>
      )}

      {!isLoading && !error && tab === "orders" && orders && orders.data.length === 0 && (
        <EmptyState title="Nenhum pedido de compra" description="Crie o primeiro pedido de compra." />
      )}

      {tab === "orders" && orders && orders.data.length > 0 && (
        <div className={isLoading ? "opacity-50 transition-opacity" : "transition-opacity"}>
          <DataTable columns={orderColumns} data={orders.data} keyExtractor={(o) => o.id} />
          <Pagination page={orders.page} totalPages={orders.totalPages} onPageChange={setPage} />
        </div>
      )}
    </div>
  );
}
