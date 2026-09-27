"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, TrendingUp, TrendingDown, Pencil, Save, X, Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { clientFetch } from "@/lib/client-fetch";
import { formatDateOnly } from "@/lib/format";
import { toDateInputValue } from "@/lib/date";
import { DataTable } from "@/components/ui/data-table";
import { Pagination } from "@/components/ui/pagination";
import { MoneyInput } from "@/components/ui/money-input";
import { LoadingSpinner, EmptyState, ErrorMessage } from "@/components/ui/feedback";
import { SubscriptionPixCard } from "@/components/pix/subscription-pix";

interface FinancialEntry {
  id: string;
  type: string;
  description: string;
  amount: number;
  competenceDate: string;
  dueDate: string | null;
  cashDate: string | null;
  status: "PENDING" | "PAID" | "CANCELLED";
  paymentMethod: string | null;
  orderId: string | null;
  cancellationOrderId: string | null;
  order?: { id: string; code: string; status: string } | null;
  costCenter?: { id: string; name: string } | null;
}

interface CostCenter {
  id: string;
  name: string;
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: "Dinheiro",
  DEBIT: "Débito",
  CREDIT: "Crédito",
  PIX: "PIX",
  VOUCHER: "Voucher",
  STORE_CREDIT: "Crédito Loja",
  BARTER: "Permuta",
  INVOICED: "Faturado",
};

const EDITABLE_PAYMENT_METHODS = ["CASH", "DEBIT", "CREDIT", "PIX", "VOUCHER", "BARTER", "INVOICED"] as const;

interface EntriesResponse {
  data: FinancialEntry[];
  total: number;
  page: number;
  totalPages: number;
}

interface EntryEditForm {
  description: string;
  amount: string;
  dueDate: string;
  cashDate: string;
  status: "PENDING" | "PAID";
  costCenterId: string;
  paymentMethod: string;
}

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendente",
  PAID: "Pago",
  CANCELLED: "CANCELLED",
};

const EDITABLE_STATUSES = ["PENDING", "PAID"] as const;

const TYPE_LABELS: Record<string, string> = {
  REVENUE: "Receita",
  COGS: "CMV",
  TAX: "Imposto",
  FEE: "Taxa",
  EXPENSE: "Despesa",
  REFUND: "Reembolso",
};

function isImmutableEntry(entry: FinancialEntry): boolean {
  return entry.status === "CANCELLED" || (entry.type === "REVENUE" && entry.order?.status === "CANCELLED");
}

function canDeleteEntry(entry: FinancialEntry): boolean {
  return !isImmutableEntry(entry) && !entry.cancellationOrderId;
}

function canEditEntry(entry: FinancialEntry): boolean {
  return !isImmutableEntry(entry) && (!entry.cancellationOrderId || entry.status === "PENDING");
}

const INPUT_CELL =
  "w-full rounded border border-brand-300 bg-brand-50 px-2 py-1 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500";

interface SummaryResponse {
  dre: {
    receitaBruta: number;
    deducoesImpostos: number;
    devolucoes: number;
    receitaLiquida: number;
    cmv: number;
    lucroBruto: number;
    taxasCartao: number;
    margemContribuicao: number;
    despesasOperacionais: number;
    resultadoOperacional: number;
  };
  margins: {
    margemBruta: string;
    margemContribuicao: string;
    margemOperacional: string;
  };
}

