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

    const returnReq = await prisma.$transaction(async (tx) => {
      const order = await lockOrder(tx, input.orderId);
      if (order.status === "CANCELLED") {
        throw new ConflictError("Pedido cancelado não pode receber devolução.");
      }
      const customer = await tx.customer.findFirst({
        where: { id: input.customerId, deletedAt: null },
      });
      if (!customer) throw new NotFoundError("Cliente");
      if (customer.id !== order.customerId) throw new ValidationError("O cliente não pertence ao pedido informado.");

      const orderItems = await tx.orderItem.findMany({ where: { orderId: order.id } });
      const seenItems = new Set<string>();
      for (const item of input.items) {
        const original = orderItems.find((candidate) => candidate.id === item.orderItemId);
        if (!original || original.variantId !== item.variantId || seenItems.has(item.orderItemId)) {
          throw new ValidationError("Item duplicado ou variante não pertencente ao pedido informado.");
        }
        if (item.quantity > original.quantity) throw new ValidationError("Quantidade devolvida excede a quantidade do pedido.");
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
