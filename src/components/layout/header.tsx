"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  Search,
  User,
  CalendarDays,
  Menu,
  BadgePercent,
  QrCode,
  ChevronUp,
  Receipt,
} from "lucide-react";
import { REQUIRE_DISCOUNT_APPROVAL } from "@/lib/features";
import {
  SubscriptionPixQRCode,
  useSubscriptionCycle,
} from "@/components/pix/subscription-pix";
import {
  SYSTEM_SUBSCRIPTION,
  describeDue,
  type SubscriptionCycle,
} from "@/lib/subscription";
import { formatBRL } from "@/lib/format";
import { can } from "@/lib/permissions";

interface PendingDiscountRequest {
  id: string;
  cartTotal: number;
  reason: string | null;
  createdAt: string;
  requestedBy: { id: string; name: string };
}

function formatTimeAgo(iso: string): string {
  const diffMin = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000));
  if (diffMin < 1) return "agora";
  if (diffMin === 1) return "há 1 min";
  return `há ${diffMin} min`;
}

interface HeaderProps {
  userName: string;
  role: string;
  onOpenMobileMenu?: () => void;
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

function formatToday(): string {
  return new Date().toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function Header({ userName, role, onOpenMobileMenu }: HeaderProps): React.JSX.Element {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  // Quem aprova desconto no PDV recebe as solicitações pendentes.
  const isAdmin = can(role, "orders", "manage");
  const [pendingDiscounts, setPendingDiscounts] = useState(0);
  const [pendingList, setPendingList] = useState<PendingDiscountRequest[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  // Fecha o painel ao clicar fora
  useEffect(() => {
    if (!notifOpen) return;
    function onClickOutside(e: MouseEvent): void {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [notifOpen]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  // Polling (10s) do count de solicitações de desconto pendentes — só admin
  useEffect(() => {
    if (!isAdmin || !REQUIRE_DISCOUNT_APPROVAL) return;
    let cancelled = false;
    async function poll(): Promise<void> {
      try {
        const r = await fetch("/api/sales/discount-requests?status=PENDING&limit=5", {
          credentials: "include",
        });
        if (!r.ok) return;
        const body = (await r.json()) as { total?: number; data?: PendingDiscountRequest[] };
        if (!cancelled) {
          setPendingDiscounts(body.total ?? 0);
          setPendingList(body.data ?? []);
        }
      } catch {
        /* silencioso */
      }
    }
    void poll();
    const timer = setInterval(poll, 10_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [isAdmin]);

  const showDiscountNotifs = isAdmin && REQUIRE_DISCOUNT_APPROVAL;
  const subscriptionCycle = useSubscriptionCycle();
  const showSubscription = Boolean(subscriptionCycle?.shouldNotify);
  const hasNotifPanel = showDiscountNotifs || showSubscription;
  const notifCount = (showDiscountNotifs ? pendingDiscounts : 0) + (showSubscription ? 1 : 0);

  return (
    <header className="sticky top-0 z-30 border-b border-gray-200/50 bg-white/70 backdrop-blur-lg print:hidden">
      <div className="flex h-16 items-center justify-between px-3 sm:h-20 sm:px-6 md:px-8">
        {/* Left — Hamburguer (mobile) + Greeting */}
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={onOpenMobileMenu}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-100/80 text-gray-600 transition hover:bg-white hover:text-brand-600 hover:shadow-sm md:hidden"
            aria-label="Abrir menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex min-w-0 flex-col">
            <h2 className="truncate text-[14px] font-bold tracking-tight text-gray-900 sm:text-[16px] sm:h-6">
              {mounted ? `${getGreeting()}, ${userName} 👋` : ""}
            </h2>
            <div className="mt-0.5 hidden items-center gap-1.5 text-[12.5px] font-medium text-gray-500 sm:flex sm:h-5">
              <CalendarDays className="h-3.5 w-3.5 text-brand-500" />
              <span className="capitalize">{mounted ? formatToday() : "Carregando data..."}</span>
            </div>
          </div>
        </div>

        {/* Right — Search + Actions */}
        <div className="flex shrink-0 items-center gap-2 sm:gap-4">
          <div className="relative hidden lg:block">
            <Search className="absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar no sistema..."
              className="w-72 rounded-xl border-0 bg-gray-100/80 py-2.5 pl-10 pr-4 text-[13.5px] font-medium text-gray-700 outline-none transition-all placeholder:text-gray-400 focus:bg-white focus:ring-2 focus:ring-brand-500/30 focus:shadow-sm"
            />
          </div>

          <div className="relative" ref={notifRef}>
            <button
              type="button"
              onClick={() => {
                if (hasNotifPanel) setNotifOpen((v) => !v);
              }}
              className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100/80 text-gray-500 transition-all duration-200 hover:bg-white hover:text-brand-600 hover:shadow-sm"
              aria-label={
                notifCount > 0 ? `${notifCount} notificações pendentes` : "Notificações"
              }
              title={hasNotifPanel ? "Notificações" : undefined}
            >
              <Bell className="h-5 w-5" />
              {notifCount > 0 ? (
                <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white ring-2 ring-white">
                  {notifCount > 9 ? "9+" : notifCount}
                </span>
              ) : (
                <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-brand-500 ring-2 ring-white" />
              )}
            </button>

            {hasNotifPanel && notifOpen ? (
              <div className="absolute right-0 top-12 z-50 w-80 overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-xl">
                <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                  <span className="text-[13px] font-bold text-gray-900">Notificações</span>
                  {notifCount > 0 && (
                    <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-600">
                      {notifCount} pendente{notifCount > 1 ? "s" : ""}
                    </span>
                  )}
                </div>

                <div className="max-h-96 overflow-y-auto">
                  {showSubscription && subscriptionCycle ? (
                    <SubscriptionNotificationItem cycle={subscriptionCycle} />
                  ) : null}

                  {showDiscountNotifs ? (
                    pendingList.length === 0 ? (
                      <p className="px-4 py-6 text-center text-[12.5px] font-medium text-gray-400">
                        Nenhuma solicitação pendente.
                      </p>
                    ) : (
                      <ul className="divide-y divide-gray-50">
                        {pendingList.map((req) => (
                          <li key={req.id}>
                            <button
                              type="button"
                              onClick={() => {
                                setNotifOpen(false);
                                router.push("/dashboard/vendas/aprovacoes");
                              }}
                              className="flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-gray-50"
                            >
                              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                                <BadgePercent className="h-4 w-4" />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block text-[12.5px] font-semibold text-gray-800">
                                  {req.requestedBy.name} solicitou desconto
                                </span>
                                <span className="block truncate text-[12px] text-gray-500">
                                  Carrinho de{" "}
                                  {req.cartTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                                  {req.reason ? ` — ${req.reason}` : ""}
                                </span>
                                <span className="block text-[11px] font-medium text-gray-400">
                                  {formatTimeAgo(req.createdAt)}
                                </span>
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )
                  ) : null}
                </div>

                {showDiscountNotifs ? (
                  <button
                    type="button"
                    onClick={() => {
                      setNotifOpen(false);
                      router.push("/dashboard/vendas/aprovacoes");
                    }}
                    className="block w-full border-t border-gray-100 px-4 py-2.5 text-center text-[12.5px] font-bold text-brand-600 transition hover:bg-brand-50"
                  >
                    Ver todas as aprovações
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="hidden h-7 w-px bg-gray-200/80 sm:mx-1 sm:block" />

          <button
            type="button"
            className="flex items-center gap-2 rounded-xl border border-transparent p-1.5 transition-all hover:bg-gray-50 hover:border-gray-100 sm:gap-3 sm:pr-3"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-linear-to-br from-brand-500 to-brand-700 shadow-sm shadow-brand-500/20">
              <User className="h-4 w-4 text-white" />
            </div>
            <span className="hidden text-[13.5px] font-semibold text-gray-700 sm:block">{userName}</span>
          </button>
        </div>
      </div>
    </header>
  );
}

/**
 * Cobrança da mensalidade dentro do painel de notificações: mostra a despesa e,
 * logo abaixo, o QR Code Pix já com o valor e a competência preenchidos.
 */
function SubscriptionNotificationItem({
  cycle,
}: {
  cycle: SubscriptionCycle;
}): React.JSX.Element {
  const [showPix, setShowPix] = useState(false);

  return (
    <div className="border-b border-gray-50 px-4 py-3">
      <div className="flex items-start gap-3">
        <span
          className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
            cycle.isOverdue ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600"
          }`}
        >
          <Receipt className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] font-semibold text-gray-800">
            {SYSTEM_SUBSCRIPTION.description}
          </p>
          <p className="text-[12px] text-gray-500">
            {formatBRL(SYSTEM_SUBSCRIPTION.amount)}
          </p>
          <p
            className={`text-[11px] font-bold ${
              cycle.isOverdue ? "text-red-600" : "text-amber-600"
            }`}
          >
            {describeDue(cycle)}
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setShowPix((v) => !v)}
        className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-[12px] font-semibold text-gray-700 transition hover:bg-gray-50"
      >
        {showPix ? (
          <>
            <ChevronUp className="h-3.5 w-3.5" /> Ocultar QR Code
          </>
        ) : (
          <>
            <QrCode className="h-3.5 w-3.5" /> Pagar com Pix
          </>
        )}
      </button>

      {showPix ? (
        <div className="mt-2">
          <SubscriptionPixQRCode cycle={cycle} size={180} />
        </div>
      ) : null}
    </div>
  );
}
