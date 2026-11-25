import { Barcode } from "@/components/ui/barcode";
import { formatBRL } from "@/lib/format";

interface ProductLabelProps {
  productName: string;
  colorName?: string | null;
  sizeName?: string | null;
  price: number;
  barcode: string | null;
  sku: string;
}

/** Etiqueta da peça: nome, cor e tamanho, preço de venda, código de barras e SKU. */
export function ProductLabel({ productName, colorName, sizeName, price, barcode, sku }: ProductLabelProps): React.ReactNode {
  return (
    <div className="flex break-inside-avoid flex-col items-center gap-1 rounded-lg border bg-white p-3 text-center">
      <span className="line-clamp-2 text-xs font-semibold text-gray-900">{productName}</span>
      <span className="text-[11px] text-gray-500">
        {[colorName, sizeName].filter(Boolean).join(" · ") || "—"}
      </span>
      <span className="text-lg font-bold leading-tight text-gray-900">{formatBRL(price)}</span>
      {barcode ? (
        <Barcode value={barcode} moduleWidth={1.6} height={40} />
      ) : (
        <span className="py-4 text-xs text-gray-400">sem código</span>
      )}
      <span className="font-mono text-[10px] text-gray-500">{sku}</span>
    </div>
  );
}
