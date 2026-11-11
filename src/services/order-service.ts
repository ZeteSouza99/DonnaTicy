import { Prisma } from "@prisma/client";
import { z } from "zod";
import { ValidationError, ConflictError, ForbiddenError } from "@/lib/errors";
import { calculateDiscount, isDiscountRequestExpired } from "@/lib/discount-approval";
import {
  PAYMENT_TOLERANCE,
  calculateCouponDiscount,
  capManualDiscount,
  paymentsCoverTotal,
} from "@/lib/order-totals";
import { REQUIRE_DISCOUNT_APPROVAL } from "@/lib/features";
import { fromCents, toCents } from "@/lib/money";
import { can } from "@/lib/permissions";
import { createOrderSchema } from "@/schemas/sales";
import { createAuditLogTx } from "@/lib/audit";
import { generateCode } from "@/lib/code-generator";
import type { JwtPayload } from "@/lib/auth";
import { deductAvailableStock, lockStockPositions } from "./stock-lock";

export type CreateOrderInput = z.infer<typeof createOrderSchema>;

/** Diferença aceita entre o desconto digitado no PDV e o aprovado. */
const DISCOUNT_TOLERANCE_CENTS = 1;

interface CreateOrderContext {
  input: CreateOrderInput;
  session: JwtPayload;
  ipAddress?: string;
}

/** Toda venda movimenta o estoque de um local: o informado ou o do usuário logado. */
async function resolveLocationId(tx: Prisma.TransactionClient, input: CreateOrderInput, session: JwtPayload) {
  const locationId = input.locationId ?? session.locationId;
  if (!locationId) throw new ValidationError("Informe o local de estoque da venda.");
  if (session.role === "SELLER" && session.locationId && locationId !== session.locationId) {
    throw new ForbiddenError("Vendedor só pode vender pelo estoque da própria loja.");
  }
  const location = await tx.location.findFirst({
    where: { id: locationId, isActive: true, deletedAt: null },
    select: { id: true },
  });
  if (!location) throw new ValidationError("Local de estoque não encontrado ou inativo.");
  return location.id;
}

/** Atribuir a venda a outra pessoa afeta comissão e relatórios: só gerente/admin. */
async function resolveSellerId(tx: Prisma.TransactionClient, input: CreateOrderInput, session: JwtPayload) {
  if (!input.sellerId || input.sellerId === session.sub) return session.sub;
  if (!can(session.role, "orders", "manage")) {
    throw new ForbiddenError("Só gerente ou administrador pode registrar venda em nome de outro vendedor.");
  }
  const seller = await tx.user.findFirst({
    where: { id: input.sellerId, isActive: true, deletedAt: null },
    select: { id: true },
  });
  if (!seller) throw new ValidationError("Vendedor informado não encontrado ou inativo.");
  return seller.id;
}

/**
 * Cria um pedido completo (itens, estoque, cupom, desconto, vale-troca,
 * pagamentos, lançamento financeiro e auditoria) dentro da transação recebida.
 */
