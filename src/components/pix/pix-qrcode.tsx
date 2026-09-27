"use client";

import { useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Check, Copy } from "lucide-react";

import { generatePixPayload } from "@/lib/pix";
import { formatBRL } from "@/lib/format";

interface PixQRCodeProps {
  pixKey: string;
  merchantName: string;
  merchantCity: string;
  amount: number;
  txid?: string;
  description?: string;
  /** Título acima do QR Code. Vazio esconde o cabeçalho. */
  title?: string;
  /** Exibe nome e chave do beneficiário abaixo do valor, para conferência. */
  showBeneficiary?: boolean;
  /** Lado do QR Code em pixels. */
  size?: number;
}

export function PixQRCode({
  pixKey,
  merchantName,
  merchantCity,
  amount,
  txid,
  description,
  title = "Pagamento via Pix",
  showBeneficiary = false,
  size = 200,
}: PixQRCodeProps): React.JSX.Element | null {
  const [copied, setCopied] = useState(false);

  const payload = useMemo(
    () =>
      generatePixPayload({
        pixKey,
        merchantName,
        merchantCity,
        amount,
        txid,
        description,
      }),
    [pixKey, merchantName, merchantCity, amount, txid, description],
  );

  async function handleCopy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(payload);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard bloqueado pelo navegador — o QR Code continua utilizável */
    }
  }

  if (amount <= 0) return null;

  return (
    <div className="space-y-3">
      {title ? (
        <h3 className="text-[13px] font-bold text-gray-900">{title}</h3>
      ) : null}

      <div className="flex flex-col items-center gap-3 rounded-xl border border-gray-200 bg-gray-50/60 p-4">
        <div className="rounded-lg bg-white p-3 shadow-sm">
          <QRCodeSVG value={payload} size={size} level="M" />
        </div>

        <p className="text-lg font-bold text-gray-900">{formatBRL(amount)}</p>

        {showBeneficiary ? (
          <div className="w-full border-t border-gray-200 pt-3 text-center">
            <p className="text-[12.5px] font-semibold uppercase text-gray-800">
              {merchantName}
            </p>
            <p className="break-all text-[11px] text-gray-500">{pixKey}</p>
          </div>
        ) : null}

        <p className="text-center text-[11.5px] font-medium text-gray-500">
          Escaneie o QR Code com o app do seu banco
        </p>

        <button
          type="button"
          onClick={() => void handleCopy()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-[12.5px] font-semibold text-gray-700 transition hover:bg-gray-50"
        >
          {copied ? (
            <>
              <Check className="h-4 w-4 text-emerald-600" /> Copiado!
            </>
          ) : (
            <>
              <Copy className="h-4 w-4" /> Copiar código Pix
            </>
          )}
        </button>
      </div>
    </div>
  );
}
