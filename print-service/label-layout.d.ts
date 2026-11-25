export interface ProductLabelData {
  productName: string;
  colorName?: string | null;
  sizeName?: string | null;
  /** Preço de venda em reais. */
  price: number;
  barcode: string | null;
  sku: string;
  /** Padrão 1; de 1 a 99. */
  copies?: number;
}
export const MAX_COPIES: number;
export const MAX_LABELS: number;
export function expandLabels(labels: ProductLabelData[]): ProductLabelData[];
export function variantText(label: ProductLabelData): string;
export function ean13Bits(value: string | null | undefined): string | null;
export function renderProductLabelsHtml(labels: ProductLabelData[]): string;
