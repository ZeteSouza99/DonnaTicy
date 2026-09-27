import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { handleApiError, NotFoundError } from "@/lib/errors";
import { updateOrderStatusSchema } from "@/schemas/sales";
import { getClientIp } from "@/lib/audit";
import { updateOrderStatus } from "@/services/order-status-service";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    await requirePermission(request, "orders", "read");
    const { id } = await params;

    const order = await prisma.order.findFirst({
      where: { id, deletedAt: null },
      include: {
        customer: {
          select: { id: true, code: true, fullName: true, phone: true, email: true, tier: true },
        },
        location: { select: { id: true, name: true, code: true } },
        seller: { select: { id: true, name: true } },
        coupon: { select: { id: true, code: true, discountValue: true } },
        items: {
          include: {
            variant: {
              select: {
                sku: true,
                product: { select: { code: true, name: true } },
                color: { select: { name: true, hexValue: true } },
                size: { select: { name: true } },
              },
            },
          },
        },
        payments: true,
        cancellationRefund: { select: { id: true, amount: true, status: true } },
        shipments: true,
        returnRequests: {
          where: { deletedAt: null },
          select: { id: true, code: true, status: true, type: true, createdAt: true },
        },
      },
    });

    if (!order) throw new NotFoundError("Pedido");

    return NextResponse.json(order);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const session = await requirePermission(request, "orders", "write");
    const { id } = await params;
    const body = await request.json();
    const input = updateOrderStatusSchema.parse(body);

    const updated = await prisma.$transaction((tx) =>
      updateOrderStatus(tx, { id, input, session, ipAddress: getClientIp(request) }),
    );

    return NextResponse.json(updated);
  } catch (error) {
    return handleApiError(error, request);
  }
}
