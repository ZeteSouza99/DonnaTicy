"use client";

import { useState } from "react";
import { Loader2, Printer } from "lucide-react";
import { printProductLabels, type ProductLabelData } from "@/lib/print";

interface PrintLabelsButtonProps {
  labels: ProductLabelData[];
  children: React.ReactNode;
  className: string;
  disabled?: boolean;
}

/** Imprime as etiquetas na MP-4200 TH (serviço local ou navegador) e informa o resultado. */
export function PrintLabelsButton({ labels, children, className, disabled }: PrintLabelsButtonProps): React.ReactNode {
  const [isPrinting, setIsPrinting] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  const handlePrint = async (): Promise<void> => {
    setIsPrinting(true);
    setStatus(null);
    try {
      const via = await printProductLabels(labels);
      if (via === "service") setStatus({ ok: true, text: "Enviado para a MP-4200 TH." });
    } catch (err) {
      setStatus({ ok: false, text: err instanceof Error ? err.message : "Falha ao imprimir as etiquetas." });
    } finally {
      setIsPrinting(false);
    }
  };

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {status && (
        <span role="status" className={`text-sm ${status.ok ? "text-green-700" : "text-red-600"}`}>
          {status.text}
        </span>
      )}
      <button
        type="button"
        onClick={() => void handlePrint()}
        disabled={disabled || isPrinting || labels.length === 0}
        className={className}
      >
        {isPrinting ? <Loader2 className="animate-spin" size={16} /> : <Printer size={16} />}
        {children}
      </button>
    </span>
  );
}
