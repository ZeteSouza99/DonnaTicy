import { NextRequest, NextResponse } from "next/server";
import { DiscountApprovalStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";
import { parseEnumParam } from "@/lib/query-params";
import { getPaginationParams, paginate } from "@/lib/pagination";
import { createDiscountRequestSchema } from "@/schemas/sales";
import { createAuditLog, getClientIp } from "@/lib/audit";
import { DISCOUNT_REQUEST_TTL_MS, DISCOUNT_ADMIN_ROLES } from "@/lib/discount-approval";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await requirePermission(request, "orders", "read");
    const isAdmin = DISCOUNT_ADMIN_ROLES.includes(session.role);
    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = getPaginationParams(searchParams);
    const status = parseEnumParam(
      searchParams.get("status"),
      DiscountApprovalStatus,
      "status",
    );

    const where = {
      ...(status && { status }),
      // PENDING/APPROVED expiram em 30 min — não listar as vencidas
      ...(status === "PENDING" || status === "APPROVED"
        ? { createdAt: { gte: new Date(Date.now() - DISCOUNT_REQUEST_TTL_MS) } }
        : {}),
      // SELLER só enxerga as próprias solicitações
      ...(!isAdmin && { requestedById: session.sub }),
    };

    const [data, total] = await Promise.all([
      prisma.discountApproval.findMany({
        where,
        include: {
          requestedBy: { select: { id: true, name: true, email: true } },
          approvedBy: { select: { id: true, name: true, email: true, role: true } },
        },
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      prisma.discountApproval.count({ where }),
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
    const input = createDiscountRequestSchema.parse(body);
    const ipAddress = getClientIp(request);

    const items = input.items ?? [];
    const cartSnapshot = items.map((item) => ({
      ...item,
      lineTotal: Math.round(item.unitPrice * item.quantity * 100) / 100,
    }));
    const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

    // Decisão: se o caixa já tem PENDING, a anterior é CANCELADA e uma nova é
    // criada — garante que carrinho/motivo refletem sempre o estado atual.
    const created = await prisma.$transaction(async (tx) => {
      await tx.discountApproval.updateMany({
        where: { requestedById: session.sub, status: "PENDING" },
        data: { status: "CANCELLED", resolvedAt: new Date() },
      });
      return tx.discountApproval.create({
        data: {
          requestedById: session.sub,
          cartTotal: input.cartTotal,
          reason: input.reason,
          cartSnapshot: cartSnapshot.length > 0 ? cartSnapshot : undefined,
          itemCount: itemCount > 0 ? itemCount : undefined,
          customerId: input.customerId,
          customerName: input.customerName,
          locationId: input.locationId,
          locationName: input.locationName,
          requestedByIp: ipAddress,
        },
        include: { requestedBy: { select: { id: true, name: true, email: true } } },
      });
    });

    await createAuditLog(
      { session, ipAddress },
      "CREATE",
      "DiscountApproval",
      created.id,
      {
        cartTotal: input.cartTotal,
        reason: input.reason,
        itemCount,
        items: cartSnapshot,
        customerName: input.customerName,
        locationName: input.locationName,
      },
    );

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
