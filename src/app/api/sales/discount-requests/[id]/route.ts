import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { handleApiError, NotFoundError, ForbiddenError, ConflictError, ValidationError } from "@/lib/errors";
import { resolveDiscountRequestSchema } from "@/schemas/sales";
import { createAuditLog, getClientIp } from "@/lib/audit";
import { DISCOUNT_ADMIN_ROLES, calculateDiscount, isDiscountRequestExpired } from "@/lib/discount-approval";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const session = await requirePermission(request, "orders", "read");
    const { id } = await params;

    const approval = await prisma.discountApproval.findUnique({
      where: { id },
      include: {
        requestedBy: { select: { id: true, name: true, email: true } },
        approvedBy: { select: { id: true, name: true, email: true, role: true } },
      },
    });
    if (!approval) throw new NotFoundError("Solicitação de desconto");

    const isAdmin = DISCOUNT_ADMIN_ROLES.includes(session.role);
    if (!isAdmin && approval.requestedById !== session.sub) {
      throw new ForbiddenError("Você não tem acesso a esta solicitação.");
    }

    const expired =
      (approval.status === "PENDING" || approval.status === "APPROVED") &&
      isDiscountRequestExpired(approval.createdAt);

    return NextResponse.json({ ...approval, expired });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const session = await requirePermission(request, "orders", "manage");
    const { id } = await params;
    const body = await request.json();
    const input = resolveDiscountRequestSchema.parse(body);

    const approval = await prisma.discountApproval.findUnique({
      where: { id },
      include: { requestedBy: { select: { id: true, name: true } } },
    });
    if (!approval) throw new NotFoundError("Solicitação de desconto");
    if (approval.status !== "PENDING") {
      throw new ConflictError("Solicitação já foi resolvida ou cancelada.");
    }
    if (isDiscountRequestExpired(approval.createdAt)) {
      throw new ValidationError("Solicitação expirada (mais de 30 minutos).");
    }

    const cartTotal = Number(approval.cartTotal);
    if (
      input.action === "approve" &&
      input.discountType === "AMOUNT" &&
      input.discountValue > cartTotal
    ) {
      throw new ValidationError("Desconto não pode exceder o total do carrinho.");
    }

    const ipAddress = getClientIp(request);
    const resolvedAt = new Date();

    // Valor efetivo em reais (mesmo quando aprovado em %) para a trilha de auditoria
    const decision =
      input.action === "approve"
        ? calculateDiscount(cartTotal, input.discountType, input.discountValue)
        : null;
    const discountAmount = decision?.discountAmount ?? null;
    const finalTotal = decision?.finalTotal ?? null;

    // Guard atômico: só resolve se ainda estiver PENDING
    const updated = await prisma.discountApproval.updateMany({
      where: { id, status: "PENDING" },
      data:
        input.action === "approve"
          ? {
              status: "APPROVED",
              discountType: input.discountType,
              discountValue: input.discountValue,
              discountAmount,
              finalTotal,
              approvedById: session.sub,
              approvedByEmail: session.email,
              approvedByRole: session.role,
              approvedByIp: ipAddress,
              resolvedAt,
            }
          : {
              status: "REJECTED",
              approvedById: session.sub,
              approvedByEmail: session.email,
              approvedByRole: session.role,
              approvedByIp: ipAddress,
              resolvedAt,
            },
    });
    if (updated.count === 0) {
      throw new ConflictError("Solicitação já foi resolvida por outro usuário.");
    }

    await createAuditLog(
      { session, ipAddress },
      input.action === "approve" ? "APPROVE" : "REJECT",
      "DiscountApproval",
      id,
      {
        decision: input.action === "approve" ? "APROVADO" : "REJEITADO",
        decidedAt: resolvedAt.toISOString(),
        approvedByRole: session.role,
        requestedByName: approval.requestedBy.name,
        requestedAt: approval.createdAt.toISOString(),
        reason: approval.reason,
        cartTotal: approval.cartTotal,
        itemCount: approval.itemCount,
        items: approval.cartSnapshot,
        customerName: approval.customerName,
        locationName: approval.locationName,
        ...(input.action === "approve"
          ? {
              discountType: input.discountType,
              discountValue: input.discountValue,
              discountAmount,
              finalTotal,
            }
          : {}),
      },
    );

    const result = await prisma.discountApproval.findUnique({
      where: { id },
      include: {
        requestedBy: { select: { id: true, name: true, email: true } },
        approvedBy: { select: { id: true, name: true, email: true, role: true } },
      },
    });
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const session = await requirePermission(request, "orders", "write");
    const { id } = await params;

    const approval = await prisma.discountApproval.findUnique({ where: { id } });
    if (!approval) throw new NotFoundError("Solicitação de desconto");
    if (approval.requestedById !== session.sub && !DISCOUNT_ADMIN_ROLES.includes(session.role)) {
      throw new ForbiddenError("Você só pode cancelar as próprias solicitações.");
    }
    if (approval.status !== "PENDING") {
      throw new ConflictError("Somente solicitações pendentes podem ser canceladas.");
    }

    await prisma.discountApproval.updateMany({
      where: { id, status: "PENDING" },
      data: { status: "CANCELLED", resolvedAt: new Date() },
    });

    await createAuditLog(
      { session, ipAddress: getClientIp(request) },
      "CANCEL",
      "DiscountApproval",
      id,
    );

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleApiError(error);
  }
}
