"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { clientFetch } from "@/lib/client-fetch";
import { todayInputValue } from "@/lib/date";
import { LoadingSpinner, ErrorMessage } from "@/components/ui/feedback";
import { MoneyInput } from "@/components/ui/money-input";

interface CostCenter {
  id: string;
  name: string;
}

const ENTRY_TYPES = [
  { value: "REVENUE", label: "Receita" },
  { value: "COGS", label: "CMV" },
  { value: "TAX", label: "Imposto" },
  { value: "FEE", label: "Taxa" },
  { value: "EXPENSE", label: "Despesa" },
  { value: "REFUND", label: "Reembolso" },
];

const EXPENSE_CATEGORIES = [
  "Custo de Mercadoria",
  "Despesas Operacionais",
  "Despesas Administrativas",
  "Despesas Variáveis",
];

const PAYMENT_METHODS = [
  { value: "CASH", label: "Dinheiro" },
  { value: "DEBIT", label: "Débito" },
  { value: "CREDIT", label: "Crédito" },
  { value: "PIX", label: "PIX" },
  { value: "VOUCHER", label: "Voucher" },
  { value: "BARTER", label: "Permuta" },
  { value: "INVOICED", label: "Faturado" },
];

const DOCUMENT_TYPES = [
  { value: "INVOICE", label: "Nota Fiscal" },
  { value: "RECEIPT", label: "Recibo" },
  { value: "PROOF", label: "Comprovante" },
];

export default function NovoLancamentoPage(): React.ReactNode {
  const router = useRouter();
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [isLoadingOptions, setIsLoadingOptions] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [type, setType] = useState("EXPENSE");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [cashDate, setCashDate] = useState("");
  const [status, setStatus] = useState("PENDING");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [documentType, setDocumentType] = useState("");
  const [documentNumber, setDocumentNumber] = useState("");
  const [costCenterId, setCostCenterId] = useState("");
  const [role, setRole] = useState<string | null>(null);

  const isSeller = role === "SELLER";

  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((me: { role?: string } | null) => setRole(me?.role ?? null))
      .catch(() => setRole(null));
  }, []);

  const fetchOptions = useCallback(async () => {
    try {
      const data = await clientFetch<{ data: CostCenter[] }>("/api/financial/cost-centers?limit=100");
      setCostCenters(data.data);
    } catch {
      setError("Erro ao carregar centros de custo.");
    } finally {
      setIsLoadingOptions(false);
    }
  }, []);

  useEffect(() => { fetchOptions(); }, [fetchOptions]);

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      await clientFetch("/api/financial/entries", {
        method: "POST",
        body: {
          type: isSeller ? "EXPENSE" : type,
          category,
          description,
          amount: Number(amount),
          dueDate,
          cashDate: status === "PAID" ? cashDate : undefined,
          status,
          paymentMethod: paymentMethod || undefined,
          documentType: documentType || undefined,
          documentNumber: documentNumber || undefined,
          costCenterId: costCenterId || undefined,
        },
      });
      router.push("/dashboard/financeiro");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar lançamento.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoadingOptions) return <LoadingSpinner />;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="rounded-lg p-2 hover:bg-gray-100" aria-label="Voltar">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-2xl font-bold text-gray-900">Novo Lançamento Financeiro</h1>
      </div>

      {error && <ErrorMessage message={error} />}

      <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border bg-white p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="type" className="mb-1 block text-sm font-medium text-gray-700">Tipo *</label>
            <select id="type" required value={isSeller ? "EXPENSE" : type} disabled={isSeller}
              onChange={(e) => { setType(e.target.value); setCategory(""); }}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-gray-100 disabled:text-gray-500">
              {(isSeller ? ENTRY_TYPES.filter((t) => t.value === "EXPENSE") : ENTRY_TYPES).map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="category" className="mb-1 block text-sm font-medium text-gray-700">Categoria *</label>
            {type === "EXPENSE" ? (
              <select id="category" required value={category} onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500">
                <option value="">Selecione...</option>
                {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            ) : (
              <input id="category" required value={category} onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
            )}
          </div>
        </div>

        <div>
          <label htmlFor="description" className="mb-1 block text-sm font-medium text-gray-700">Descrição *</label>
          <input id="description" required value={description} onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="amount" className="mb-1 block text-sm font-medium text-gray-700">Valor (R$) *</label>
            <MoneyInput id="amount" required value={amount} onChange={setAmount}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
          </div>
          <div>
            <label htmlFor="dueDate" className="mb-1 block text-sm font-medium text-gray-700">Vencimento *</label>
            <input id="dueDate" type="date" required value={dueDate} onChange={(e) => setDueDate(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
          </div>
          <div>
            <label htmlFor="status" className="mb-1 block text-sm font-medium text-gray-700">Status *</label>
            <select id="status" required value={status}
              onChange={(e) => {
                const value = e.target.value;
                setStatus(value);
                if (value === "PAID" && !cashDate) setCashDate(todayInputValue());
                if (value === "PENDING") setCashDate("");
              }}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500">
              <option value="PENDING">Pendente</option>
              <option value="PAID">Pago</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="cashDate" className="mb-1 block text-sm font-medium text-gray-700">
              Data de Pagamento {status === "PAID" ? "*" : ""}
            </label>
            <input id="cashDate" type="date" required={status === "PAID"} disabled={status !== "PAID"}
              value={cashDate} onChange={(e) => setCashDate(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-gray-100 disabled:text-gray-400" />
          </div>
          <div>
            <label htmlFor="paymentMethod" className="mb-1 block text-sm font-medium text-gray-700">
              Forma de Pagamento {status === "PAID" ? "*" : ""}
            </label>
            <select id="paymentMethod" required={status === "PAID"} value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500">
              <option value="">Selecione...</option>
              {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="costCenterId" className="mb-1 block text-sm font-medium text-gray-700">Centro de Custo</label>
            <select id="costCenterId" value={costCenterId} onChange={(e) => setCostCenterId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500">
              <option value="">Nenhum</option>
              {costCenters.map((cc) => <option key={cc.id} value={cc.id}>{cc.name}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="documentType" className="mb-1 block text-sm font-medium text-gray-700">Comprovante</label>
            <select id="documentType" value={documentType} onChange={(e) => setDocumentType(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500">
              <option value="">Nenhum</option>
              {DOCUMENT_TYPES.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="documentNumber" className="mb-1 block text-sm font-medium text-gray-700">Número do Documento</label>
            <input id="documentNumber" value={documentNumber} onChange={(e) => setDocumentNumber(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4">
          <button type="button" onClick={() => router.back()}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Cancelar
          </button>
          <button type="submit" disabled={isSubmitting}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
            {isSubmitting ? "Salvando..." : "Criar Lançamento"}
          </button>
        </div>
      </form>
    </div>
  );
}
