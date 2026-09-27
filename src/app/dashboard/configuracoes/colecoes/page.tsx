"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, Trash2, Pencil, Save, X, Loader2 } from "lucide-react";
import { clientFetch } from "@/lib/client-fetch";
import { LoadingSpinner, EmptyState, ErrorMessage } from "@/components/ui/feedback";

interface Collection {
  id: string;
  code: string;
  name: string;
  season: string;
  year: number;
}

interface CollectionsResponse {
  data: Collection[];
  total: number;
  page: number;
  totalPages: number;
}

interface FormData {
  name: string;
  code: string;
  season: string;
  year: string;
}

const SEASONS = ["Primavera/Verão", "Outono/Inverno", "Alto Verão", "Permanente"];

const CURRENT_YEAR = new Date().getFullYear();

const INITIAL_FORM: FormData = { name: "", code: "", season: SEASONS[0], year: String(CURRENT_YEAR) };

const INPUT_CELL =
  "w-full rounded border border-brand-300 bg-brand-50 px-2 py-1 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500";

function toPayload(form: FormData): { name: string; code: string; season: string; year: number } {
  return { name: form.name, code: form.code, season: form.season, year: Number(form.year) || CURRENT_YEAR };
}

export default function ColecoesPage(): React.ReactNode {
  const router = useRouter();
  const [collections, setCollections] = useState<CollectionsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormData>(INITIAL_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<FormData>(INITIAL_FORM);
  const [busyId, setBusyId] = useState<string | null>(null);

  const fetchCollections = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await clientFetch<CollectionsResponse>("/api/catalog/collections?limit=200");
      setCollections(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar coleções.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchCollections(); }, [fetchCollections]);

  async function handleCreate(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      await clientFetch("/api/catalog/collections", { method: "POST", body: toPayload(form) });
      setShowForm(false);
      setForm(INITIAL_FORM);
      await fetchCollections();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar coleção.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function startEditing(collection: Collection): void {
    setEditingId(collection.id);
    setEditForm({
      name: collection.name,
      code: collection.code,
      season: collection.season,
      year: String(collection.year),
    });
    setError(null);
  }

  async function handleUpdate(id: string): Promise<void> {
    setBusyId(id);
    setError(null);
    try {
      await clientFetch(`/api/catalog/collections/${id}`, { method: "PUT", body: toPayload(editForm) });
      setEditingId(null);
      await fetchCollections();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar coleção.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(collection: Collection): Promise<void> {
    if (!confirm(`Excluir a coleção "${collection.name}"?`)) return;

    setBusyId(collection.id);
    setError(null);
    try {
      await clientFetch(`/api/catalog/collections/${collection.id}`, { method: "DELETE" });
      await fetchCollections();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao excluir coleção.");
    } finally {
      setBusyId(null);
    }
  }

  const seasonOptions = (current: string): string[] =>
    SEASONS.includes(current) || current === "" ? SEASONS : [current, ...SEASONS];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/dashboard/configuracoes")} className="rounded-lg p-2 hover:bg-gray-100" aria-label="Voltar">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Coleções</h1>
            <p className="text-sm text-gray-500">Coleções sazonais usadas no cadastro de produtos.</p>
          </div>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
          <Plus size={16} /> Nova Coleção
        </button>
      </div>

      {error && <ErrorMessage message={error} />}

      {showForm && (
        <form onSubmit={handleCreate} className="space-y-4 rounded-lg border bg-white p-6">
          <h2 className="text-lg font-semibold">Criar Coleção</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <div>
              <label htmlFor="name" className="mb-1 block text-sm font-medium text-gray-700">Nome *</label>
              <input id="name" required value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="Ex.: Verão 2027"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
            </div>
            <div>
              <label htmlFor="code" className="mb-1 block text-sm font-medium text-gray-700">Código *</label>
              <input id="code" required maxLength={20} value={form.code}
                onChange={(e) => setForm((p) => ({ ...p, code: e.target.value.toUpperCase() }))}
                placeholder="Ex.: VER-2027"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
            </div>
            <div>
              <label htmlFor="season" className="mb-1 block text-sm font-medium text-gray-700">Estação *</label>
              <select id="season" required value={form.season}
                onChange={(e) => setForm((p) => ({ ...p, season: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500">
                {seasonOptions(form.season).map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="year" className="mb-1 block text-sm font-medium text-gray-700">Ano *</label>
              <input id="year" required type="number" min={2020} max={2099} value={form.year}
                onChange={(e) => setForm((p) => ({ ...p, year: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
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
      {!isLoading && collections && collections.data.length === 0 && (
        <EmptyState title="Nenhuma coleção" description="Crie a primeira coleção do catálogo." />
      )}

      {collections && collections.data.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Nome</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Código</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Estação</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Ano</th>
                <th className="px-4 py-3 w-28"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {collections.data.map((c) => {
                const editing = editingId === c.id;
                const busy = busyId === c.id;
                return (
                  <tr key={c.id} className={editing ? "bg-brand-50/30" : "hover:bg-gray-50"}>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {editing ? (
                        <input value={editForm.name} disabled={busy} className={INPUT_CELL}
                          onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))} />
                      ) : c.name}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {editing ? (
                        <input value={editForm.code} disabled={busy} maxLength={20} className={INPUT_CELL}
                          onChange={(e) => setEditForm((p) => ({ ...p, code: e.target.value.toUpperCase() }))} />
                      ) : c.code}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {editing ? (
                        <select value={editForm.season} disabled={busy} className={INPUT_CELL}
                          onChange={(e) => setEditForm((p) => ({ ...p, season: e.target.value }))}>
                          {seasonOptions(editForm.season).map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      ) : c.season}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {editing ? (
                        <input type="number" min={2020} max={2099} value={editForm.year} disabled={busy} className={INPUT_CELL}
                          onChange={(e) => setEditForm((p) => ({ ...p, year: e.target.value }))} />
                      ) : c.year}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {editing ? (
                        <div className="flex items-center gap-1">
                          <button onClick={() => handleUpdate(c.id)} disabled={busy} title="Salvar"
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
                          <button onClick={() => startEditing(c)} disabled={busy} title="Editar"
                            className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-brand-600 disabled:opacity-50">
                            <Pencil size={16} />
                          </button>
                          <button onClick={() => handleDelete(c)} disabled={busy} title="Excluir"
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
