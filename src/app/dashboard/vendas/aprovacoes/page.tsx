"use client";

import { useState, useEffect, useCallback, Fragment } from "react";
import Link from "next/link";
import {
  Check,
  X,
  Loader2,
  Percent,
  DollarSign,
  BadgePercent,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { clientFetch } from "@/lib/client-fetch";
import { MoneyInput } from "@/components/ui/money-input";
import { LoadingSpinner, ErrorMessage, EmptyState } from "@/components/ui/feedback";

interface DiscountRequestItem {
  variantId: string;
  sku: string;
  productName: string;
  colorName?: string | null;
  sizeName?: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

interface DiscountRequest {
  id: string;
  cartTotal: number;
  reason?: string | null;
  discountType?: "PERCENT" | "AMOUNT" | null;
  discountValue?: number | null;
  discountAmount?: number | null;
  finalTotal?: number | null;
  status: "PENDING" | "APPROVED" | "REJECTED" | "APPLIED" | "CANCELLED";
  createdAt: string;
  resolvedAt?: string | null;
  orderId?: string | null;
  itemCount?: number | null;
  cartSnapshot?: DiscountRequestItem[] | null;
  customerName?: string | null;
  locationName?: string | null;
  requestedByIp?: string | null;
  approvedByEmail?: string | null;
  approvedByRole?: string | null;
  approvedByIp?: string | null;
  requestedBy: { id: string; name: string; email?: string };
  approvedBy?: { id: string; name: string; email?: string; role?: string } | null;
}

interface PaginatedResponse<T> {
  data: T[];
  total: number;
}

const STATUS_LABEL: Record<DiscountRequest["status"], { label: string; cls: string }> = {
  PENDING: { label: "Pendente", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  APPROVED: { label: "Aprovada", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  REJECTED: { label: "Rejeitada", cls: "bg-red-50 text-red-700 border-red-200" },
  APPLIED: { label: "Utilizada", cls: "bg-blue-50 text-blue-700 border-blue-200" },
  CANCELLED: { label: "Cancelada", cls: "bg-gray-100 text-gray-600 border-gray-200" },
};

function formatBRL(v: number): string {
  return Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Data e hora completas para a trilha de auditoria. */
function formatFull(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatDiscount(r: DiscountRequest): string {
  if (r.discountValue == null) return "—";
  const label = r.discountType === "PERCENT" ? `${r.discountValue}%` : formatBRL(r.discountValue);
  if (r.discountType === "PERCENT" && r.discountAmount != null) {
    return `${label} (${formatBRL(r.discountAmount)})`;
  }
  return label;
}

export default function AprovacoesPage(): React.ReactNode {
  const [pending, setPending] = useState<DiscountRequest[]>([]);
  const [history, setHistory] = useState<DiscountRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { type: "PERCENT" | "AMOUNT"; value: string }>>({});
  const [actingId, setActingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const [pend, all] = await Promise.all([
        clientFetch<PaginatedResponse<DiscountRequest>>(
          "/api/sales/discount-requests?status=PENDING&limit=50",
        ),
        clientFetch<PaginatedResponse<DiscountRequest>>("/api/sales/discount-requests?limit=100"),
      ]);
      setPending(pend.data);
      setHistory(all.data.filter((r) => r.status !== "PENDING"));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar solicitações.");
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(true), 10_000);
    return () => clearInterval(timer);
  }, [load]);

  function getDraft(id: string): { type: "PERCENT" | "AMOUNT"; value: string } {
    return drafts[id] ?? { type: "PERCENT", value: "" };
  }

  function setDraft(id: string, patch: Partial<{ type: "PERCENT" | "AMOUNT"; value: string }>): void {
    setDrafts((prev) => ({ ...prev, [id]: { ...getDraft(id), ...prev[id], ...patch } }));
  }

  async function approve(req: DiscountRequest): Promise<void> {
    const draft = getDraft(req.id);
    const value = Number(draft.value);
    if (!value || value <= 0) {
      setError("Informe o valor do desconto.");
      return;
    }
    if (draft.type === "PERCENT" && value > 100) {
      setError("Percentual não pode exceder 100%.");
      return;
    }
    if (draft.type === "AMOUNT" && value > req.cartTotal) {
      setError("Desconto não pode exceder o total do carrinho.");
      return;
    }
    setActingId(req.id);
    setError(null);
    try {
      await clientFetch(`/api/sales/discount-requests/${req.id}`, {
        method: "PUT",
        body: { action: "approve", discountType: draft.type, discountValue: value },
      });
      await load(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao aprovar.");
    } finally {
      setActingId(null);
    }
  }

  async function reject(req: DiscountRequest): Promise<void> {
    setActingId(req.id);
    setError(null);
    try {
      await clientFetch(`/api/sales/discount-requests/${req.id}`, {
        method: "PUT",
        body: { action: "reject" },
      });
      await load(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao rejeitar.");
    } finally {
      setActingId(null);
    }
  }

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <BadgePercent className="h-6 w-6 text-brand-600" />
        <h1 className="text-xl font-bold text-gray-900">Aprovações de Desconto</h1>
      </div>

      {error && <ErrorMessage message={error} onRetry={() => void load()} />}

      {/* Pendentes */}
      <section className="rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-gray-900">
            Pendentes ({pending.length})
          </h2>
        </div>
        {pending.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title="Nenhuma solicitação pendente"
              description="Solicitações dos caixas aparecem aqui automaticamente."
            />
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {pending.map((req) => {
              const draft = getDraft(req.id);
              const acting = actingId === req.id;
              return (
                <li key={req.id} className="flex flex-wrap items-center gap-3 px-4 py-4">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-gray-900">
                      {req.requestedBy.name}
                    </div>
                    <div className="text-xs text-gray-500">
                      Carrinho: <span className="font-semibold">{formatBRL(req.cartTotal)}</span>
                      {req.itemCount ? ` · ${req.itemCount} item(ns)` : ""}
                      {" · "}
                      {formatTime(req.createdAt)}
                    </div>
                    {(req.customerName || req.locationName) && (
                      <div className="text-xs text-gray-500">
                        {req.customerName ?? "Consumidor Final"}
                        {req.locationName ? ` · ${req.locationName}` : ""}
                      </div>
                    )}
                    {req.reason && (
                      <div className="mt-1 text-xs italic text-gray-600">&quot;{req.reason}&quot;</div>
                    )}
                    {req.cartSnapshot && req.cartSnapshot.length > 0 && (
                      <ul className="mt-2 space-y-0.5 border-l-2 border-gray-100 pl-2">
                        {req.cartSnapshot.map((item) => (
                          <li key={item.variantId} className="text-xs text-gray-600">
                            <span className="font-medium text-gray-800">{item.quantity}x</span>{" "}
                            {item.productName}
                            <span className="text-gray-400">
                              {" "}
                              · {item.sku}
                              {item.colorName ? ` · ${item.colorName}` : ""}
                              {item.sizeName ? ` · ${item.sizeName}` : ""}
                            </span>{" "}
                            <span className="text-gray-500">{formatBRL(item.lineTotal)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex overflow-hidden rounded-lg border border-gray-300">
                      <button
                        type="button"
                        onClick={() => setDraft(req.id, { type: "PERCENT" })}
                        className={`flex items-center gap-1 px-2.5 py-2 text-xs font-medium transition ${
                          draft.type === "PERCENT"
                            ? "bg-brand-600 text-white"
                            : "bg-white text-gray-600 hover:bg-gray-50"
                        }`}
                        aria-label="Desconto em percentual"
                      >
                        <Percent size={13} /> %
                      </button>
                      <button
                        type="button"
                        onClick={() => setDraft(req.id, { type: "AMOUNT" })}
                        className={`flex items-center gap-1 px-2.5 py-2 text-xs font-medium transition ${
                          draft.type === "AMOUNT"
                            ? "bg-brand-600 text-white"
                            : "bg-white text-gray-600 hover:bg-gray-50"
                        }`}
                        aria-label="Desconto em reais"
                      >
                        <DollarSign size={13} /> R$
                      </button>
                    </div>
                    {draft.type === "PERCENT" ? (
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step="0.01"
                        value={draft.value}
                        onChange={(e) => setDraft(req.id, { value: e.target.value })}
                        placeholder="%"
                        className="w-24 rounded-lg border border-gray-300 px-2 py-2 text-right text-sm focus:border-brand-500 focus:outline-none"
                      />
                    ) : (
                      <MoneyInput
                        value={draft.value}
                        onChange={(v) => setDraft(req.id, { value: v })}
                        className="w-28 rounded-lg border border-gray-300 px-2 py-2 text-right text-sm focus:border-brand-500 focus:outline-none"
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => void approve(req)}
                      disabled={acting || !draft.value}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {acting ? <Loader2 className="animate-spin" size={14} /> : <Check size={14} />}
                      Aprovar
                    </button>
                    <button
                      type="button"
                      onClick={() => void reject(req)}
                      disabled={acting}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
                    >
                      <X size={14} />
                      Rejeitar
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Histórico recente */}
      <section className="rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-gray-900">
            Histórico de aprovações
          </h2>
          <p className="text-xs text-gray-500">
            Trilha de auditoria: quem decidiu, quando, o valor e os itens da venda.
          </p>
        </div>
        {history.length === 0 ? (
          <div className="p-6 text-center text-sm text-gray-400">Sem registros.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-2 font-medium">Caixa</th>
                  <th className="px-4 py-2 font-medium">Carrinho</th>
                  <th className="px-4 py-2 font-medium">Desconto</th>
                  <th className="px-4 py-2 font-medium">Total final</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Resolvido por</th>
                  <th className="px-4 py-2 font-medium">Quando</th>
                  <th className="px-4 py-2 font-medium sr-only">Detalhes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {history.map((r) => {
                  const st = STATUS_LABEL[r.status];
                  const isOpen = expandedId === r.id;
                  return (
                    <Fragment key={r.id}>
                      <tr>
                        <td className="px-4 py-2.5 font-medium text-gray-900">
                          {r.requestedBy.name}
                        </td>
                        <td className="px-4 py-2.5 text-gray-700">{formatBRL(r.cartTotal)}</td>
                        <td className="px-4 py-2.5 text-gray-700">{formatDiscount(r)}</td>
                        <td className="px-4 py-2.5 text-gray-700">
                          {r.finalTotal != null ? formatBRL(r.finalTotal) : "—"}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${st.cls}`}>
                            {st.label}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-gray-700">
                          {r.approvedBy?.name ?? "—"}
                          {r.approvedByRole && (
                            <span className="block text-xs text-gray-400">{r.approvedByRole}</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-gray-500">
                          {formatFull(r.resolvedAt ?? r.createdAt)}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => setExpandedId(isOpen ? null : r.id)}
                            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
                            aria-expanded={isOpen}
                          >
                            {isOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                            Detalhes
                          </button>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="bg-gray-50/60">
                          <td colSpan={8} className="px-4 py-3">
                            <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-gray-700 sm:grid-cols-4">
                              <div>
                                <dt className="text-gray-400">Solicitado em</dt>
                                <dd>{formatFull(r.createdAt)}</dd>
                              </div>
                              <div>
                                <dt className="text-gray-400">Decidido em</dt>
                                <dd>{r.resolvedAt ? formatFull(r.resolvedAt) : "—"}</dd>
                              </div>
                              <div>
                                <dt className="text-gray-400">Cliente</dt>
                                <dd>{r.customerName ?? "Consumidor Final"}</dd>
                              </div>
                              <div>
                                <dt className="text-gray-400">Local</dt>
                                <dd>{r.locationName ?? "—"}</dd>
                              </div>
                              <div>
                                <dt className="text-gray-400">Aprovador</dt>
                                <dd>{r.approvedByEmail ?? r.approvedBy?.email ?? "—"}</dd>
                              </div>
                              <div>
                                <dt className="text-gray-400">IP do aprovador</dt>
                                <dd>{r.approvedByIp ?? "—"}</dd>
                              </div>
                              <div>
                                <dt className="text-gray-400">IP do caixa</dt>
                                <dd>{r.requestedByIp ?? "—"}</dd>
                              </div>
                              <div>
                                <dt className="text-gray-400">Pedido</dt>
                                <dd>
                                  {r.orderId ? (
                                    <Link
                                      href={`/dashboard/vendas/${r.orderId}`}
                                      className="text-brand-600 hover:underline"
                                    >
                                      Ver venda
                                    </Link>
                                  ) : (
                                    "Não utilizada"
                                  )}
                                </dd>
                              </div>
                              {r.reason && (
                                <div className="col-span-2 sm:col-span-4">
                                  <dt className="text-gray-400">Motivo informado</dt>
                                  <dd className="italic">{r.reason}</dd>
                                </div>
                              )}
                            </dl>

                            {r.cartSnapshot && r.cartSnapshot.length > 0 ? (
                              <table className="mt-3 w-full text-left text-xs">
                                <thead>
                                  <tr className="text-gray-400">
                                    <th className="py-1 font-medium">SKU</th>
                                    <th className="py-1 font-medium">Produto</th>
                                    <th className="py-1 font-medium">Cor / Tam.</th>
                                    <th className="py-1 text-right font-medium">Qtd</th>
                                    <th className="py-1 text-right font-medium">Unit.</th>
                                    <th className="py-1 text-right font-medium">Total</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200/70">
                                  {r.cartSnapshot.map((item) => (
                                    <tr key={item.variantId}>
                                      <td className="py-1 font-mono text-gray-500">{item.sku}</td>
                                      <td className="py-1 text-gray-800">{item.productName}</td>
                                      <td className="py-1 text-gray-500">
                                        {[item.colorName, item.sizeName].filter(Boolean).join(" / ") || "—"}
                                      </td>
                                      <td className="py-1 text-right text-gray-700">{item.quantity}</td>
                                      <td className="py-1 text-right text-gray-700">
                                        {formatBRL(item.unitPrice)}
                                      </td>
                                      <td className="py-1 text-right font-medium text-gray-900">
                                        {formatBRL(item.lineTotal)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            ) : (
                              <p className="mt-3 text-xs text-gray-400">
                                Solicitação anterior à captura de itens — sem detalhamento da venda.
                              </p>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
