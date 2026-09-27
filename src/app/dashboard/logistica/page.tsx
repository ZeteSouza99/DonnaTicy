"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search, Truck, RotateCcw } from "lucide-react";
import { clientFetch } from "@/lib/client-fetch";
import { DataTable } from "@/components/ui/data-table";
import { Pagination } from "@/components/ui/pagination";
import { LoadingSpinner, EmptyState, ErrorMessage } from "@/components/ui/feedback";

interface ReturnRequest {
  id: string;
  status: string;
  reason: string;
  createdAt: string;
  customer: { fullName: string };
  order: { code: string };
}

interface Shipment {
  id: string;
  trackingCode: string | null;
  carrier: string;
  status: string;
  shippedAt: string | null;
  deliveredAt: string | null;
  order: { code: string };
}

interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  totalPages: number;
}

const RETURN_STATUS: Record<string, string> = {
  REQUESTED: "Solicitada",
  APPROVED: "Aprovada",
  RECEIVED: "Recebida",
  REFUNDED: "Reembolsada",
  REJECTED: "Rejeitada",
};

export default function LogisticaPage(): React.ReactNode {
  const router = useRouter();
  const [tab, setTab] = useState<"shipments" | "returns">("shipments");
  const [shipments, setShipments] = useState<PaginatedResponse<Shipment> | null>(null);
  const [returns, setReturns] = useState<PaginatedResponse<ReturnRequest> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      if (tab === "shipments") {
        const data = await clientFetch<PaginatedResponse<Shipment>>(`/api/logistics/shipments?${params}`);
        setShipments(data);
      } else {
        const data = await clientFetch<PaginatedResponse<ReturnRequest>>(`/api/logistics/returns?${params}`);
        setReturns(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar dados.");
    } finally {
      setIsLoading(false);
    }
  }, [tab, page]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const shipmentColumns = [
    { key: "order", label: "Pedido", render: (s: Shipment) => s.order.code },
    { key: "carrier", label: "Transportadora" },
    { key: "trackingCode", label: "Rastreio", render: (s: Shipment) => s.trackingCode ?? "—" },
    { key: "status", label: "Status" },
    {
      key: "shippedAt",
      label: "Envio",
      render: (s: Shipment) => s.shippedAt ? new Date(s.shippedAt).toLocaleDateString("pt-BR") : "—",
    },
    {
      key: "deliveredAt",
      label: "Entrega",
      render: (s: Shipment) => s.deliveredAt ? new Date(s.deliveredAt).toLocaleDateString("pt-BR") : "—",
    },
  ];

  const returnColumns = [
    { key: "order", label: "Pedido", render: (r: ReturnRequest) => r.order.code },
    { key: "customer", label: "Cliente", render: (r: ReturnRequest) => r.customer.fullName },
    { key: "reason", label: "Motivo" },
    {
      key: "status",
      label: "Status",
      render: (r: ReturnRequest) => (
        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
          r.status === "REFUNDED" ? "bg-green-100 text-green-800"
            : r.status === "REJECTED" ? "bg-red-100 text-red-800"
              : "bg-yellow-100 text-yellow-800"
        }`}>
          {RETURN_STATUS[r.status] ?? r.status}
        </span>
      ),
    },
    {
      key: "createdAt",
      label: "Data",
      render: (r: ReturnRequest) => new Date(r.createdAt).toLocaleDateString("pt-BR"),
    },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Logística</h1>

      <div className="flex border-b border-gray-200">
        <button
          onClick={() => { setTab("shipments"); setPage(1); }}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === "shipments" ? "border-brand-600 text-brand-600" : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <Truck size={16} /> Envios
        </button>
        <button
          onClick={() => { setTab("returns"); setPage(1); }}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === "returns" ? "border-brand-600 text-brand-600" : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <RotateCcw size={16} /> Devoluções
        </button>
      </div>

      {isLoading && <LoadingSpinner />}
      {error && <ErrorMessage message={error} onRetry={fetchData} />}

      {!isLoading && !error && tab === "shipments" && shipments && (
        shipments.data.length === 0
          ? <EmptyState title="Nenhum envio" description="Nenhum envio registrado." />
          : (
            <>
              <DataTable columns={shipmentColumns} data={shipments.data} keyExtractor={(s) => s.id} />
              <Pagination page={shipments.page} totalPages={shipments.totalPages} onPageChange={setPage} />
            </>
          )
      )}

      {!isLoading && !error && tab === "returns" && returns && (
        returns.data.length === 0
          ? <EmptyState title="Nenhuma devolução" description="Nenhuma devolução registrada." />
          : (
            <>
              <DataTable columns={returnColumns} data={returns.data} keyExtractor={(r) => r.id} />
              <Pagination page={returns.page} totalPages={returns.totalPages} onPageChange={setPage} />
            </>
          )
      )}
    </div>
  );
}
