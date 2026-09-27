"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { totalAvailable } from "@/lib/stock";
import {
  Search,
  Plus,
  Minus,
  Trash2,
  X,
  Check,
  Loader2,
  CreditCard,
  Banknote,
  QrCode,
  ShoppingCart,
  User as UserIcon,
  ClipboardList,
  Receipt,
  RefreshCcw,
  Ticket,
  BadgePercent,
} from "lucide-react";
import { clientFetch } from "@/lib/client-fetch";
import { REQUIRE_DISCOUNT_APPROVAL, RECEIPT_PRINTING } from "@/lib/features";
import { printSaleReceipt } from "@/lib/print";
import { useDebounce } from "@/hooks/use-debounce";
import { LoadingSpinner } from "@/components/ui/feedback";
import { MoneyInput } from "@/components/ui/money-input";

// ----------------------------------------------------------------------------
// Tipos
// ----------------------------------------------------------------------------

interface Customer {
  id: string;
  fullName: string;
  phone?: string | null;
}

interface StoreLocation {
  id: string;
  name: string;
  type: string;
}

interface StoreCreditInfo {
  id: string;
  code: string;
  remainingAmount: number;
  customerId: string;
}

interface VariantStock {
  locationId: string;
  quantity: number;
  reservedQty: number;
}

interface Variant {
  id: string;
  sku: string;
  barcode?: string | null;
  additionalCost: number | string;
  product: {
    id: string;
    code: string;
    name: string;
    basePrice: number | string;
  };
  color: { id: string; name: string; hexValue?: string | null };
  size: { id: string; name: string };
  stockPositions: VariantStock[];
}

interface CartItem {
  variantId: string;
  sku: string;
  productName: string;
  colorName: string;
  colorHex?: string | null;
  sizeName: string;
  unitPrice: number;
  quantity: number;
  available: number;
}

type PaymentMethod = "CREDIT" | "DEBIT" | "PIX" | "CASH";

interface Payment {
  uid: number;
  method: PaymentMethod;
  amount: string;
  installments: number;
}

interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  totalPages: number;
}

interface DiscountRequest {
  id: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "APPLIED" | "CANCELLED";
  discountType?: "PERCENT" | "AMOUNT" | null;
  discountValue?: number | null;
  approvedBy?: { id: string; name: string } | null;
  expired?: boolean;
}

// ----------------------------------------------------------------------------
// Constantes
// ----------------------------------------------------------------------------

const PAY_METHODS: { value: PaymentMethod; label: string; icon: typeof CreditCard }[] = [
  { value: "CREDIT", label: "Crédito", icon: CreditCard },
  { value: "DEBIT", label: "Débito", icon: CreditCard },
  { value: "CASH", label: "Dinheiro", icon: Banknote },
  { value: "PIX", label: "PIX", icon: QrCode },
];

let payUidCounter = 1;

// ----------------------------------------------------------------------------
// Utils
// ----------------------------------------------------------------------------

