"use client";

import { useEffect, useState } from "react";
import { ChevronUp, QrCode } from "lucide-react";

import { PixQRCode } from "./pix-qrcode";
import {
  SYSTEM_SUBSCRIPTION,
  describeDue,
  getSubscriptionCycle,
  type SubscriptionCycle,
} from "@/lib/subscription";
import { formatBRL, formatDate } from "@/lib/format";

/**
 * Resolve o ciclo apenas no cliente: calcular no servidor faria o HTML inicial
 * divergir quando o fuso do deploy for diferente do fuso do usuário.
 */
export function useSubscriptionCycle(): SubscriptionCycle | null {
  const [cycle, setCycle] = useState<SubscriptionCycle | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCycle(getSubscriptionCycle());
  }, []);
  return cycle;
}

/** QR Code da mensalidade, já preenchido com beneficiário, valor e competência. */
export function SubscriptionPixQRCode({
  cycle,
  size,
  title,
}: {
  cycle: SubscriptionCycle;
  size?: number;
  title?: string;
}): React.JSX.Element {
  return (
    <PixQRCode
      title={title ?? ""}
      pixKey={SYSTEM_SUBSCRIPTION.pixKey}
      merchantName={SYSTEM_SUBSCRIPTION.beneficiaryName}
      merchantCity={SYSTEM_SUBSCRIPTION.beneficiaryCity}
      amount={SYSTEM_SUBSCRIPTION.amount}
      txid={cycle.txid}
      description={SYSTEM_SUBSCRIPTION.category}
      size={size}
      showBeneficiary
    />
  );
}

/** Card da mensalidade com o QR Code expansível. Usado na tela Financeiro. */
export function SubscriptionPixCard(): React.JSX.Element | null {
  const cycle = useSubscriptionCycle();
  const [open, setOpen] = useState(false);

  if (!cycle) return null;

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-bold text-gray-900">
            {SYSTEM_SUBSCRIPTION.description}
          </h2>
          <p className="mt-0.5 text-[12.5px] font-medium text-gray-500">
            {formatBRL(SYSTEM_SUBSCRIPTION.amount)} · vencimento{" "}
            {formatDate(cycle.dueDate)}
          </p>
          <p
            className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${
              cycle.isOverdue
                ? "bg-red-50 text-red-600"
                : cycle.shouldNotify
                  ? "bg-amber-50 text-amber-600"
                  : "bg-gray-100 text-gray-500"
            }`}
          >
            {describeDue(cycle)}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-[12.5px] font-semibold text-white transition hover:bg-brand-700"
        >
          {open ? (
            <>
              <ChevronUp className="h-4 w-4" /> Ocultar QR Code
            </>
          ) : (
            <>
              <QrCode className="h-4 w-4" /> Pagar com Pix
            </>
          )}
        </button>
      </div>

      {open ? (
        <div className="mt-4 max-w-xs">
          <SubscriptionPixQRCode cycle={cycle} />
        </div>
      ) : null}
    </section>
  );
}
