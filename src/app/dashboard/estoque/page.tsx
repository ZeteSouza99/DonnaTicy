"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Save, X, Pencil, Check, Loader2, Trash2 } from "lucide-react";
import type { ChangeEvent } from "react";
import { clientFetch } from "@/lib/client-fetch";
import { LoadingSpinner, EmptyState, ErrorMessage } from "@/components/ui/feedback";
import { Pagination } from "@/components/ui/pagination";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StockPosition {
  id: string;
  quantity: number;
  minStock: number;
  safetyStock: number;
  maxStock: number;
  variant: {
    sku: string;
    product: { id: string; name: string };
    color: { name: string; hexValue?: string };
    size: { name: string };
  };
  location: { name: string };
}

interface StockResponse {
  data: StockPosition[];
  total: number;
  page: number;
  totalPages: number;
}

interface EditValues {
  quantity: number;
  minStock: number;
  safetyStock: number;
  maxStock: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const INPUT_CELL =
  "w-20 rounded border border-brand-300 bg-brand-50 px-2 py-1 text-sm text-center focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500";

function statusBadge(s: StockPosition): React.ReactNode {
  if (s.quantity <= 0)
    return <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700"><AlertTriangle size={12} /> Sem estoque</span>;
  if (s.quantity <= s.minStock)
    return <span className="text-xs font-semibold text-orange-600">Abaixo do mínimo</span>;
  if (s.quantity <= s.safetyStock)
    return <span className="text-xs font-semibold text-yellow-600">Atenção</span>;
  return <span className="text-xs font-semibold text-green-600">OK</span>;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function EstoquePage(): React.ReactNode {
  const router = useRouter();
  const [stock, setStock] = useState<StockResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [belowMin, setBelowMin] = useState(false);
  const [page, setPage] = useState(1);

  // Editing state: maps stockPosition.id → edited values
  const [editingIds, setEditingIds] = useState<Set<string>>(new Set());
  const [editValues, setEditValues] = useState<Record<string, EditValues>>({});
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [saveErrors, setSaveErrors] = useState<Record<string, string>>({});

  // Bulk selection state (guarda productIds)
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const fetchStock = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "50" });
      if (belowMin) params.set("belowMin", "true");
      const data = await clientFetch<StockResponse>(`/api/inventory/stock?${params}`);
      setStock(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar estoque.");
    } finally {
      setIsLoading(false);
    }
  }, [belowMin, page]);

  useEffect(() => { fetchStock(); }, [fetchStock]);
  useEffect(() => { setSelectedProductIds(new Set()); setDeleteError(null); }, [belowMin, page]);

  // ---------------------------------------------------------------------------
  // Exclusão de produtos
  // ---------------------------------------------------------------------------

  function toggleProduct(productId: string): void {
    setSelectedProductIds((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId); else next.add(productId);
      return next;
    });
  }

  function toggleAll(e: ChangeEvent<HTMLInputElement>): void {
    const ids = stock?.data.map((sp) => sp.variant.product.id) ?? [];
    setSelectedProductIds(e.target.checked ? new Set(ids) : new Set());
  }

  async function deleteProducts(ids: string[], label: string): Promise<void> {
    if (ids.length === 0) return;
    if (!confirm(`Excluir ${label}? Todas as variantes e posições de estoque serão removidas. Esta ação não pode ser desfeita.`)) return;

    setIsDeleting(true);
    setDeleteError(null);
    try {
      await clientFetch("/api/catalog/products/bulk-delete", { method: "POST", body: { ids } });
      setSelectedProductIds(new Set());
      await fetchStock();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Erro ao excluir os produtos.");
    } finally {
      setIsDeleting(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Edit helpers
  // ---------------------------------------------------------------------------

  function startEditing(sp: StockPosition): void {
    setEditingIds((prev) => new Set(prev).add(sp.id));
    setEditValues((prev) => ({
      ...prev,
      [sp.id]: {
        quantity: sp.quantity,
        minStock: sp.minStock,
        safetyStock: sp.safetyStock,
        maxStock: sp.maxStock,
      },
    }));
    setSaveErrors((prev) => {
      const next = { ...prev };
      delete next[sp.id];
      return next;
    });
  }

  function cancelEditing(id: string): void {
    setEditingIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setEditValues((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setSaveErrors((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  function updateField(id: string, field: keyof EditValues, value: string): void {
    const num = value === "" ? 0 : parseInt(value, 10);
    if (isNaN(num) || num < 0) return;
    setEditValues((prev) => ({
      ...prev,
      [id]: { ...prev[id], [field]: num },
    }));
  }

  async function saveRow(id: string): Promise<void> {
    const values = editValues[id];
    if (!values) return;

    setSavingIds((prev) => new Set(prev).add(id));
    setSaveErrors((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });

    try {
      const updated = await clientFetch<StockPosition>(`/api/inventory/stock/${id}`, {
        method: "PATCH",
        body: values,
      });

      // Update row in-place
      setStock((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          data: prev.data.map((sp) => (sp.id === id ? { ...sp, ...updated } : sp)),
        };
      });

      cancelEditing(id);
    } catch (err) {
      setSaveErrors((prev) => ({
        ...prev,
        [id]: err instanceof Error ? err.message : "Erro ao salvar.",
      }));
    } finally {
      setSavingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const pageProductIds = [...new Set(stock?.data.map((sp) => sp.variant.product.id) ?? [])];
  const allPageSelected = pageProductIds.length > 0 && pageProductIds.every((id) => selectedProductIds.has(id));
  const somePageSelected = pageProductIds.some((id) => selectedProductIds.has(id));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Gestão de Estoque</h1>
        <button
          onClick={() => router.push("/dashboard/estoque/movimentar")}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
        >
          Nova Movimentação
        </button>
      </div>

      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={belowMin}
            onChange={(e) => { setBelowMin(e.target.checked); setPage(1); }}
            className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
          />
          Exibir apenas itens abaixo do mínimo
        </label>
      </div>

      {selectedProductIds.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium text-red-800">
              {selectedProductIds.size} produto(s) selecionado(s)
            </span>
            <button
              onClick={() => setSelectedProductIds(new Set())}
              disabled={isDeleting}
              className="text-sm text-red-700 underline underline-offset-2 hover:text-red-900 disabled:opacity-50"
            >
              Limpar seleção
            </button>
            {deleteError && <span className="text-sm text-red-600">{deleteError}</span>}
          </div>
          <button
            onClick={() => deleteProducts([...selectedProductIds], `${selectedProductIds.size} produto(s) selecionado(s)`)}
            disabled={isDeleting}
            className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
          >
            {isDeleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
            Excluir selecionados
          </button>
        </div>
      )}

      {isLoading && <LoadingSpinner />}
      {error && <ErrorMessage message={error} onRetry={fetchStock} />}

      {!isLoading && !error && stock && stock.data.length === 0 && (
        <EmptyState title="Nenhuma posição de estoque" description="Nenhum item encontrado com os filtros selecionados." />
      )}

      {!isLoading && !error && stock && stock.data.length > 0 && (
        <div className="rounded-lg border bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-left text-xs font-medium uppercase text-gray-500">
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
                  <th className="px-4 py-3">SKU</th>
                  <th className="px-4 py-3">Produto</th>
                  <th className="px-4 py-3">Cor</th>
                  <th className="px-4 py-3">Tam.</th>
                  <th className="px-4 py-3">Local</th>
                  <th className="px-4 py-3 text-center">Qtd</th>
                  <th className="px-4 py-3 text-center">Mín.</th>
                  <th className="px-4 py-3 text-center">Segur.</th>
                  <th className="px-4 py-3 text-center">Máx.</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 w-28 text-center">Ações</th>
                </tr>
              </thead>
              <tbody>
                {stock.data.map((sp) => {
                  const isEditing = editingIds.has(sp.id);
                  const isSaving = savingIds.has(sp.id);
                  const rowError = saveErrors[sp.id];
                  const vals = editValues[sp.id];
                  const selected = selectedProductIds.has(sp.variant.product.id);

                  return (
                    <tr key={sp.id} className={`border-b hover:bg-gray-50 ${isEditing ? "bg-brand-50" : ""} ${selected ? "bg-brand-50/50" : ""} ${rowError ? "bg-red-50" : ""}`}>
                      <td className="w-10 px-4 py-2">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleProduct(sp.variant.product.id)}
                          disabled={isDeleting}
                          aria-label={`Selecionar ${sp.variant.product.name}`}
                          className="h-4 w-4 cursor-pointer rounded border-gray-300 text-brand-600 focus:ring-brand-500 disabled:opacity-50"
                        />
                      </td>
                      <td className="px-4 py-2 font-mono text-xs text-gray-700">{sp.variant.sku}</td>
                      <td className="px-4 py-2">{sp.variant.product.name}</td>
                      <td className="px-4 py-2">
                        <span className="inline-flex items-center gap-1.5">
                          {sp.variant.color.hexValue && (
                            <span className="inline-block h-3 w-3 rounded-full border border-gray-300" style={{ backgroundColor: sp.variant.color.hexValue }} />
                          )}
                          {sp.variant.color.name}
                        </span>
                      </td>
                      <td className="px-4 py-2">{sp.variant.size.name}</td>
                      <td className="px-4 py-2">{sp.location.name}</td>

                      {/* Quantity */}
                      <td className="px-4 py-2 text-center">
                        {isEditing ? (
                          <input type="number" min={0} value={vals?.quantity ?? 0}
                            onChange={(e) => updateField(sp.id, "quantity", e.target.value)}
                            disabled={isSaving} className={INPUT_CELL} />
                        ) : (
                          <span className={sp.quantity <= sp.minStock ? "font-bold text-red-600" : ""}>{sp.quantity}</span>
                        )}
                      </td>

                      {/* Min Stock */}
                      <td className="px-4 py-2 text-center">
                        {isEditing ? (
                          <input type="number" min={0} value={vals?.minStock ?? 0}
                            onChange={(e) => updateField(sp.id, "minStock", e.target.value)}
                            disabled={isSaving} className={INPUT_CELL} />
                        ) : (
                          sp.minStock
                        )}
                      </td>

                      {/* Safety Stock */}
                      <td className="px-4 py-2 text-center">
                        {isEditing ? (
                          <input type="number" min={0} value={vals?.safetyStock ?? 0}
                            onChange={(e) => updateField(sp.id, "safetyStock", e.target.value)}
                            disabled={isSaving} className={INPUT_CELL} />
                        ) : (
                          sp.safetyStock
                        )}
                      </td>

                      {/* Max Stock */}
                      <td className="px-4 py-2 text-center">
                        {isEditing ? (
                          <input type="number" min={0} value={vals?.maxStock ?? 0}
                            onChange={(e) => updateField(sp.id, "maxStock", e.target.value)}
                            disabled={isSaving} className={INPUT_CELL} />
                        ) : (
                          sp.maxStock
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-2 text-center">
                        {statusBadge(isEditing && vals ? { ...sp, ...vals } : sp)}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-2 text-center">
                        {isEditing ? (
                          <div className="inline-flex items-center gap-1">
                            <button onClick={() => saveRow(sp.id)} disabled={isSaving}
                              className="rounded p-1.5 text-green-600 hover:bg-green-100 disabled:opacity-50" title="Salvar">
                              {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                            </button>
                            <button onClick={() => cancelEditing(sp.id)} disabled={isSaving}
                              className="rounded p-1.5 text-gray-500 hover:bg-gray-200 disabled:opacity-50" title="Cancelar">
                              <X size={16} />
                            </button>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1">
                            <button onClick={() => startEditing(sp)} className="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-brand-600" title="Editar">
                              <Pencil size={16} />
                            </button>
                            <button
                              onClick={() => deleteProducts([sp.variant.product.id], `o produto "${sp.variant.product.name}"`)}
                              disabled={isDeleting}
                              className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                              title="Excluir produto"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        )}
                        {rowError && <p className="mt-1 text-xs text-red-600">{rowError}</p>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {stock.totalPages > 1 && (
            <div className="border-t px-4 py-3">
              <Pagination page={stock.page} totalPages={stock.totalPages} onPageChange={setPage} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
