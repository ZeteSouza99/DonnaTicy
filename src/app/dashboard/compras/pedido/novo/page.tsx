"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { clientFetch } from "@/lib/client-fetch";
import { LoadingSpinner, ErrorMessage } from "@/components/ui/feedback";
import { MoneyInput } from "@/components/ui/money-input";

interface Supplier {
  id: string;
  companyName: string;
  tradeName: string | null;
}

interface RawMaterial {
  id: string;
  code: string;
  name: string;
}

interface OrderItem {
  rawMaterialId: string;
  label: string;
  quantity: number;
  unitPrice: number;
}

export default function NovoPedidoCompraPage(): React.ReactNode {
  const router = useRouter();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [materials, setMaterials] = useState<RawMaterial[]>([]);
  const [isLoadingOptions, setIsLoadingOptions] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [supplierId, setSupplierId] = useState("");
  const [expectedAt, setExpectedAt] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<OrderItem[]>([]);
  const [selectedMaterial, setSelectedMaterial] = useState("");
  const [itemQty, setItemQty] = useState(1);
  const [itemPrice, setItemPrice] = useState("");

  const fetchOptions = useCallback(async () => {
    try {
      const [sup, mat] = await Promise.all([
        clientFetch<{ data: Supplier[] }>("/api/purchasing/suppliers?limit=200"),
        clientFetch<{ data: RawMaterial[] }>("/api/purchasing/materials?limit=200"),
      ]);
      setSuppliers(sup.data);
      setMaterials(mat.data);
    } catch {
      setError("Erro ao carregar opções.");
    } finally {
      setIsLoadingOptions(false);
    }
  }, []);

  useEffect(() => { fetchOptions(); }, [fetchOptions]);

  function addItem(): void {
    if (!selectedMaterial || itemQty < 1 || !itemPrice) return;
    const material = materials.find((m) => m.id === selectedMaterial);
    if (!material) return;
    setItems([...items, {
      rawMaterialId: material.id,
      label: `${material.code} — ${material.name}`,
      quantity: itemQty,
      unitPrice: Number(itemPrice),
    }]);
    setSelectedMaterial("");
    setItemQty(1);
    setItemPrice("");
  }

  function removeItem(idx: number): void {
    setItems(items.filter((_, i) => i !== idx));
  }

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (items.length === 0) { setError("Adicione ao menos um item."); return; }
    setIsSubmitting(true);
    setError(null);
    try {
      await clientFetch("/api/purchasing/orders", {
        method: "POST",
        body: {
          supplierId,
          expectedAt: expectedAt || undefined,
          notes: notes || undefined,
          items: items.map(({ rawMaterialId, quantity, unitPrice }) => ({ rawMaterialId, quantity, unitPrice })),
        },
      });
      router.push("/dashboard/compras");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar pedido de compra.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoadingOptions) return <LoadingSpinner />;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="rounded-lg p-2 hover:bg-gray-100" aria-label="Voltar">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-2xl font-bold text-gray-900">Novo Pedido de Compra</h1>
      </div>

      {error && <ErrorMessage message={error} />}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-4 rounded-lg border bg-white p-6">
          <h2 className="text-lg font-semibold text-gray-900">Dados do Pedido</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="supplierId" className="mb-1 block text-sm font-medium text-gray-700">Fornecedor *</label>
              <select id="supplierId" required value={supplierId} onChange={(e) => setSupplierId(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500">
                <option value="">Selecione</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.tradeName ?? s.companyName}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="expectedAt" className="mb-1 block text-sm font-medium text-gray-700">Entrega Prevista</label>
              <input id="expectedAt" type="date" value={expectedAt} onChange={(e) => setExpectedAt(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
            </div>
          </div>
          <div>
            <label htmlFor="notes" className="mb-1 block text-sm font-medium text-gray-700">Observações</label>
            <textarea id="notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
          </div>
        </div>

        <div className="space-y-4 rounded-lg border bg-white p-6">
          <h2 className="text-lg font-semibold text-gray-900">Itens</h2>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[180px]">
              <label htmlFor="material" className="mb-1 block text-sm font-medium text-gray-700">Material</label>
              <select id="material" value={selectedMaterial} onChange={(e) => setSelectedMaterial(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500">
                <option value="">Selecione</option>
                {materials.map((m) => <option key={m.id} value={m.id}>{m.code} — {m.name}</option>)}
              </select>
            </div>
            <div className="w-24">
              <label htmlFor="qty" className="mb-1 block text-sm font-medium text-gray-700">Qtd</label>
              <input id="qty" type="number" min={1} value={itemQty} onChange={(e) => setItemQty(Number(e.target.value))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
            </div>
            <div className="w-32">
              <label htmlFor="unitPrice" className="mb-1 block text-sm font-medium text-gray-700">Preço Unit.</label>
              <MoneyInput id="unitPrice" value={itemPrice} onChange={setItemPrice}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
            </div>
            <button type="button" onClick={addItem}
              className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700">
              <Plus size={16} /> Adicionar
            </button>
          </div>

          {items.length > 0 && (
            <table className="mt-4 w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="pb-2">Material</th>
                  <th className="pb-2 text-center">Qtd</th>
                  <th className="pb-2 text-right">Preço Unit.</th>
                  <th className="pb-2 text-right">Subtotal</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => (
                  <tr key={idx} className="border-b">
                    <td className="py-2">{item.label}</td>
                    <td className="py-2 text-center">{item.quantity}</td>
                    <td className="py-2 text-right">{item.unitPrice.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td>
                    <td className="py-2 text-right font-medium">{(item.quantity * item.unitPrice).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td>
                    <td className="py-2 text-right">
                      <button type="button" onClick={() => removeItem(idx)} className="text-red-500 hover:text-red-700" aria-label="Remover">
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex justify-end gap-3">
          <button type="button" onClick={() => router.back()}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Cancelar
          </button>
          <button type="submit" disabled={isSubmitting || items.length === 0}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
            {isSubmitting ? "Criando..." : "Criar Pedido"}
          </button>
        </div>
      </form>
    </div>
  );
}
