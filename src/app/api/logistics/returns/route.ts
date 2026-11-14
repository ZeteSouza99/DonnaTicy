import { NextRequest, NextResponse } from "next/server";
import { ReturnStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { handleApiError, NotFoundError, ConflictError, ValidationError } from "@/lib/errors";
import { getPaginationParams, paginate } from "@/lib/pagination";
import { createReturnRequestSchema } from "@/schemas/logistics";
import { createAuditLogTx, getClientIp } from "@/lib/audit";
import { generateCode } from "@/lib/code-generator";
import { parseEnumParam } from "@/lib/query-params";
import { getReturnBalances } from "@/services/return-balance-service";
import { runIdempotent } from "@/services/idempotency-service";
import { lockOrder } from "@/services/order-lock";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requirePermission(request, "logistics", "read");
    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = getPaginationParams(searchParams);
    const status = parseEnumParam(searchParams.get("status"), ReturnStatus, "status");
    const customerId = searchParams.get("customerId") ?? undefined;

    const where = {
      deletedAt: null,
      ...(status && { status }),
      ...(customerId && { customerId }),
    };

    const [data, total] = await Promise.all([
      prisma.returnRequest.findMany({
        where,
        include: {
          order: { select: { id: true, code: true } },
          customer: { select: { id: true, fullName: true } },
          _count: { select: { items: true } },
        },
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      prisma.returnRequest.count({ where }),
    ]);

    return NextResponse.json(paginate(data, total, page, limit));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await requirePermission(request, "logistics", "write");
    const body = await request.json();
    const input = createReturnRequestSchema.parse(body);

    const returnReq = await runIdempotent(session.sub, "returns", request.headers.get("Idempotency-Key"), input, async (tx) => {
      const order = await lockOrder(tx, input.orderId);
      if (order.status === "CANCELLED" || order.status === "PENDING_PAYMENT") {
        throw new ConflictError("Somente pedidos pagos podem receber devolução.");
      }
      const customer = await tx.customer.findFirst({
        where: { id: input.customerId, deletedAt: null },
      });
      if (!customer) throw new NotFoundError("Cliente");
      if (customer.id !== order.customerId) throw new ValidationError("O cliente não pertence ao pedido informado.");

      if (order.channel !== "STORE" && order.status === "PAID") throw new ConflictError("Pedido ainda reservado, sem saída física. Cancele o pedido ou conclua a separação antes de registrar a devolução.");
      const balances = await getReturnBalances(tx, order.id);
      const seenItems = new Set<string>();
      for (const item of input.items) {
        const original = balances.get(item.orderItemId);
        if (!original || original.variantId !== item.variantId || seenItems.has(item.orderItemId)) {
          throw new ValidationError("Item duplicado ou variante não pertencente ao pedido informado.");
        }
        if (item.quantity > original.remaining) throw new ValidationError("Quantidade excede o saldo disponível após trocas e devoluções anteriores.");
        seenItems.add(item.orderItemId);
      }

      const created = await tx.returnRequest.create({
        data: {
          code: generateCode("DEV"),
          orderId: input.orderId,
          customerId: input.customerId,
          type: input.type,
          reason: input.items[0].reason,
          reasonDetail: input.reasonDetail,
          inspectionPhotos: [],
          items: {
            create: input.items.map((i) => ({
              orderItemId: i.orderItemId,
              variantId: i.variantId,
              quantity: i.quantity,
              reason: i.reason,
              exchangeVariantId: i.exchangeVariantId,
            })),
          },
        },
        include: {
          order: { select: { code: true } },
          customer: { select: { fullName: true } },
          items: true,
        },
      });
      await createAuditLogTx(tx, { session, ipAddress: getClientIp(request) }, "CREATE", "ReturnRequest", created.id, {
        code: created.code,
        type: input.type,
      });
      return created;
    });

    return NextResponse.json(returnReq, { status: 201 });
  } catch (error) {
    return handleApiError(error, request);
  }
}
