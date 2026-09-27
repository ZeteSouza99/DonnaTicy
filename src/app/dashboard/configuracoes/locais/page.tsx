"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, Trash2, Pencil, Save, X, Loader2 } from "lucide-react";
import { clientFetch } from "@/lib/client-fetch";
import { DataTable } from "@/components/ui/data-table";
import { LoadingSpinner, EmptyState, ErrorMessage } from "@/components/ui/feedback";

interface Location {
  id: string;
  name: string;
  code: string;
  type: string;
  createdAt: string;
}

interface LocationsResponse {
  data: Location[];
  total: number;
  page: number;
  totalPages: number;
}

const TYPE_LABELS: Record<string, string> = {
  STORE: "Loja",
  WAREHOUSE: "Depósito",
  IN_TRANSIT: "Em Trânsito",
  VIRTUAL: "Virtual",
};

interface LocationFormData {
  name: string;
  code: string;
  type: string;
}

const INITIAL_FORM: LocationFormData = { name: "", code: "", type: "STORE" };

const INPUT_CELL =
  "w-full rounded border border-brand-300 bg-brand-50 px-2 py-1 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500";

export default function LocaisPage(): React.ReactNode {
  const router = useRouter();
  const [locations, setLocations] = useState<LocationsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<LocationFormData>(INITIAL_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<LocationFormData>(INITIAL_FORM);
  const [busyId, setBusyId] = useState<string | null>(null);

  const fetchLocations = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await clientFetch<LocationsResponse>("/api/inventory/locations?limit=50");
      setLocations(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar locais.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchLocations(); }, [fetchLocations]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>): void {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleCreate(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      await clientFetch("/api/inventory/locations", {
        method: "POST",
        body: form,
      });
      setShowForm(false);
      setForm(INITIAL_FORM);
      await fetchLocations();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar local.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete(id: string): Promise<void> {
    if (!confirm("Tem certeza que deseja excluir este local?")) return;
    setBusyId(id);
    try {
      await clientFetch(`/api/inventory/locations/${id}`, { method: "DELETE" });
      await fetchLocations();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao excluir local.");
    } finally {
      setBusyId(null);
    }
  }

  function startEditing(l: Location): void {
    setEditingId(l.id);
    setEditForm({ name: l.name, code: l.code, type: l.type });
    setError(null);
  }

  async function handleUpdate(id: string): Promise<void> {
    setBusyId(id);
    setError(null);
    try {
      await clientFetch(`/api/inventory/locations/${id}`, { method: "PUT", body: editForm });
      setEditingId(null);
      await fetchLocations();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar local.");
    } finally {
      setBusyId(null);
    }
  }

  const columns = [
    {
      key: "code", label: "Código",
      render: (l: Location) => editingId === l.id ? (
        <input value={editForm.code} disabled={busyId === l.id} className={INPUT_CELL}
          onChange={(e) => setEditForm((p) => ({ ...p, code: e.target.value.toUpperCase() }))} />
      ) : l.code,
    },
    {
      key: "name", label: "Nome",
      render: (l: Location) => editingId === l.id ? (
        <input value={editForm.name} disabled={busyId === l.id} className={INPUT_CELL}
          onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))} />
      ) : l.name,
    },
    {
      key: "type", label: "Tipo",
      render: (l: Location) => editingId === l.id ? (
        <select value={editForm.type} disabled={busyId === l.id} className={INPUT_CELL}
          onChange={(e) => setEditForm((p) => ({ ...p, type: e.target.value }))}>
          {Object.entries(TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      ) : TYPE_LABELS[l.type] ?? l.type,
    },
    { key: "createdAt", label: "Criado em", render: (l: Location) => new Date(l.createdAt).toLocaleDateString("pt-BR") },
    {
      key: "actions", label: "",
      render: (l: Location) => {
        const busy = busyId === l.id;
        return editingId === l.id ? (
          <div className="flex items-center gap-1">
            <button onClick={(e) => { e.stopPropagation(); handleUpdate(l.id); }} disabled={busy} title="Salvar"
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
            <button onClick={(e) => { e.stopPropagation(); startEditing(l); }} disabled={busy} title="Editar"
              className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-brand-600 disabled:opacity-50">
              <Pencil size={16} />
            </button>
            <button onClick={(e) => { e.stopPropagation(); handleDelete(l.id); }} disabled={busy} title="Excluir"
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
          <h1 className="text-2xl font-bold text-gray-900">Locais / Lojas</h1>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
          <Plus size={16} /> Novo Local
        </button>
      </div>

      {error && <ErrorMessage message={error} />}

      {showForm && (
        <form onSubmit={handleCreate} className="space-y-4 rounded-lg border bg-white p-6">
          <h2 className="text-lg font-semibold">Criar Local</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="name" className="mb-1 block text-sm font-medium text-gray-700">Nome *</label>
              <input id="name" name="name" required value={form.name} onChange={handleChange}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
            </div>
            <div>
              <label htmlFor="code" className="mb-1 block text-sm font-medium text-gray-700">Código *</label>
              <input id="code" name="code" required value={form.code} onChange={handleChange} placeholder="EX: LOJA-01"
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
      {!isLoading && !error && locations && locations.data.length === 0 && (
        <EmptyState title="Nenhum local cadastrado" description="Crie a primeira loja ou depósito." />
      )}
      {locations && locations.data.length > 0 && (
        <DataTable columns={columns} data={locations.data} keyExtractor={(l) => l.id} />
      )}
    </div>
  );
}
