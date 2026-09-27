export interface StockQuantities {
  quantity: number;
  reservedQty: number;
}

/** Saldo realmente vendável de uma posição: o físico menos o já reservado. */
export function availableAt(position: StockQuantities): number {
  return position.quantity - position.reservedQty;
}

/** Saldo vendável somado entre todas as localizações. */
export function totalAvailable(positions: readonly StockQuantities[]): number {
  return positions.reduce((sum, position) => sum + availableAt(position), 0);
}

/** Há saldo suficiente para atender a quantidade pedida? */
export function hasEnoughStock(
  positions: readonly StockQuantities[],
  requested: number,
): boolean {
  return totalAvailable(positions) >= requested;
}
