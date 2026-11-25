import { MAX_COPIES, type ProductLabelData } from "../../print-service/label-layout";

export const MAX_LABEL_COPIES = MAX_COPIES;

export interface StockPositionQuantity {
  quantity: number;
}

/** Soma a quantidade física registrada em todas as posições de estoque da variante. */
export function totalStockQuantity(positions?: readonly StockPositionQuantity[] | null): number {
  if (!positions || positions.length === 0) return 0;
  return positions.reduce((sum, pos) => sum + Math.max(0, Math.floor(Number(pos.quantity) || 0)), 0);
}

/** Garante número inteiro dentro do intervalo permitido para cópias de etiqueta. */
export function clampLabelCopies(value: number, min = 0): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(MAX_LABEL_COPIES, Math.floor(value)));
}

/**
 * Cópias padrão ao selecionar uma variante individual (ex.: tela de etiquetas em lote):
 * usa a quantidade em estoque (limitada a 99), ou 1 se estiver zerada.
 */
export function defaultCopiesForStock(quantity: number): number {
  const normalized = Number.isFinite(quantity) ? Math.floor(quantity) : 0;
  return normalized > 0 ? clampLabelCopies(normalized, 1) : 1;
}

/**
 * Cópias padrão para um conjunto de variantes de um produto (cadastro ou detalhe):
 * - Se houver ao menos uma variante com quantidade > 0, usa a quantidade de cada uma
 *   (variantes com 0 ficam com 0 cópias para não imprimir etiqueta de tamanho sem peça).
 * - Se todas estiverem zeradas, usa 1 cópia por variante como fallback.
 */
export function defaultLabelCopies(quantities: readonly number[]): number[] {
  const normalized = quantities.map((q) => (Number.isFinite(q) ? Math.max(0, Math.floor(q)) : 0));
  const hasPositive = normalized.some((q) => q > 0);
  if (!hasPositive) return normalized.map(() => 1);
  return normalized.map((q) => clampLabelCopies(q, 0));
}

/** Remove etiquetas com 0 cópias e normaliza o restante para envio à impressão. */
export function prepareLabelsForPrint<T extends ProductLabelData>(
  items: readonly (T & { copies: number })[],
): ProductLabelData[] {
  const prepared: ProductLabelData[] = [];
  for (const item of items) {
    const copies = clampLabelCopies(item.copies, 0);
    if (copies <= 0) continue;
    prepared.push({
      productName: item.productName,
      colorName: item.colorName,
      sizeName: item.sizeName,
      price: item.price,
      barcode: item.barcode,
      sku: item.sku,
      copies,
    });
  }
  return prepared;
}
