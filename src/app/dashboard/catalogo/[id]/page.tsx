"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { ArrowLeft, Save, Trash2, Printer, Barcode as BarcodeIcon, Loader2 } from "lucide-react";
import { clientFetch } from "@/lib/client-fetch";
import { LoadingSpinner, ErrorMessage } from "@/components/ui/feedback";
import { MoneyInput } from "@/components/ui/money-input";
import { Barcode } from "@/components/ui/barcode";

interface SelectOption {
  id: string;
  name: string;
}

interface Variant {
  id: string;
  sku: string;
  barcode: string | null;
  color?: { name: string; hexValue?: string | null };
  size?: { name: string };
}

interface Product {
  id: string;
  code: string;
  name: string;
  description: string | null;
  collectionId: string;
  lineId: string;
  categoryId: string;
  composition: string | null;
  costPrice: number;
  basePrice: number;
  markup: number;
  abcClass: string | null;
  seasonality: string | null;
  collection?: { name: string };
  line?: { name: string };
  category?: { name: string };
  variants?: Variant[];
}

interface FormData {
  code: string;
  name: string;
  description: string;
  collectionId: string;
  lineId: string;
  categoryId: string;
  composition: string;
  costPrice: string;
  basePrice: string;
  markup: string;
  abcClass: string;
  seasonality: string;
}

