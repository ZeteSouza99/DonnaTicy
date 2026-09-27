import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { handleApiError, NotFoundError, ValidationError, ConflictError } from "@/lib/errors";
import { updateReturnStatusSchema } from "@/schemas/logistics";
import { createAuditLogTx, getClientIp } from "@/lib/audit";
import { sameValue } from "@/lib/decimal";
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

      const returnedItemsValue = existing.items.reduce((sum, item) => {
        const unitPaid = item.orderItem.quantity > 0 ? Number(item.orderItem.totalPrice) / item.orderItem.quantity : 0;
        return sum + unitPaid * item.quantity;
      }, 0);
      const refundAmount = Number(input.refundAmount ?? existing.refundAmount ?? 0);
      const storeCreditAmount = Number(input.storeCreditAmount ?? existing.storeCreditAmount ?? 0);
      if (refundAmount + storeCreditAmount > returnedItemsValue + 0.01) {
        throw new ValidationError("Reembolso + crédito excede o valor dos itens devolvidos.");
      }

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
