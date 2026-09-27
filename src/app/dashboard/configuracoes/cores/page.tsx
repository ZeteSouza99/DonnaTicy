"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, Trash2, Pencil, Save, X, Loader2 } from "lucide-react";
import { clientFetch } from "@/lib/client-fetch";
import { LoadingSpinner, EmptyState, ErrorMessage } from "@/components/ui/feedback";

interface Color {
  id: string;
  code: string;
  name: string;
  hexValue: string;
  _count?: { variants: number };
}

interface ColorsResponse {
  data: Color[];
  total: number;
  page: number;
  totalPages: number;
}

interface FormData {
  name: string;
  code: string;
  hexValue: string;
}

const INITIAL_FORM: FormData = { name: "", code: "", hexValue: "#000000" };

const INPUT_CELL =
  "w-full rounded border border-brand-300 bg-brand-50 px-2 py-1 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500";

function ColorDot({ hex }: { hex: string }): React.ReactNode {
  return (
    <span
      className="inline-block h-4 w-4 shrink-0 rounded-full border border-gray-300"
      style={{ backgroundColor: hex }}
      title={hex}
    />
  );
}

export default function CoresPage(): React.ReactNode {
  const router = useRouter();
  const [colors, setColors] = useState<ColorsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormData>(INITIAL_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<FormData>(INITIAL_FORM);
  const [busyId, setBusyId] = useState<string | null>(null);

  const fetchColors = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await clientFetch<ColorsResponse>("/api/catalog/colors?limit=200");
      setColors(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar cores.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchColors(); }, [fetchColors]);

  async function handleCreate(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      await clientFetch("/api/catalog/colors", { method: "POST", body: form });
      setShowForm(false);
      setForm(INITIAL_FORM);
      await fetchColors();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar cor.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function startEditing(color: Color): void {
    setEditingId(color.id);
    setEditForm({ name: color.name, code: color.code, hexValue: color.hexValue });
    setError(null);
  }

  async function handleUpdate(id: string): Promise<void> {
    setBusyId(id);
    setError(null);
    try {
      await clientFetch(`/api/catalog/colors/${id}`, { method: "PUT", body: editForm });
      setEditingId(null);
      await fetchColors();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar cor.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(color: Color): Promise<void> {
    const count = color._count?.variants ?? 0;
    const warning = count > 0
      ? `A cor "${color.name}" tem ${count} variante(s) vinculada(s). Excluir mesmo assim?`
      : `Excluir a cor "${color.name}"?`;
    if (!confirm(warning)) return;

    setBusyId(color.id);
    setError(null);
    try {
      await clientFetch(`/api/catalog/colors/${color.id}`, { method: "DELETE" });
      await fetchColors();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao excluir cor.");
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
            <h1 className="text-2xl font-bold text-gray-900">Cores</h1>
            <p className="text-sm text-gray-500">Cores usadas nas variantes de produtos.</p>
          </div>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
          <Plus size={16} /> Nova Cor
        </button>
      </div>

      {error && <ErrorMessage message={error} />}

      {showForm && (
        <form onSubmit={handleCreate} className="space-y-4 rounded-lg border bg-white p-6">
          <h2 className="text-lg font-semibold">Criar Cor</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="name" className="mb-1 block text-sm font-medium text-gray-700">Nome *</label>
              <input id="name" required value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="Ex.: Preto"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
            </div>
            <div>
              <label htmlFor="code" className="mb-1 block text-sm font-medium text-gray-700">Código *</label>
              <input id="code" required maxLength={10} value={form.code}
                onChange={(e) => setForm((p) => ({ ...p, code: e.target.value.toUpperCase() }))}
                placeholder="Ex.: PRT"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
            </div>
            <div>
              <label htmlFor="hexValue" className="mb-1 block text-sm font-medium text-gray-700">Cor (hex) *</label>
              <div className="flex items-center gap-2">
                <input id="hexValue" type="color" value={form.hexValue}
                  onChange={(e) => setForm((p) => ({ ...p, hexValue: e.target.value }))}
                  className="h-9 w-12 cursor-pointer rounded border border-gray-300 p-0.5" />
                <input required value={form.hexValue}
                  onChange={(e) => setForm((p) => ({ ...p, hexValue: e.target.value.toLowerCase() }))}
                  pattern="^#[0-9a-fA-F]{6}$" placeholder="#000000"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
              </div>
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
      {!isLoading && colors && colors.data.length === 0 && (
        <EmptyState title="Nenhuma cor" description="Crie a primeira cor do catálogo." />
      )}

      {colors && colors.data.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Nome</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Código</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Cor</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Variantes</th>
                <th className="px-4 py-3 w-28"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {colors.data.map((c) => {
                const editing = editingId === c.id;
                const busy = busyId === c.id;
                return (
                  <tr key={c.id} className={editing ? "bg-brand-50/30" : "hover:bg-gray-50"}>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {editing ? (
                        <input value={editForm.name} disabled={busy} className={INPUT_CELL}
                          onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))} />
                      ) : (
                        <span className="inline-flex items-center gap-2">
                          <ColorDot hex={c.hexValue} /> {c.name}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {editing ? (
                        <input value={editForm.code} disabled={busy} maxLength={10} className={INPUT_CELL}
                          onChange={(e) => setEditForm((p) => ({ ...p, code: e.target.value.toUpperCase() }))} />
                      ) : c.code}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {editing ? (
                        <div className="flex items-center gap-2">
                          <input type="color" value={editForm.hexValue} disabled={busy}
                            onChange={(e) => setEditForm((p) => ({ ...p, hexValue: e.target.value }))}
                            className="h-7 w-10 cursor-pointer rounded border border-gray-300 p-0.5" />
                          <input value={editForm.hexValue} disabled={busy} className={INPUT_CELL}
                            onChange={(e) => setEditForm((p) => ({ ...p, hexValue: e.target.value.toLowerCase() }))} />
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-2">
                          <ColorDot hex={c.hexValue} /> {c.hexValue}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">{c._count?.variants ?? 0}</td>
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
