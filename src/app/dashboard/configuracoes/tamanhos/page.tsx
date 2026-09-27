"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, Trash2, Pencil, Save, X, Loader2 } from "lucide-react";
import { clientFetch } from "@/lib/client-fetch";
import { LoadingSpinner, EmptyState, ErrorMessage } from "@/components/ui/feedback";

interface Size {
  id: string;
  code: string;
  name: string;
  sortOrder: number;
  isPeakSize: boolean;
}

interface SizesResponse {
  data: Size[];
  total: number;
  page: number;
  totalPages: number;
}

interface FormData {
  name: string;
  code: string;
  sortOrder: string;
  isPeakSize: boolean;
}

const INITIAL_FORM: FormData = { name: "", code: "", sortOrder: "0", isPeakSize: false };

const INPUT_CELL =
  "w-full rounded border border-brand-300 bg-brand-50 px-2 py-1 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500";

function toPayload(form: FormData): { name: string; code: string; sortOrder: number; isPeakSize: boolean } {
  return {
    name: form.name,
    code: form.code,
    sortOrder: Number(form.sortOrder) || 0,
    isPeakSize: form.isPeakSize,
  };
}

export default function TamanhosPage(): React.ReactNode {
  const router = useRouter();
  const [sizes, setSizes] = useState<SizesResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormData>(INITIAL_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<FormData>(INITIAL_FORM);
  const [busyId, setBusyId] = useState<string | null>(null);

  const fetchSizes = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await clientFetch<SizesResponse>("/api/catalog/sizes?limit=200");
      setSizes(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar tamanhos.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchSizes(); }, [fetchSizes]);

  async function handleCreate(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      await clientFetch("/api/catalog/sizes", { method: "POST", body: toPayload(form) });
      setShowForm(false);
      setForm(INITIAL_FORM);
      await fetchSizes();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar tamanho.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function startEditing(size: Size): void {
    setEditingId(size.id);
    setEditForm({
      name: size.name,
      code: size.code,
      sortOrder: String(size.sortOrder),
      isPeakSize: size.isPeakSize,
    });
    setError(null);
  }

  async function handleUpdate(id: string): Promise<void> {
    setBusyId(id);
    setError(null);
    try {
      await clientFetch(`/api/catalog/sizes/${id}`, { method: "PUT", body: toPayload(editForm) });
      setEditingId(null);
      await fetchSizes();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar tamanho.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(size: Size): Promise<void> {
    if (!confirm(`Excluir o tamanho "${size.name}"?`)) return;

    setBusyId(size.id);
    setError(null);
    try {
      await clientFetch(`/api/catalog/sizes/${size.id}`, { method: "DELETE" });
      await fetchSizes();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao excluir tamanho.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/dashboard/configuracoes")} className="rounded-lg p-2 hover:bg-gray-100" aria-label="Voltar">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Tamanhos</h1>
            <p className="text-sm text-gray-500">Grade de tamanhos das variantes de produtos.</p>
          </div>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
          <Plus size={16} /> Novo Tamanho
        </button>
      </div>

      {error && <ErrorMessage message={error} />}

      {showForm && (
        <form onSubmit={handleCreate} className="space-y-4 rounded-lg border bg-white p-6">
          <h2 className="text-lg font-semibold">Criar Tamanho</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <div>
              <label htmlFor="name" className="mb-1 block text-sm font-medium text-gray-700">Nome *</label>
              <input id="name" required value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="Ex.: Médio"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
            </div>
            <div>
              <label htmlFor="code" className="mb-1 block text-sm font-medium text-gray-700">Código *</label>
              <input id="code" required maxLength={10} value={form.code}
                onChange={(e) => setForm((p) => ({ ...p, code: e.target.value.toUpperCase() }))}
                placeholder="Ex.: M"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
            </div>
            <div>
              <label htmlFor="sortOrder" className="mb-1 block text-sm font-medium text-gray-700">Ordem *</label>
              <input id="sortOrder" required type="number" min={0} value={form.sortOrder}
                onChange={(e) => setForm((p) => ({ ...p, sortOrder: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
            </div>
            <div className="flex items-end pb-2">
              <label className="inline-flex items-center gap-2 text-sm font-medium text-gray-700">
                <input type="checkbox" checked={form.isPeakSize}
                  onChange={(e) => setForm((p) => ({ ...p, isPeakSize: e.target.checked }))}
                  className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
                Tamanho de pico
              </label>
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
      {!isLoading && sizes && sizes.data.length === 0 && (
        <EmptyState title="Nenhum tamanho" description="Crie o primeiro tamanho da grade." />
      )}

      {sizes && sizes.data.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Nome</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Código</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Ordem</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Pico</th>
                <th className="px-4 py-3 w-28"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {sizes.data.map((s) => {
                const editing = editingId === s.id;
                const busy = busyId === s.id;
                return (
                  <tr key={s.id} className={editing ? "bg-brand-50/30" : "hover:bg-gray-50"}>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {editing ? (
                        <input value={editForm.name} disabled={busy} className={INPUT_CELL}
                          onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))} />
                      ) : s.name}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {editing ? (
                        <input value={editForm.code} disabled={busy} maxLength={10} className={INPUT_CELL}
                          onChange={(e) => setEditForm((p) => ({ ...p, code: e.target.value.toUpperCase() }))} />
                      ) : s.code}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {editing ? (
                        <input type="number" min={0} value={editForm.sortOrder} disabled={busy} className={INPUT_CELL}
                          onChange={(e) => setEditForm((p) => ({ ...p, sortOrder: e.target.value }))} />
                      ) : s.sortOrder}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {editing ? (
                        <input type="checkbox" checked={editForm.isPeakSize} disabled={busy}
                          onChange={(e) => setEditForm((p) => ({ ...p, isPeakSize: e.target.checked }))}
                          className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
                      ) : (s.isPeakSize ? "Sim" : "Não")}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {editing ? (
                        <div className="flex items-center gap-1">
                          <button onClick={() => handleUpdate(s.id)} disabled={busy} title="Salvar"
                            className="rounded p-1.5 text-green-600 hover:bg-green-100 disabled:opacity-50">
                            {busy ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                          </button>
                          <button onClick={() => setEditingId(null)} disabled={busy} title="Cancelar"
                            className="rounded p-1.5 text-gray-500 hover:bg-gray-100 disabled:opacity-50">
                            <X size={16} />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <button onClick={() => startEditing(s)} disabled={busy} title="Editar"
                            className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-brand-600 disabled:opacity-50">
                            <Pencil size={16} />
                          </button>
                          <button onClick={() => handleDelete(s)} disabled={busy} title="Excluir"
                            className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50">
                            {busy ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
