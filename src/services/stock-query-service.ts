import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export function lowStockWhere(locationId?: string, variantId?: string, search?: string) {
  return Prisma.sql`p.deleted_at IS NULL AND v.deleted_at IS NULL AND l.deleted_at IS NULL AND l.is_active = true
    AND sp.min_stock > 0 AND sp.quantity - sp.reserved_qty <= sp.min_stock
    AND (${locationId ?? null}::text IS NULL OR sp.location_id = ${locationId ?? null})
    AND (${variantId ?? null}::text IS NULL OR sp.variant_id = ${variantId ?? null})
    AND (${search ?? null}::text IS NULL OR p.name ILIKE ${`%${search ?? ""}%`} OR v.sku ILIKE ${`%${search ?? ""}%`})`;
}
export const stockJoins = Prisma.sql`FROM stock_positions sp JOIN product_variants v ON v.id = sp.variant_id JOIN products p ON p.id = v.product_id JOIN locations l ON l.id = sp.location_id`;
export async function lowStockCount(locationId?: string, variantId?: string, search?: string) {
  const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*) AS count ${stockJoins} WHERE ${lowStockWhere(locationId, variantId, search)}`;
  return Number(rows[0]?.count ?? 0);
}
