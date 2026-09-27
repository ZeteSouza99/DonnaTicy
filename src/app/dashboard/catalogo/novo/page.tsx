"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Loader2, Check, X, Plus, Save, Printer, Barcode as BarcodeIcon } from "lucide-react";
import { clientFetch } from "@/lib/client-fetch";
import { LoadingSpinner } from "@/components/ui/feedback";
import { MoneyInput } from "@/components/ui/money-input";
import { Barcode } from "@/components/ui/barcode";
import { normalizeInternalCode } from "@/lib/barcode";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

interface Option { id: string; name: string; code?: string }
interface SizeOption extends Option { sortOrder?: number }
interface ColorOption extends Option { hexValue?: string }

interface ProductData {
  collectionId: string;
  lineId: string;
  locationId: string;
  internalCode: string;
  internalDescription: string;
  fiscalDescription: string;
  categoryId: string;
  supplierId: string;
  costUnit: string;
  priceSuggestion: string;
  notes: string;
}

interface GeneratedLabel {
  sku: string;
  barcode: string;
  productName: string;
  colorName: string;
  sizeName: string;
}

interface BatchImportResponse {
  productsCreated: number;
  variantsCreated: number;
  results: {
    productId: string;
    productName: string;
    variants: { id: string; sku: string; barcode: string }[];
  }[];
}

interface Cell {
  enabled: boolean;
  quantity: string;
}

type InlineEntity = "color" | "size" | "category" | "supplier" | null;

const INPUT = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500";

