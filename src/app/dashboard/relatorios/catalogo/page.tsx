"use client";

import { useEffect, useState, Fragment } from "react";
import { clientFetch } from "@/lib/client-fetch";
import { ReportShell, KpiBox } from "@/components/reports/report-shell";
import { formatBRL, formatNumber, formatPct } from "@/lib/format";
import { Loader2 } from "lucide-react";

interface Variant {
  id: string;
  sku: string;
  color: string;
  colorHex: string;
  size: string;
  stock: number;
  reserved: number;
  available: number;
  stockValue: number;
}

interface Row {
  id: string;
  code: string;
  name: string;
  collection: string;
  line: string;
  category: string;
  costPrice: number;
  basePrice: number;
  marginAbs: number;
  marginPct: number;
  abcClass: string | null;
  seasonality: string | null;
  variantsCount: number;
  totalStock: number;
  totalAvailable: number;
  totalValue: number;
  variants: Variant[];
}

interface Resp {
  summary: {
    productsCount: number;
    variantsCount: number;
    totalStock: number;
    totalAvailable: number;
    totalCostValue: number;
    potentialRevenue: number;
  };
  rows: Row[];
}

export default function CatalogReportPage(): React.ReactNode {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    clientFetch<Resp>("/api/reports/catalog")
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  const toggle = (id: string): void => {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpanded(next);
  };

  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 className="animate-spin" /></div>;
  if (!data) return <div>Erro ao carregar dados.</div>;

  const exportRows = data.rows.flatMap((p) =>
    p.variants.map((v) => ({
      produto_codigo: p.code,
      produto_nome: p.name,
      colecao: p.collection,
      categoria: p.category,
      sku: v.sku,
      cor: v.color,
      tamanho: v.size,
      custo: p.costPrice,
      preco: p.basePrice,
      margem_pct: p.marginPct.toFixed(2),
      estoque: v.stock,
      reservado: v.reserved,
      disponivel: v.available,
      valor_estoque: v.stockValue.toFixed(2),
    })),
  );

  return (
    <ReportShell
      title="Catálogo Completo"
      description="Produtos com variantes, preços e estoque agregado"
      exportFilename="catalogo-completo"
      exportRows={exportRows}
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <KpiBox label="Produtos" value={formatNumber(data.summary.productsCount)} />
        <KpiBox label="SKUs" value={formatNumber(data.summary.variantsCount)} />
        <KpiBox label="Estoque total" value={formatNumber(data.summary.totalStock)} />
        <KpiBox label="Disponível" value={formatNumber(data.summary.totalAvailable)} />
        <KpiBox label="Valor a custo" value={formatBRL(data.summary.totalCostValue)} />
        <KpiBox label="Receita potencial" value={formatBRL(data.summary.potentialRevenue)} tone="positive" />
      </div>

      <div className="overflow-x-auto rounded-lg border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-600">
            <tr>
              <th className="px-3 py-2 text-left">Código</th>
              <th className="px-3 py-2 text-left">Produto</th>
              <th className="px-3 py-2 text-left">Coleção</th>
              <th className="px-3 py-2 text-left">Categoria</th>
              <th className="px-3 py-2 text-right">Custo</th>
              <th className="px-3 py-2 text-right">Preço</th>
              <th className="px-3 py-2 text-right">Margem</th>
              <th className="px-3 py-2 text-right">SKUs</th>
              <th className="px-3 py-2 text-right">Estoque</th>
              <th className="px-3 py-2 text-right">Disp.</th>
              <th className="px-3 py-2 text-right">Valor</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {data.rows.map((p) => (
              <Fragment key={p.id}>
                <tr className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-mono text-xs">{p.code}</td>
                  <td className="px-3 py-2 font-medium">{p.name}</td>
                  <td className="px-3 py-2 text-gray-600">{p.collection}</td>
                  <td className="px-3 py-2 text-gray-600">{p.category}</td>
                  <td className="px-3 py-2 text-right">{formatBRL(p.costPrice)}</td>
                  <td className="px-3 py-2 text-right">{formatBRL(p.basePrice)}</td>
                  <td className="px-3 py-2 text-right text-emerald-600">{formatPct(p.marginPct)}</td>
                  <td className="px-3 py-2 text-right">{p.variantsCount}</td>
                  <td className="px-3 py-2 text-right">{formatNumber(p.totalStock)}</td>
                  <td className="px-3 py-2 text-right">{formatNumber(p.totalAvailable)}</td>
                  <td className="px-3 py-2 text-right">{formatBRL(p.totalValue)}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => toggle(p.id)}
                      className="text-xs text-brand-600 hover:underline"
                    >
                      {expanded.has(p.id) ? "Ocultar" : "Variantes"}
                    </button>
                  </td>
                </tr>
                {expanded.has(p.id) && (
                  <tr className="bg-gray-50">
                    <td colSpan={12} className="px-6 py-3">
                      <table className="w-full text-xs">
                        <thead className="text-gray-600">
                          <tr>
                            <th className="px-2 py-1 text-left">SKU</th>
                            <th className="px-2 py-1 text-left">Cor</th>
                            <th className="px-2 py-1 text-left">Tamanho</th>
                            <th className="px-2 py-1 text-right">Estoque</th>
                            <th className="px-2 py-1 text-right">Reservado</th>
                            <th className="px-2 py-1 text-right">Disponível</th>
                            <th className="px-2 py-1 text-right">Valor</th>
                          </tr>
                        </thead>
                        <tbody>
                          {p.variants.map((v) => (
                            <tr key={v.id}>
                              <td className="px-2 py-1 font-mono">{v.sku}</td>
                              <td className="px-2 py-1">
                                <span className="inline-flex items-center gap-1">
                                  <span className="h-3 w-3 rounded-full border" style={{ background: v.colorHex }} />
                                  {v.color}
                                </span>
                              </td>
                              <td className="px-2 py-1">{v.size}</td>
                              <td className="px-2 py-1 text-right">{formatNumber(v.stock)}</td>
                              <td className="px-2 py-1 text-right">{formatNumber(v.reserved)}</td>
                              <td className="px-2 py-1 text-right">{formatNumber(v.available)}</td>
                              <td className="px-2 py-1 text-right">{formatBRL(v.stockValue)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </ReportShell>
  );
}
