import type { Prisma } from "@prisma/client";
import { allocateCents } from "@/lib/allocations";
import { toCents } from "@/lib/money";

/** Nas mutações, chamar depois de lockOrder. Leituras servem apenas como estimativa para a interface. */
export async function getReturnBalances(tx: Prisma.TransactionClient, orderId: string, excludeReturnId?: string) {
  const [order, exchanges, returns] = await Promise.all([
    tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: { orderBy: { id: "asc" } } } }),
    tx.exchange.findMany({ where: { orderId }, select: { returnedItems: true } }),
    tx.returnRequest.findMany({
      where: { orderId, deletedAt: null, status: { not: "REJECTED" }, ...(excludeReturnId && { id: { not: excludeReturnId } }) },
      include: { items: true },
    }),
  ]);
  const used = new Map<string, number>();
  const settled = new Map<string, number>();
  const add = (id: string, qty: number) => used.set(id, (used.get(id) ?? 0) + qty);
  for (const exchange of exchanges) {
    for (const item of exchange.returnedItems as Array<{ orderItemId: string; quantity: number }>) { add(item.orderItemId, item.quantity); settled.set(item.orderItemId, (settled.get(item.orderItemId) ?? 0) + item.quantity); }
  }
  for (const request of returns) for (const item of request.items) { add(item.orderItemId, item.quantity); if (request.status === "RESOLVED") settled.set(item.orderItemId, (settled.get(item.orderItemId) ?? 0) + item.quantity); }
  // Recalcula também pedidos legados, cujos itens não receberam o desconto do cabeçalho.
  const stored = order.items.map(item => toCents(item.totalPrice));
  const payable = Math.max(0, toCents(order.total) - toCents(order.shippingCost));
  const totals = stored.reduce((sum, value) => sum + value, 0) === payable ? stored : allocateCents(Math.max(0, toCents(order.total) - toCents(order.shippingCost)), order.items.map((i) => toCents(i.unitPrice) * i.quantity));
  return new Map(order.items.map((item, index) => [item.id, {
    ...item, settled: settled.get(item.id) ?? 0, used: used.get(item.id) ?? 0, netCents: totals[index],
    remaining: Math.max(0, item.quantity - (used.get(item.id) ?? 0)),
  }]));
}
