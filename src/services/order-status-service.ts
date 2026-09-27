import type { Order, OrderStatus, Prisma } from "@prisma/client";
import type { z } from "zod";
import type { JwtPayload } from "@/lib/auth";
import { createAuditLogTx } from "@/lib/audit";
import { ConflictError, ValidationError } from "@/lib/errors";
import { paymentsCoverTotal } from "@/lib/order-totals";
import type { updateOrderStatusSchema } from "@/schemas/sales";
import { lockOrder } from "./order-lock";
import { lockStockPositions } from "./stock-lock";

const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING_PAYMENT: ["PAID", "CANCELLED"],
  PAID: ["PICKING", "CANCELLED"],
  PICKING: ["PACKED", "CANCELLED"],
  PACKED: ["SHIPPED"],
  SHIPPED: ["IN_TRANSIT"],
  IN_TRANSIT: ["OUT_FOR_DELIVERY"],
  OUT_FOR_DELIVERY: ["DELIVERED"],
  DELIVERED: [],
  CANCELLED: [],
};

interface UpdateOrderStatusContext {
  id: string;
  input: z.infer<typeof updateOrderStatusSchema>;
  /** `null` quando a transição é automática (expiração pelo cron). */
  session: JwtPayload | null;
  ipAddress?: string;
}

/** Baixa manual do pagamento de um pedido remoto: recebimentos e receita passam a pagos. */
async function confirmPayment(tx: Prisma.TransactionClient, order: Order, now: Date): Promise<void> {
  const payments = await tx.paymentTransaction.findMany({
    where: { orderId: order.id, status: { in: ["PENDING", "CONFIRMED"] } },
  });
  const covered = payments.reduce((sum, payment) => sum + Number(payment.grossAmount), 0);
  if (!paymentsCoverTotal(covered, Number(order.total))) {
    throw new ConflictError("Os pagamentos do pedido não fecham com o total. Concilie antes de confirmar.");
  }
  await tx.paymentTransaction.updateMany({
    where: { orderId: order.id, status: "PENDING" },
    data: { status: "CONFIRMED", actualReceiptDate: now },
  });
  await tx.financialEntry.updateMany({
    where: { orderId: order.id, type: "REVENUE", status: "PENDING", deletedAt: null },
    data: { status: "PAID", cashDate: now },
  });
}

async function cancelFinancials(tx: Prisma.TransactionClient, order: Order, now: Date) {
  const payments = await tx.paymentTransaction.findMany({ where: { orderId: order.id } });
  const entries = await tx.financialEntry.findMany({ where: { orderId: order.id } });

  // Não tentar adivinhar acertos de trocas, devoluções ou lançamentos alterados manualmente.
  if (
    entries.some((entry) => entry.deletedAt || entry.type !== "REVENUE" || entry.status === "CANCELLED") ||
    payments.some((payment) =>
      (payment.status !== "PENDING" && payment.status !== "CONFIRMED") ||
      (payment.status === "CONFIRMED" && payment.method === "STORE_CREDIT"),
    )
  ) {
    throw new ConflictError("Pedido com acerto financeiro prévio. Concilie os lançamentos antes de cancelar.");
  }

  const received = payments.filter((p) => p.status === "CONFIRMED").reduce((sum, p) => sum + Number(p.grossAmount), 0);
  const paidRevenue = entries.filter((e) => e.status === "PAID").reduce((sum, e) => sum + Number(e.amount), 0);
  const revenue = entries.reduce((sum, e) => sum + Number(e.amount), 0);
  if (!paymentsCoverTotal(revenue, Number(order.total)) || !paymentsCoverTotal(received, paidRevenue)) {
    throw new ConflictError("Receita e pagamentos do pedido divergentes. Concilie os valores antes de cancelar.");
  }

  await tx.paymentTransaction.updateMany({
    where: { orderId: order.id, status: "PENDING" },
    data: { status: "CANCELLED" },
  });
  await tx.financialEntry.updateMany({
    where: { orderId: order.id, type: "REVENUE", status: "PENDING", deletedAt: null },
    data: { status: "CANCELLED", cashDate: null },
  });

  if (received > 0) {
    await tx.financialEntry.create({
      data: {
        type: "REFUND",
        category: "CANCELAMENTO",
        description: `Reembolso do cancelamento ${order.code}`,
        orderId: order.id,
        cancellationOrderId: order.id,
        locationId: order.locationId,
        amount: received,
        competenceDate: now,
        dueDate: now,
        status: "PENDING",
      },
    });
    // Registro de obrigação, NÃO confirmação de estorno bancário.
    await tx.paymentTransaction.updateMany({
      where: { orderId: order.id, status: "CONFIRMED" },
      data: { status: "REFUND_PENDING" },
    });
  }
  return received;
}