export default function ProdutoDetalhePage(): React.ReactNode {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [product, setProduct] = useState<Product | null>(null);
  const [form, setForm] = useState<FormData | null>(null);
  const [collections, setCollections] = useState<SelectOption[]>([]);
  const [lines, setLines] = useState<SelectOption[]>([]);
  const [categories, setCategories] = useState<SelectOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGeneratingBarcodes, setIsGeneratingBarcodes] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [prod, cols, lns, cats] = await Promise.all([
        clientFetch<Product>(`/api/catalog/products/${id}`),
        clientFetch<{ data: SelectOption[] }>("/api/catalog/collections?limit=100"),
        clientFetch<{ data: SelectOption[] }>("/api/catalog/lines?limit=100"),
        clientFetch<{ data: SelectOption[] }>("/api/catalog/categories?limit=100"),
      ]);
      setProduct(prod);
      setCollections(cols.data);
      setLines(lns.data);
      setCategories(cats.data);
      setForm({
        code: prod.code,
        name: prod.name,
        description: prod.description ?? "",
        collectionId: prod.collectionId,
        lineId: prod.lineId,
        categoryId: prod.categoryId,
        composition: prod.composition ?? "",
        costPrice: String(prod.costPrice),
        basePrice: String(prod.basePrice),
        markup: String(prod.markup),
        abcClass: prod.abcClass ?? "",
        seasonality: prod.seasonality ?? "",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar produto.");
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>): void {
    setForm((prev) => prev ? { ...prev, [e.target.name]: e.target.value } : prev);
  }

  async function handleSave(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!form) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await clientFetch(`/api/catalog/products/${id}`, {
        method: "PUT",
        body: {
          code: form.code,
          name: form.name,
          description: form.description || undefined,
          collectionId: form.collectionId,
          lineId: form.lineId,
          categoryId: form.categoryId,
          composition: form.composition || undefined,
          costPrice: Number(form.costPrice),
          basePrice: Number(form.basePrice),
          markup: Number(form.markup),
          abcClass: form.abcClass || undefined,
          seasonality: form.seasonality || undefined,
        },
      });
      router.push("/dashboard/catalogo");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar produto.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete(): Promise<void> {
    if (!confirm("Tem certeza que deseja excluir este produto?")) return;
    try {
      await clientFetch(`/api/catalog/products/${id}`, { method: "DELETE" });
      router.push("/dashboard/catalogo");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao excluir produto.");
    }
  }

  async function handleGenerateBarcodes(): Promise<void> {
    setIsGeneratingBarcodes(true);
    setError(null);
    try {
      await clientFetch(`/api/catalog/products/${id}/barcodes`, { method: "POST" });
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao gerar códigos de barras.");
    } finally {
      setIsGeneratingBarcodes(false);
    }
  }

  if (isLoading) return <LoadingSpinner />;
  if (error && !product) return <ErrorMessage message={error} onRetry={fetchData} />;
  if (!form) return null;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="rounded-lg p-2 hover:bg-gray-100" aria-label="Voltar">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-2xl font-bold text-gray-900">{product?.name}</h1>
        </div>
        <button onClick={handleDelete} className="inline-flex items-center gap-2 rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50">
          <Trash2 size={16} />
          Excluir
        </button>
      </div>

      {error && <ErrorMessage message={error} />}

      <form onSubmit={handleSave} className="space-y-4 rounded-lg border bg-white p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="code" className="mb-1 block text-sm font-medium text-gray-700">Código *</label>
            <input id="code" name="code" required value={form.code} onChange={handleChange}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
          </div>
          <div>
            <label htmlFor="name" className="mb-1 block text-sm font-medium text-gray-700">Nome *</label>
            <input id="name" name="name" required value={form.name} onChange={handleChange}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
          </div>
        </div>

        <div>
          <label htmlFor="description" className="mb-1 block text-sm font-medium text-gray-700">Descrição</label>
          <textarea id="description" name="description" rows={3} value={form.description} onChange={handleChange}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="collectionId" className="mb-1 block text-sm font-medium text-gray-700">Coleção *</label>
            <select id="collectionId" name="collectionId" required value={form.collectionId} onChange={handleChange}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500">
              <option value="">Selecione</option>
              {collections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="lineId" className="mb-1 block text-sm font-medium text-gray-700">Linha *</label>
            <select id="lineId" name="lineId" required value={form.lineId} onChange={handleChange}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500">
              <option value="">Selecione</option>
              {lines.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="categoryId" className="mb-1 block text-sm font-medium text-gray-700">Categoria *</label>
            <select id="categoryId" name="categoryId" required value={form.categoryId} onChange={handleChange}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500">
              <option value="">Selecione</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="composition" className="mb-1 block text-sm font-medium text-gray-700">Composição</label>
          <input id="composition" name="composition" value={form.composition} onChange={handleChange}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="costPrice" className="mb-1 block text-sm font-medium text-gray-700">Preço de Custo *</label>
            <MoneyInput id="costPrice" name="costPrice" required value={form.costPrice}
              onChange={(v) => setForm((f) => (f ? { ...f, costPrice: v } : f))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
          </div>
          <div>
            <label htmlFor="basePrice" className="mb-1 block text-sm font-medium text-gray-700">Preço Base *</label>
            <MoneyInput id="basePrice" name="basePrice" required value={form.basePrice}
              onChange={(v) => setForm((f) => (f ? { ...f, basePrice: v } : f))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
          </div>
          <div>
            <label htmlFor="markup" className="mb-1 block text-sm font-medium text-gray-700">Markup *</label>
            <input id="markup" name="markup" type="number" step="0.01" min="0" required value={form.markup} onChange={handleChange}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="abcClass" className="mb-1 block text-sm font-medium text-gray-700">Curva ABC</label>
            <select id="abcClass" name="abcClass" value={form.abcClass} onChange={handleChange}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500">
              <option value="">Selecione</option>
              <option value="A">A</option>
              <option value="B">B</option>
              <option value="C">C</option>
            </select>
          </div>
          <div>
            <label htmlFor="seasonality" className="mb-1 block text-sm font-medium text-gray-700">Sazonalidade</label>
            <select id="seasonality" name="seasonality" value={form.seasonality} onChange={handleChange}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500">
              <option value="">Selecione</option>
              <option value="BASIC">Básico</option>
              <option value="SEASONAL">Sazonal</option>
              <option value="FASHION_BET">Aposta de Moda</option>
            </select>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4">
          <button type="button" onClick={() => router.back()}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Cancelar
          </button>
          <button type="submit" disabled={isSubmitting}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
            <Save size={16} />
            {isSubmitting ? "Salvando..." : "Salvar Alterações"}
          </button>
        </div>
      </form>

      <VariantBarcodes
        variants={product?.variants ?? []}
        productName={product?.name ?? ""}
        isGenerating={isGeneratingBarcodes}
        onGenerate={handleGenerateBarcodes}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Códigos de barras das variantes
// ---------------------------------------------------------------------------

interface VariantBarcodesProps {
  variants: Variant[];
  productName: string;
  isGenerating: boolean;
  onGenerate: () => void;
}

function VariantBarcodes({ variants, productName, isGenerating, onGenerate }: VariantBarcodesProps): React.ReactNode {
  if (variants.length === 0) return null;
  const missing = variants.filter((v) => !v.barcode).length;

  return (
    <section className="space-y-3 rounded-lg border bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
            <BarcodeIcon size={18} /> Códigos de barras ({variants.length} variante(s))
          </h2>
          {missing > 0 && (
            <p className="text-sm text-amber-700">{missing} variante(s) ainda sem código de barras.</p>
          )}
        </div>
        <div className="flex gap-2">
          {missing > 0 && (
            <button
              type="button"
              onClick={onGenerate}
              disabled={isGenerating}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {isGenerating ? <Loader2 className="animate-spin" size={16} /> : <BarcodeIcon size={16} />}
              Gerar códigos
            </button>
          )}
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <Printer size={16} /> Imprimir etiquetas
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {variants.map((v) => (
          <div key={v.id} className="flex flex-col items-center gap-1 rounded-lg border p-3 text-center">
            <span className="line-clamp-2 text-xs font-semibold text-gray-900">{productName}</span>
            <span className="text-[11px] text-gray-500">
              {v.color?.name ?? "—"} · {v.size?.name ?? "—"}
            </span>
            {v.barcode ? (
              <Barcode value={v.barcode} moduleWidth={1.6} height={40} />
            ) : (
              <span className="py-4 text-xs text-gray-400">sem código</span>
            )}
            <span className="font-mono text-[10px] text-gray-500">{v.sku}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
