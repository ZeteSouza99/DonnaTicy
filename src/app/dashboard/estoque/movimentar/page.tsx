"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { clientFetch } from "@/lib/client-fetch";
import { LoadingSpinner, ErrorMessage } from "@/components/ui/feedback";

interface Variant {
  id: string;
  sku: string;
  product: { name: string };
  color: { name: string };
  size: { name: string };
}

interface Location {
  id: string;
  name: string;
}

const REASONS = [
  { value: "SALE", label: "Venda" },
  { value: "PURCHASE_RECEIVED", label: "Recebimento de Compra" },
  { value: "PRODUCTION_RECEIVED", label: "Recebimento de Produção" },
  { value: "RETURN_APPROVED", label: "Devolução Aprovada" },
  { value: "TRANSFER", label: "Transferência" },
  { value: "ADJUSTMENT", label: "Ajuste" },
  { value: "LOSS", label: "Perda" },
  { value: "DAMAGE", label: "Avaria" },
];

export default function MovimentarEstoquePage(): React.ReactNode {
  const router = useRouter();
  const [variants, setVariants] = useState<Variant[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [isLoadingOptions, setIsLoadingOptions] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [variantId, setVariantId] = useState("");
  const [fromLocationId, setFromLocationId] = useState("");
  const [toLocationId, setToLocationId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("ADJUSTMENT");
  const [notes, setNotes] = useState("");

  const fetchOptions = useCallback(async () => {
    try {
      const [vars, locs] = await Promise.all([
        clientFetch<{ data: Variant[] }>("/api/catalog/variants?limit=500"),
        clientFetch<{ data: Location[] }>("/api/inventory/locations?limit=100"),
      ]);
      setVariants(vars.data);
      setLocations(locs.data);
    } catch {
      setError("Erro ao carregar opções.");
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
      await clientFetch("/api/inventory/movements", {
        method: "POST",
        body: {
          variantId,
          fromLocationId: fromLocationId || undefined,
          toLocationId: toLocationId || undefined,
          quantity: Number(quantity),
          reason,
          notes: notes || undefined,
        },
      });
      router.push("/dashboard/estoque");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao registrar movimentação.");
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
        <h1 className="text-2xl font-bold text-gray-900">Nova Movimentação de Estoque</h1>
      </div>

      {error && <ErrorMessage message={error} />}

      <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border bg-white p-6">
        <div>
          <label htmlFor="variantId" className="mb-1 block text-sm font-medium text-gray-700">Variante (SKU) *</label>
          <select id="variantId" required value={variantId} onChange={(e) => setVariantId(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500">
            <option value="">Selecione</option>
            {variants.map((v) => (
              <option key={v.id} value={v.id}>{v.sku} — {v.product.name} ({v.color.name}/{v.size.name})</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="reason" className="mb-1 block text-sm font-medium text-gray-700">Motivo *</label>
          <select id="reason" required value={reason} onChange={(e) => setReason(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500">
            {REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="fromLocationId" className="mb-1 block text-sm font-medium text-gray-700">Origem</label>
            <select id="fromLocationId" value={fromLocationId} onChange={(e) => setFromLocationId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500">
              <option value="">Nenhum</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="toLocationId" className="mb-1 block text-sm font-medium text-gray-700">Destino</label>
            <select id="toLocationId" value={toLocationId} onChange={(e) => setToLocationId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500">
              <option value="">Nenhum</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="quantity" className="mb-1 block text-sm font-medium text-gray-700">Quantidade *</label>
            <input id="quantity" type="number" min={1} required value={quantity} onChange={(e) => setQuantity(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
          </div>
        </div>

        <div>
          <label htmlFor="notes" className="mb-1 block text-sm font-medium text-gray-700">Observações</label>
          <textarea id="notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
        </div>

        <div className="flex justify-end gap-3 pt-4">
          <button type="button" onClick={() => router.back()}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Cancelar
          </button>
          <button type="submit" disabled={isSubmitting}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
            {isSubmitting ? "Registrando..." : "Registrar Movimentação"}
          </button>
        </div>
      </form>
    </div>
  );
}