export default function FinanceiroPage(): React.ReactNode {
  const router = useRouter();
  const [entries, setEntries] = useState<EntriesResponse | null>(null);
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState("");
  const [page, setPage] = useState(1);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EntryEditForm>({
    description: "",
    amount: "",
    dueDate: "",
    cashDate: "",
    status: "PENDING",
    costCenterId: "",
    paymentMethod: "",
  });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((me: { role?: string } | null) => setRole(me?.role ?? null))
      .catch(() => setRole(null));
  }, []);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      if (typeFilter) params.set("type", typeFilter);
      const [entriesData, summaryData] = await Promise.all([
        clientFetch<EntriesResponse>(`/api/financial/entries?${params}`),
        clientFetch<SummaryResponse>("/api/financial/summary"),
      ]);
      setEntries(entriesData);
      setSummary(summaryData);
      setSelectedIds((prev) => prev.filter((id) => entriesData.data.some((e) => e.id === id && canDeleteEntry(e))));
      setEditingId((prev) => prev && entriesData.data.some((e) => e.id === prev && canEditEntry(e)) ? prev : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar dados financeiros.");
    } finally {
      setIsLoading(false);
    }
  }, [page, typeFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    clientFetch<{ data: CostCenter[] }>("/api/financial/cost-centers?limit=100")
      .then((res) => setCostCenters(res.data))
      .catch(() => setCostCenters([]));
  }, []);

  const formatCurrency = (value: number | null | undefined): string =>
    Number(value ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  function startEditing(entry: FinancialEntry): void {
    if (!canEditEntry(entry)) return;
    setEditingId(entry.id);
    setEditForm({
      description: entry.description,
      amount: String(entry.amount),
      dueDate: toDateInputValue(entry.dueDate ?? entry.competenceDate),
      cashDate: toDateInputValue(entry.cashDate),
      status: entry.cancellationOrderId || entry.status === "PAID" ? "PAID" : "PENDING",
      costCenterId: entry.costCenter?.id ?? "",
      paymentMethod: entry.paymentMethod ?? "",
    });
    setError(null);
  }

  async function handleUpdate(id: string): Promise<void> {
    const entry = entries?.data.find((item) => item.id === id);
    if (!entry || !canEditEntry(entry)) {
      setError("Este lançamento está protegido e não pode ser alterado.");
      return;
    }
    const isCancellationRefund = Boolean(entry.cancellationOrderId);
    const amount = isCancellationRefund ? entry.amount : parseFloat(editForm.amount.replace(",", "."));
    if (Number.isNaN(amount) || amount <= 0) {
      setError("Informe um valor válido maior que zero.");
      return;
    }
    if (!isCancellationRefund && !editForm.dueDate) {
      setError("Informe a data de vencimento.");
      return;
    }
    if (editForm.status === "PAID" && (!editForm.paymentMethod || !editForm.cashDate)) {
      setError(isCancellationRefund
        ? "Informe a forma e a data da devolução efetiva antes de registrar a baixa."
        : "Informe a forma e a data de pagamento.");
      return;
    }
    if (isCancellationRefund && !window.confirm(
      `Confirma que ${formatCurrency(entry.amount)} já foram devolvidos ao cliente? Esta baixa é apenas um registro manual, sem estorno automático.`,
    )) return;
    setBusyId(id);
    setError(null);
    try {
      await clientFetch(`/api/financial/entries/${id}`, {
        method: "PUT",
        body: {
          description: editForm.description,
          status: editForm.status,
          paymentMethod: editForm.paymentMethod || null,
          ...(editForm.status === "PAID" && { cashDate: editForm.cashDate }),
          ...(!isCancellationRefund && {
            amount,
            dueDate: editForm.dueDate,
            costCenterId: editForm.costCenterId || null,
          }),
        },
      });
      setEditingId(null);
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar lançamento.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(entry: FinancialEntry): Promise<void> {
    if (!canDeleteEntry(entry)) {
      setError("Este lançamento está protegido e não pode ser excluído.");
      return;
    }
    if (!window.confirm(`Excluir o lançamento "${entry.description}"?`)) return;
    setBusyId(entry.id);
    setError(null);
    try {
      await clientFetch(`/api/financial/entries/${entry.id}`, { method: "DELETE" });
      setSelectedIds((prev) => prev.filter((id) => id !== entry.id));
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao excluir lançamento.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleBulkDelete(): Promise<void> {
    if (selectedIds.length === 0) return;
    if (selectedIds.some((id) => !entries?.data.some((entry) => entry.id === id && canDeleteEntry(entry)))) {
      setError("A seleção contém lançamentos protegidos. Recarregue antes de excluir.");
      return;
    }
    if (!window.confirm(`Excluir ${selectedIds.length} lançamento(s) selecionado(s)?`)) return;
    setIsBulkDeleting(true);
    setError(null);
    try {
      await clientFetch("/api/financial/entries/bulk-delete", {
        method: "POST",
        body: { ids: selectedIds },
      });
      setSelectedIds([]);
      setEditingId(null);
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao excluir lançamentos.");
    } finally {
      setIsBulkDeleting(false);
    }
  }

  function toggleSelection(entry: FinancialEntry): void {
    if (!canDeleteEntry(entry)) return;
    setSelectedIds((prev) => (prev.includes(entry.id) ? prev.filter((id) => id !== entry.id) : [...prev, entry.id]));
  }

  const isSeller = role === "SELLER";
  const pageIds = entries?.data.filter(canDeleteEntry).map((e) => e.id) ?? [];
  const allSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.includes(id));

  const columns = [
    ...(isSeller
      ? []
      : [
          {
            key: "select",
            label: (
              <input
                type="checkbox"
                checked={allSelected}
                disabled={pageIds.length === 0 || isBulkDeleting || busyId !== null}
                aria-label="Selecionar todos os lançamentos excluíveis"
                className="h-4 w-4 cursor-pointer accent-brand-600 disabled:cursor-not-allowed disabled:opacity-40"
                onChange={(ev) =>
                  setSelectedIds((prev) =>
                    ev.target.checked
                      ? [...new Set([...prev, ...pageIds])]
                      : prev.filter((id) => !pageIds.includes(id)),
                  )
                }
              />
            ),
            render: (e: FinancialEntry) => (
              <input
                type="checkbox"
                checked={selectedIds.includes(e.id)}
                disabled={!canDeleteEntry(e) || isBulkDeleting || busyId !== null}
                aria-label={`Selecionar ${e.description}`}
                title={canDeleteEntry(e) ? "Selecionar lançamento" : "Lançamento protegido contra exclusão"}
                className="h-4 w-4 cursor-pointer accent-brand-600 disabled:cursor-not-allowed disabled:opacity-40"
                onClick={(ev) => ev.stopPropagation()}
                onChange={() => toggleSelection(e)}
              />
            ),
          },
        ]),
    {
      key: "type",
      label: "Tipo",
      render: (e: FinancialEntry) => (
        <span className={`inline-flex items-center gap-1 text-xs font-semibold ${e.type === "REVENUE" ? "text-green-700" : "text-red-700"}`}>
          {e.type === "REVENUE" ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
          {TYPE_LABELS[e.type] ?? e.type}
        </span>
      ),
    },
    { key: "description", label: "Descrição",
      render: (e: FinancialEntry) => (
        <div className="min-w-40 space-y-1">
          {editingId === e.id ? (
            <input value={editForm.description} disabled={busyId === e.id} className={INPUT_CELL}
              aria-label="Descrição do lançamento"
              onChange={(ev) => setEditForm((p) => ({ ...p, description: ev.target.value }))} />
          ) : e.description}
          {e.cancellationOrderId && e.status === "PENDING" && (
            <p className="max-w-xs whitespace-normal text-xs text-amber-700">Registrar baixa após devolução; sem estorno automático.</p>
          )}
        </div>
      ),
    },
    { key: "costCenter", label: "Centro de Custo",
      render: (e: FinancialEntry) => editingId === e.id && !e.cancellationOrderId ? (
        <select value={editForm.costCenterId} disabled={busyId === e.id} className={INPUT_CELL}
          aria-label="Centro de custo"
          onChange={(ev) => setEditForm((p) => ({ ...p, costCenterId: ev.target.value }))}>
          <option value="">Sem centro de custo</option>
          {costCenters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      ) : e.costCenter?.name ?? "—",
    },
    { key: "amount", label: "Valor",
      render: (e: FinancialEntry) => editingId === e.id && !e.cancellationOrderId ? (
        <MoneyInput value={editForm.amount} disabled={busyId === e.id} className={INPUT_CELL}
          onChange={(v) => setEditForm((p) => ({ ...p, amount: v }))} />
      ) : formatCurrency(e.amount),
    },
    {
      key: "dueDate",
      label: "Vencimento",
      render: (e: FinancialEntry) => editingId === e.id && !e.cancellationOrderId ? (
        <input type="date" value={editForm.dueDate} disabled={busyId === e.id} className={INPUT_CELL}
          aria-label="Data de vencimento"
          onChange={(ev) => setEditForm((p) => ({ ...p, dueDate: ev.target.value }))} />
      ) : formatDateOnly(e.dueDate ?? e.competenceDate),
    },
    {
      key: "cashDate",
      label: "Data de pagamento",
      render: (e: FinancialEntry) => editingId === e.id ? (
        <input type="date" value={editForm.cashDate} required={editForm.status === "PAID"}
          disabled={busyId === e.id || editForm.status !== "PAID"} className={INPUT_CELL}
          aria-label={e.cancellationOrderId ? "Data da devolução efetiva" : "Data de pagamento"}
          onChange={(ev) => setEditForm((p) => ({ ...p, cashDate: ev.target.value }))} />
      ) : formatDateOnly(e.cashDate),
    },
    {
      key: "paymentMethod",
      label: "Forma de Pagamento",
      render: (e: FinancialEntry) => editingId === e.id ? (
        <select value={editForm.paymentMethod} disabled={busyId === e.id} className={INPUT_CELL}
          required={editForm.status === "PAID"}
          aria-label={e.cancellationOrderId ? "Forma da devolução" : "Forma de pagamento"}
          onChange={(ev) => setEditForm((p) => ({ ...p, paymentMethod: ev.target.value }))}>
          <option value="">Sem forma de pagamento</option>
          {EDITABLE_PAYMENT_METHODS.map((m) => <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</option>)}
        </select>
      ) : (e.paymentMethod ? PAYMENT_METHOD_LABELS[e.paymentMethod] ?? e.paymentMethod : "—"),
    },
    {
      key: "status",
      label: "Status",
      render: (e: FinancialEntry) => {
        if (e.status === "CANCELLED") return <span className="text-xs font-semibold text-gray-500">CANCELLED</span>;
        if (editingId === e.id) {
          return (
            <select value={editForm.status} disabled={busyId === e.id || Boolean(e.cancellationOrderId)} className={INPUT_CELL}
              aria-label="Status do lançamento"
              onChange={(ev) => setEditForm((p) => ({
                ...p,
                status: ev.target.value as EntryEditForm["status"],
                cashDate: ev.target.value === "PAID" ? p.cashDate : "",
              }))}>
              {(e.cancellationOrderId ? ["PAID"] : EDITABLE_STATUSES).map((value) => (
                <option key={value} value={value}>{STATUS_LABELS[value]}</option>
              ))}
            </select>
          );
        }
        if (e.status === "PAID") return <span className="text-xs font-semibold text-green-600">Pago</span>;
        if (e.cancellationOrderId) return <span className="text-xs font-semibold text-amber-700">Reembolso pendente</span>;
        const due = new Date(e.dueDate ?? e.competenceDate);
        const today = new Date();
        if (due < today) return <span className="text-xs font-semibold text-red-600">Vencido</span>;
        return <span className="text-xs font-semibold text-yellow-600">Pendente</span>;
      },
    },
    {
      key: "actions",
      label: "",
      render: (e: FinancialEntry) => {
        if (isSeller) return null;
        if (!canEditEntry(e) && !canDeleteEntry(e)) {
          return <span className="text-xs text-gray-400" title="Histórico protegido contra edição e exclusão">Protegido</span>;
        }
        const busy = busyId === e.id || isBulkDeleting;
        return editingId === e.id ? (
          <div className="flex items-center gap-1">
            <button onClick={(ev) => { ev.stopPropagation(); handleUpdate(e.id); }} disabled={busy}
              title={e.cancellationOrderId ? "Confirmar baixa manual da devolução" : "Salvar"}
              className="rounded p-1.5 text-green-600 hover:bg-green-100 disabled:opacity-50">
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            </button>
            <button onClick={(ev) => { ev.stopPropagation(); setEditingId(null); }} disabled={busy} title="Cancelar"
              className="rounded p-1.5 text-gray-500 hover:bg-gray-100 disabled:opacity-50">
              <X size={16} />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            {canEditEntry(e) && (
              <button onClick={(ev) => { ev.stopPropagation(); startEditing(e); }} disabled={busy}
                title={e.cancellationOrderId ? "Registrar baixa após devolução efetiva" : "Editar"}
                className="inline-flex items-center gap-1 whitespace-nowrap rounded p-1.5 text-xs text-brand-600 hover:bg-gray-100 disabled:opacity-50">
                <Pencil size={16} />
                {e.cancellationOrderId && "Registrar baixa"}
              </button>
            )}
            {canDeleteEntry(e) && (
              <button onClick={(ev) => { ev.stopPropagation(); handleDelete(e); }} disabled={busy} title="Excluir"
                className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50">
                {busy ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
              </button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Financeiro</h1>
        <button
          onClick={() => router.push("/dashboard/financeiro/novo")}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
        >
          <Plus size={16} />
          Novo Lançamento
        </button>
      </div>

      {/* DRE Summary Cards */}
      {summary && (
        <div className="space-y-2">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-lg border bg-white p-4">
              <p className="text-xs text-gray-500">Receita Bruta</p>
              <p className="text-lg font-bold text-green-700">{formatCurrency(summary.dre.receitaBruta)}</p>
            </div>
            <div className="rounded-lg border bg-white p-4">
              <p className="text-xs text-gray-500">Devoluções</p>
              <p className="text-lg font-bold text-red-700">{formatCurrency(summary.dre.devolucoes)}</p>
              <p className="text-xs text-gray-500">Deduzidas uma única vez da receita</p>
            </div>
            <div className="rounded-lg border bg-white p-4">
              <p className="text-xs text-gray-500">Receita Líquida</p>
              <p className="text-lg font-bold text-green-700">{formatCurrency(summary.dre.receitaLiquida)}</p>
              <p className="text-xs text-gray-500">Após devoluções e {formatCurrency(summary.dre.deducoesImpostos)} de impostos</p>
            </div>
            <div className="rounded-lg border bg-white p-4">
              <p className="text-xs text-gray-500">CMV</p>
              <p className="text-lg font-bold text-red-700">{formatCurrency(summary.dre.cmv)}</p>
            </div>
            <div className="rounded-lg border bg-white p-4">
              <p className="text-xs text-gray-500">Lucro Bruto</p>
              <p className="text-lg font-bold text-blue-700">{formatCurrency(summary.dre.lucroBruto)}</p>
              <p className="text-xs text-gray-500">Margem bruta: {Number(summary.margins.margemBruta).toFixed(1)}%</p>
            </div>
            <div className="rounded-lg border bg-white p-4">
              <p className="text-xs text-gray-500">Resultado Operacional</p>
              <p className={`text-lg font-bold ${summary.dre.resultadoOperacional >= 0 ? "text-green-700" : "text-red-700"}`}>
                {formatCurrency(summary.dre.resultadoOperacional)}
              </p>
              <p className="text-xs text-gray-500">Após taxas e despesas operacionais</p>
            </div>
          </div>
          <p className="text-xs text-gray-500">Valores por competência. Reembolsos pendentes já deduzem a receita; a baixa apenas registra a devolução efetiva no caixa.</p>
        </div>
      )}

      {!isSeller && <SubscriptionPixCard />}

      <div className="flex flex-wrap items-center gap-4">
        <select
          value={typeFilter}
          onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
          className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          aria-label="Filtrar por tipo"
        >
          <option value="">Todos os tipos</option>
          <option value="REVENUE">Receitas</option>
          <option value="EXPENSE">Despesas</option>
          <option value="REFUND">Reembolsos</option>
        </select>

        {!isSeller && selectedIds.length > 0 && (
          <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
            <span className="text-sm font-medium text-red-800">
              {selectedIds.length} selecionado(s)
            </span>
            <button
              onClick={handleBulkDelete}
              disabled={isBulkDeleting || busyId !== null}
              className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {isBulkDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              Excluir selecionados
            </button>
            <button
              onClick={() => setSelectedIds([])}
              disabled={isBulkDeleting}
              className="text-sm text-gray-600 hover:text-gray-900 disabled:opacity-50"
            >
              Limpar
            </button>
          </div>
        )}
      </div>

      {isLoading && <LoadingSpinner />}
      {error && <ErrorMessage message={error} onRetry={fetchData} />}
      {!isLoading && !error && entries && entries.data.length === 0 && (
        <EmptyState title="Nenhum lançamento" description="Nenhum lançamento financeiro encontrado." />
      )}
      {!isLoading && entries && entries.data.length > 0 && (
        <>
          <DataTable columns={columns} data={entries.data} keyExtractor={(e) => e.id} />
          <Pagination page={entries.page} totalPages={entries.totalPages} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}
