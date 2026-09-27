"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { totalAvailable } from "@/lib/stock";
import {
  Search,
  Plus,
  Minus,
  Trash2,
  ArrowLeft,
  Check,
  Loader2,
  RefreshCcw,
  Ticket,
  CreditCard,
  Banknote,
  QrCode,
} from "lucide-react";
import { clientFetch } from "@/lib/client-fetch";
import { useDebounce } from "@/hooks/use-debounce";

// ----------------------------------------------------------------------------
// Tipos
// ----------------------------------------------------------------------------

interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  totalPages: number;
}

interface OrderSummary {
  id: string;
  code: string;
  status: string;
  total: number | string;
  placedAt: string;
  customer?: { id: string; fullName: string; phone?: string | null } | null;
}

interface OrderItemDetail {
  id: string;
  variantId: string;
  quantity: number;
  unitPrice: number | string;
  totalPrice: number | string;
  variant: {
    sku: string;
    product: { code: string; name: string };
    color: { name: string; hexValue?: string | null };
    size: { name: string };
  };
}

interface OrderDetail extends OrderSummary {
  customerId: string;
  items: OrderItemDetail[];
}

interface VariantStock {
  locationId: string;
  quantity: number;
  reservedQty: number;
}

interface Variant {
  id: string;
  sku: string;
  additionalCost: number | string;
  product: { id: string; code: string; name: string; basePrice: number | string };
  color: { id: string; name: string; hexValue?: string | null };
  size: { id: string; name: string };
  stockPositions: VariantStock[];
}

interface NewItem {
  variantId: string;
  sku: string;
  productName: string;
  colorName: string;
  sizeName: string;
  unitPrice: number;
  quantity: number;
  available: number;
}

interface StoreLocation {
  id: string;
  name: string;
  type: string;
}

interface ExchangeResult {
  code: string;
  settlementType: "CHARGED" | "STORE_CREDIT" | "EVEN";
  difference: number;
  storeCredit?: { code: string; amount: number } | null;
}

type PaymentMethod = "CREDIT" | "DEBIT" | "PIX" | "CASH";

const PAY_METHODS: { value: PaymentMethod; label: string; icon: typeof CreditCard }[] = [
  { value: "CREDIT", label: "Crédito", icon: CreditCard },
  { value: "DEBIT", label: "Débito", icon: CreditCard },
  { value: "CASH", label: "Dinheiro", icon: Banknote },
  { value: "PIX", label: "PIX", icon: QrCode },
];

const TOLERANCE = 0.01;

