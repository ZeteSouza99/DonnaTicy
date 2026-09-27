import type { Prisma } from "@prisma/client";

interface StockKey {
  locationId: string;
  variantId: string;
}

/** Mesmo ordenamento em vendas, cancelamentos, trocas e devoluções multi-item. */
export async function lockStockPositions(tx: Prisma.TransactionClient, positions: StockKey[]): Promise<void> {
  const keys = new Map(positions.map((position) => [`${position.locationId}:${position.variantId}`, position]));
  for (const key of [...keys.keys()].sort()) {
    const { locationId, variantId } = keys.get(key)!;
    // Serializa também posições ainda inexistentes, que podem ser criadas na devolução.
    await tx.$queryRaw`
      SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`stock:${key}`}, 0))
    `;
    await tx.$queryRaw`
      SELECT id FROM stock_positions
      WHERE location_id = ${locationId} AND variant_id = ${variantId}
      FOR UPDATE
    `;
  }
}