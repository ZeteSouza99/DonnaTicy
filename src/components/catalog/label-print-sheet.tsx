"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Barcode } from "@/components/ui/barcode";
import { formatBRL } from "@/lib/format";

export interface PrintableLabel {
  key: string;
  productName: string;
  colorName?: string | null;
  sizeName?: string | null;
  price: number;
  barcode: string | null;
  sku: string;
}

const PRINTING_CLASS = "printing-labels";

const subscribe = (): (() => void) => () => {};

/**
 * Imprime só a folha de etiquetas (uma página de 80 x 50 mm por etiqueta),
 * escondendo o resto da tela.
 */
export function printLabelSheet(): void {
  const cleanup = (): void => document.body.classList.remove(PRINTING_CLASS);
  document.body.classList.add(PRINTING_CLASS);
  window.addEventListener("afterprint", cleanup, { once: true });
  window.print();
}

/** Folha de impressão das etiquetas; invisível na tela. */
export function LabelPrintSheet({ labels }: { labels: PrintableLabel[] }): React.ReactNode {
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  if (!mounted || labels.length === 0) return null;

  return createPortal(
    <div id="label-print-root" aria-hidden="true">
      {labels.map((label) => (
        <div key={label.key} className="print-label">
          <span className="print-label__name">{label.productName}</span>
          <span className="print-label__variant">
            {[label.colorName, label.sizeName].filter(Boolean).join(" · ") || "—"}
          </span>
          <span className="print-label__price">{formatBRL(label.price)}</span>
          <span className="print-label__barcode">
            {label.barcode ? <Barcode value={label.barcode} moduleWidth={2} height={40} /> : "sem código"}
          </span>
          <span className="print-label__sku">{label.sku}</span>
        </div>
      ))}
    </div>,
    document.body,
  );
}