function formatBRL(v: number): string {
  return Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function num(v: number | string | null | undefined): number {
  return Number(v ?? 0);
}

// ============================================================================
// Página de Troca (PDV)
// ============================================================================

export default function TrocaPage(): React.ReactNode {
  const router = useRouter();

  // -------- Local de estoque --------
  const [locationId, setLocationId] = useState("");

  // -------- Busca de pedido --------
  const [orderSearch, setOrderSearch] = useState("");
  const debouncedOrderSearch = useDebounce(orderSearch, 300);
  const [orderResults, setOrderResults] = useState<OrderSummary[]>([]);
  const [isSearchingOrders, setIsSearchingOrders] = useState(false);
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [isLoadingOrder, setIsLoadingOrder] = useState(false);

  // -------- Itens devolvidos: orderItemId -> qty --------
  const [returnedQty, setReturnedQty] = useState<Record<string, number>>({});

  // -------- Itens novos --------
  const [productSearch, setProductSearch] = useState("");
  const debouncedProductSearch = useDebounce(productSearch, 300);
  const [variantResults, setVariantResults] = useState<Variant[]>([]);
  const [isSearchingVariants, setIsSearchingVariants] = useState(false);
  const [newItems, setNewItems] = useState<NewItem[]>([]);
  const productInputRef = useRef<HTMLInputElement>(null);

  // -------- Pagamento da diferença --------
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("PIX");

  // -------- Estado geral --------
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<ExchangeResult | null>(null);

  // -------- Local padrão (loja) --------
  useEffect(() => {
    clientFetch<PaginatedResponse<StoreLocation>>("/api/inventory/locations?limit=100")
      .then((res) => {
        const store = res.data.find((l) => l.type === "STORE") ?? res.data[0];
        if (store) setLocationId(store.id);
      })
      .catch(() => setError("Erro ao carregar locais de estoque."));
  }, []);

  // -------- Buscar pedidos --------
  useEffect(() => {
    if (order || !debouncedOrderSearch || debouncedOrderSearch.trim().length < 2) {
      setOrderResults([]);
      return;
    }
    let cancelled = false;
    setIsSearchingOrders(true);
    clientFetch<PaginatedResponse<OrderSummary>>(
      `/api/orders?search=${encodeURIComponent(debouncedOrderSearch)}&limit=10`,
    )
      .then((res) => {
        if (!cancelled) {
          setOrderResults(
            res.data.filter((o) => o.status !== "CANCELLED" && o.status !== "PENDING_PAYMENT"),
          );
        }
      })
      .catch(() => {
        if (!cancelled) setOrderResults([]);
      })
      .finally(() => {
        if (!cancelled) setIsSearchingOrders(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedOrderSearch, order]);

  // -------- Buscar variantes novas --------
  useEffect(() => {
    if (!debouncedProductSearch || debouncedProductSearch.trim().length < 2) {
      setVariantResults([]);
      return;
    }
    let cancelled = false;
    setIsSearchingVariants(true);
    clientFetch<PaginatedResponse<Variant>>(
      `/api/catalog/variants?search=${encodeURIComponent(debouncedProductSearch)}&limit=40`,
    )
      .then((res) => {
        if (!cancelled) setVariantResults(res.data);
      })
      .catch(() => {
        if (!cancelled) setVariantResults([]);
      })
      .finally(() => {
        if (!cancelled) setIsSearchingVariants(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedProductSearch]);

  // -------- Selecionar pedido --------
  const selectOrder = useCallback(async (id: string) => {
    setIsLoadingOrder(true);
    setError(null);
    try {
      const detail = await clientFetch<OrderDetail>(`/api/orders/${id}`);
      setOrder(detail);
      setReturnedQty({});
      setOrderResults([]);
      setOrderSearch("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar o pedido.");
    } finally {
      setIsLoadingOrder(false);
    }
  }, []);

  function resetAll(): void {
    setOrder(null);
    setReturnedQty({});
    setNewItems([]);
    setResult(null);
    setError(null);
    setOrderSearch("");
    setProductSearch("");
  }

  // -------- Itens devolvidos --------
  function toggleReturn(item: OrderItemDetail): void {
    setReturnedQty((prev) => {
      const next = { ...prev };
      if (next[item.id]) delete next[item.id];
      else next[item.id] = 1;
      return next;
    });
  }

  function changeReturnQty(item: OrderItemDetail, delta: number): void {
    setReturnedQty((prev) => {
      const current = prev[item.id] ?? 0;
      const next = Math.max(1, Math.min(item.quantity, current + delta));
      return { ...prev, [item.id]: next };
    });
  }

  // -------- Itens novos --------
  function getAvailable(v: Variant): number {
    return totalAvailable(v.stockPositions);
  }

  function addNewItem(v: Variant): void {
    setError(null);
    const unitPrice = num(v.product.basePrice) + num(v.additionalCost);
    const available = getAvailable(v);
    setNewItems((prev) => {
      const existing = prev.find((i) => i.variantId === v.id);
      if (existing) {
        if (existing.quantity + 1 > available) {
          setError(`Estoque insuficiente para ${v.sku} (disponível: ${available}).`);
          return prev;
        }
        return prev.map((i) => (i.variantId === v.id ? { ...i, quantity: i.quantity + 1 } : i));
      }
      if (available < 1) {
        setError(`Sem estoque para ${v.sku}.`);
        return prev;
      }
      return [
        ...prev,
        {
          variantId: v.id,
          sku: v.sku,
          productName: v.product.name,
          colorName: v.color.name,
          sizeName: v.size.name,
          unitPrice,
          quantity: 1,
          available,
        },
      ];
    });
    setProductSearch("");
    productInputRef.current?.focus();
  }

  function changeNewQty(variantId: string, delta: number): void {
    setNewItems((prev) =>
      prev.map((i) => {
        if (i.variantId !== variantId) return i;
        const next = i.quantity + delta;
        if (next < 1) return i;
        if (next > i.available) {
          setError(`Estoque insuficiente (disponível: ${i.available}).`);
          return i;
        }
        return { ...i, quantity: next };
      }),
    );
  }

  function removeNewItem(variantId: string): void {
    setNewItems((prev) => prev.filter((i) => i.variantId !== variantId));
  }

  // -------- Totais --------
  const amountReturned = useMemo(() => {
    if (!order) return 0;
    return order.items.reduce((sum, item) => {
      const qty = returnedQty[item.id] ?? 0;
      if (!qty) return sum;
      return sum + (num(item.totalPrice) / item.quantity) * qty;
    }, 0);
  }, [order, returnedQty]);

  const amountNew = useMemo(
    () => newItems.reduce((s, i) => s + i.unitPrice * i.quantity, 0),
    [newItems],
  );

  const difference = amountNew - amountReturned;
  const settlement: "CHARGED" | "STORE_CREDIT" | "EVEN" =
    difference > TOLERANCE ? "CHARGED" : difference < -TOLERANCE ? "STORE_CREDIT" : "EVEN";
  const returnedCount = Object.keys(returnedQty).length;
  const isGenericCustomer = order?.customer?.phone === "00000000000";
  const canSubmit =
    Boolean(order) &&
    returnedCount > 0 &&
    Boolean(locationId) &&
    !(settlement === "STORE_CREDIT" && isGenericCustomer);

  // -------- Submit --------
  async function submitExchange(): Promise<void> {
    if (!order || !canSubmit) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const created = await clientFetch<ExchangeResult>("/api/sales/exchanges", {
        method: "POST",
        body: {
          orderId: order.id,
          locationId,
          returnedItems: Object.entries(returnedQty).map(([orderItemId, quantity]) => ({
            orderItemId,
            quantity,
          })),
          newItems: newItems.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
          paymentMethod: settlement === "CHARGED" ? paymentMethod : undefined,
        },
      });
      setResult(created);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao registrar a troca.");
    } finally {
      setIsSubmitting(false);
    }
  }

  // -------- Tela de sucesso --------
  if (result) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
            <Check size={24} className="text-emerald-600" />
          </div>
          <h2 className="text-lg font-bold text-emerald-800">Troca {result.code} registrada</h2>
          {result.settlementType === "CHARGED" && (
            <p className="mt-2 text-sm text-emerald-700">
              Diferença cobrada: <strong>{formatBRL(result.difference)}</strong>
            </p>
          )}
          {result.settlementType === "STORE_CREDIT" && result.storeCredit && (
            <div className="mt-3 rounded-lg border border-emerald-300 bg-white px-4 py-3">
              <p className="flex items-center justify-center gap-1.5 text-sm text-gray-700">
                <Ticket size={16} className="text-brand-600" />
                Vale-troca gerado:
              </p>
              <p className="mt-1 font-mono text-xl font-bold text-brand-700">
                {result.storeCredit.code}
              </p>
              <p className="text-sm text-gray-600">
                Valor: {formatBRL(result.storeCredit.amount)}
              </p>
            </div>
          )}
          {result.settlementType === "EVEN" && (
            <p className="mt-2 text-sm text-emerald-700">Troca sem diferença de valores.</p>
          )}
          <div className="mt-5 flex justify-center gap-2">
            <button
              type="button"
              onClick={resetAll}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Nova troca
            </button>
            <button
              type="button"
              onClick={() => router.push("/dashboard/vendas")}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              Voltar ao PDV
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-3 py-4 sm:px-4">
      {/* Header */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => router.push("/dashboard/vendas")}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
        >
          <ArrowLeft size={14} />
          PDV
        </button>
        <h1 className="flex flex-1 items-center gap-2 text-lg font-bold text-gray-900 sm:text-xl">
          <RefreshCcw size={18} className="text-brand-600" />
          Troca de Mercadoria
        </h1>
      </div>

      {error && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Passo 1: selecionar pedido */}
      {!order ? (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
            Venda original
          </label>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={orderSearch}
              onChange={(e) => setOrderSearch(e.target.value)}
              placeholder="Buscar por código do pedido, cliente ou SKU..."
              className="w-full rounded-lg border border-gray-300 py-2.5 pl-9 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
              autoFocus
            />
            {(isSearchingOrders || isLoadingOrder) && (
              <Loader2
                size={16}
                className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-gray-400"
              />
            )}
          </div>
          {orderResults.length > 0 && (
            <ul className="mt-2 divide-y divide-gray-100 rounded-lg border border-gray-200">
              {orderResults.map((o) => (
                <li key={o.id}>
                  <button
                    type="button"
                    onClick={() => void selectOrder(o.id)}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm hover:bg-gray-50"
                  >
                    <div>
                      <span className="font-mono font-semibold text-gray-900">{o.code}</span>
                      <span className="ml-2 text-gray-600">
                        {o.customer?.fullName ?? "Consumidor Final"}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="font-medium text-gray-900">{formatBRL(num(o.total))}</span>
                      <span className="ml-2 text-xs text-gray-400">
                        {new Date(o.placedAt).toLocaleDateString("pt-BR")}
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {orderSearch.trim().length >= 2 && !isSearchingOrders && orderResults.length === 0 && (
            <p className="mt-2 text-sm text-gray-500">Nenhum pedido elegível encontrado.</p>
          )}
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-3">
          {/* Coluna 1: itens devolvidos */}
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-bold text-gray-900">
                Pedido <span className="font-mono">{order.code}</span>
              </h2>
              <button
                type="button"
                onClick={resetAll}
                className="text-xs font-medium text-brand-600 hover:underline"
              >
                Trocar pedido
              </button>
            </div>
            <p className="mb-3 text-xs text-gray-500">
              Cliente: {order.customer?.fullName ?? "Consumidor Final"}
            </p>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Itens devolvidos
            </p>
            <ul className="space-y-2">
              {order.items.map((item) => {
                const qty = returnedQty[item.id] ?? 0;
                const selected = qty > 0;
                const unitValue = num(item.totalPrice) / item.quantity;
                return (
                  <li
                    key={item.id}
                    className={`rounded-lg border px-3 py-2 ${
                      selected ? "border-brand-300 bg-brand-50" : "border-gray-200"
                    }`}
                  >
                    <label className="flex cursor-pointer items-start gap-2">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleReturn(item)}
                        className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-gray-900">
                          {item.variant.product.name}
                        </p>
                        <p className="text-xs text-gray-500">
                          {item.variant.sku} · {item.variant.color.name} / {item.variant.size.name}{" "}
                          · {formatBRL(unitValue)}/un · comprou {item.quantity}
                        </p>
                      </div>
                    </label>
                    {selected && (
                      <div className="mt-2 flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => changeReturnQty(item, -1)}
                          className="rounded border border-gray-300 p-1 hover:bg-gray-50"
                        >
                          <Minus size={12} />
                        </button>
                        <span className="w-8 text-center text-sm font-semibold">{qty}</span>
                        <button
                          type="button"
                          onClick={() => changeReturnQty(item, 1)}
                          className="rounded border border-gray-300 p-1 hover:bg-gray-50"
                        >
                          <Plus size={12} />
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Coluna 2: itens novos */}
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Itens novos (levar)
            </p>
            <div className="relative mb-2">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                ref={productInputRef}
                type="text"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder="Buscar produto ou SKU..."
                className="w-full rounded-lg border border-gray-300 py-2 pl-8 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
              {isSearchingVariants && (
                <Loader2
                  size={14}
                  className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-gray-400"
                />
              )}
            </div>
            {variantResults.length > 0 && (
              <ul className="mb-2 max-h-56 divide-y divide-gray-100 overflow-y-auto rounded-lg border border-gray-200">
                {variantResults.map((v) => {
                  const available = getAvailable(v);
                  const price = num(v.product.basePrice) + num(v.additionalCost);
                  return (
                    <li key={v.id}>
                      <button
                        type="button"
                        onClick={() => addNewItem(v)}
                        disabled={available < 1}
                        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50 disabled:opacity-40"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium text-gray-900">{v.product.name}</p>
                          <p className="text-xs text-gray-500">
                            {v.sku} · {v.color.name} / {v.size.name} · estoque {available}
                          </p>
                        </div>
                        <span className="shrink-0 font-medium">{formatBRL(price)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <ul className="space-y-2">
              {newItems.map((i) => (
                <li
                  key={i.variantId}
                  className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-900">{i.productName}</p>
                    <p className="text-xs text-gray-500">
                      {i.sku} · {i.colorName} / {i.sizeName} · {formatBRL(i.unitPrice)}/un
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => changeNewQty(i.variantId, -1)}
                    className="rounded border border-gray-300 p-1 hover:bg-gray-50"
                  >
                    <Minus size={12} />
                  </button>
                  <span className="w-7 text-center text-sm font-semibold">{i.quantity}</span>
                  <button
                    type="button"
                    onClick={() => changeNewQty(i.variantId, 1)}
                    className="rounded border border-gray-300 p-1 hover:bg-gray-50"
                  >
                    <Plus size={12} />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeNewItem(i.variantId)}
                    className="rounded p-1 text-red-500 hover:bg-red-50"
                  >
                    <Trash2 size={13} />
                  </button>
                </li>
              ))}
              {newItems.length === 0 && (
                <li className="rounded-lg border border-dashed border-gray-200 px-3 py-4 text-center text-xs text-gray-400">
                  Sem itens novos — a troca gerará vale ou saldo zero.
                </li>
              )}
            </ul>
          </div>

          {/* Coluna 3: resumo */}
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Resumo da troca
            </p>
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-600">Valor devolvido</dt>
                <dd className="font-medium text-gray-900">{formatBRL(amountReturned)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-600">Valor dos novos</dt>
                <dd className="font-medium text-gray-900">{formatBRL(amountNew)}</dd>
              </div>
              <div className="flex justify-between border-t border-gray-200 pt-1.5 text-base">
                <dt className="font-semibold text-gray-900">Diferença</dt>
                <dd
                  className={`font-bold ${
                    settlement === "CHARGED"
                      ? "text-red-600"
                      : settlement === "STORE_CREDIT"
                        ? "text-emerald-600"
                        : "text-gray-900"
                  }`}
                >
                  {formatBRL(Math.abs(difference))}
                </dd>
              </div>
            </dl>

            <div className="mt-3 rounded-lg bg-gray-50 px-3 py-2.5 text-xs text-gray-600">
              {returnedCount === 0 ? (
                "Selecione ao menos 1 item devolvido."
              ) : settlement === "CHARGED" ? (
                <>
                  Cliente paga a diferença de <strong>{formatBRL(difference)}</strong>.
                </>
              ) : settlement === "STORE_CREDIT" ? (
                isGenericCustomer ? (
                  <span className="text-red-600">
                    Pedido de Consumidor Final: não é possível gerar vale-troca sem identificar o
                    cliente.
                  </span>
                ) : (
                  <>
                    Será gerado um <strong>vale-troca de {formatBRL(-difference)}</strong> para{" "}
                    {order.customer?.fullName}.
                  </>
                )
              ) : (
                "Troca com saldo zero — sem cobrança nem vale."
              )}
            </div>

            {settlement === "CHARGED" && (
              <div className="mt-3">
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Pagamento da diferença
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                  {PAY_METHODS.map((m) => {
                    const Icon = m.icon;
                    return (
                      <button
                        key={m.value}
                        type="button"
                        onClick={() => setPaymentMethod(m.value)}
                        className={`inline-flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-xs font-medium ${
                          paymentMethod === m.value
                            ? "border-brand-500 bg-brand-50 text-brand-700"
                            : "border-gray-300 text-gray-600 hover:bg-gray-50"
                        }`}
                      >
                        <Icon size={13} />
                        {m.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => void submitExchange()}
              disabled={!canSubmit || isSubmitting}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              Confirmar troca
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
