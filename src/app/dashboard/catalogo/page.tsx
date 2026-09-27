"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, Pencil, Save, X, Loader2, Trash2, Barcode } from "lucide-react";
import type { ChangeEvent } from "react";
import { clientFetch } from "@/lib/client-fetch";
import { useDebounce } from "@/hooks/use-debounce";
import { Pagination } from "@/components/ui/pagination";
import { LoadingSpinner, EmptyState, ErrorMessage } from "@/components/ui/feedback";
import { MoneyInput } from "@/components/ui/money-input";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NamedRef {
  id: string;
  name: string;
}

interface Product {
  id: string;
  code: string;
  name: string;
  basePrice: number;
  costPrice: number;
  abcClass: string;
  categoryId: string;
  collectionId: string;
  category?: NamedRef;
  collection?: NamedRef;
}

interface ProductsResponse {
  data: Product[];
  total: number;
  page: number;
  totalPages: number;
}

interface ListResponse<T> {
  data: T[];
}

interface EditValues {
  code: string;
  name: string;
  costPrice: string;
  basePrice: string;
  abcClass: string;
  categoryId: string;
  collectionId: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const INPUT_CELL =
  "w-full rounded border border-brand-300 bg-brand-50 px-2 py-1 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500";

function abcBadge(abc: string): React.ReactNode {
  const cls =
    abc === "A"
      ? "bg-green-100 text-green-800"
      : abc === "B"
        ? "bg-yellow-100 text-yellow-800"
        : "bg-gray-100 text-gray-800";
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>
      {abc}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CatalogPage(): React.ReactNode {
  const router = useRouter();
  const [products, setProducts] = useState<ProductsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 500);
  const [page, setPage] = useState(1);

  // Lookup lists for dropdowns
  const [categories, setCategories] = useState<NamedRef[]>([]);
  const [collections, setCollections] = useState<NamedRef[]>([]);

  // Editing state
  const [editingIds, setEditingIds] = useState<Set<string>>(new Set());
  const [editValues, setEditValues] = useState<Record<string, EditValues>>({});
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [saveErrors, setSaveErrors] = useState<Record<string, string>>({});
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());

  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);

  useEffect(() => { setPage(1); }, [debouncedSearch]);
  useEffect(() => { setSelectedIds(new Set()); setBulkError(null); }, [page, debouncedSearch]);

  // Fetch products
  const fetchProducts = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      if (debouncedSearch) params.set("search", debouncedSearch);
      const data = await clientFetch<ProductsResponse>(`/api/catalog/products?${params}`);
      setProducts(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar produtos.");
    } finally {
      setIsLoading(false);
    }
  }, [page, debouncedSearch]);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  // Fetch lookup lists once
  useEffect(() => {
    async function loadLookups(): Promise<void> {
      try {
        const [catRes, colRes] = await Promise.all([
          clientFetch<ListResponse<NamedRef>>("/api/catalog/categories?limit=200"),
          clientFetch<ListResponse<NamedRef>>("/api/catalog/collections?limit=200"),
        ]);
        setCategories(catRes.data);
        setCollections(colRes.data);
      } catch { /* lookup failure is non-blocking */ }
    }
    loadLookups();
  }, []);

  // ---------------------------------------------------------------------------
  // Edit helpers
  // ---------------------------------------------------------------------------

  function startEditing(p: Product): void {
    setEditingIds((prev) => new Set(prev).add(p.id));
    setEditValues((prev) => ({
      ...prev,
      [p.id]: {
        code: p.code,
        name: p.name,
        costPrice: String(p.costPrice),
        basePrice: String(p.basePrice),
        abcClass: p.abcClass ?? "",
        categoryId: p.categoryId ?? "",
        collectionId: p.collectionId ?? "",
      },
    }));
    setSaveErrors((prev) => { const n = { ...prev }; delete n[p.id]; return n; });
  }

  function cancelEditing(id: string): void {
    setEditingIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
    setEditValues((prev) => { const n = { ...prev }; delete n[id]; return n; });
    setSaveErrors((prev) => { const n = { ...prev }; delete n[id]; return n; });
  }

  function updateField(id: string, field: keyof EditValues, value: string): void {
    setEditValues((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  }

  async function saveRow(id: string): Promise<void> {
    const v = editValues[id];
    if (!v) return;

    setSavingIds((prev) => new Set(prev).add(id));
    setSaveErrors((prev) => { const n = { ...prev }; delete n[id]; return n; });

    try {
      const body: Record<string, unknown> = {
        code: v.code.trim(),
        name: v.name.trim(),
        costPrice: Number(v.costPrice),
        basePrice: Number(v.basePrice),
      };
      if (v.abcClass) body.abcClass = v.abcClass;
      if (v.categoryId) body.categoryId = v.categoryId;
      if (v.collectionId) body.collectionId = v.collectionId;

      await clientFetch(`/api/catalog/products/${id}`, { method: "PUT", body });

      // Re-fetch to get updated relationships
      await fetchProducts();
      cancelEditing(id);
    } catch (err) {
      setSaveErrors((prev) => ({
        ...prev,
        [id]: err instanceof Error ? err.message : "Erro ao salvar.",
      }));
    } finally {
      setSavingIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
    }
  }

  async function deleteRow(p: Product): Promise<void> {
    if (!confirm(`Excluir o produto "${p.name}"? Esta ação não pode ser desfeita.`)) return;

    setDeletingIds((prev) => new Set(prev).add(p.id));
    setSaveErrors((prev) => { const n = { ...prev }; delete n[p.id]; return n; });

    try {
      await clientFetch(`/api/catalog/products/${p.id}`, { method: "DELETE" });
      await fetchProducts();
    } catch (err) {
      setSaveErrors((prev) => ({
        ...prev,
        [p.id]: err instanceof Error ? err.message : "Erro ao excluir.",
      }));
    } finally {
      setDeletingIds((prev) => { const n = new Set(prev); n.delete(p.id); return n; });
    }
  }

  // ---------------------------------------------------------------------------
  // Bulk selection helpers
  // ---------------------------------------------------------------------------

  function toggleOne(id: string): void {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  function toggleAll(e: ChangeEvent<HTMLInputElement>): void {
    const pageIds = products?.data.map((p) => p.id) ?? [];
    setSelectedIds(e.target.checked ? new Set(pageIds) : new Set());
  }

  async function deleteSelected(): Promise<void> {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    if (!confirm(`Excluir ${ids.length} produto(s) selecionado(s)? Esta ação não pode ser desfeita.`)) return;

    setIsBulkDeleting(true);
    setBulkError(null);

    try {
      await clientFetch("/api/catalog/products/bulk-delete", { method: "POST", body: { ids } });
      setSelectedIds(new Set());
      await fetchProducts();
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : "Erro ao excluir os produtos selecionados.");
    } finally {
      setIsBulkDeleting(false);
    }
  }

  const isEditing = (id: string): boolean => editingIds.has(id);
  const isSaving = (id: string): boolean => savingIds.has(id);
  const isDeleting = (id: string): boolean => deletingIds.has(id);

  const pageIds = products?.data.map((p) => p.id) ?? [];
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));
  const somePageSelected = pageIds.some((id) => selectedIds.has(id));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-gray-900">Catálogo de Produtos</h1>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => router.push("/dashboard/catalogo/etiquetas")}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            <Barcode size={16} />
            Etiquetas
          </button>
          <button
            onClick={() => router.push("/dashboard/catalogo/importar")}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            Importar planilha
          </button>
          <button
            onClick={() => router.push("/dashboard/catalogo/novo")}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
          >
            <Plus size={16} />
            Novo Produto
          </button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
        <input
          type="text"
          placeholder="Buscar por nome, código ou SKU..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-4 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
      </div>

      {isLoading && !products && <LoadingSpinner />}
      {error && !products && <ErrorMessage message={error} onRetry={fetchProducts} />}
      {!isLoading && !error && products && products.data.length === 0 && (
        <EmptyState title="Nenhum produto encontrado" description="Cadastre o primeiro produto do catálogo." />
      )}

      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium text-red-800">
              {selectedIds.size} produto(s) selecionado(s)
            </span>
            <button
              onClick={() => setSelectedIds(new Set())}
              disabled={isBulkDeleting}
              className="text-sm text-red-700 underline underline-offset-2 hover:text-red-900 disabled:opacity-50"
            >
              Limpar seleção
            </button>
            {bulkError && <span className="text-sm text-red-600">{bulkError}</span>}
          </div>
          <button
            onClick={deleteSelected}
            disabled={isBulkDeleting}
            className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
          >
            {isBulkDeleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
            Excluir selecionados
          </button>
        </div>
      )}

      {products && products.data.length > 0 && (
        <div className={isLoading ? "opacity-50 transition-opacity" : "transition-opacity"}>
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={allPageSelected}
                      ref={(el) => { if (el) el.indeterminate = !allPageSelected && somePageSelected; }}
                      onChange={toggleAll}
                      aria-label="Selecionar todos os produtos desta página"
                      className="h-4 w-4 cursor-pointer rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Código</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Nome</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Categoria</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Coleção</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Preço</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Custo</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Curva</th>
                  <th className="px-4 py-3 w-28"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {products.data.map((p) => {
                  const editing = isEditing(p.id);
                  const saving = isSaving(p.id);
                  const deleting = isDeleting(p.id);
                  const v = editValues[p.id];
                  const rowError = saveErrors[p.id];

                  const selected = selectedIds.has(p.id);

                  return (
                    <tr key={p.id} className={`${editing ? "bg-brand-50/30" : selected ? "bg-brand-50/50" : "hover:bg-gray-50"} transition-colors`}>
                      {/* Seleção */}
                      <td className="w-10 px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleOne(p.id)}
                          disabled={isBulkDeleting || deleting}
                          aria-label={`Selecionar ${p.name}`}
                          className="h-4 w-4 cursor-pointer rounded border-gray-300 text-brand-600 focus:ring-brand-500 disabled:opacity-50"
                        />
                      </td>

                      {/* Código */}
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">
                        {editing ? (
                          <input value={v.code} onChange={(e) => updateField(p.id, "code", e.target.value)}
                            disabled={saving} className={INPUT_CELL} />
                        ) : p.code}
                      </td>

                      {/* Nome */}
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">
                        {editing ? (
                          <input value={v.name} onChange={(e) => updateField(p.id, "name", e.target.value)}
                            disabled={saving} className={INPUT_CELL} />
                        ) : p.name}
                      </td>

                      {/* Categoria */}
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">
                        {editing ? (
                          <select value={v.categoryId} onChange={(e) => updateField(p.id, "categoryId", e.target.value)}
                            disabled={saving} className={INPUT_CELL}>
                            <option value="">—</option>
                            {categories.map((c) => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                          </select>
                        ) : p.category?.name ?? "—"}
                      </td>

                      {/* Coleção */}
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">
                        {editing ? (
                          <select value={v.collectionId} onChange={(e) => updateField(p.id, "collectionId", e.target.value)}
                            disabled={saving} className={INPUT_CELL}>
                            <option value="">—</option>
                            {collections.map((c) => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                          </select>
                        ) : p.collection?.name ?? "—"}
                      </td>

                      {/* Preço */}
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">
                        {editing ? (
                          <MoneyInput value={v.basePrice}
                            onChange={(val) => updateField(p.id, "basePrice", val)}
                            disabled={saving} className={`${INPUT_CELL} w-28`} />
                        ) : p.basePrice.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                      </td>

                      {/* Custo */}
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">
                        {editing ? (
                          <MoneyInput value={v.costPrice}
                            onChange={(val) => updateField(p.id, "costPrice", val)}
                            disabled={saving} className={`${INPUT_CELL} w-28`} />
                        ) : p.costPrice.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                      </td>

                      {/* Curva ABC */}
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">
                        {editing ? (
                          <select value={v.abcClass} onChange={(e) => updateField(p.id, "abcClass", e.target.value)}
                            disabled={saving} className={`${INPUT_CELL} w-20`}>
                            <option value="">—</option>
                            <option value="A">A</option>
                            <option value="B">B</option>
                            <option value="C">C</option>
                          </select>
                        ) : abcBadge(p.abcClass)}
                      </td>

                      {/* Ações */}
                      <td className="whitespace-nowrap px-4 py-3 text-sm">
                        {editing ? (
                          <div className="flex items-center gap-1">
                            <button onClick={() => saveRow(p.id)} disabled={saving}
                              className="rounded p-1.5 text-green-600 hover:bg-green-100 disabled:opacity-50" title="Salvar">
                              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                            </button>
                            <button onClick={() => cancelEditing(p.id)} disabled={saving}
                              className="rounded p-1.5 text-gray-500 hover:bg-gray-100 disabled:opacity-50" title="Cancelar">
                              <X size={16} />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            <button onClick={() => startEditing(p)} title="Editar" disabled={deleting}
                              className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-brand-600 disabled:opacity-50">
                              <Pencil size={16} />
                            </button>
                            <button onClick={() => deleteRow(p)} title="Excluir" disabled={deleting}
                              className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50">
                              {deleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                            </button>
                          </div>
                        )}
                        {rowError && (
                          <p className="mt-1 text-xs text-red-500 max-w-32 truncate" title={rowError}>{rowError}</p>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination page={products.page} totalPages={products.totalPages} onPageChange={setPage} />
        </div>
      )}
    </div>
  );
}