function slug(s: string): string {
  return s.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function code(s: string, max = 20): string {
  return slug(s).toUpperCase().slice(0, max);
}

function buildSku(productName: string, colorName: string, sizeName: string): string {
  const p = slug(productName).toUpperCase().replace(/-/g, "");
  const c = slug(colorName).toUpperCase().replace(/-/g, "").slice(0, 4);
  const s = slug(sizeName).toUpperCase().replace(/-/g, "");
  return [p, c, s].filter(Boolean).join("-").slice(0, 40);
}

function formatBRL(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function NovoProdutoPage(): React.ReactNode {
  const router = useRouter();

  const [collections, setCollections] = useState<Option[]>([]);
  const [lines, setLines] = useState<Option[]>([]);
  const [categories, setCategories] = useState<Option[]>([]);
  const [colors, setColors] = useState<ColorOption[]>([]);
  const [sizes, setSizes] = useState<SizeOption[]>([]);
  const [suppliers, setSuppliers] = useState<Option[]>([]);
  const [locations, setLocations] = useState<Option[]>([]);
  const [isLoadingOptions, setIsLoadingOptions] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [step, setStep] = useState<1 | 2>(1);
  const [product, setProduct] = useState<ProductData>({
    collectionId: "", lineId: "", locationId: "",
    internalCode: "", internalDescription: "", fiscalDescription: "",
    categoryId: "", supplierId: "",
    costUnit: "", priceSuggestion: "", notes: "",
  });
  const [labels, setLabels] = useState<GeneratedLabel[]>([]);

  const [selectedColorIds, setSelectedColorIds] = useState<string[]>([]);
  const [selectedSizeIds, setSelectedSizeIds] = useState<string[]>([]);
  const [matrix, setMatrix] = useState<Record<string, Cell>>({});
  const [defaultQty, setDefaultQty] = useState("1");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [inline, setInline] = useState<InlineEntity>(null);
  const [inlineName, setInlineName] = useState("");
  const [inlineHex, setInlineHex] = useState("#CCCCCC");
  const [inlineSort, setInlineSort] = useState(99);
  const [inlineSaving, setInlineSaving] = useState(false);

  const fetchOptions = useCallback(async () => {
    try {
      const [cols, lns, cats, clrs, szs, sups, locs] = await Promise.all([
        clientFetch<{ data: Option[] }>("/api/catalog/collections?limit=100"),
        clientFetch<{ data: Option[] }>("/api/catalog/lines?limit=100"),
        clientFetch<{ data: Option[] }>("/api/catalog/categories?limit=100"),
        clientFetch<{ data: ColorOption[] }>("/api/catalog/colors?limit=100"),
        clientFetch<{ data: SizeOption[] }>("/api/catalog/sizes?limit=100"),
        clientFetch<{ data: Array<{ id: string; companyName: string }> }>("/api/purchasing/suppliers?limit=100"),
        clientFetch<{ data: Option[] }>("/api/inventory/locations?limit=100"),
      ]);
      setCollections(cols.data);
      setLines(lns.data);
      setCategories(cats.data);
      setColors(clrs.data);
      setSizes(szs.data.sort((a, b) => (a.sortOrder ?? 99) - (b.sortOrder ?? 99)));
      setSuppliers(sups.data.map((s) => ({ id: s.id, name: s.companyName })));
      setLocations(locs.data);

      setProduct((p) => ({
        ...p,
        collectionId: cols.data[0]?.id ?? "",
        lineId: lns.data[0]?.id ?? "",
        locationId: locs.data[0]?.id ?? "",
      }));
    } catch {
      setError("Erro ao carregar opções.");
    } finally {
      setIsLoadingOptions(false);
    }
  }, []);

  useEffect(() => { fetchOptions(); }, [fetchOptions]);

  const cellKey = (c: string, s: string): string => `${c}|${s}`;

  const toggleColor = (id: string): void => {
    setSelectedColorIds((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);
  };
  const toggleSize = (id: string): void => {
    setSelectedSizeIds((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);
  };

  useEffect(() => {
    setMatrix((prev) => {
      const next: Record<string, Cell> = {};
      for (const c of selectedColorIds) {
        for (const s of selectedSizeIds) {
          const k = cellKey(c, s);
          next[k] = prev[k] ?? { enabled: true, quantity: defaultQty };
        }
      }
      return next;
    });
  }, [selectedColorIds, selectedSizeIds, defaultQty]);

  const toggleCell = (c: string, s: string): void => {
    setMatrix((prev) => {
      const k = cellKey(c, s);
      return { ...prev, [k]: { ...prev[k], enabled: !prev[k]?.enabled } };
    });
  };

  const setCellQty = (c: string, s: string, qty: string): void => {
    setMatrix((prev) => {
      const k = cellKey(c, s);
      return { ...prev, [k]: { ...prev[k], quantity: qty } };
    });
  };

  const fillAll = (qty: string): void => {
    setDefaultQty(qty);
    setMatrix((prev) => {
      const next: Record<string, Cell> = {};
      for (const k of Object.keys(prev)) {
        next[k] = { ...prev[k], quantity: qty };
      }
      return next;
    });
  };

  const enabledCells = useMemo(
    () => Object.entries(matrix).filter(([, v]) => v.enabled),
    [matrix],
  );

  const totalUnits = useMemo(
    () => enabledCells.reduce((s, [, v]) => s + (Number(v.quantity) || 0), 0),
    [enabledCells],
  );

  const totalCost = useMemo(
    () => totalUnits * (Number(product.costUnit) || 0),
    [totalUnits, product.costUnit],
  );

  function openInline(entity: Exclude<InlineEntity, null>): void {
    setInlineName("");
    setInlineHex("#CCCCCC");
    setInlineSort(99);
    setInline(entity);
  }

  async function saveInline(): Promise<void> {
    if (!inline || !inlineName.trim()) return;
    setInlineSaving(true);
    try {
      const name = inlineName.trim();
      if (inline === "color") {
        const c = await clientFetch<ColorOption>("/api/catalog/colors", {
          method: "POST",
          body: { name, code: code(name, 10), hexValue: inlineHex },
        });
        setColors((p) => [...p, c]);
        setSelectedColorIds((p) => [...p, c.id]);
      } else if (inline === "size") {
        const c = await clientFetch<SizeOption>("/api/catalog/sizes", {
          method: "POST",
          body: { name, code: code(name, 10), sortOrder: inlineSort },
        });
        setSizes((p) => [...p, c].sort((a, b) => (a.sortOrder ?? 99) - (b.sortOrder ?? 99)));
        setSelectedSizeIds((p) => [...p, c.id]);
      } else if (inline === "category") {
        const c = await clientFetch<Option>("/api/catalog/categories", {
          method: "POST",
          body: { name, code: code(name, 20), slug: slug(name) },
        });
        setCategories((p) => [...p, c]);
        setProduct((p) => ({ ...p, categoryId: c.id }));
      } else if (inline === "supplier") {
        const cnpj = String(Date.now()).padStart(14, "0").slice(-14);
        const c = await clientFetch<{ id: string; companyName: string }>("/api/purchasing/suppliers", {
          method: "POST",
          body: { type: "FULL_PACKAGE", companyName: name, tradeName: name, cnpj },
        });
        setSuppliers((p) => [...p, { id: c.id, name: c.companyName }]);
        setProduct((p) => ({ ...p, supplierId: c.id }));
      }
      setInline(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar registro.");
    } finally {
      setInlineSaving(false);
    }
  }

  function validateStep1(): string | null {
    if (!product.collectionId) return "Selecione a coleção.";
    if (!product.lineId) return "Selecione a linha.";
    if (!product.locationId) return "Selecione o local de estoque.";
    if (!product.internalDescription.trim()) return "Informe o nome do produto (descrição interna).";
    if (!product.categoryId) return "Selecione a categoria.";
    if (!product.costUnit || Number(product.costUnit) <= 0) return "Informe o custo unitário.";
    return null;
  }

  function goNext(): void {
    const err = validateStep1();
    if (err) { setError(err); return; }
    setError(null);
    setStep(2);
  }

  async function handleSubmit(): Promise<void> {
    if (enabledCells.length === 0) { setError("Marque ao menos uma combinação cor × tamanho."); return; }
    setError(null);
    setIsSubmitting(true);
    try {
      const meta = new Map<string, { colorName: string; sizeName: string }>();
      const rows = enabledCells.map(([key, cell]) => {
        const [colorId, sizeId] = key.split("|");
        const colorName = colors.find((c) => c.id === colorId)?.name ?? "";
        const sizeName = sizes.find((s) => s.id === sizeId)?.name ?? "";
        const sku = buildSku(product.internalDescription, colorName, sizeName);
        meta.set(sku, { colorName, sizeName });
        return {
          code: sku,
          fiscalDescription: product.fiscalDescription,
          internalDescription: product.internalDescription,
          colorId,
          sizeId,
          categoryId: product.categoryId,
          quantity: Number(cell.quantity) || 0,
          costUnit: Number(product.costUnit),
          priceSuggestion: product.priceSuggestion,
          supplierId: product.supplierId || undefined,
          notes: product.notes || undefined,
        };
      });

      const res = await clientFetch<BatchImportResponse>("/api/catalog/batch-import", {
        method: "POST",
        body: {
          collectionId: product.collectionId,
          lineId: product.lineId,
          locationId: product.locationId,
          internalCode: product.internalCode || undefined,
          rows,
        },
      });

      setLabels(
        res.results.flatMap((r) =>
          r.variants.map((v) => ({
            sku: v.sku,
            barcode: v.barcode,
            productName: r.productName,
            colorName: meta.get(v.sku)?.colorName ?? "",
            sizeName: meta.get(v.sku)?.sizeName ?? "",
          })),
        ),
      );
      setSuccess(`Produto cadastrado com ${rows.length} variante(s). Códigos de barras gerados.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao cadastrar produto.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoadingOptions) return <LoadingSpinner />;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="rounded-lg p-2 hover:bg-gray-100" aria-label="Voltar">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">Cadastro de Produto</h1>
          <p className="text-sm text-gray-500">Defina o produto e depois selecione as variantes (cor × tamanho).</p>
        </div>
        <Stepper step={step} />
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-red-700">
          <X size={18} className="mt-0.5 shrink-0" />
          <span className="flex-1 text-sm">{error}</span>
          <button type="button" onClick={() => setError(null)} className="text-red-700 hover:text-red-900" aria-label="Fechar"><X size={16} /></button>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-emerald-700">
          <Check size={18} /> {success}
        </div>
      )}

      {labels.length > 0 ? (
        <LabelSheet labels={labels} onFinish={() => router.push("/dashboard/catalogo")} />
      ) : step === 1 ? (
        <Step1
          product={product}
          setProduct={setProduct}
          collections={collections}
          lines={lines}
          categories={categories}
          suppliers={suppliers}
          locations={locations}
          openInline={openInline}
          onNext={goNext}
        />
      ) : (
        <Step2
          colors={colors}
          sizes={sizes}
          selectedColorIds={selectedColorIds}
          selectedSizeIds={selectedSizeIds}
          toggleColor={toggleColor}
          toggleSize={toggleSize}
          matrix={matrix}
          toggleCell={toggleCell}
          setCellQty={setCellQty}
          defaultQty={defaultQty}
          fillAll={fillAll}
          totalUnits={totalUnits}
          totalCost={totalCost}
          enabledCount={enabledCells.length}
          productName={product.internalDescription}
          onBack={() => setStep(1)}
          onSubmit={handleSubmit}
          isSubmitting={isSubmitting}
          openInline={openInline}
        />
      )}

      {inline && (
        <InlineModal
          entity={inline}
          name={inlineName}
          setName={setInlineName}
          hex={inlineHex}
          setHex={setInlineHex}
          sort={inlineSort}
          setSort={setInlineSort}
          saving={inlineSaving}
          onCancel={() => setInline(null)}
          onSave={saveInline}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stepper
// ---------------------------------------------------------------------------

function Stepper({ step }: { step: 1 | 2 }): React.ReactNode {
  return (
    <div className="flex items-center gap-2">
      {[1, 2].map((n) => (
        <div key={n} className="flex items-center gap-2">
          <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${step >= n ? "bg-brand-600 text-white" : "bg-gray-200 text-gray-500"}`}>{n}</div>
          {n === 1 && <div className={`h-0.5 w-12 ${step >= 2 ? "bg-brand-600" : "bg-gray-200"}`} />}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Etiquetas geradas
// ---------------------------------------------------------------------------

function LabelSheet({ labels, onFinish }: { labels: GeneratedLabel[]; onFinish: () => void }): React.ReactNode {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-white p-4 print:hidden">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
            <BarcodeIcon size={18} /> Etiquetas geradas ({labels.length})
          </h2>
          <p className="text-sm text-gray-500">
            Imprima e cole nas peças. No PDV, basta ler o código para lançar o item.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            <Printer size={16} /> Imprimir etiquetas
          </button>
          <button
            type="button"
            onClick={onFinish}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Ir para o catálogo
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {labels.map((label) => (
          <div key={label.sku} className="flex flex-col items-center gap-1 rounded-lg border bg-white p-3 text-center">
            <span className="line-clamp-2 text-xs font-semibold text-gray-900">{label.productName}</span>
            <span className="text-[11px] text-gray-500">
              {label.colorName} · {label.sizeName}
            </span>
            <Barcode value={label.barcode} moduleWidth={1.6} height={40} />
            <span className="font-mono text-[10px] text-gray-500">{label.sku}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 1
// ---------------------------------------------------------------------------

interface Step1Props {
  product: ProductData;
  setProduct: React.Dispatch<React.SetStateAction<ProductData>>;
  collections: Option[];
  lines: Option[];
  categories: Option[];
  suppliers: Option[];
  locations: Option[];
  openInline: (e: Exclude<InlineEntity, null>) => void;
  onNext: () => void;
}

function Step1({ product, setProduct, collections, lines, categories, suppliers, locations, openInline, onNext }: Step1Props): React.ReactNode {
  const update = <K extends keyof ProductData>(k: K, v: ProductData[K]): void => setProduct((p) => ({ ...p, [k]: v }));

  return (
    <div className="space-y-5">
      <div className="rounded-lg border bg-white p-5">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">1. Dados do produto</h2>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Field label="Coleção *">
            <select className={INPUT} value={product.collectionId} onChange={(e) => update("collectionId", e.target.value)}>
              <option value="">—</option>
              {collections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Linha *">
            <select className={INPUT} value={product.lineId} onChange={(e) => update("lineId", e.target.value)}>
              <option value="">—</option>
              {lines.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Local de estoque *">
            <select className={INPUT} value={product.locationId} onChange={(e) => update("locationId", e.target.value)}>
              <option value="">—</option>
              {locations.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>

          <Field label="Nome do produto (descrição interna) *" className="md:col-span-2">
            <input
              className={INPUT}
              value={product.internalDescription}
              onChange={(e) => update("internalDescription", e.target.value.toUpperCase())}
              placeholder="Ex.: CJ LEG MAYA"
            />
          </Field>
          <Field label="Código interno">
            <input
              className={INPUT}
              value={product.internalCode}
              onChange={(e) => update("internalCode", normalizeInternalCode(e.target.value))}
              placeholder="Ex.: MAYA001 (gera o código de barras)"
            />
            <p className="mt-1 text-[11px] text-gray-500">
              Base do código de barras EAN-13 gerado para cada variante. Em branco, usa o código do produto.
            </p>
          </Field>
          <Field label="Descrição NF" className="md:col-span-2">
            <input
              className={INPUT}
              value={product.fiscalDescription}
              onChange={(e) => update("fiscalDescription", e.target.value)}
              placeholder="Descrição para nota fiscal"
            />
          </Field>

          <Field label="Categoria *">
            <div className="flex gap-2">
              <select className={INPUT} value={product.categoryId} onChange={(e) => update("categoryId", e.target.value)}>
                <option value="">—</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <button type="button" onClick={() => openInline("category")} className="rounded-lg border border-gray-300 px-2 hover:bg-gray-50" title="Nova categoria">
                <Plus size={16} />
              </button>
            </div>
          </Field>

          <Field label="Fornecedor">
            <div className="flex gap-2">
              <select className={INPUT} value={product.supplierId} onChange={(e) => update("supplierId", e.target.value)}>
                <option value="">—</option>
                {suppliers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <button type="button" onClick={() => openInline("supplier")} className="rounded-lg border border-gray-300 px-2 hover:bg-gray-50" title="Novo fornecedor">
                <Plus size={16} />
              </button>
            </div>
          </Field>

          <Field label="Custo unitário *">
            <MoneyInput className={INPUT} value={product.costUnit} onChange={(v) => update("costUnit", v)} />
          </Field>

          <Field label="Sugestão de venda">
            <input
              className={INPUT}
              value={product.priceSuggestion}
              onChange={(e) => update("priceSuggestion", e.target.value)}
              placeholder="Ex.: 159-169 ou 169"
            />
          </Field>

          <Field label="Observações" className="md:col-span-3">
            <input
              className={INPUT}
              value={product.notes}
              onChange={(e) => update("notes", e.target.value)}
              placeholder="Observações internas (opcional)"
            />
          </Field>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={onNext}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-700"
        >
          Próximo: variantes <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }): React.ReactNode {
  return (
    <div className={className}>
      <label className="mb-1 block text-xs font-medium text-gray-700">{label}</label>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2
// ---------------------------------------------------------------------------

interface Step2Props {
  colors: ColorOption[];
  sizes: SizeOption[];
  selectedColorIds: string[];
  selectedSizeIds: string[];
  toggleColor: (id: string) => void;
  toggleSize: (id: string) => void;
  matrix: Record<string, Cell>;
  toggleCell: (c: string, s: string) => void;
  setCellQty: (c: string, s: string, q: string) => void;
  defaultQty: string;
  fillAll: (q: string) => void;
  totalUnits: number;
  totalCost: number;
  enabledCount: number;
  productName: string;
  onBack: () => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  openInline: (e: Exclude<InlineEntity, null>) => void;
}

function Step2(props: Step2Props): React.ReactNode {
  const { colors, sizes, selectedColorIds, selectedSizeIds, toggleColor, toggleSize, matrix, toggleCell, setCellQty,
    defaultQty, fillAll, totalUnits, totalCost, enabledCount, productName, onBack, onSubmit, isSubmitting, openInline } = props;

  const cellKey = (c: string, s: string): string => `${c}|${s}`;
  const selectedColors = colors.filter((c) => selectedColorIds.includes(c.id));
  const selectedSizes = sizes.filter((s) => selectedSizeIds.includes(s.id));

  return (
    <div className="space-y-5">
      <div className="rounded-lg border bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">2. Variantes do produto</h2>
          <p className="text-sm text-gray-500">{productName}</p>
        </div>

        <div className="mb-4">
          <div className="mb-2 flex items-center justify-between">
            <label className="text-xs font-medium uppercase text-gray-600">Cores</label>
            <button type="button" onClick={() => openInline("color")} className="inline-flex items-center gap-1 text-xs text-brand-600 hover:underline">
              <Plus size={12} /> Nova cor
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {colors.map((c) => {
              const active = selectedColorIds.includes(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggleColor(c.id)}
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors ${active ? "border-brand-500 bg-brand-50 text-brand-700" : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"}`}
                >
                  <span className="h-4 w-4 rounded-full border" style={{ background: c.hexValue ?? "#ccc" }} />
                  {c.name}
                  {active && <Check size={14} />}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mb-4">
          <div className="mb-2 flex items-center justify-between">
            <label className="text-xs font-medium uppercase text-gray-600">Tamanhos</label>
            <button type="button" onClick={() => openInline("size")} className="inline-flex items-center gap-1 text-xs text-brand-600 hover:underline">
              <Plus size={12} /> Novo tamanho
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {sizes.map((s) => {
              const active = selectedSizeIds.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggleSize(s.id)}
                  className={`min-w-12 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${active ? "border-brand-500 bg-brand-50 text-brand-700" : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"}`}
                >
                  {s.name}
                </button>
              );
            })}
          </div>
        </div>

        {selectedColors.length > 0 && selectedSizes.length > 0 ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-xs font-medium uppercase text-gray-600">Quantidade padrão por SKU:</label>
              <input
                type="number"
                min={0}
                value={defaultQty}
                onChange={(e) => fillAll(e.target.value)}
                className="w-24 rounded-lg border border-gray-300 px-2 py-1 text-sm"
              />
              <span className="text-xs text-gray-500">Aplica em todas as células habilitadas.</span>
            </div>

            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="border-b border-r px-3 py-2 text-left text-xs font-semibold uppercase text-gray-600">Cor \ Tam.</th>
                    {selectedSizes.map((s) => (
                      <th key={s.id} className="border-b border-r px-3 py-2 text-center text-xs font-semibold text-gray-700">{s.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {selectedColors.map((c) => (
                    <tr key={c.id}>
                      <td className="border-b border-r bg-gray-50 px-3 py-2 text-xs font-medium">
                        <span className="inline-flex items-center gap-2">
                          <span className="h-3 w-3 rounded-full border" style={{ background: c.hexValue ?? "#ccc" }} />
                          {c.name}
                        </span>
                      </td>
                      {selectedSizes.map((s) => {
                        const cell = matrix[cellKey(c.id, s.id)] ?? { enabled: true, quantity: defaultQty };
                        return (
                          <td key={s.id} className="border-b border-r px-2 py-1.5 text-center align-middle">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                onClick={() => toggleCell(c.id, s.id)}
                                className={`flex h-5 w-5 items-center justify-center rounded border ${cell.enabled ? "border-brand-500 bg-brand-500 text-white" : "border-gray-300 bg-white text-transparent hover:border-gray-400"}`}
                                title={cell.enabled ? "Remover combinação" : "Adicionar combinação"}
                              >
                                {cell.enabled && <Check size={12} />}
                              </button>
                              <input
                                type="number"
                                min={0}
                                disabled={!cell.enabled}
                                value={cell.quantity}
                                onChange={(e) => setCellQty(c.id, s.id, e.target.value)}
                                className="w-14 rounded border border-gray-300 px-1.5 py-0.5 text-center text-xs disabled:bg-gray-100 disabled:text-gray-400"
                              />
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center gap-4 rounded-lg bg-gray-50 px-4 py-3 text-sm">
              <span><strong>{enabledCount}</strong> SKUs selecionados</span>
              <span className="text-gray-300">|</span>
              <span>Total de unidades: <strong>{totalUnits}</strong></span>
              <span className="text-gray-300">|</span>
              <span>Custo total: <strong>{formatBRL(totalCost)}</strong></span>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border-2 border-dashed border-gray-200 p-8 text-center text-sm text-gray-500">
            Selecione ao menos uma cor e um tamanho para gerar a matriz.
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
          <ArrowLeft size={16} /> Voltar
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={isSubmitting || enabledCount === 0}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {isSubmitting ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
          Cadastrar produto ({enabledCount} SKUs)
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline modal
// ---------------------------------------------------------------------------

interface InlineModalProps {
  entity: Exclude<InlineEntity, null>;
  name: string;
  setName: (v: string) => void;
  hex: string;
  setHex: (v: string) => void;
  sort: number;
  setSort: (v: number) => void;
  saving: boolean;
  onCancel: () => void;
  onSave: () => void;
}

function InlineModal({ entity, name, setName, hex, setHex, sort, setSort, saving, onCancel, onSave }: InlineModalProps): React.ReactNode {
  const titles: Record<Exclude<InlineEntity, null>, string> = {
    color: "Nova cor",
    size: "Novo tamanho",
    category: "Nova categoria",
    supplier: "Novo fornecedor",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="max-h-[92vh] w-full max-w-sm overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-lg">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">{titles[entity]}</h3>
          <button type="button" onClick={onCancel} className="rounded p-1 hover:bg-gray-100" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-3">
          <Field label="Nome *">
            <input
              className={INPUT}
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") onSave(); }}
            />
          </Field>

          {entity === "color" && (
            <Field label="Cor (hex)">
              <div className="flex items-center gap-2">
                <input type="color" value={hex} onChange={(e) => setHex(e.target.value)} className="h-10 w-14 rounded border" />
                <input className={INPUT} value={hex} onChange={(e) => setHex(e.target.value)} />
              </div>
            </Field>
          )}

          {entity === "size" && (
            <Field label="Ordem de exibição">
              <input
                type="number"
                className={INPUT}
                value={sort}
                onChange={(e) => setSort(Number(e.target.value))}
              />
            </Field>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm hover:bg-gray-50">Cancelar</button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving || !name.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {saving && <Loader2 className="animate-spin" size={14} />} Salvar
          </button>
        </div>
      </div>
    </div>
  );
}