"use client";

import { useEffect, useState, useCallback } from "react";
import { Star, Gift, TrendingUp } from "lucide-react";
import { clientFetch } from "@/lib/client-fetch";
import { LoadingSpinner, EmptyState, ErrorMessage } from "@/components/ui/feedback";
import { DataTable } from "@/components/ui/data-table";

interface LoyaltyTransaction {
  id: string;
  type: string;
  points: number;
  description: string | null;
  createdAt: string;
  customer: { fullName: string; tier: string };
}

interface LoyaltyResponse {
  data: LoyaltyTransaction[];
  total: number;
}

const TIER_COLORS: Record<string, string> = {
  BRONZE: "bg-orange-100 text-orange-800",
  SILVER: "bg-gray-200 text-gray-700",
  GOLD: "bg-yellow-100 text-yellow-800",
  VIP: "bg-brand-100 text-brand-800",
};

export default function CrmPage(): React.ReactNode {
  const [transactions, setTransactions] = useState<LoyaltyResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await clientFetch<LoyaltyResponse>("/api/crm/loyalty?limit=50");
      setTransactions(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar CRM.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const columns = [
    { key: "customer", label: "Cliente", render: (t: LoyaltyTransaction) => t.customer.fullName },
    {
      key: "tier",
      label: "Tier",
      render: (t: LoyaltyTransaction) => (
        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${TIER_COLORS[t.customer.tier] ?? "bg-gray-100"}`}>
          {t.customer.tier}
        </span>
      ),
    },
    {
      key: "type",
      label: "Tipo",
      render: (t: LoyaltyTransaction) => (
        <span className={`inline-flex items-center gap-1 text-xs font-semibold ${t.type === "EARN" ? "text-green-700" : "text-red-700"}`}>
          {t.type === "EARN" ? <TrendingUp size={14} /> : <Gift size={14} />}
          {t.type === "EARN" ? "Acúmulo" : "Resgate"}
        </span>
      ),
    },
    {
      key: "points",
      label: "Pontos",
      render: (t: LoyaltyTransaction) => (
        <span className={t.type === "EARN" ? "text-green-700 font-semibold" : "text-red-700 font-semibold"}>
          {t.type === "EARN" ? "+" : "-"}{t.points}
        </span>
      ),
    },
    { key: "description", label: "Descrição", render: (t: LoyaltyTransaction) => t.description ?? "—" },
    {
      key: "createdAt",
      label: "Data",
      render: (t: LoyaltyTransaction) => new Date(t.createdAt).toLocaleDateString("pt-BR"),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">CRM / Fidelidade</h1>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="flex items-center gap-3 rounded-lg border bg-white p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-100">
            <Star size={20} className="text-brand-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500">Total de Transações</p>
            <p className="text-xl font-bold text-gray-900">{transactions?.total ?? "—"}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-lg border bg-white p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100">
            <TrendingUp size={20} className="text-green-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500">Pontos Emitidos</p>
            <p className="text-xl font-bold text-green-700">
              {transactions?.data.filter((t) => t.type === "EARN").reduce((sum, t) => sum + t.points, 0).toLocaleString("pt-BR") ?? "—"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-lg border bg-white p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100">
            <Gift size={20} className="text-red-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500">Pontos Resgatados</p>
            <p className="text-xl font-bold text-red-700">
              {transactions?.data.filter((t) => t.type === "REDEEM").reduce((sum, t) => sum + t.points, 0).toLocaleString("pt-BR") ?? "—"}
            </p>
          </div>
        </div>
      </div>

      {isLoading && <LoadingSpinner />}
      {error && <ErrorMessage message={error} onRetry={fetchData} />}
      {!isLoading && !error && transactions && transactions.data.length === 0 && (
        <EmptyState title="Nenhuma transação" description="Nenhuma transação de fidelidade registrada." />
      )}
      {!isLoading && !error && transactions && transactions.data.length > 0 && (
        <DataTable columns={columns} data={transactions.data} keyExtractor={(t) => t.id} />
      )}
    </div>
  );
}
