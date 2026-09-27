import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { handleApiError, NotFoundError } from "@/lib/errors";
import { updateCouponSchema } from "@/schemas/sales";
import { createAuditLog, getClientIp } from "@/lib/audit";
import { startOfDayUtc, endOfDayUtc } from "@/lib/date";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    await requirePermission(request, "orders", "read");
    const { id } = await params;

    const coupon = await prisma.coupon.findFirst({
      where: { id, deletedAt: null },
      include: { _count: { select: { orders: true } } },
    });

    if (!coupon) throw new NotFoundError("Cupom");
    return NextResponse.json(coupon);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const session = await requirePermission(request, "orders", "write");
    const { id } = await params;
    const body = await request.json();
    const input = updateCouponSchema.parse(body);

    const existing = await prisma.coupon.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundError("Cupom");

    const data: Record<string, unknown> = { ...input };
    if (input.validFrom) data.validFrom = startOfDayUtc(input.validFrom);
    if (input.validUntil) data.validUntil = endOfDayUtc(input.validUntil);

    const coupon = await prisma.coupon.update({ where: { id }, data });

    await createAuditLog(
      { session, ipAddress: getClientIp(request) },
      "UPDATE",
      "Coupon",
      id,
      input,
    );

    return NextResponse.json(coupon);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const session = await requirePermission(request, "orders", "write");
    const { id } = await params;

    const existing = await prisma.coupon.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundError("Cupom");

    await prisma.coupon.update({ where: { id }, data: { deletedAt: new Date() } });

    await createAuditLog(
      { session, ipAddress: getClientIp(request) },
      "DELETE",
      "Coupon",
      id,
    );

    return NextResponse.json({ message: "Cupom removido com sucesso." });
  } catch (error) {
    return handleApiError(error);
  }
}