async function restoreStoreCredit(tx: Prisma.TransactionClient, order: Order, now: Date): Promise<void> {
  if (order.usedStoreCreditAmount === null) {
    if (Number(order.discountTotal) > 0) {
      throw new ConflictError("Pedido legado com desconto/crédito não rastreado. Concilie o vale-troca antes de cancelar.");
    }
    return;
  }
  const usedAmount = Number(order.usedStoreCreditAmount);
  if (usedAmount <= 0) return;
  if (!order.usedStoreCreditId) {
    throw new ConflictError("Consumo de vale-troca sem vínculo. Concilie o crédito antes de cancelar.");
  }
  await tx.$queryRaw`SELECT id FROM store_credits WHERE id = ${order.usedStoreCreditId} FOR UPDATE`;
  const credit = await tx.storeCredit.findUnique({ where: { id: order.usedStoreCreditId } });
  if (!credit || credit.customerId !== order.customerId || credit.status === "CANCELLED") {
    throw new ConflictError("Vale-troca indisponível para restituição.");
  }
  const creditAmount = Number(credit.amount);
  const remainingAmount = Math.round((Number(credit.remainingAmount) + usedAmount) * 100) / 100;
  if (remainingAmount > creditAmount + 0.01) {
    throw new ConflictError("A restituição excederia o saldo original do vale-troca.");
  }
  await tx.storeCredit.update({
    where: { id: credit.id },
    data: {
      remainingAmount,
      status: credit.expiresAt && credit.expiresAt < now
        ? "EXPIRED"
        : remainingAmount >= creditAmount - 0.009 ? "ACTIVE" : "PARTIALLY_USED",
    },
  });
}

