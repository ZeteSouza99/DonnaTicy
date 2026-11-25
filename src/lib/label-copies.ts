export const MAX_LABEL_COPIES = 99;

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

/** Cópias ao selecionar uma variante avulsa: a quantidade em estoque, ou 1 se estiver zerada. */
export function defaultCopiesForStock(quantity: number): number {
  const normalized = Number.isFinite(quantity) ? Math.floor(quantity) : 0;
  return normalized > 0 ? clampLabelCopies(normalized, 1) : 1;
}

/**
 * Cópias para as variantes de um produto: a quantidade de cada uma (0 não imprime);
 * se todas estiverem zeradas, 1 por variante.
 */
export function defaultLabelCopies(quantities: readonly number[]): number[] {
  const normalized = quantities.map((q) => (Number.isFinite(q) ? Math.max(0, Math.floor(q)) : 0));
  if (!normalized.some((q) => q > 0)) return normalized.map(() => 1);
  return normalized.map((q) => clampLabelCopies(q, 0));
}

/** Repete cada item conforme suas cópias, na ordem recebida, para montar a folha de impressão. */
export function expandLabelCopies<T extends { copies: number }>(items: readonly T[]): T[] {
  return items.flatMap((item) => Array.from({ length: clampLabelCopies(item.copies, 0) }, () => item));
}
