"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { ArrowLeft, FileText } from "lucide-react";
import { clientFetch } from "@/lib/client-fetch";
import { LoadingSpinner, ErrorMessage } from "@/components/ui/feedback";

interface InvoiceDetail {
  id: string;
  number: string;
  series: string | null;
  supplierName: string;
  issueDate: string;
  description: string | null;
  freight: number;
  productsTotal: number;
  discountTotal: number;
  icmsBaseTotal: number;
  icmsTotal: number;
  ipiTotal: number;
  invoiceTotal: number;
  importedAt: string;
  supplier: { id: string; companyName: string; cnpj: string } | null;
  items: Array<{
    id: string;
    sku: string;
    description: string;
    ncm: string | null;
    cfop: string | null;
    csosn: string | null;
    unit: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    realCost: number;
    margin: number;
    costMargin: number;
    commercialValue: number;
    discount: number;
    icmsBase: number;
    icmsValue: number;
    ipiValue: number;
    icmsRate: number;
    ipiRate: number;
    variant: {
      id: string;
      sku: string;
      product: { name: string; code: string };
      color: { name: string; hexValue: string };
      size: { name: string };
    } | null;
  }>;
}

function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

export default function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): React.ReactNode {
  const { id } = use(params);
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async (): Promise<void> => {
      setIsLoading(true);
      try {
        const data = await clientFetch<InvoiceDetail>(`/api/invoices/${id}`);
        setInvoice(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao carregar nota fiscal.");
      } finally {
        setIsLoading(false);
      }
    })();
  }, [id]);

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message={error} />;
  if (!invoice) return null;

  const items = invoice.items ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link
          href="/dashboard/notas-fiscais"
          className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Link>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
              <FileText className="h-6 w-6" /> NF nº {invoice.number}
              {invoice.series && (
                <span className="text-base font-normal text-gray-500">
                  / Série {invoice.series}
                </span>
              )}
            </h1>
            <p className="mt-1 text-sm text-gray-600">
              Emitida em {formatDate(invoice.issueDate)} · Importada em{" "}
              {formatDate(invoice.importedAt)}
            </p>
            {invoice.description && (
              <p className="mt-2 text-sm italic text-gray-500">{invoice.description}</p>
            )}
          </div>
          <div className="rounded-lg bg-brand-50 px-4 py-3 text-right">
            <p className="text-xs uppercase text-brand-600">Total NF</p>
            <p className="text-2xl font-bold text-brand-700">{formatBRL(invoice.invoiceTotal)}</p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 border-t pt-4 md:grid-cols-2">
          <div>
            <p className="text-xs uppercase text-gray-500">Fornecedor</p>
            <p className="text-sm font-medium text-gray-900">
              {invoice.supplier?.companyName ?? invoice.supplierName}
            </p>
            {invoice.supplier?.cnpj && (
              <p className="text-xs text-gray-500">CNPJ: {invoice.supplier.cnpj}</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <Field label="Produtos" value={formatBRL(invoice.productsTotal)} />
            <Field label="Frete" value={formatBRL(invoice.freight)} />
            <Field label="Desconto" value={formatBRL(invoice.discountTotal)} />
            <Field label="ICMS" value={formatBRL(invoice.icmsTotal)} />
            <Field label="Base ICMS" value={formatBRL(invoice.icmsBaseTotal)} />
            <Field label="IPI" value={formatBRL(invoice.ipiTotal)} />
          </div>
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold text-gray-900">
          Itens ({items.length})
        </h2>
        {items.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <p className="text-sm text-gray-600">
              Nota sem itens detalhados (entrada manual).
            </p>
            <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
              <Field label="Descrição" value={invoice.description ?? "—"} />
              <Field label="Produtos" value={formatBRL(invoice.productsTotal)} />
              <Field label="Frete" value={formatBRL(invoice.freight)} />
              <Field label="Total NF" value={formatBRL(invoice.invoiceTotal)} />
            </div>
          </div>
        ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <Th>SKU</Th>
                  <Th>Produto</Th>
                  <Th>Cor / Tam.</Th>
                  <Th>NCM</Th>
                  <Th>CFOP</Th>
                  <Th align="right">Qtd</Th>
                  <Th align="right">Vlr Unit</Th>
                  <Th align="right">Total</Th>
                  <Th align="right">Custo Real</Th>
                  <Th align="right">Vlr Comercial</Th>
                  <Th align="right">ICMS</Th>
                  <Th align="right">IPI</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {items.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <Td>
                      <span className="font-mono text-xs">{item.sku}</span>
                    </Td>
                    <Td>
                      <span className="line-clamp-1">
                        {item.variant?.product.name ?? item.description}
                      </span>
                    </Td>
                    <Td>
                      {item.variant ? (
                        <div className="flex items-center gap-2">
                          <span
                            className="inline-block h-3 w-3 rounded-full border border-gray-200"
                            style={{ backgroundColor: item.variant.color.hexValue }}
                          />
                          <span className="text-xs">
                            {item.variant.color.name} / {item.variant.size.name}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </Td>
                    <Td>
                      <span className="font-mono text-xs">{item.ncm ?? "—"}</span>
                    </Td>
                    <Td>
                      <span className="font-mono text-xs">{item.cfop ?? "—"}</span>
                    </Td>
                    <Td align="right">{item.quantity}</Td>
                    <Td align="right">{formatBRL(item.unitPrice)}</Td>
                    <Td align="right">{formatBRL(item.totalPrice)}</Td>
                    <Td align="right">{formatBRL(item.realCost)}</Td>
                    <Td align="right">
                      <span className="font-medium text-brand-700">
                        {formatBRL(item.commercialValue)}
                      </span>
                    </Td>
                    <Td align="right">
                      {formatBRL(item.icmsValue)}
                      {item.icmsRate > 0 && (
                        <span className="ml-1 text-[10px] text-gray-400">
                          ({item.icmsRate}%)
                        </span>
                      )}
                    </Td>
                    <Td align="right">
                      {formatBRL(item.ipiValue)}
                      {item.ipiRate > 0 && (
                        <span className="ml-1 text-[10px] text-gray-400">
                          ({item.ipiRate}%)
                        </span>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div>
      <p className="text-xs uppercase text-gray-500">{label}</p>
      <p className="text-sm font-medium text-gray-900">{value}</p>
    </div>
  );
}

function Th({
  children,
  align = "left",
}: {
  children?: React.ReactNode;
  align?: "left" | "right";
}): React.JSX.Element {
  return (
    <th
      className={`whitespace-nowrap px-3 py-2 text-xs font-medium uppercase tracking-wider text-gray-500 text-${align}`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = "left",
}: {
  children?: React.ReactNode;
  align?: "left" | "right";
}): React.JSX.Element {
  return (
    <td className={`whitespace-nowrap px-3 py-2 text-sm text-gray-700 text-${align}`}>
      {children}
    </td>
  );
}