export async function updateOrderStatus(
  tx: Prisma.TransactionClient,
  { id, input, session, ipAddress }: UpdateOrderStatusContext,
) {
  const order = await lockOrder(tx, id);
  // Retry de cancelamento é idempotente: preserva data, auditoria e todos os efeitos.
  if (order.status === "CANCELLED" && input.status === "CANCELLED") return order;
  if (!VALID_TRANSITIONS[order.status].includes(input.status)) {
    throw new ValidationError(`Transição de status inválida: ${order.status} → ${input.status}.`);
  }

  const now = new Date();
  const items = await tx.orderItem.findMany({ where: { orderId: id }, orderBy: { variantId: "asc" } });
  let refundAmount = 0;

  if (input.status === "CANCELLED") {
    const exchanges = await tx.exchange.count({ where: { orderId: id } });
    const returns = await tx.returnRequest.count({ where: { orderId: id } });
    if (exchanges > 0 || returns > 0) {
      throw new ConflictError("Pedido com troca ou devolução. Concilie a operação antes de cancelar.");
    }
    // Mesma ordem de locks da criação: cliente → estoque → cupom → vale-troca.
    await tx.$queryRaw`SELECT id FROM customers WHERE id = ${order.customerId} FOR NO KEY UPDATE`;

    if (order.locationId) {
      await lockStockPositions(tx, items.map((item) => ({ locationId: order.locationId!, variantId: item.variantId })));
      const physicalDebited = order.channel === "STORE" || order.status === "PICKING";
      for (const item of items) {
        const result = await tx.stockPosition.updateMany({
          where: {
            variantId: item.variantId,
            locationId: order.locationId,
            ...(!physicalDebited && { reservedQty: { gte: item.quantity } }),
          },
          data: physicalDebited
            ? { quantity: { increment: item.quantity } }
            : { reservedQty: { decrement: item.quantity } },
        });
        if (result.count !== 1) {
          throw new ConflictError(`Estoque ou reserva inconsistente para o item ${item.variantId}.`);
        }
        if (physicalDebited) {
          await tx.stockMovement.create({
            data: {
              variantId: item.variantId,
              toLocationId: order.locationId,
              quantity: item.quantity,
              reason: "ADJUSTMENT",
              referenceId: id,
              referenceType: "Order",
              notes: "Estorno por cancelamento de pedido",
            },
          });
        }
      }
    }

    refundAmount = await cancelFinancials(tx, order, now);
    if (order.couponId) {
      const released = await tx.coupon.updateMany({
        where: { id: order.couponId, usedCount: { gt: 0 } },
        data: { usedCount: { decrement: 1 } },
      });
      if (released.count !== 1) throw new ConflictError("Contagem de uso do cupom inconsistente.");
    }
    await restoreStoreCredit(tx, order, now);
  }

  if (input.status === "PAID" && order.status === "PENDING_PAYMENT") {
    await confirmPayment(tx, order, now);
  }

  if (input.status === "PICKING" && order.locationId && order.channel !== "STORE") {
    await lockStockPositions(tx, items.map((item) => ({ locationId: order.locationId!, variantId: item.variantId })));
    for (const item of items) {
      const result = await tx.stockPosition.updateMany({
        where: {
          variantId: item.variantId,
          locationId: order.locationId,
          quantity: { gte: item.quantity },
          reservedQty: { gte: item.quantity },
        },
        data: { quantity: { decrement: item.quantity }, reservedQty: { decrement: item.quantity } },
      });
      if (result.count !== 1) throw new ConflictError(`Estoque ou reserva insuficiente para separar ${item.variantId}.`);
      await tx.stockMovement.create({
        data: {
          variantId: item.variantId,
          fromLocationId: order.locationId,
          quantity: item.quantity,
          reason: "SALE",
          referenceId: id,
          referenceType: "Order",
        },
      });
    }
  }

  const updated = await tx.order.update({
    where: { id },
    data: {
      status: input.status,
      ...(input.status === "PAID" && { paidAt: now }),
      ...(input.status === "SHIPPED" && { shippedAt: now }),
      ...(input.status === "DELIVERED" && { deliveredAt: now }),
      ...(input.status === "CANCELLED" && { cancelledAt: now, cancelReason: input.cancelReason }),
    },
  });

  if (input.status === "CANCELLED") {
    const stats = await tx.order.aggregate({
      where: { customerId: order.customerId, deletedAt: null, status: { not: "CANCELLED" } },
      _count: { id: true },
      _sum: { total: true },
      _min: { placedAt: true },
      _max: { placedAt: true },
    });
    const lifetimeValue = Number(stats._sum.total ?? 0);
    await tx.customer.update({
      where: { id: order.customerId },
      data: {
        totalOrders: stats._count.id,
        lifetimeValue,
        avgTicket: stats._count.id > 0 ? lifetimeValue / stats._count.id : 0,
        firstPurchaseAt: stats._min.placedAt,
        lastPurchaseAt: stats._max.placedAt,
      },
    });
  }

  await createAuditLogTx(tx, { session, ipAddress }, "STATUS_CHANGE", "Order", id, {
    from: order.status,
    to: input.status,
    ...(input.status === "CANCELLED" && { cancelReason: input.cancelReason ?? null, refundAmount }),
  });
  return updated;
}