function formatBRL(v: number): string {
  return Number(v ?? 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function num(v: number | string | null | undefined): number {
  return Number(v ?? 0);
}

// ============================================================================
// Componente principal — PDV
// ============================================================================

export default function PdvPage(): React.ReactNode {
  const router = useRouter();

  // -------- Lookups --------
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [locationId, setLocationId] = useState("");
  const [locationName, setLocationName] = useState("");
  const [isLoadingOptions, setIsLoadingOptions] = useState(true);

  // -------- Pedido em construção --------
  const [customerId, setCustomerId] = useState("");
  const [discountAmount, setDiscountAmount] = useState("0");
  const [discountMode, setDiscountMode] = useState<"AMOUNT" | "PERCENT">("AMOUNT");
  const [discountPercent, setDiscountPercent] = useState("0");
  const [cart, setCart] = useState<CartItem[]>([]);

  // -------- Busca de produto --------
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [searchResults, setSearchResults] = useState<Variant[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // -------- Modal de pagamento --------
  const [showPayment, setShowPayment] = useState(false);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // -------- Vale-troca --------
  const [creditCodeInput, setCreditCodeInput] = useState("");
  const [appliedCredit, setAppliedCredit] = useState<StoreCreditInfo | null>(null);
  const [isValidatingCredit, setIsValidatingCredit] = useState(false);

  // -------- Modal novo cliente --------
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newCust, setNewCust] = useState({ name: "", phone: "" });
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);

  // -------- Aprovação remota de desconto (SELLER) --------
  const [role, setRole] = useState<string | null>(null);
  const isSeller = REQUIRE_DISCOUNT_APPROVAL && role === "SELLER";
  const [discountRequest, setDiscountRequest] = useState<DiscountRequest | null>(null);
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [discountReason, setDiscountReason] = useState("");
  const [isRequestingDiscount, setIsRequestingDiscount] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((me: { role?: string } | null) => setRole(me?.role ?? null))
      .catch(() => setRole(null));
  }, []);

  // -------- Totais --------
  const subtotal = useMemo(
    () => cart.reduce((s, i) => s + i.unitPrice * i.quantity, 0),
    [cart],
  );
  const approvedDiscount = useMemo(() => {
    if (!discountRequest || discountRequest.status !== "APPROVED" || discountRequest.expired) return 0;
    const value = Number(discountRequest.discountValue ?? 0);
    if (discountRequest.discountType === "PERCENT") {
      return Math.round(subtotal * value) / 100;
    }
    return Math.min(value, subtotal);
  }, [discountRequest, subtotal]);
  const manualDiscount = useMemo(() => {
    if (discountMode === "PERCENT") {
      const pct = Math.min(100, Math.max(0, Math.trunc(Number(discountPercent) || 0)));
      return Math.round(subtotal * pct) / 100;
    }
    return Math.min(Math.max(0, Number(discountAmount) || 0), subtotal);
  }, [discountMode, discountPercent, discountAmount, subtotal]);

  const discount = isSeller ? approvedDiscount : manualDiscount;
  const total = Math.max(0, subtotal - discount);
  const creditApplied = appliedCredit ? Math.min(appliedCredit.remainingAmount, total) : 0;
  const toPay = Math.max(0, total - creditApplied);
  const paidAmount = useMemo(
    () => payments.reduce((s, p) => s + (Number(p.amount) || 0), 0),
    [payments],
  );
  const missing = toPay - paidAmount;
  const change = paidAmount - toPay;
  const itemCount = cart.reduce((s, i) => s + i.quantity, 0);

  // -------- Carregar opções iniciais --------
  const fetchOptions = useCallback(async () => {
    setIsLoadingOptions(true);
    try {
      const [cust, locs] = await Promise.all([
        clientFetch<PaginatedResponse<Customer>>("/api/customers?limit=200"),
        clientFetch<PaginatedResponse<StoreLocation>>("/api/inventory/locations?limit=100"),
      ]);
      setCustomers(cust.data);
      const store = locs.data.find((l) => l.type === "STORE") ?? locs.data[0];
      if (store) {
        setLocationId(store.id);
        setLocationName(store.name);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar dados.");
    } finally {
      setIsLoadingOptions(false);
    }
  }, []);

  useEffect(() => {
    void fetchOptions();
  }, [fetchOptions]);

  // -------- Polling (5s) da solicitação de desconto pendente --------
  useEffect(() => {
    if (!discountRequest || discountRequest.status !== "PENDING") return;
    const timer = setInterval(() => {
      clientFetch<DiscountRequest>(`/api/sales/discount-requests/${discountRequest.id}`)
        .then((res) => setDiscountRequest(res))
        .catch(() => {
          /* mantém estado; tenta de novo no próximo tick */
        });
    }, 5_000);
    return () => clearInterval(timer);
  }, [discountRequest]);

  // -------- Buscar variantes --------
  useEffect(() => {
    if (!debouncedSearch || debouncedSearch.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    let cancelled = false;
    setIsSearching(true);
    clientFetch<PaginatedResponse<Variant>>(
      `/api/catalog/variants?search=${encodeURIComponent(debouncedSearch)}&limit=40`,
    )
      .then((res) => {
        if (!cancelled) setSearchResults(res.data);
      })
      .catch(() => {
        if (!cancelled) setSearchResults([]);
      })
      .finally(() => {
        if (!cancelled) setIsSearching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedSearch]);

  // -------- Hotkey Ctrl+K --------
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // -------- Helpers de estoque/carrinho --------
  function getAvailable(v: Variant): number {
    return totalAvailable(v.stockPositions);
  }

  function addToCart(v: Variant): void {
    setError(null);
    const unitPrice = num(v.product.basePrice) + num(v.additionalCost);
    const available = getAvailable(v);
    setCart((prev) => {
      const existing = prev.find((i) => i.variantId === v.id);
      if (existing) {
        if (existing.quantity + 1 > available) {
          setError(`Estoque insuficiente para ${v.sku} (disponível: ${available}).`);
          return prev;
        }
        return prev.map((i) =>
          i.variantId === v.id ? { ...i, quantity: i.quantity + 1 } : i,
        );
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
          colorHex: v.color.hexValue,
          sizeName: v.size.name,
          unitPrice,
          quantity: 1,
          available,
        },
      ];
    });
    setSearch("");
    searchInputRef.current?.focus();
  }

  /**
   * Leitura de código de barras: o leitor digita o código e envia Enter.
   * Faz lookup EXATO por código de barras (ou SKU) e lança a peça no carrinho.
   */
  async function handleScan(): Promise<void> {
    const code = search.trim();
    if (!code || isScanning) return;
    setError(null);
    setIsScanning(true);
    try {
      const variant = await clientFetch<Variant>(
        `/api/catalog/variants/lookup?code=${encodeURIComponent(code)}`,
      );
      addToCart(variant);
    } catch {
      if (searchResults.length === 1) {
        addToCart(searchResults[0]);
      } else {
        setError(`Nenhuma peça encontrada para o código "${code}".`);
      }
    } finally {
      setIsScanning(false);
    }
  }

  function changeQty(variantId: string, delta: number): void {
    setError(null);
    setCart((prev) =>
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

  function setQty(variantId: string, q: number): void {
    setCart((prev) =>
      prev.map((i) =>
        i.variantId === variantId
          ? { ...i, quantity: Math.max(1, Math.min(i.available, q || 1)) }
          : i,
      ),
    );
  }

  function removeFromCart(variantId: string): void {
    setCart((prev) => prev.filter((i) => i.variantId !== variantId));
  }

  function clearCart(): void {
    setCart([]);
    setDiscountAmount("0");
    setDiscountPercent("0");
    setPayments([]);
    setAppliedCredit(null);
    setCreditCodeInput("");
    setDiscountRequest(null);
    setDiscountReason("");
    setError(null);
  }

  // -------- Solicitação de desconto (SELLER) --------
  async function requestDiscount(): Promise<void> {
    if (subtotal <= 0) return;
    setIsRequestingDiscount(true);
    setError(null);
    try {
      const created = await clientFetch<DiscountRequest>("/api/sales/discount-requests", {
        method: "POST",
        body: {
          cartTotal: subtotal,
          reason: discountReason.trim() || undefined,
          items: cart.map((i) => ({
            variantId: i.variantId,
            sku: i.sku,
            productName: i.productName,
            colorName: i.colorName,
            sizeName: i.sizeName,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
          })),
          customerId: customerId || undefined,
          customerName:
            customers.find((c) => c.id === customerId)?.fullName ?? undefined,
          locationId: locationId || undefined,
          locationName: locationName || undefined,
        },
      });
      setDiscountRequest(created);
      setShowDiscountModal(false);
      setDiscountReason("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao solicitar desconto.");
    } finally {
      setIsRequestingDiscount(false);
    }
  }

  async function cancelDiscountRequest(): Promise<void> {
    if (!discountRequest) return;
    try {
      if (discountRequest.status === "PENDING") {
        await clientFetch(`/api/sales/discount-requests/${discountRequest.id}`, {
          method: "DELETE",
        });
      }
    } catch {
      /* best-effort */
    } finally {
      setDiscountRequest(null);
    }
  }

  // -------- Vale-troca --------
  async function validateStoreCredit(): Promise<void> {
    const code = creditCodeInput.trim().toUpperCase();
    if (!code) return;
    if (!customerId) {
      setError("Selecione o cliente dono do vale-troca antes de aplicar.");
      return;
    }
    setIsValidatingCredit(true);
    setError(null);
    try {
      const res = await clientFetch<PaginatedResponse<StoreCreditInfo>>(
        `/api/sales/store-credits?code=${encodeURIComponent(code)}&customerId=${encodeURIComponent(customerId)}`,
      );
      const credit = res.data[0];
      if (!credit) {
        setError("Vale-troca não encontrado, já utilizado ou não pertence ao cliente.");
        return;
      }
      setAppliedCredit(credit);
      setCreditCodeInput("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao validar vale-troca.");
    } finally {
      setIsValidatingCredit(false);
    }
  }

  // -------- Cliente inline --------
  async function handleCreateCustomer(): Promise<void> {
    const name = newCust.name.trim();
    const phoneDigits = newCust.phone.replace(/\D/g, "");
    if (!name || !phoneDigits) return;
    setIsCreatingCustomer(true);
    setError(null);
    try {
      const created = await clientFetch<Customer>("/api/customers", {
        method: "POST",
        body: { fullName: name, phone: phoneDigits },
      });
      setCustomers((prev) => [...prev, created]);
      setCustomerId(created.id);
      setShowNewCustomer(false);
      setNewCust({ name: "", phone: "" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao cadastrar cliente.");
    } finally {
      setIsCreatingCustomer(false);
    }
  }

  // -------- Pagamento --------
  function openPayment(): void {
    if (cart.length === 0) {
      setError("Adicione itens ao carrinho antes de finalizar.");
      return;
    }
    setError(null);
    setPayments([]);
    setShowPayment(true);
  }

  function addPayment(method: PaymentMethod): void {
    const remaining = Math.max(0, toPay - paidAmount);
    setPayments((prev) => [
      ...prev,
      {
        uid: payUidCounter++,
        method,
        amount: remaining > 0 ? remaining.toFixed(2) : "0",
        installments: 1,
      },
    ]);
  }

  function updatePayment(uid: number, patch: Partial<Payment>): void {
    setPayments((prev) => prev.map((p) => (p.uid === uid ? { ...p, ...patch } : p)));
  }

  function removePayment(uid: number): void {
    setPayments((prev) => prev.filter((p) => p.uid !== uid));
  }

  async function finalize(): Promise<void> {
    if (payments.length === 0 && toPay > 0.01) {
      setError("Adicione pelo menos uma forma de pagamento.");
      return;
    }
    if (missing > 0.01) {
      setError(`Faltam ${formatBRL(missing)} para fechar a venda.`);
      return;
    }
    setIsSubmitting(true);
    setError(null);

    // Ajusta sobra (troco) no último pagamento em CASH, se houver
    const adjusted = payments
      .map((p) => ({
        method: p.method,
        amount: Number(p.amount),
        installments: p.method === "CREDIT" ? p.installments : 1,
      }))
      .filter((p) => p.amount > 0);
    const sum = adjusted.reduce((s, p) => s + p.amount, 0);
    const overpay = sum - toPay;
    if (overpay > 0.01) {
      const idxFromEnd = [...adjusted].reverse().findIndex((p) => p.method === "CASH");
      if (idxFromEnd >= 0) {
        const idx = adjusted.length - 1 - idxFromEnd;
        adjusted[idx] = { ...adjusted[idx], amount: adjusted[idx].amount - overpay };
      }
    }

    try {
      const created = await clientFetch<{
        code: string;
        createdAt: string;
        subtotal: number;
        discountTotal: number;
        total: number;
        customer?: { fullName: string } | null;
      }>("/api/orders", {
        method: "POST",
        body: {
          channel: "STORE",
          customerId: customerId || undefined,
          locationId: locationId || undefined,
          storeCreditCode: appliedCredit?.code,
          discount: discount > 0 ? Math.round(discount * 100) / 100 : undefined,
          discountApprovalId:
            isSeller && discount > 0 && discountRequest?.status === "APPROVED"
              ? discountRequest.id
              : undefined,
          items: cart.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
          payments: adjusted,
        },
      });
      if (RECEIPT_PRINTING) {
        const methodLabel = (m: PaymentMethod): string =>
          PAY_METHODS.find((pm) => pm.value === m)?.label ?? m;
        const paidSum = payments.reduce((s, p) => s + Number(p.amount), 0);
        void printSaleReceipt({
          code: created.code,
          createdAt: created.createdAt ?? new Date().toISOString(),
          customerName: created.customer?.fullName,
          items: cart.map((i) => ({
            name: `${i.productName} ${i.colorName} ${i.sizeName}`.trim(),
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            totalPrice: i.unitPrice * i.quantity,
          })),
          subtotal: num(created.subtotal),
          discountTotal: num(created.discountTotal),
          total: num(created.total),
          payments: adjusted.map((p) => ({
            label: methodLabel(p.method),
            amount: p.amount,
            installments: p.installments,
          })),
          change: Math.max(0, Math.round((paidSum - toPay) * 100) / 100),
        });
      }
      setSuccess("Venda concluída com sucesso!");
      clearCart();
      setCustomerId("");
      setShowPayment(false);
      setTimeout(() => setSuccess(null), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao finalizar venda.");
    } finally {
      setIsSubmitting(false);
    }
  }

  // ----------------------------------------------------------------------------
  // Render
  // ----------------------------------------------------------------------------

  if (isLoadingOptions) return <LoadingSpinner />;

  const hasSearch = search.trim().length >= 2;
  const showResults = hasSearch;
  const showCart = !hasSearch && cart.length > 0;
  const showEmpty = !hasSearch && cart.length === 0;

  return (
    <div className="-m-4 sm:-m-6 md:-m-8 flex min-h-[calc(100vh-4rem)] flex-col bg-gray-50 lg:h-[calc(100vh-4rem)] lg:min-h-0 lg:flex-row">
      {/* ============== COLUNA PRINCIPAL ============== */}
      <div className="flex flex-1 flex-col p-3 pb-40 sm:p-4 lg:p-6 lg:pb-6">
        {/* Header */}
        <div className="mb-3 flex flex-wrap items-center gap-2 sm:gap-3">
          <h1 className="flex-1 text-lg font-bold text-gray-900 sm:text-xl">PDV — Nova Venda</h1>
          <button
            type="button"
            onClick={() => router.push("/dashboard/vendas/troca")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-brand-300 bg-brand-50 px-2.5 py-2 text-xs font-medium text-brand-700 hover:bg-brand-100 sm:px-3"
          >
            <RefreshCcw size={14} />
            Troca
          </button>
          <button
            type="button"
            onClick={() => router.push("/dashboard/vendas/historico?aba=pedidos")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 sm:px-3"
          >
            <ClipboardList size={14} />
            <span className="hidden sm:inline">Histórico de </span>Pedidos
          </button>
          <button
            type="button"
            onClick={() => router.push("/dashboard/vendas/historico?aba=vendas")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 sm:px-3"
          >
            <Receipt size={14} />
            <span className="hidden sm:inline">Histórico de </span>Vendas
          </button>
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
            size={18}
          />
          <input
            ref={searchInputRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void handleScan();
              }
            }}
            placeholder="Leia o código de barras ou busque por nome, SKU, cor ou tamanho..."
            className="w-full rounded-xl border border-gray-300 bg-white py-3 pl-11 pr-20 text-sm shadow-sm transition focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
          <kbd className="absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-gray-300 bg-gray-50 px-2 py-0.5 text-xs text-gray-500 sm:inline">
            Ctrl+K
          </kbd>
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-12 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              aria-label="Limpar busca"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Resultados de busca / Carrinho / Estado vazio */}
        {showResults && (
          <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-gray-200 bg-white">
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-2 text-xs text-gray-500">
              <span>{searchResults.length} resultado(s) para &quot;{search}&quot;</span>
              {isSearching && <Loader2 className="animate-spin" size={14} />}
            </div>
            <div className="flex-1 overflow-y-auto">
              {searchResults.length === 0 && !isSearching ? (
                <div className="flex h-full flex-col items-center justify-center p-12 text-center text-sm text-gray-400">
                  Nenhuma variante encontrada para &quot;{search}&quot;.
                </div>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {searchResults.map((v) => {
                    const available = getAvailable(v);
                    const price = num(v.product.basePrice) + num(v.additionalCost);
                    return (
                      <li key={v.id}>
                        <button
                          type="button"
                          disabled={available < 1}
                          onClick={() => addToCart(v)}
                          className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <span
                            className="h-9 w-9 shrink-0 rounded-full border border-gray-200"
                            style={{ background: v.color.hexValue ?? "#e5e7eb" }}
                            title={v.color.name}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-semibold text-gray-900">
                              {v.product.name}
                            </div>
                            <div className="truncate text-xs text-gray-500">
                              {v.sku} · {v.color.name} / {v.size.name} · Estoque: {available} UN
                            </div>
                            {v.barcode && (
                              <div className="truncate font-mono text-[11px] text-gray-400">
                                {v.barcode}
                              </div>
                            )}
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-bold text-brand-700">
                              {formatBRL(price)}
                            </div>
                            {available < 1 && (
                              <div className="text-[10px] font-semibold text-red-600">
                                Sem estoque
                              </div>
                            )}
                          </div>
                          <Plus size={16} className="text-gray-400" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        )}

        {showEmpty && (
          <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center">
            <Search size={36} className="mb-3 text-gray-300" />
            <p className="text-sm font-semibold text-gray-700">Comece uma nova venda</p>
            <p className="mt-1 max-w-xs text-xs text-gray-500">
              Use a busca acima ou pressione Ctrl+K para encontrar produtos por nome, SKU, cor ou tamanho.
            </p>
          </div>
        )}

        {showCart && (
          <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-gray-200 bg-white">
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-2">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                <ShoppingCart size={16} />
                Carrinho ({itemCount} {itemCount === 1 ? "item" : "itens"})
              </h2>
              <button
                type="button"
                onClick={clearCart}
                className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-800"
              >
                <X size={12} /> Limpar
              </button>
            </div>
            <ul className="flex-1 divide-y divide-gray-100 overflow-y-auto">
              {cart.map((i) => (
                <li key={i.variantId} className="flex flex-wrap items-center gap-2 px-3 py-3 sm:flex-nowrap sm:gap-3 sm:px-4">
                  <span
                    className="h-9 w-9 shrink-0 rounded-full border border-gray-200"
                    style={{ background: i.colorHex ?? "#e5e7eb" }}
                    title={i.colorName}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-gray-900">
                      {i.productName}
                    </div>
                    <div className="truncate text-xs text-gray-500">
                      {i.sku} · {i.colorName} / {i.sizeName} · {formatBRL(i.unitPrice)} / UN
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => changeQty(i.variantId, -1)}
                      className="rounded-full border border-gray-300 p-1.5 hover:bg-gray-100"
                      aria-label="Diminuir"
                    >
                      <Minus size={14} />
                    </button>
                    <input
                      type="number"
                      min={1}
                      max={i.available}
                      value={i.quantity}
                      onChange={(e) => setQty(i.variantId, Number(e.target.value))}
                      className="w-12 rounded border border-gray-300 px-1 py-1 text-center text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => changeQty(i.variantId, +1)}
                      className="rounded-full border border-gray-300 p-1.5 hover:bg-gray-100"
                      aria-label="Aumentar"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                  <div className="ml-auto w-20 text-right text-sm font-bold text-gray-900 sm:w-24">
                    {formatBRL(i.unitPrice * i.quantity)}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeFromCart(i.variantId)}
                    className="rounded p-1.5 text-red-500 hover:bg-red-50"
                    aria-label="Remover"
                  >
                    <Trash2 size={16} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* ============== SIDEBAR DE PEDIDO (mobile: bottom bar fixa | desktop: aside) ============== */}
      <aside className="fixed inset-x-0 bottom-0 z-30 flex shrink-0 flex-col gap-2 border-t border-gray-200 bg-white p-3 shadow-[0_-4px_12px_rgba(0,0,0,0.05)] sm:gap-3 lg:relative lg:inset-auto lg:w-80 lg:gap-3 lg:border-l lg:border-t-0 lg:p-6 lg:shadow-none">
        {/* Totais */}
        <div className="space-y-1.5 lg:space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">Subtotal</span>
            <span className="font-semibold text-gray-900">{formatBRL(subtotal)}</span>
          </div>
          {isSeller ? (
            <div className="space-y-1.5">
              {!discountRequest && (
                <button
                  type="button"
                  onClick={() => setShowDiscountModal(true)}
                  disabled={cart.length === 0}
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-brand-300 bg-brand-50 px-3 py-2 text-xs font-semibold text-brand-700 hover:bg-brand-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <BadgePercent size={14} />
                  Solicitar desconto
                </button>
              )}
              {discountRequest?.status === "PENDING" && (
                <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-800">
                    <Loader2 className="animate-spin" size={13} />
                    Aguardando aprovação...
                  </span>
                  <button
                    type="button"
                    onClick={() => void cancelDiscountRequest()}
                    className="rounded p-1 text-amber-700 hover:bg-amber-100"
                    aria-label="Cancelar solicitação"
                  >
                    <X size={13} />
                  </button>
                </div>
              )}
              {discountRequest?.status === "APPROVED" && !discountRequest.expired && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                  <span className="font-semibold">
                    Desconto aprovado por {discountRequest.approvedBy?.name ?? "admin"}:
                  </span>{" "}
                  {discountRequest.discountType === "PERCENT"
                    ? `${discountRequest.discountValue}% (${formatBRL(approvedDiscount)})`
                    : formatBRL(approvedDiscount)}
                </div>
              )}
              {(discountRequest?.status === "REJECTED" ||
                discountRequest?.status === "CANCELLED" ||
                (discountRequest?.status === "APPROVED" && discountRequest.expired)) && (
                <div className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                  <span className="text-xs font-medium text-red-700">
                    {discountRequest.status === "REJECTED"
                      ? "Desconto rejeitado."
                      : discountRequest.status === "CANCELLED"
                        ? "Solicitação cancelada."
                        : "Aprovação expirada."}
                  </span>
                  <button
                    type="button"
                    onClick={() => setDiscountRequest(null)}
                    className="text-xs font-semibold text-red-700 underline hover:text-red-900"
                  >
                    Nova solicitação
                  </button>
                </div>
              )}
              {discount > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Desconto</span>
                  <span className="font-semibold text-emerald-700">− {formatBRL(discount)}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="text-gray-600">Desconto</span>
              <div className="flex items-center gap-2">
                <div className="inline-flex overflow-hidden rounded-lg border border-gray-300">
                  <button
                    type="button"
                    onClick={() => setDiscountMode("AMOUNT")}
                    className={`px-2.5 py-1 text-xs font-semibold transition ${
                      discountMode === "AMOUNT"
                        ? "bg-brand-600 text-white"
                        : "bg-white text-gray-600 hover:bg-gray-50"
                    }`}
                    aria-pressed={discountMode === "AMOUNT"}
                  >
                    R$
                  </button>
                  <button
                    type="button"
                    onClick={() => setDiscountMode("PERCENT")}
                    className={`px-2.5 py-1 text-xs font-semibold transition ${
                      discountMode === "PERCENT"
                        ? "bg-brand-600 text-white"
                        : "bg-white text-gray-600 hover:bg-gray-50"
                    }`}
                    aria-pressed={discountMode === "PERCENT"}
                  >
                    %
                  </button>
                </div>
                {discountMode === "PERCENT" ? (
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={100}
                    step={1}
                    value={discountPercent}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, "");
                      if (!digits) {
                        setDiscountPercent("0");
                        return;
                      }
                      setDiscountPercent(String(Math.min(100, Number(digits))));
                    }}
                    aria-label="Desconto em percentual"
                    className="w-20 rounded border border-gray-300 px-2 py-1 text-right text-sm focus:border-brand-500 focus:outline-none"
                  />
                ) : (
                  <MoneyInput
                    value={discountAmount}
                    onChange={setDiscountAmount}
                    aria-label="Desconto em reais"
                    className="w-24 rounded border border-gray-300 px-2 py-1 text-right text-sm focus:border-brand-500 focus:outline-none sm:w-28"
                  />
                )}
              </div>
            </div>
          )}
        </div>

        {!isSeller && discountMode === "PERCENT" && manualDiscount > 0 && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-500">Desconto aplicado</span>
            <span className="font-semibold text-emerald-700">− {formatBRL(manualDiscount)}</span>
          </div>
        )}

        <hr className="my-0.5 border-gray-200 lg:my-1" />

        <div className="flex items-baseline justify-between">
          <span className="text-sm font-semibold text-gray-700">TOTAL</span>
          <span className="text-2xl font-bold text-brand-600 sm:text-3xl">{formatBRL(total)}</span>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}
        {success && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
            {success}
          </div>
        )}

        <button
          type="button"
          onClick={openPayment}
          disabled={cart.length === 0}
          className="mt-1 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-3 text-sm font-bold text-white shadow-lg transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50 lg:mt-auto lg:py-3.5"
        >
          <CreditCard size={18} />
          PAGAMENTO
        </button>
      </aside>

      {/* ============== MODAL: SOLICITAR DESCONTO ============== */}
      {showDiscountModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
          <div className="w-full max-w-sm rounded-t-2xl bg-white p-4 shadow-xl sm:rounded-xl sm:p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Solicitar desconto</h3>
              <button
                type="button"
                onClick={() => setShowDiscountModal(false)}
                className="rounded p-1 text-gray-500 hover:bg-gray-100"
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>
            <div className="mb-4 flex items-baseline justify-between rounded-lg bg-gray-50 px-3 py-2">
              <span className="text-sm text-gray-600">Total do carrinho</span>
              <span className="text-lg font-bold text-gray-900">{formatBRL(subtotal)}</span>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">
                Motivo <span className="font-normal text-gray-400">(opcional)</span>
              </label>
              <textarea
                autoFocus
                value={discountReason}
                onChange={(e) => setDiscountReason(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder="Ex.: cliente fiel, peça com pequeno defeito..."
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowDiscountModal(false)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void requestDiscount()}
                disabled={isRequestingDiscount || subtotal <= 0}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {isRequestingDiscount && <Loader2 className="animate-spin" size={14} />}
                Enviar solicitação
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============== MODAL: NOVO CLIENTE ============== */}
      {showNewCustomer && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
          <div className="w-full max-w-sm rounded-t-2xl bg-white p-4 shadow-xl sm:rounded-xl sm:p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Novo cliente</h3>
              <button
                type="button"
                onClick={() => setShowNewCustomer(false)}
                className="rounded p-1 text-gray-500 hover:bg-gray-100"
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  Nome *
                </label>
                <input
                  autoFocus
                  value={newCust.name}
                  onChange={(e) => setNewCust({ ...newCust, name: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  Telefone *
                </label>
                <input
                  value={newCust.phone}
                  onChange={(e) => setNewCust({ ...newCust, phone: e.target.value })}
                  placeholder="11999999999"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
                />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowNewCustomer(false)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleCreateCustomer}
                disabled={
                  isCreatingCustomer ||
                  !newCust.name.trim() ||
                  !newCust.phone.replace(/\D/g, "")
                }
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {isCreatingCustomer && <Loader2 className="animate-spin" size={14} />}
                Cadastrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============== MODAL: PAGAMENTO ============== */}
      {showPayment && (
        <div className="fixed inset-0 z-60 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4">
          <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-4 shadow-xl sm:rounded-xl sm:p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Pagamento</h3>
              <button
                type="button"
                onClick={() => setShowPayment(false)}
                className="rounded p-1 text-gray-500 hover:bg-gray-100"
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mb-4 flex items-baseline justify-between border-b border-gray-200 pb-3">
              <span className="text-sm font-semibold text-gray-700">Total</span>
              <span className="text-3xl font-bold text-brand-600">{formatBRL(total)}</span>
            </div>

            {/* Cliente (opcional) */}
            <div className="mb-4 space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Cliente <span className="font-normal normal-case text-gray-400">(opcional)</span>
              </label>
              <div className="flex gap-1.5">
                <select
                  value={customerId}
                  onChange={(e) => {
                    setCustomerId(e.target.value);
                    if (appliedCredit && appliedCredit.customerId !== e.target.value) {
                      setAppliedCredit(null);
                    }
                  }}
                  className="flex-1 rounded-lg border border-gray-300 px-2 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
                >
                  <option value="">Consumidor Final</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.fullName}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setShowNewCustomer(true)}
                  className="rounded-lg border border-gray-300 p-2 text-gray-700 hover:bg-gray-50"
                  title="Cadastrar novo cliente"
                  aria-label="Novo cliente"
                >
                  <UserIcon size={16} />
                </button>
              </div>
            </div>

            {/* Vale-troca */}
            <div className="mb-4 space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Vale-troca <span className="font-normal normal-case text-gray-400">(opcional)</span>
              </label>
              {appliedCredit ? (
                <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
                  <div className="flex items-center gap-2 text-xs text-emerald-800">
                    <Ticket size={14} />
                    <span className="font-semibold">{appliedCredit.code}</span>
                    <span>· saldo {formatBRL(appliedCredit.remainingAmount)}</span>
                    <span>· usando {formatBRL(creditApplied)}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAppliedCredit(null)}
                    className="rounded p-1 text-emerald-700 hover:bg-emerald-100"
                    aria-label="Remover vale-troca"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <div className="flex gap-1.5">
                  <input
                    value={creditCodeInput}
                    onChange={(e) => setCreditCodeInput(e.target.value.toUpperCase())}
                    placeholder="Código do vale (ex.: VLT-2608-XXXXXX)"
                    className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm uppercase focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
                  />
                  <button
                    type="button"
                    onClick={validateStoreCredit}
                    disabled={isValidatingCredit || !creditCodeInput.trim()}
                    className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {isValidatingCredit ? (
                      <Loader2 className="animate-spin" size={14} />
                    ) : (
                      <Ticket size={14} />
                    )}
                    Aplicar
                  </button>
                </div>
              )}
            </div>

            <div className="mb-4 grid grid-cols-2 gap-2">
              {PAY_METHODS.map((m) => {
                const Icon = m.icon;
                return (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => addPayment(m.value)}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-3 text-sm font-medium transition hover:border-brand-500 hover:bg-brand-50"
                  >
                    <Icon size={16} /> {m.label}
                  </button>
                );
              })}
            </div>

            {payments.length > 0 && (
              <div className="mb-4 space-y-2">
                {payments.map((p) => {
                  const meta = PAY_METHODS.find((m) => m.value === p.method)!;
                  return (
                    <div key={p.uid} className="flex items-center gap-2">
                      <span className="rounded-full border border-brand-300 bg-brand-50 px-2 py-1 text-xs font-medium text-brand-700">
                        {meta.label}
                      </span>
                      <MoneyInput
                        value={p.amount}
                        onChange={(v) => updatePayment(p.uid, { amount: v })}
                        className="flex-1 rounded border border-gray-300 px-2 py-1 text-right text-sm focus:border-brand-500 focus:outline-none"
                      />
                      {p.method === "CREDIT" && (
                        <select
                          value={p.installments}
                          onChange={(e) =>
                            updatePayment(p.uid, { installments: Number(e.target.value) })
                          }
                          className="rounded border border-gray-300 px-1 py-1 text-xs"
                          aria-label="Parcelas"
                        >
                          {Array.from({ length: 12 }, (_, k) => k + 1).map((n) => (
                            <option key={n} value={n}>
                              {n}x
                            </option>
                          ))}
                        </select>
                      )}
                      <button
                        type="button"
                        onClick={() => removePayment(p.uid)}
                        className="rounded p-1 text-red-500 hover:bg-red-50"
                        aria-label="Remover"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="mb-4 space-y-1 border-t border-gray-200 pt-3 text-sm">
              {creditApplied > 0 && (
                <>
                  <div className="flex justify-between text-emerald-700">
                    <span>Vale-troca</span>
                    <span className="font-semibold">− {formatBRL(creditApplied)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">A pagar</span>
                    <span className="font-semibold text-gray-900">{formatBRL(toPay)}</span>
                  </div>
                </>
              )}
              <div className="flex justify-between">
                <span className="text-gray-600">Pago</span>
                <span className="font-semibold text-gray-900">{formatBRL(paidAmount)}</span>
              </div>
              {missing > 0.01 && (
                <div className="flex justify-between text-red-600">
                  <span>Falta</span>
                  <span className="font-semibold">{formatBRL(missing)}</span>
                </div>
              )}
              {change > 0.01 && (
                <div className="flex justify-between text-emerald-700">
                  <span>Troco</span>
                  <span className="font-semibold">{formatBRL(change)}</span>
                </div>
              )}
            </div>

            {error && (
              <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {error}
              </div>
            )}

            <button
              type="button"
              onClick={finalize}
              disabled={isSubmitting || (payments.length === 0 && toPay > 0.01) || missing > 0.01}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-3.5 text-sm font-bold text-white shadow-lg transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? (
                <Loader2 className="animate-spin" size={16} />
              ) : (
                <Check size={16} />
              )}
              Finalizar Venda
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
