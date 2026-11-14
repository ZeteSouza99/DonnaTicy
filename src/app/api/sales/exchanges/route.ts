import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { handleApiError, NotFoundError, ValidationError, ConflictError } from "@/lib/errors";
import { getPaginationParams, paginate } from "@/lib/pagination";
import { createExchangeSchema } from "@/schemas/sales";
import { createAuditLogTx, getClientIp } from "@/lib/audit";
import { generateCode } from "@/lib/code-generator";
import { fromCents, toCents } from "@/lib/money";
import { getReturnBalances } from "@/services/return-balance-service";
import { partialItemCents } from "@/lib/allocations";
import { runIdempotent } from "@/services/idempotency-service";
import { lockOrder } from "@/services/order-lock";
import { deductAvailableStock, lockStockPositions } from "@/services/stock-lock";

const GENERIC_CUSTOMER_PHONE = "00000000000";
/** Diferença, em centavos, até a qual a troca fecha sem cobrança nem vale-troca. */
const TOLERANCE_CENTS = 1;

interface ReturnedItemRecord {
  orderItemId: string;
  variantId: string;
  sku: string;
  quantity: number;
  unitValue: number;
}

interface NewItemRecord {
  costPrice: number;
  variantId: string;
  sku: string;
  quantity: number;
  unitPrice: number;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requirePermission(request, "orders", "read");
    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = getPaginationParams(searchParams);
    const orderId = searchParams.get("orderId") ?? undefined;
    const customerId = searchParams.get("customerId") ?? undefined;

    const where = {
      ...(orderId && { orderId }),
      ...(customerId && { customerId }),
    };

