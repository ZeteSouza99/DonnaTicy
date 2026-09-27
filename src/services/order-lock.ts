import type { Order, Prisma } from "@prisma/client";
import { NotFoundError } from "@/lib/errors";

/** Serializa alterações de pedido, financeiro, troca e devolução na mesma transação. */
export async function lockOrder(tx: Prisma.TransactionClient, id: string): Promise<Order> {
  await tx.$queryRaw`SELECT id FROM orders WHERE id = ${id} FOR UPDATE`;
  const order = await tx.order.findFirst({ where: { id, deletedAt: null } });
  if (!order) throw new NotFoundError("Pedido");
  return order;
}