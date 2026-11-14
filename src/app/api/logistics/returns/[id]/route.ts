import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { handleApiError, NotFoundError, ValidationError, ConflictError } from "@/lib/errors";
import { updateReturnStatusSchema } from "@/schemas/logistics";
import { createAuditLogTx, getClientIp } from "@/lib/audit";
import { sameValue } from "@/lib/decimal";
import { getReturnBalances } from "@/services/return-balance-service";
import { partialItemCents } from "@/lib/allocations";
import { toCents, fromCents } from "@/lib/money";
import { generateCode } from "@/lib/code-generator";
import { lockOrder } from "@/services/order-lock";
import { lockStockPositions } from "@/services/stock-lock";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    await requirePermission(request, "logistics", "read");
    const { id } = await params;

    const returnRequest = await prisma.returnRequest.findFirst({
      where: { id, deletedAt: null },
      include: {
        order: { select: { id: true, code: true } },
        customer: { select: { id: true, fullName: true, email: true } },
        inspectedBy: { select: { id: true, name: true } },
        items: {
          include: {
            variant: {
              select: { id: true, sku: true, color: { select: { name: true } }, size: { select: { name: true } } },
            },
            orderItem: { select: { id: true, unitPrice: true, quantity: true } },
          },
        },
      },
    });

    if (!returnRequest) throw new NotFoundError("Devolução");
    return NextResponse.json(returnRequest);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const session = await requirePermission(request, "logistics", "manage");
    const { id } = await params;
    const body = await request.json();
    const input = updateReturnStatusSchema.parse(body);

    const returnRequest = await prisma.$transaction(async (tx) => {
      const reference = await tx.returnRequest.findFirst({ where: { id, deletedAt: null }, select: { orderId: true } });
      if (!reference) throw new NotFoundError("Devolução");
      const order = await lockOrder(tx, reference.orderId);
      if (order.status === "CANCELLED") throw new ConflictError("Pedido cancelado não pode receber devolução.");
      const existing = await tx.returnRequest.findFirst({
        where: { id, deletedAt: null },
        include: { items: { include: { orderItem: { select: { orderId: true, variantId: true, totalPrice: true, quantity: true } } } } },
      });
      if (!existing) throw new NotFoundError("Devolução");
      if (existing.status === "RESOLVED") {
        const changed = (Object.keys(input) as Array<keyof typeof input>)
          .some((key) => input[key] !== undefined && !sameValue(input[key], existing[key]));
        if (!changed) return existing;
        throw new ConflictError("Devolução resolvida não pode ser reaberta nem alterada.");
      }
      if (existing.customerId !== order.customerId || existing.items.some((item) =>
        item.orderItem.orderId !== order.id || item.orderItem.variantId !== item.variantId,
      )) {
        throw new ConflictError("Devolução com vínculo de cliente/item inconsistente.");
      }

      if (existing.status === "REJECTED" && input.status !== "REJECTED") throw new ConflictError("Devolução rejeitada não pode ser reaberta. Crie uma nova solicitação.");
      if (order.channel !== "STORE" && order.status === "PAID") throw new ConflictError("Pedido ainda reservado, sem saída física. Cancele o pedido ou conclua a separação antes de registrar a devolução.");
      const balances = await getReturnBalances(tx, order.id, id);
      let returnedCents = 0;
      for (const item of existing.items) {
        const balance = balances.get(item.orderItemId);
        if (!balance || item.quantity > balance.remaining) throw new ConflictError("Saldo de devolução insuficiente. Confira as outras trocas e devoluções.");
        returnedCents += partialItemCents(balance.netCents, balance.quantity, balance.settled, item.quantity);
      }
      const refundCents = toCents(input.refundAmount ?? existing.refundAmount ?? 0);
      const creditCents = toCents(input.storeCreditAmount ?? existing.storeCreditAmount ?? 0);
      if (refundCents + creditCents > returnedCents) throw new ValidationError("Reembolso + crédito excede o valor líquido dos itens devolvidos.");
      if (input.status === "RESOLVED") {
        if (!(input.inspectionResult ?? existing.inspectionResult)) throw new ValidationError("Informe o resultado da inspeção antes de concluir.");
        if ((input.resolution ?? existing.resolution) === "EXCHANGE_SENT") throw new ValidationError("Registre a troca no PDV para movimentar as peças substitutas.");
        if (creditCents > 0) {
          const customer = await tx.customer.findUniqueOrThrow({ where: { id: order.customerId } });
          if (customer.phone === "00000000000") throw new ValidationError("Identifique o cliente antes de emitir o vale-troca.");
        }
      }

      const settingsRow = await tx.setting.findUnique({ where: { key: "operational" } });
      const validity = Number((settingsRow?.value as { storeCreditValidityDays?: number } | null)?.storeCreditValidityDays ?? 0);
      const creditExpiresAt = validity > 0 ? new Date(Date.now() + validity * 86400000) : null;
      const now = new Date();
      const data: Record<string, unknown> = { status: input.status };
      if (input.inspectionResult) data.inspectionResult = input.inspectionResult;
      if (input.inspectionNotes !== undefined) data.inspectionNotes = input.inspectionNotes;
      if (input.resolution) data.resolution = input.resolution;
      if (input.refundAmount !== undefined) data.refundAmount = input.refundAmount;
      if (input.storeCreditAmount !== undefined) data.storeCreditAmount = input.storeCreditAmount;
      if (input.status === "RECEIVED") data.receivedAt = now;
      if (input.status === "APPROVED" || input.status === "REJECTED") {
        data.inspectedAt = now;
        data.inspectedById = session.sub;
      }
      if (input.status === "RESOLVED") data.resolvedAt = now;

      const updated = await tx.returnRequest.update({ where: { id }, data });

      if (input.status === "RESOLVED") {
        if (creditCents > 0) {
          await tx.storeCredit.create({ data: {
            code: generateCode("VLT"), customerId: order.customerId,
            amount: fromCents(creditCents), remainingAmount: fromCents(creditCents),
            expiresAt: creditExpiresAt,
            originOrderId: order.id, returnRequestId: id,
          } });
        }
        // Reentrada de estoque para itens revendáveis
        const restockLocationId = order.locationId;
        if (restockLocationId) {
          await lockStockPositions(tx, existing.items.map((item) => ({ locationId: restockLocationId, variantId: item.variantId })));
          for (const item of existing.items) {
            const itemResult = item.inspectionResult ?? updated.inspectionResult;
            if (itemResult !== "APPROVED" && itemResult !== "APPROVED_WITH_NOTE") continue;

            await tx.stockMovement.create({
              data: {
                variantId: item.variantId,
                toLocationId: restockLocationId,
                quantity: item.quantity,
                reason: "RETURN_APPROVED",
                referenceId: id,
                referenceType: "ReturnRequest",
              },
            });

            await tx.stockPosition.upsert({
              where: {
                variantId_locationId: {
                  variantId: item.variantId,
                  locationId: restockLocationId,
                },
              },
              create: {
                variantId: item.variantId,
                locationId: restockLocationId,
                quantity: item.quantity,
              },
              update: { quantity: { increment: item.quantity } },
            });
          }
        }

        // Lançamento financeiro de reembolso
        const finalRefund = Number(updated.refundAmount ?? 0);
        if (finalRefund > 0) {
          await tx.financialEntry.create({
            data: {
              type: "REFUND",
              category: "DEVOLUCAO",
              description: `Reembolso da devolução ${existing.code}`,
              orderId: existing.orderId,
              locationId: order.locationId,
              amount: finalRefund,
              competenceDate: now,
              dueDate: now,
              status: "PENDING",
            },
          });
        }
      }

      await createAuditLogTx(tx, { session, ipAddress: getClientIp(request) }, "UPDATE", "ReturnRequest", id, {
        status: input.status,
        resolution: input.resolution,
      });
      return updated;
    });

    return NextResponse.json(returnRequest);
  } catch (error) {
    return handleApiError(error, request);
  }
}
