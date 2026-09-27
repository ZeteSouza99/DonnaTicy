"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, Trash2, Pencil, Save, X, Loader2 } from "lucide-react";
import { clientFetch } from "@/lib/client-fetch";
import { LoadingSpinner, EmptyState, ErrorMessage } from "@/components/ui/feedback";

interface Category {
  id: string;
  code: string;
  name: string;
  slug: string;
  _count?: { products: number };
}

interface CategoriesResponse {
  data: Category[];
  total: number;
  page: number;
  totalPages: number;
}

interface FormData {
  name: string;
  code: string;
  slug: string;
}

const INITIAL_FORM: FormData = { name: "", code: "", slug: "" };

const INPUT_CELL =
  "w-full rounded border border-brand-300 bg-brand-50 px-2 py-1 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500";

/** Deriva código (MAIÚSCULO-COM-HIFEN) e slug (minúsculo-com-hifen) a partir do nome. */
function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default function CategoriasPage(): React.ReactNode {
  const router = useRouter();
  const [categories, setCategories] = useState<CategoriesResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormData>(INITIAL_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<FormData>(INITIAL_FORM);
  const [busyId, setBusyId] = useState<string | null>(null);

  const fetchCategories = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await clientFetch<CategoriesResponse>("/api/catalog/categories?limit=200");
      setCategories(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar categorias.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchCategories(); }, [fetchCategories]);

  function handleNameChange(value: string): void {
    const slug = slugify(value);
    setForm({ name: value, slug, code: slug.toUpperCase() });
  }

  async function handleCreate(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      await clientFetch("/api/catalog/categories", { method: "POST", body: form });
      setShowForm(false);
      setForm(INITIAL_FORM);
      await fetchCategories();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar categoria.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function startEditing(category: Category): void {
    setEditingId(category.id);
    setEditForm({ name: category.name, code: category.code, slug: category.slug });
    setError(null);
  }

  async function handleUpdate(id: string): Promise<void> {
    setBusyId(id);
    setError(null);
    try {
      await clientFetch(`/api/catalog/categories/${id}`, { method: "PUT", body: editForm });
      setEditingId(null);
      await fetchCategories();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar categoria.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(category: Category): Promise<void> {
    const count = category._count?.products ?? 0;
    const warning = count > 0
      ? `A categoria "${category.name}" tem ${count} produto(s) vinculado(s). Excluir mesmo assim?`
      : `Excluir a categoria "${category.name}"?`;
    if (!confirm(warning)) return;

    setBusyId(category.id);
    setError(null);
    try {
      await clientFetch(`/api/catalog/categories/${category.id}`, { method: "DELETE" });
      await fetchCategories();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao excluir categoria.");
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
            <h1 className="text-2xl font-bold text-gray-900">Categorias</h1>
            <p className="text-sm text-gray-500">Categorias usadas no cadastro de produtos.</p>
          </div>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
          <Plus size={16} /> Nova Categoria
        </button>
      </div>

      {error && <ErrorMessage message={error} />}

      {showForm && (
        <form onSubmit={handleCreate} className="space-y-4 rounded-lg border bg-white p-6">
          <h2 className="text-lg font-semibold">Criar Categoria</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="name" className="mb-1 block text-sm font-medium text-gray-700">Nome *</label>
              <input id="name" required value={form.name} onChange={(e) => handleNameChange(e.target.value)}
                placeholder="Ex.: LEG & TOP"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
            </div>
            <div>
              <label htmlFor="code" className="mb-1 block text-sm font-medium text-gray-700">Código *</label>
              <input id="code" required value={form.code}
                onChange={(e) => setForm((p) => ({ ...p, code: e.target.value.toUpperCase() }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
            </div>
            <div>
              <label htmlFor="slug" className="mb-1 block text-sm font-medium text-gray-700">Slug *</label>
              <input id="slug" required value={form.slug}
                onChange={(e) => setForm((p) => ({ ...p, slug: e.target.value.toLowerCase() }))}
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
      {!isLoading && categories && categories.data.length === 0 && (
        <EmptyState title="Nenhuma categoria" description="Crie a primeira categoria do catálogo." />
      )}

      {categories && categories.data.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Nome</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Código</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Slug</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Produtos</th>
                <th className="px-4 py-3 w-28"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {categories.data.map((c) => {
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
                        <input value={editForm.code} disabled={busy} className={INPUT_CELL}
                          onChange={(e) => setEditForm((p) => ({ ...p, code: e.target.value.toUpperCase() }))} />
                      ) : c.code}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {editing ? (
                        <input value={editForm.slug} disabled={busy} className={INPUT_CELL}
                          onChange={(e) => setEditForm((p) => ({ ...p, slug: e.target.value.toLowerCase() }))} />
                      ) : c.slug}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">{c._count?.products ?? 0}</td>
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
