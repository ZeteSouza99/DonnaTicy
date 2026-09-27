"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Package, ExternalLink, Plus, X, Pencil, Save, Loader2 } from "lucide-react";
import { clientFetch } from "@/lib/client-fetch";
import { todayInputValue, toDateInputValue } from "@/lib/date";
import { Pagination } from "@/components/ui/pagination";
import { MoneyInput } from "@/components/ui/money-input";
import { LoadingSpinner, EmptyState, ErrorMessage } from "@/components/ui/feedback";

interface InvoiceRow {
  id: string;
  number: string;
  supplierName: string;
  description: string | null;
  issueDate: string;
  freight: number;
  productsTotal: number;
  invoiceTotal: number;
  _count: { items: number };
}

interface InvoicesResponse {
  data: InvoiceRow[];
  total: number;
  page: number;
  totalPages: number;
}

const PAGE_SIZE = 20;

const INPUT_CELL =
  "w-full rounded border border-brand-300 bg-brand-50 px-2 py-1 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500";

interface InvoiceEditForm {
  description: string;
  issueDate: string;
  productsTotal: string;
  freight: string;
}

function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

export default function EntradasMercadoriaPage(): React.ReactNode {
  const [data, setData] = useState<InvoicesResponse | null>(null);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<InvoiceEditForm>({ description: "", issueDate: "", productsTotal: "", freight: "" });
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_SIZE),
      });
      const res = await clientFetch<InvoicesResponse>(`/api/invoices?${params}`);
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar entradas.");
    } finally {
      setIsLoading(false);
    }
  }, [page]);

  useEffect(() => {
    void load();
  }, [load]);

  function startEditing(nf: InvoiceRow): void {
    setEditingId(nf.id);
    setEditForm({
      description: nf.description ?? "",
      issueDate: toDateInputValue(nf.issueDate),
      productsTotal: String(nf.productsTotal),
      freight: String(nf.freight),
    });
    setError(null);
  }

  async function handleUpdate(id: string): Promise<void> {
    const productsTotal = parseFloat(editForm.productsTotal.replace(",", "."));
    const freight = parseFloat(editForm.freight.replace(",", ".") || "0");
    if (Number.isNaN(productsTotal) || productsTotal < 0) {
      setError("Informe um valor de custo válido.");
      return;
    }
    if (Number.isNaN(freight) || freight < 0) {
      setError("Frete inválido.");
      return;
    }
    if (!editForm.issueDate) {
      setError("Informe a data da compra.");
      return;
    }
    setBusyId(id);
    setError(null);
    try {
      await clientFetch(`/api/invoices/${id}`, {
        method: "PUT",
        body: {
          description: editForm.description.trim(),
          issueDate: editForm.issueDate,
          productsTotal,
          freight,
        },
      });
      setEditingId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar entrada.");
    } finally {
      setBusyId(null);
    }
  }

  const totalCost = data?.data.reduce((sum, n) => sum + n.productsTotal, 0) ?? 0;
  const totalFreight = data?.data.reduce((sum, n) => sum + n.freight, 0) ?? 0;
  const totalGeneral = data?.data.reduce((sum, n) => sum + n.invoiceTotal, 0) ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <Package className="h-6 w-6" /> Entradas de Mercadoria
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Custo de mercadoria por entrada: valor de custo + frete
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" /> Nova entrada
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SummaryCard label="Custo de mercadoria" value={formatBRL(totalCost)} />
        <SummaryCard label="Frete" value={formatBRL(totalFreight)} />
        <SummaryCard label="Total geral" value={formatBRL(totalGeneral)} highlight />
      </div>

      {showForm && (
        <NewEntryForm
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            void load();
          }}
        />
      )}

      {isLoading ? (
        <LoadingSpinner />
      ) : error ? (
        <ErrorMessage message={error} />
      ) : !data || data.data.length === 0 ? (
        <EmptyState
          title="Nenhuma entrada registrada"
          description="Clique em Nova entrada para lançar o custo de mercadoria"
        />
      ) : (
        <>
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <Th>Data</Th>
                    <Th>Origem</Th>
                    <Th align="right">Custo de mercadoria</Th>
                    <Th align="right">Frete</Th>
                    <Th align="right">Total</Th>
                    <Th />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {data.data.map((nf) => {
                    const editing = editingId === nf.id;
                    const busy = busyId === nf.id;
                    return (
                      <tr key={nf.id} className={editing ? "bg-brand-50/30" : "hover:bg-gray-50"}>
                        <Td>
                          {editing ? (
                            <input type="date" value={editForm.issueDate} disabled={busy} className={INPUT_CELL}
                              onChange={(e) => setEditForm((p) => ({ ...p, issueDate: e.target.value }))} />
                          ) : formatDate(nf.issueDate)}
                        </Td>
                        <Td>
                          {editing ? (
                            <input value={editForm.description} maxLength={200} disabled={busy} className={INPUT_CELL}
                              onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))} />
                          ) : (
                            <span className="line-clamp-1">{nf.description || nf.supplierName}</span>
                          )}
                        </Td>
                        <Td align="right">
                          {editing ? (
                            <MoneyInput value={editForm.productsTotal} disabled={busy} className={INPUT_CELL}
                              onChange={(v) => setEditForm((p) => ({ ...p, productsTotal: v }))} />
                          ) : formatBRL(nf.productsTotal)}
                        </Td>
                        <Td align="right">
                          {editing ? (
                            <MoneyInput value={editForm.freight} disabled={busy} className={INPUT_CELL}
                              onChange={(v) => setEditForm((p) => ({ ...p, freight: v }))} />
                          ) : formatBRL(nf.freight)}
                        </Td>
                        <Td align="right">
                          <span className="font-medium text-gray-900">
                            {formatBRL(nf.invoiceTotal)}
                          </span>
                        </Td>
                        <Td align="right">
                          <div className="inline-flex items-center gap-1">
                            {editing ? (
                              <>
                                <button onClick={() => handleUpdate(nf.id)} disabled={busy} title="Salvar"
                                  className="rounded p-1.5 text-green-600 hover:bg-green-100 disabled:opacity-50">
                                  {busy ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                                </button>
                                <button onClick={() => setEditingId(null)} disabled={busy} title="Cancelar"
                                  className="rounded p-1.5 text-gray-500 hover:bg-gray-100 disabled:opacity-50">
                                  <X size={16} />
                                </button>
                              </>
                            ) : (
                              <>
                                <button onClick={() => startEditing(nf)} disabled={busy} title="Editar"
                                  className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-brand-600 disabled:opacity-50">
                                  <Pencil size={16} />
                                </button>
                                {nf._count.items > 0 ? (
                                  <Link
                                    href={`/dashboard/notas-fiscais/${nf.id}`}
                                    className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
                                  >
                                    Ver <ExternalLink className="h-3 w-3" />
                                  </Link>
                                ) : null}
                              </>
                            )}
                          </div>
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <Pagination
            page={data.page}
            totalPages={data.totalPages}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  );
}

function NewEntryForm({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}): React.JSX.Element {
  const [issueDate, setIssueDate] = useState(() => todayInputValue());
  const [description, setDescription] = useState("");
  const [cost, setCost] = useState("");
  const [freight, setFreight] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parseMoney = (v: string): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : NaN;
  };

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    const costValue = parseMoney(cost);
    const freightValue = freight.trim() ? parseMoney(freight) : 0;
    if (!issueDate || !Number.isFinite(costValue) || costValue <= 0) {
      setError("Informe a data e um valor de custo válido.");
      return;
    }
    if (!Number.isFinite(freightValue) || freightValue < 0) {
      setError("Frete inválido.");
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      await clientFetch("/api/invoices", {
        method: "POST",
        body: {
          issueDate,
          description: description.trim() || undefined,
          productsTotal: costValue,
          freight: freightValue,
        },
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar entrada.");
      setIsSaving(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-lg border border-brand-200 bg-brand-50/50 p-4"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">Nova entrada de mercadoria</h2>
        <button
          type="button"
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600"
          aria-label="Fechar"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">
            Data da compra *
          </label>
          <input
            type="date"
            value={issueDate}
            onChange={(e) => setIssueDate(e.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">
            Valor de custo (R$) *
          </label>
          <MoneyInput
            value={cost}
            onChange={setCost}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Frete (R$)</label>
          <MoneyInput
            value={freight}
            onChange={setFreight}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>
        <div className="sm:col-span-3">
          <label className="mb-1 block text-xs font-medium text-gray-600">Descrição</label>
          <input
            type="text"
            maxLength={200}
            placeholder="Ex.: Compra de tecido, chip de maquininha, reposição de embalagens..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={isSaving}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {isSaving ? "Salvando..." : "Salvar entrada"}
        </button>
      </div>
    </form>
  );
}

function SummaryCard({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}): React.JSX.Element {
  return (
    <div
      className={`rounded-lg border p-4 ${
        highlight ? "border-brand-200 bg-brand-50" : "border-gray-200 bg-white"
      }`}
    >
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${highlight ? "text-brand-700" : "text-gray-900"}`}>
        {value}
      </p>
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
      className={`px-4 py-3 text-xs font-medium uppercase tracking-wider text-gray-500 text-${align}`}
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
    <td className={`px-4 py-3 text-sm text-gray-700 text-${align}`}>{children}</td>
  );
}