export async function createOrder(
  tx: Prisma.TransactionClient,
  { input, session, ipAddress }: CreateOrderContext,
) {
  const locationId = await resolveLocationId(tx, input, session);
  const sellerId = await resolveSellerId(tx, input, session);

  // Validate / resolve customer (cria "Consumidor Final" se não informado)
  let customer;
  if (input.customerId) {
    customer = await tx.customer.findFirst({
      where: { id: input.customerId, deletedAt: null },
    });
    if (!customer) throw new ValidationError("Cliente não encontrado.");
  } else {
    customer = await tx.customer.findFirst({
      where: { phone: "00000000000", deletedAt: null },
    });
    if (!customer) {
      customer = await tx.customer.create({
        data: {
          code: generateCode("CLI"),
          fullName: "Consumidor Final",
          phone: "00000000000",
        },
      });
    }
  }
  const resolvedCustomerId = customer.id;
  await tx.$queryRaw`SELECT id FROM customers WHERE id = ${resolvedCustomerId} FOR NO KEY UPDATE`;
  customer = await tx.customer.findUniqueOrThrow({ where: { id: resolvedCustomerId } });

  // Validate coupon if provided (desconto calculado após o subtotal)
  let couponId: string | undefined;
  let couponDiscountCents = 0;
  let coupon: Awaited<ReturnType<typeof tx.coupon.findFirst>> = null;
  if (input.couponCode) {
    coupon = await tx.coupon.findFirst({
      where: {
        code: input.couponCode,
        isActive: true,
        deletedAt: null,
        validFrom: { lte: new Date() },
        validUntil: { gte: new Date() },
      },
    });
    if (!coupon) throw new ValidationError("Cupom inválido ou expirado.");
    couponId = coupon.id;
  }

  // Build items and calculate totals (em centavos inteiros; o banco recebe o valor já fechado)
  let subtotalCents = 0;
  const orderItems: Array<{
    variantId: string;
    quantity: number;
    unitPrice: number;
    discount: number;
    totalPrice: number;
    costPrice: number;
  }> = [];

  const variants = await tx.productVariant.findMany({
    where: { id: { in: input.items.map((i) => i.variantId) }, deletedAt: null },
    include: { product: { select: { basePrice: true, costPrice: true } } },
  });
  const variantById = new Map(variants.map((v) => [v.id, v]));
  await lockStockPositions(tx, input.items.map((item) => ({ locationId, variantId: item.variantId })));

  for (const item of [...input.items].sort((a, b) => a.variantId.localeCompare(b.variantId))) {
    const variant = variantById.get(item.variantId);

    if (!variant) throw new ValidationError(`Variante ${item.variantId} não encontrada.`);

    const unitPriceCents = toCents(variant.product.basePrice) + toCents(variant.additionalCost);
    const totalPriceCents = unitPriceCents * item.quantity;
    subtotalCents += totalPriceCents;

    orderItems.push({
      variantId: item.variantId,
      quantity: item.quantity,
      unitPrice: fromCents(unitPriceCents),
      discount: 0,
      totalPrice: fromCents(totalPriceCents),
      costPrice: Number(variant.product.costPrice),
    });

    // Baixa de estoque conforme o canal:
    // - STORE (PDV): saída imediata — decremento atômico com guard (o item sai no balcão),
    //   sem tocar no que já está reservado para pedidos remotos
    // - demais canais: reserva (convertida em baixa no PICKING)
    if (input.channel === "STORE") {
      const deducted = await deductAvailableStock(tx, { locationId, variantId: item.variantId }, item.quantity);
      if (!deducted) {
        throw new ConflictError(
          `Estoque insuficiente para SKU ${variant.sku}. Solicitado: ${item.quantity}.`,
        );
      }
    } else {
      const reserved = await tx.$executeRaw`
        UPDATE stock_positions
        SET reserved_qty = reserved_qty + ${item.quantity}
        WHERE variant_id = ${item.variantId}
          AND location_id = ${locationId}
          AND quantity - reserved_qty >= ${item.quantity}
      `;
      if (reserved === 0) {
        throw new ConflictError(
          `Estoque insuficiente para SKU ${variant.sku}. Solicitado: ${item.quantity}.`,
        );
      }
    }
  }

  const subtotal = fromCents(subtotalCents);

  // Apply coupon discount over the computed subtotal
  if (coupon) {
    const minOrderValue = Number(coupon.minOrderValue ?? 0);
    if (minOrderValue > 0 && subtotalCents < toCents(minOrderValue)) {
      throw new ValidationError(
        `Cupom exige pedido mínimo de R$ ${minOrderValue.toFixed(2)}.`,
      );
    }
    couponDiscountCents = toCents(calculateCouponDiscount(
      subtotal,
      coupon.discountType === "PERCENTAGE" ? "PERCENT" : "AMOUNT",
      Number(coupon.discountValue),
    ));

    // Incremento atômico respeitando maxUses
    const usage = await tx.coupon.updateMany({
      where: {
        id: coupon.id,
        ...(coupon.maxUses ? { usedCount: { lt: coupon.maxUses } } : {}),
      },
      data: { usedCount: { increment: 1 } },
    });
    if (usage.count === 0) throw new ValidationError("Cupom esgotado.");
  }

  // Desconto manual (PDV): admin é livre; SELLER exige aprovação remota
  // válida (APPROVED, do próprio caixa, não expirada, valor batendo) e de uso único.
  const manualDiscountCents = toCents(
    capManualDiscount(input.discount ?? 0, subtotal, fromCents(couponDiscountCents)),
  );
  let usedApprovalId: string | null = null;
  if (REQUIRE_DISCOUNT_APPROVAL && session.role === "SELLER" && manualDiscountCents > 0) {
    if (!input.discountApprovalId) {
      throw new ForbiddenError("Desconto no PDV requer aprovação de um administrador.");
    }
    const approval = await tx.discountApproval.findUnique({
      where: { id: input.discountApprovalId },
    });
    if (!approval || approval.requestedById !== session.sub) {
      throw new ValidationError("Aprovação de desconto inválida.");
    }
    if (approval.status !== "APPROVED") {
      throw new ValidationError("Aprovação de desconto não está aprovada ou já foi utilizada.");
    }
    if (isDiscountRequestExpired(approval.createdAt)) {
      throw new ValidationError("Aprovação de desconto expirada (mais de 30 minutos).");
    }
    const expectedCents = toCents(calculateDiscount(
      subtotal,
      approval.discountType === "PERCENT" ? "PERCENT" : "AMOUNT",
      Number(approval.discountValue),
    ).discountAmount);
    if (Math.abs(expectedCents - manualDiscountCents) > DISCOUNT_TOLERANCE_CENTS) {
      throw new ValidationError(
        `Desconto informado (R$ ${fromCents(manualDiscountCents).toFixed(2)}) difere do aprovado (R$ ${fromCents(expectedCents).toFixed(2)}).`,
      );
    }
    // Uso único: guard atômico APPROVED -> APPLIED
    const claimed = await tx.discountApproval.updateMany({
      where: { id: approval.id, status: "APPROVED" },
      data: { status: "APPLIED" },
    });
    if (claimed.count === 0) {
      throw new ConflictError("Aprovação de desconto já foi utilizada.");
    }
    usedApprovalId = approval.id;
  }

  const totalAfterDiscountsCents = subtotalCents - couponDiscountCents - manualDiscountCents;

  // Vale-troca (store credit): abatimento atômico com guard de saldo
  let storeCreditUsedCents = 0;
  let usedStoreCreditId: string | undefined;
  if (input.storeCreditCode) {
    if (!input.customerId) {
      throw new ValidationError("Informe o cliente para usar o vale-troca.");
    }
    await tx.$queryRaw`SELECT id FROM store_credits WHERE code = ${input.storeCreditCode.trim().toUpperCase()} FOR UPDATE`;
    const credit = await tx.storeCredit.findFirst({
      where: {
        code: input.storeCreditCode.trim().toUpperCase(),
        customerId: resolvedCustomerId,
        status: { in: ["ACTIVE", "PARTIALLY_USED"] },
      },
    });
    if (!credit) {
      throw new ValidationError("Vale-troca inválido, já utilizado ou não pertence ao cliente.");
    }
    if (credit.expiresAt && credit.expiresAt < new Date()) {
      // O status EXPIRED é gravado pelo cron: aqui o throw desfaria a alteração.
      throw new ValidationError("Vale-troca expirado.");
    }
    const creditRemainingCents = toCents(credit.remainingAmount);
    storeCreditUsedCents = Math.min(creditRemainingCents, totalAfterDiscountsCents);
    if (storeCreditUsedCents > 0) {
      const storeCreditUsed = fromCents(storeCreditUsedCents);
      const debited = await tx.storeCredit.updateMany({
        where: { id: credit.id, remainingAmount: { gte: storeCreditUsed } },
        data: { remainingAmount: { decrement: storeCreditUsed } },
      });
      if (debited.count === 0) {
        throw new ConflictError("Saldo do vale-troca insuficiente.");
      }
      await tx.storeCredit.update({
        where: { id: credit.id },
        data: { status: creditRemainingCents === storeCreditUsedCents ? "USED" : "PARTIALLY_USED" },
      });
      usedStoreCreditId = credit.id;
    }
  }

  const total = fromCents(totalAfterDiscountsCents - storeCreditUsedCents);

  // Validate payments cover the total
  const paymentSum = fromCents(input.payments.reduce((sum, p) => sum + toCents(p.amount), 0));
  if (!paymentsCoverTotal(paymentSum, total)) {
    throw new ValidationError(
      `Soma dos pagamentos (R$ ${paymentSum.toFixed(2)}) difere do total do pedido (R$ ${total.toFixed(2)}).`,
    );
  }

  // Balcão recebe na hora; canais remotos aguardam a baixa (PENDING_PAYMENT → PAID).
  const isCounterSale = input.channel === "STORE";
  const isPaid = isCounterSale || total <= PAYMENT_TOLERANCE;

  const created = await tx.order.create({
    data: {
      code: generateCode("PED"),
      channel: input.channel,
      customerId: resolvedCustomerId,
      locationId,
      sellerId,
      subtotal,
      discountTotal: fromCents(couponDiscountCents + manualDiscountCents + storeCreditUsedCents),
      shippingCost: 0,
      total,
      status: isPaid ? (isCounterSale ? "DELIVERED" : "PAID") : "PENDING_PAYMENT",
      paidAt: isPaid ? new Date() : undefined,
      deliveredAt: isPaid && isCounterSale ? new Date() : undefined,
      shippingAddress: input.shippingAddress ?? undefined,
      deliveryMethod: input.deliveryMethod,
      couponId,
      usedStoreCreditId,
      usedStoreCreditAmount: fromCents(storeCreditUsedCents),
      notes: input.notes,
      items: {
        create: orderItems,
      },
      payments: {
        create: input.payments.map((p) => ({
          method: p.method,
          gateway: p.gateway ?? "INTERNAL",
          grossAmount: p.amount,
          adminFeeRate: 0,
          adminFeeAmount: 0,
          netAmount: p.amount,
          installments: p.installments ?? 1,
          status: isPaid ? "CONFIRMED" : "PENDING",
          expectedReceiptDate: new Date(),
        })),
      },
    },
    include: {
      customer: { select: { id: true, fullName: true } },
      items: {
        include: {
          variant: {
            select: { sku: true, color: { select: { name: true } }, size: { select: { name: true } } },
          },
        },
      },
      payments: true,
    },
  });

  // Vincula a aprovação de desconto consumida ao pedido criado
  if (usedApprovalId) {
    await tx.discountApproval.update({
      where: { id: usedApprovalId },
      data: { orderId: created.id },
    });
  }

  // Movimentos de estoque da venda de balcão (baixa já aplicada acima)
  if (isCounterSale) {
    for (const item of orderItems) {
      await tx.stockMovement.create({
        data: {
          variantId: item.variantId,
          fromLocationId: locationId,
          quantity: item.quantity,
          reason: "SALE",
          referenceId: created.id,
          referenceType: "Order",
        },
      });
    }
  }

  // Lançamento financeiro de receita da venda
  await tx.financialEntry.create({
    data: {
      type: "REVENUE",
      category: "Vendas",
      description: `Venda ${created.code}`,
      orderId: created.id,
      locationId,
      amount: total,
      competenceDate: new Date(),
      dueDate: new Date(),
      cashDate: isPaid ? new Date() : null,
      status: isPaid ? "PAID" : "PENDING",
      paymentMethod: input.payments[0]?.method,
    },
  });

  // Update customer stats
  await tx.customer.update({
    where: { id: resolvedCustomerId },
    data: {
      totalOrders: { increment: 1 },
      lifetimeValue: { increment: total },
      avgTicket: fromCents(
        Math.round((toCents(customer.lifetimeValue) + toCents(total)) / (customer.totalOrders + 1)),
      ),
      lastPurchaseAt: new Date(),
      firstPurchaseAt: customer.firstPurchaseAt ?? new Date(),
    },
  });

  await createAuditLogTx(tx, { session, ipAddress }, "CREATE", "Order", created.id, {
    code: created.code,
    total: created.total,
    channel: input.channel,
  });

  return created;
}
