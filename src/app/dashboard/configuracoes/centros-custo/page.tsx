"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, Trash2, Pencil, Save, X, Loader2 } from "lucide-react";
import { clientFetch } from "@/lib/client-fetch";
import { DataTable } from "@/components/ui/data-table";
import { LoadingSpinner, EmptyState, ErrorMessage } from "@/components/ui/feedback";

interface CostCenter {
  id: string;
  code: string;
  name: string;
  type: string;
  createdAt: string;
}

interface CostCentersResponse {
  data: CostCenter[];
  total: number;
  page: number;
  totalPages: number;
}

const TYPE_LABELS: Record<string, string> = {
  STORE: "Loja",
  ECOMMERCE: "E-commerce",
  WAREHOUSE: "Depósito",
  CORPORATE: "Corporativo",
};

interface FormData {
  code: string;
  name: string;
  type: string;
}

const INITIAL_FORM: FormData = { code: "", name: "", type: "STORE" };

const INPUT_CELL =
  "w-full rounded border border-brand-300 bg-brand-50 px-2 py-1 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500";

export default function CentrosCustoPage(): React.ReactNode {
  const router = useRouter();
  const [costCenters, setCostCenters] = useState<CostCentersResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormData>(INITIAL_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<FormData>(INITIAL_FORM);
  const [busyId, setBusyId] = useState<string | null>(null);

  const fetchCostCenters = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await clientFetch<CostCentersResponse>("/api/financial/cost-centers?limit=50");
      setCostCenters(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar centros de custo.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchCostCenters(); }, [fetchCostCenters]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>): void {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleCreate(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      await clientFetch("/api/financial/cost-centers", {
        method: "POST",
        body: form,
      });
      setShowForm(false);
      setForm(INITIAL_FORM);
      await fetchCostCenters();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar centro de custo.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete(id: string): Promise<void> {
    if (!confirm("Tem certeza que deseja excluir este centro de custo?")) return;
    setBusyId(id);
    try {
      await clientFetch(`/api/financial/cost-centers/${id}`, { method: "DELETE" });
      await fetchCostCenters();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao excluir centro de custo.");
    } finally {
      setBusyId(null);
    }
  }

  function startEditing(cc: CostCenter): void {
    setEditingId(cc.id);
    setEditForm({ code: cc.code, name: cc.name, type: cc.type });
    setError(null);
  }

  async function handleUpdate(id: string): Promise<void> {
    setBusyId(id);
    setError(null);
    try {
      await clientFetch(`/api/financial/cost-centers/${id}`, { method: "PUT", body: editForm });
      setEditingId(null);
      await fetchCostCenters();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar centro de custo.");
    } finally {
      setBusyId(null);
    }
  }

  const columns = [
    {
      key: "code", label: "Código",
      render: (cc: CostCenter) => editingId === cc.id ? (
        <input value={editForm.code} disabled={busyId === cc.id} className={INPUT_CELL}
          onChange={(e) => setEditForm((p) => ({ ...p, code: e.target.value.toUpperCase() }))} />
      ) : cc.code,
    },
    {
      key: "name", label: "Nome",
      render: (cc: CostCenter) => editingId === cc.id ? (
        <input value={editForm.name} disabled={busyId === cc.id} className={INPUT_CELL}
          onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))} />
      ) : cc.name,
    },
    {
      key: "type", label: "Tipo",
      render: (cc: CostCenter) => editingId === cc.id ? (
        <select value={editForm.type} disabled={busyId === cc.id} className={INPUT_CELL}
          onChange={(e) => setEditForm((p) => ({ ...p, type: e.target.value }))}>
          {Object.entries(TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      ) : TYPE_LABELS[cc.type] ?? cc.type,
    },
    { key: "createdAt", label: "Criado em", render: (cc: CostCenter) => new Date(cc.createdAt).toLocaleDateString("pt-BR") },
    {
      key: "actions", label: "",
      render: (cc: CostCenter) => {
        const busy = busyId === cc.id;
        return editingId === cc.id ? (
          <div className="flex items-center gap-1">
            <button onClick={(e) => { e.stopPropagation(); handleUpdate(cc.id); }} disabled={busy} title="Salvar"
              className="rounded p-1.5 text-green-600 hover:bg-green-100 disabled:opacity-50">
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            </button>
            <button onClick={(e) => { e.stopPropagation(); setEditingId(null); }} disabled={busy} title="Cancelar"
              className="rounded p-1.5 text-gray-500 hover:bg-gray-100 disabled:opacity-50">
              <X size={16} />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <button onClick={(e) => { e.stopPropagation(); startEditing(cc); }} disabled={busy} title="Editar"
              className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-brand-600 disabled:opacity-50">
              <Pencil size={16} />
            </button>
            <button onClick={(e) => { e.stopPropagation(); handleDelete(cc.id); }} disabled={busy} title="Excluir"
              className="rounded p-1.5 text-red-500 hover:bg-red-100 disabled:opacity-50">
              <Trash2 size={16} />
            </button>
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/dashboard/configuracoes")} className="rounded-lg p-2 hover:bg-gray-100" aria-label="Voltar">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-2xl font-bold text-gray-900">Centros de Custo</h1>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
          <Plus size={16} /> Novo Centro de Custo
        </button>
      </div>

      {error && <ErrorMessage message={error} />}

      {showForm && (
        <form onSubmit={handleCreate} className="space-y-4 rounded-lg border bg-white p-6">
          <h2 className="text-lg font-semibold">Criar Centro de Custo</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="code" className="mb-1 block text-sm font-medium text-gray-700">Código *</label>
              <input id="code" name="code" required value={form.code} onChange={handleChange} placeholder="EX: CC-LOJA01"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
            </div>
            <div>
              <label htmlFor="name" className="mb-1 block text-sm font-medium text-gray-700">Nome *</label>
              <input id="name" name="name" required value={form.name} onChange={handleChange}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
            </div>
            <div>
              <label htmlFor="type" className="mb-1 block text-sm font-medium text-gray-700">Tipo *</label>
              <select id="type" name="type" required value={form.type} onChange={handleChange}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500">
                {Object.entries(TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => { setShowForm(false); setForm(INITIAL_FORM); }}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              Cancelar
            </button>
            <button type="submit" disabled={isSubmitting}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
              {isSubmitting ? "Criando..." : "Criar"}
            </button>
          </div>
        </form>
      )}

      {isLoading && <LoadingSpinner />}
      {!isLoading && !error && costCenters && costCenters.data.length === 0 && (
        <EmptyState title="Nenhum centro de custo" description="Crie o primeiro centro de custo." />
      )}
      {costCenters && costCenters.data.length > 0 && (
        <DataTable columns={columns} data={costCenters.data} keyExtractor={(cc) => cc.id} />
      )}
    </div>
  );
}