    const [data, total] = await Promise.all([
      prisma.exchange.findMany({
        where,
        include: {
          order: { select: { id: true, code: true } },
          customer: { select: { id: true, fullName: true, phone: true } },
          location: { select: { id: true, name: true } },
          user: { select: { id: true, name: true } },
          storeCredit: {
            select: { id: true, code: true, amount: true, remainingAmount: true, status: true },
          },
        },
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      prisma.exchange.count({ where }),
    ]);

    return NextResponse.json(paginate(data, total, page, limit));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await requirePermission(request, "orders", "write");
    const body = await request.json();
    const input = createExchangeSchema.parse(body);

    const exchange = await runIdempotent(session.sub, "exchanges", request.headers.get("Idempotency-Key"), input, async (tx) => {
      await lockOrder(tx, input.orderId);
      const order = await tx.order.findFirst({
        where: { id: input.orderId, deletedAt: null },
        include: {
          items: { include: { variant: { select: { sku: true } } } },
          customer: { select: { id: true, phone: true } },
        },
      });
      if (!order) throw new NotFoundError("Pedido");
      if (order.status === "CANCELLED" || order.status === "PENDING_PAYMENT") {
        throw new ValidationError(
          "Troca só é permitida para pedidos pagos (não cancelados nem pendentes).",
        );
      }

      const location = await tx.location.findFirst({
        where: { id: input.locationId, deletedAt: null },
      });
      if (!location) throw new ValidationError("Local de estoque não encontrado.");

      if (order.channel !== "STORE" && order.status === "PAID") throw new ConflictError("Pedido ainda reservado, sem saída física. Cancele o pedido ou conclua a separação antes de registrar a devolução.");
      const balances = await getReturnBalances(tx, order.id);

      // ---- Itens devolvidos: validação + ENTRADA de estoque ----
      let amountReturnedCents = 0;
      const returnedRecords: ReturnedItemRecord[] = [];
      const seenOrderItems = new Set<string>();

      for (const ret of input.returnedItems) {
        if (seenOrderItems.has(ret.orderItemId)) {
          throw new ValidationError("Item devolvido duplicado na solicitação.");
        }
        seenOrderItems.add(ret.orderItemId);

        const orderItem = order.items.find((i) => i.id === ret.orderItemId);
        if (!orderItem) {
          throw new ValidationError("Item devolvido não pertence ao pedido informado.");
        }
        const remaining = balances.get(orderItem.id)!.remaining;
        if (ret.quantity > remaining) {
          throw new ValidationError(
            `Quantidade devolvida do SKU ${orderItem.variant.sku} excede o disponível para troca (${remaining}).`,
          );
        }

        // Valor efetivamente pago por unidade (considera desconto do item)
        const balance = balances.get(orderItem.id)!;
        const itemCents = partialItemCents(balance.netCents, balance.quantity, balance.settled, ret.quantity);
        const unitValue = fromCents(itemCents) / ret.quantity;
        amountReturnedCents += itemCents;
        returnedRecords.push({
          orderItemId: orderItem.id,
          variantId: orderItem.variantId,
          sku: orderItem.variant.sku,
          quantity: ret.quantity,
          unitValue,
        });
      }

      // ---- Itens novos: preço atual ----
      let amountNewCents = 0;
      const newRecords: NewItemRecord[] = [];
      for (const item of input.newItems) {
        const variant = await tx.productVariant.findFirst({
          where: { id: item.variantId, deletedAt: null },
          include: { product: { select: { basePrice: true, costPrice: true } } },
        });
        if (!variant) throw new ValidationError(`Variante ${item.variantId} não encontrada.`);
        const unitPriceCents = toCents(variant.product.basePrice) + toCents(variant.additionalCost);
        amountNewCents += unitPriceCents * item.quantity;
        newRecords.push({
          variantId: variant.id,
          sku: variant.sku,
          quantity: item.quantity,
          unitPrice: fromCents(unitPriceCents),
          costPrice: Number(variant.product.costPrice),
        });
      }

      const differenceCents = amountNewCents - amountReturnedCents;
      const settlementType =
        differenceCents > TOLERANCE_CENTS ? "CHARGED" : differenceCents < -TOLERANCE_CENTS ? "STORE_CREDIT" : "EVEN";
      const amountReturned = fromCents(amountReturnedCents);
      const amountNew = fromCents(amountNewCents);
      const difference = fromCents(differenceCents);

      if (settlementType === "CHARGED" && !input.paymentMethod) {
        throw new ValidationError(
          "Informe o método de pagamento para cobrar a diferença da troca.",
        );
      }

      const creditCustomerId = input.customerId ?? order.customerId;
      if (settlementType === "STORE_CREDIT") {
        const creditCustomer = await tx.customer.findFirst({
          where: { id: creditCustomerId, deletedAt: null },
        });
        if (!creditCustomer) throw new ValidationError("Cliente não encontrado.");
        if (creditCustomer.phone === GENERIC_CUSTOMER_PHONE) {
          throw new ValidationError(
            "Identifique o cliente para gerar o vale-troca (não é possível emitir para Consumidor Final).",
          );
        }
      }

      await lockStockPositions(tx, [...returnedRecords, ...newRecords].map((item) => ({
        locationId: input.locationId,
        variantId: item.variantId,
      })));

      const settingsRow = await tx.setting.findUnique({ where: { key: "operational" } });
      const validity = Number((settingsRow?.value as { storeCreditValidityDays?: number } | null)?.storeCreditValidityDays ?? 0);
      const creditExpiresAt = validity > 0 ? new Date(Date.now() + validity * 86400000) : null;
      const created = await tx.exchange.create({
        data: {
          code: generateCode("TRC"),
          orderId: order.id,
          customerId: creditCustomerId,
          locationId: input.locationId,
          userId: session.sub,
          returnedItems: returnedRecords as unknown as object,
          newItems: newRecords as unknown as object,
          amountReturned,
          amountNew,
          difference,
          settlementType,
          paymentMethod: settlementType === "CHARGED" ? input.paymentMethod : undefined,
          notes: input.notes,
        },
      });

      // ENTRADA dos itens devolvidos
      for (const ret of returnedRecords) {
        await tx.stockPosition.upsert({
          where: {
            variantId_locationId: { variantId: ret.variantId, locationId: input.locationId },
          },
          create: { variantId: ret.variantId, locationId: input.locationId, quantity: ret.quantity },
          update: { quantity: { increment: ret.quantity } },
        });
        await tx.stockMovement.create({
          data: {
            variantId: ret.variantId,
            toLocationId: input.locationId,
            quantity: ret.quantity,
            reason: "RETURN_APPROVED",
            referenceId: created.id,
            referenceType: "Exchange",
          },
        });
      }

      // SAÍDA dos itens novos (decremento atômico com guard, sem consumir reserva)
      for (const item of newRecords) {
        const deducted = await deductAvailableStock(
          tx,
          { locationId: input.locationId, variantId: item.variantId },
          item.quantity,
        );
        if (!deducted) {
          throw new ConflictError(
            `Estoque insuficiente para SKU ${item.sku}. Solicitado: ${item.quantity}.`,
          );
        }
        await tx.stockMovement.create({
          data: {
            variantId: item.variantId,
            fromLocationId: input.locationId,
            quantity: item.quantity,
            reason: "SALE",
            referenceId: created.id,
            referenceType: "Exchange",
          },
        });
      }

      // Acerto financeiro
      let storeCreditId: string | undefined;
      if (settlementType === "CHARGED") {
        await tx.paymentTransaction.create({
          data: {
            orderId: order.id,
            method: input.paymentMethod!,
            gateway: "INTERNAL",
            grossAmount: difference,
            netAmount: difference,
            status: "CONFIRMED",
            expectedReceiptDate: new Date(),
            actualReceiptDate: new Date(),
          },
        });
        await tx.financialEntry.create({
          data: {
            type: "REVENUE",
            category: "EXCHANGE",
            description: `Diferença de troca ${created.code} (pedido ${order.code})`,
            orderId: order.id,
            locationId: input.locationId,
            amount: difference,
            competenceDate: new Date(),
            dueDate: new Date(),
            cashDate: new Date(),
            status: "PAID",
            paymentMethod: input.paymentMethod,
          },
        });
      } else if (settlementType === "STORE_CREDIT") {
        const creditAmount = Math.abs(difference);
        const credit = await tx.storeCredit.create({
          data: {
            code: generateCode("VLT"),
            customerId: creditCustomerId,
            amount: creditAmount,
            remainingAmount: creditAmount,
            status: "ACTIVE",
            expiresAt: creditExpiresAt,
            originOrderId: order.id,
          },
        });
        storeCreditId = credit.id;
        await tx.exchange.update({
          where: { id: created.id },
          data: { storeCreditId: credit.id },
        });
      }

    await createAuditLogTx(tx,
      { session, ipAddress: getClientIp(request) },
      "CREATE",
      "Exchange",
      created.id,
      {
        code: created.code,
        orderId: created.orderId,
        difference: created.difference,
        settlementType: created.settlementType,
      },
    );


      return tx.exchange.findUniqueOrThrow({
        where: { id: created.id },
        include: {
          order: { select: { id: true, code: true } },
          customer: { select: { id: true, fullName: true } },
          storeCredit: storeCreditId
            ? { select: { id: true, code: true, amount: true, remainingAmount: true, status: true } }
            : false,
        },
      });
    });

    return NextResponse.json(exchange, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
