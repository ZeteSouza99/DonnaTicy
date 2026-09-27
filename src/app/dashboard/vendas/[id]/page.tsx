"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { clientFetch } from "@/lib/client-fetch";
import { LoadingSpinner, ErrorMessage } from "@/components/ui/feedback";

interface OrderItem {
  id: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  variant: {
    sku: string;
    product: { name: string };
    color: { name: string };
    size: { name: string };
  };
}

interface Order {
  id: string;
  code: string;
  status: string;
  channel: string;
  subtotal: number;
  total: number;
  discountTotal: number;
  shippingCost: number;
  notes: string | null;
  placedAt: string;
  customer?: { fullName: string; phone: string; email: string | null };
  location?: { name: string };
  items?: OrderItem[];
  cancellationRefund?: { id: string; amount: number; status: string } | null;
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Rascunho",
  PENDING_PAYMENT: "Aguardando Pgto",
  PAID: "Pago",
  PICKING: "Separação",
  PACKED: "Empacotado",
  SHIPPED: "Enviado",
  IN_TRANSIT: "Em Trânsito",
  OUT_FOR_DELIVERY: "Saiu p/ Entrega",
  DELIVERED: "Entregue",
  CANCELLED: "Cancelado",
  RETURNED: "Devolvido",
};

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-700",
  PENDING_PAYMENT: "bg-yellow-100 text-yellow-800",
  PAID: "bg-blue-100 text-blue-800",
  PICKING: "bg-indigo-100 text-indigo-800",
  PACKED: "bg-purple-100 text-purple-800",
  SHIPPED: "bg-cyan-100 text-cyan-800",
  IN_TRANSIT: "bg-teal-100 text-teal-800",
  OUT_FOR_DELIVERY: "bg-lime-100 text-lime-800",
  DELIVERED: "bg-green-100 text-green-800",
  CANCELLED: "bg-red-100 text-red-800",
  RETURNED: "bg-orange-100 text-orange-800",
};

const NEXT_STATUS: Record<string, string[]> = {
  DRAFT: ["PENDING_PAYMENT", "CANCELLED"],
  PENDING_PAYMENT: ["PAID", "CANCELLED"],
  PAID: ["PICKING", "CANCELLED"],
  PICKING: ["PACKED", "CANCELLED"],
  PACKED: ["SHIPPED"],
  SHIPPED: ["IN_TRANSIT"],
  IN_TRANSIT: ["OUT_FOR_DELIVERY"],
  OUT_FOR_DELIVERY: ["DELIVERED"],
};

export default function PedidoDetalhePage(): React.ReactNode {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [order, setOrder] = useState<Order | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchOrder = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await clientFetch<Order>(`/api/orders/${id}`);
      setOrder(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar pedido.");
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchOrder(); }, [fetchOrder]);

  async function handleStatusChange(newStatus: string): Promise<void> {
    if (newStatus === "CANCELLED" && !window.confirm("Cancelar este pedido? Valores recebidos serão enviados ao financeiro como reembolso pendente, sem estorno bancário automático.")) return;
    setIsUpdating(true);
    setError(null);
    try {
      await clientFetch(`/api/orders/${id}`, {
        method: "PATCH",
        body: { status: newStatus },
      });
      await fetchOrder();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao atualizar status.");
    } finally {
      setIsUpdating(false);
    }
  }

  const formatCurrency = (v: number): string =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  if (isLoading) return <LoadingSpinner />;
  if (error && !order) return <ErrorMessage message={error} onRetry={fetchOrder} />;
  if (!order) return null;

  const possibleStatuses = NEXT_STATUS[order.status] ?? [];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="rounded-lg p-2 hover:bg-gray-100" aria-label="Voltar">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pedido {order.code}</h1>
          <p className="text-sm text-gray-500">{new Date(order.placedAt).toLocaleString("pt-BR")}</p>
        </div>
      </div>

      {error && <ErrorMessage message={error} />}

      {order.status === "CANCELLED" && order.cancellationRefund?.status === "PENDING" && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Pedido cancelado. Reembolso de {formatCurrency(order.cancellationRefund.amount)} pendente no Financeiro.
          A baixa deve ser registrada após a devolução do dinheiro; não há estorno bancário automático.
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="space-y-4 rounded-lg border bg-white p-6">
          <h2 className="text-lg font-semibold text-gray-900">Informações</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500">Status</dt>
              <dd><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_COLORS[order.status] ?? "bg-gray-100 text-gray-700"}`}>{STATUS_LABELS[order.status] ?? order.status}</span></dd>
            </div>
            <div className="flex justify-between"><dt className="text-gray-500">Canal</dt><dd>{order.channel}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">Local</dt><dd>{order.location?.name ?? "—"}</dd></div>
          </dl>

          {possibleStatuses.length > 0 && (
            <div className="border-t pt-4">
              <p className="mb-2 text-xs font-medium text-gray-500">Avançar para:</p>
              <div className="flex flex-wrap gap-2">
                {possibleStatuses.map((s) => (
                  <button key={s} disabled={isUpdating} onClick={() => handleStatusChange(s)}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium hover:bg-gray-50 disabled:opacity-50">
                    {STATUS_LABELS[s] ?? s}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-4 rounded-lg border bg-white p-6">
          <h2 className="text-lg font-semibold text-gray-900">Cliente</h2>
          {order.customer ? (
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-gray-500">Nome</dt><dd>{order.customer.fullName}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">Telefone</dt><dd>{order.customer.phone}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">E-mail</dt><dd>{order.customer.email ?? "—"}</dd></div>
            </dl>
          ) : (
            <p className="text-sm text-gray-400">Sem cliente vinculado.</p>
          )}
        </div>
      </div>

      <div className="space-y-4 rounded-lg border bg-white p-6">
        <h2 className="text-lg font-semibold text-gray-900">Itens</h2>
        {order.items && order.items.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="pb-2">SKU</th>
                <th className="pb-2">Produto</th>
                <th className="pb-2 text-center">Qtd</th>
                <th className="pb-2 text-right">Unit.</th>
                <th className="pb-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item) => (
                <tr key={item.id} className="border-b">
                  <td className="py-2 font-mono text-xs">{item.variant.sku}</td>
                  <td className="py-2">{item.variant.product.name} — {item.variant.color.name}/{item.variant.size.name}</td>
                  <td className="py-2 text-center">{item.quantity}</td>
                  <td className="py-2 text-right">{formatCurrency(item.unitPrice)}</td>
                  <td className="py-2 text-right font-medium">{formatCurrency(item.totalPrice)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-gray-400">Nenhum item encontrado.</p>
        )}

        <div className="border-t pt-4 text-sm">
          <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span>{formatCurrency(order.subtotal)}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Desconto</span><span>- {formatCurrency(order.discountTotal)}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Frete</span><span>{formatCurrency(order.shippingCost)}</span></div>
          <div className="mt-2 flex justify-between border-t pt-2 font-bold"><span>Total</span><span>{formatCurrency(order.total)}</span></div>
        </div>
      </div>

      {order.notes && (
        <div className="rounded-lg border bg-white p-6">
          <h2 className="text-lg font-semibold text-gray-900">Observações</h2>
          <p className="mt-2 text-sm text-gray-600">{order.notes}</p>
        </div>
      )}
    </div>
  );
}
