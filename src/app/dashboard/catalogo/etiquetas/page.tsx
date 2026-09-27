"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Barcode as BarcodeIcon, Printer, Search, Trash2 } from "lucide-react";
import { clientFetch } from "@/lib/client-fetch";
import { useDebounce } from "@/hooks/use-debounce";
import { Barcode } from "@/components/ui/barcode";
import { LoadingSpinner, EmptyState, ErrorMessage } from "@/components/ui/feedback";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface VariantRow {
  id: string;
  sku: string;
  barcode: string | null;
  product: { id: string; code: string; name: string };
  color: { name: string } | null;
  size: { name: string } | null;
}

interface VariantsResponse {
  data: VariantRow[];
  total: number;
}

/** Variante selecionada + quantidade de cópias a imprimir. */
interface SelectedLabel {
  variant: VariantRow;
  copies: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function LabelsPage(): React.ReactNode {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 500);
  const [results, setResults] = useState<VariantRow[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, SelectedLabel>>({});

  const fetchVariants = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (debouncedSearch) params.set("search", debouncedSearch);
      const data = await clientFetch<VariantsResponse>(`/api/catalog/variants?${params}`);
      setResults(data.data);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar variantes.");
    } finally {
      setIsLoading(false);
    }
  }, [debouncedSearch]);

  useEffect(() => {
    void fetchVariants();
  }, [fetchVariants]);

  const toggle = (variant: VariantRow): void => {
    setSelected((prev) => {
      const next = { ...prev };
      if (next[variant.id]) delete next[variant.id];
      else next[variant.id] = { variant, copies: 1 };
      return next;
    });
  };

  const setCopies = (id: string, copies: number): void => {
    setSelected((prev) =>
      prev[id] ? { ...prev, [id]: { ...prev[id], copies: Math.max(1, Math.min(99, copies)) } } : prev,
    );
  };

  const selectAllVisible = (): void => {
    setSelected((prev) => {
      const next = { ...prev };
      for (const variant of results) {
        if (variant.barcode && !next[variant.id]) next[variant.id] = { variant, copies: 1 };
      }
      return next;
    });
  };

  const selectedList = useMemo(() => Object.values(selected), [selected]);

  /** Expande cada variante nas suas cópias, na ordem de seleção. */
  const sheet = useMemo(
    () =>
      selectedList.flatMap(({ variant, copies }) =>
        Array.from({ length: copies }, (_, i) => ({ variant, key: `${variant.id}-${i}` })),
      ),
    [selectedList],
  );

  return (
    <div className="space-y-4">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/catalogo"
            className="rounded-lg border border-gray-300 p-2 text-gray-600 hover:bg-gray-50"
            aria-label="Voltar ao catálogo"
          >
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
              <BarcodeIcon size={22} /> Impressão de Etiquetas
            </h1>
            <p className="text-sm text-gray-500">
              Busque as peças, defina quantas etiquetas de cada e imprima em lote.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {selectedList.length > 0 && (
            <button
              type="button"
              onClick={() => setSelected({})}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <Trash2 size={16} /> Limpar seleção
            </button>
          )}
          <button
            type="button"
            onClick={() => window.print()}
            disabled={sheet.length === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Printer size={16} /> Imprimir ({sheet.length})
          </button>
        </div>
      </div>

      <div className="grid gap-4 print:hidden lg:grid-cols-2">
        {/* Busca */}
        <section className="rounded-lg border bg-white p-4">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por produto, SKU, código de barras, coleção..."
              className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
            <span>
              {total} variante(s) encontrada(s)
              {total > results.length && ` · exibindo ${results.length}`}
            </span>
            {results.length > 0 && (
              <button
                type="button"
                onClick={selectAllVisible}
                className="font-medium text-brand-600 hover:underline"
              >
                Selecionar todas exibidas
              </button>
            )}
          </div>

          <div className="mt-3 max-h-[28rem] overflow-y-auto rounded border">
            {isLoading ? (
              <LoadingSpinner />
            ) : error ? (
              <ErrorMessage message={error} onRetry={fetchVariants} />
            ) : results.length === 0 ? (
              <EmptyState title="Nenhuma variante encontrada." />
            ) : (
              <ul className="divide-y">
                {results.map((variant) => {
                  const isSelected = Boolean(selected[variant.id]);
                  const hasBarcode = Boolean(variant.barcode);
                  return (
                    <li key={variant.id}>
                      <label
                        className={`flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-gray-50 ${
                          hasBarcode ? "" : "opacity-50"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={!hasBarcode}
                          onChange={() => toggle(variant)}
                          className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium text-gray-900">
                            {variant.product.name}
                          </span>
                          <span className="block truncate text-xs text-gray-500">
                            {[variant.color?.name, variant.size?.name].filter(Boolean).join(" · ") || "—"}
                            {" · "}
                            <span className="font-mono">{variant.sku}</span>
                          </span>
                        </span>
                        <span className="font-mono text-xs text-gray-400">
                          {variant.barcode ?? "sem código"}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        {/* Selecionadas */}
        <section className="rounded-lg border bg-white p-4">
          <h2 className="text-sm font-semibold text-gray-900">
            Selecionadas ({selectedList.length})
          </h2>
          {selectedList.length === 0 ? (
            <p className="mt-6 text-center text-sm text-gray-500">
              Marque as variantes à esquerda para montar a folha de etiquetas.
            </p>
          ) : (
            <ul className="mt-3 max-h-[28rem] divide-y overflow-y-auto rounded border">
              {selectedList.map(({ variant, copies }) => (
                <li key={variant.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-gray-900">
                      {variant.product.name}
                    </span>
                    <span className="block truncate font-mono text-xs text-gray-500">
                      {variant.sku}
                    </span>
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={copies}
                    onChange={(e) => setCopies(variant.id, Number(e.target.value))}
                    className="w-16 rounded border border-gray-300 px-2 py-1 text-center text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                    aria-label={`Cópias de ${variant.sku}`}
                  />
                  <button
                    type="button"
                    onClick={() => toggle(variant)}
                    className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-red-600"
                    aria-label={`Remover ${variant.sku}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Folha de impressão */}
      {sheet.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 print:grid-cols-4">
          {sheet.map(({ variant, key }) => (
            <div
              key={key}
              className="flex break-inside-avoid flex-col items-center gap-1 rounded-lg border bg-white p-3 text-center"
            >
              <span className="line-clamp-2 text-xs font-semibold text-gray-900">
                {variant.product.name}
              </span>
              <span className="text-[11px] text-gray-500">
                {[variant.color?.name, variant.size?.name].filter(Boolean).join(" · ") || "—"}
              </span>
              <Barcode value={variant.barcode ?? ""} moduleWidth={1.6} height={40} />
              <span className="font-mono text-[10px] text-gray-500">{variant.sku}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
