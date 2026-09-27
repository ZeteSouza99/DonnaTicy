import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { handleApiError, NotFoundError, ValidationError, ConflictError } from "@/lib/errors";
import { getPaginationParams, paginate } from "@/lib/pagination";
import { createExchangeSchema } from "@/schemas/sales";
import { createAuditLog, getClientIp } from "@/lib/audit";
import { generateCode } from "@/lib/code-generator";
import { lockOrder } from "@/services/order-lock";
import { lockStockPositions } from "@/services/stock-lock";

const GENERIC_CUSTOMER_PHONE = "00000000000";
const TOLERANCE = 0.01;

interface ReturnedItemRecord {
  orderItemId: string;
  variantId: string;
  sku: string;
  quantity: number;
  unitValue: number;
}

interface NewItemRecord {
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

    const exchange = await prisma.$transaction(async (tx) => {
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

      // Quantidades já devolvidas em trocas anteriores deste pedido
      const previousExchanges = await tx.exchange.findMany({
        where: { orderId: order.id },
        select: { returnedItems: true },
      });
      const alreadyReturned = new Map<string, number>();
      for (const prev of previousExchanges) {
        const items = prev.returnedItems as unknown as ReturnedItemRecord[];
        for (const it of items) {
          alreadyReturned.set(
            it.orderItemId,
            (alreadyReturned.get(it.orderItemId) ?? 0) + it.quantity,
          );
        }
      }

      // ---- Itens devolvidos: validação + ENTRADA de estoque ----
      let amountReturned = 0;
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
        const remaining = orderItem.quantity - (alreadyReturned.get(orderItem.id) ?? 0);
        if (ret.quantity > remaining) {
          throw new ValidationError(
            `Quantidade devolvida do SKU ${orderItem.variant.sku} excede o disponível para troca (${remaining}).`,
          );
        }

        // Valor efetivamente pago por unidade (considera desconto do item)
        const unitValue = Number(orderItem.totalPrice) / orderItem.quantity;
        amountReturned += unitValue * ret.quantity;
        returnedRecords.push({
          orderItemId: orderItem.id,
          variantId: orderItem.variantId,
          sku: orderItem.variant.sku,
          quantity: ret.quantity,
          unitValue,
        });
      }

      // ---- Itens novos: preço atual ----
      let amountNew = 0;
      const newRecords: NewItemRecord[] = [];
      for (const item of input.newItems) {
        const variant = await tx.productVariant.findFirst({
          where: { id: item.variantId, deletedAt: null },
          include: { product: { select: { basePrice: true } } },
        });
        if (!variant) throw new ValidationError(`Variante ${item.variantId} não encontrada.`);
        const unitPrice = Number(variant.product.basePrice) + Number(variant.additionalCost);
        amountNew += unitPrice * item.quantity;
        newRecords.push({
          variantId: variant.id,
          sku: variant.sku,
          quantity: item.quantity,
          unitPrice,
        });
      }

      const difference = amountNew - amountReturned;
      const settlementType =
        difference > TOLERANCE ? "CHARGED" : difference < -TOLERANCE ? "STORE_CREDIT" : "EVEN";

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

      // SAÍDA dos itens novos (decremento atômico com guard)
      for (const item of newRecords) {
        const deducted = await tx.stockPosition.updateMany({
          where: {
            variantId: item.variantId,
            locationId: input.locationId,
            quantity: { gte: item.quantity },
          },
          data: { quantity: { decrement: item.quantity } },
        });
        if (deducted.count === 0) {
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
            originOrderId: order.id,
          },
        });
        storeCreditId = credit.id;
        await tx.exchange.update({
          where: { id: created.id },
          data: { storeCreditId: credit.id },
        });
      }

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

    await createAuditLog(
      { session, ipAddress: getClientIp(request) },
      "CREATE",
      "Exchange",
      exchange.id,
      {
        code: exchange.code,
        orderId: exchange.orderId,
        difference: exchange.difference,
        settlementType: exchange.settlementType,
      },
    );

    return NextResponse.json(exchange, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
