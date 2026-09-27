import { NextRequest, NextResponse } from "next/server";
import { PurchaseOrderStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { handleApiError, NotFoundError, ValidationError, ForbiddenError } from "@/lib/errors";
import { updatePurchaseOrderStatusSchema } from "@/schemas/purchasing";
import { createAuditLog, getClientIp } from "@/lib/audit";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const PO_TRANSITIONS: Record<PurchaseOrderStatus, PurchaseOrderStatus[]> = {
  DRAFT: ["PENDING_APPROVAL", "CANCELLED"],
  PENDING_APPROVAL: ["APPROVED", "DRAFT", "CANCELLED"],
  APPROVED: ["SENT_TO_SUPPLIER", "CANCELLED"],
  SENT_TO_SUPPLIER: ["PARTIALLY_RECEIVED", "RECEIVED", "CANCELLED"],
  PARTIALLY_RECEIVED: ["RECEIVED"],
  RECEIVED: [],
  CANCELLED: [],
};

const APPROVAL_ROLES = ["SUPER_ADMIN", "STORE_MANAGER"] as const;

export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    await requirePermission(request, "purchasing", "read");
    const { id } = await params;

    const purchaseOrder = await prisma.purchaseOrder.findFirst({
      where: { id, deletedAt: null },
      include: {
        supplier: { select: { id: true, companyName: true, tradeName: true, phone: true, email: true } },
        items: {
          include: {
            rawMaterial: { select: { id: true, code: true, name: true, unitOfMeasure: true } },
          },
        },
        receivingOrders: {
          select: { id: true, status: true, completedAt: true },
          take: 20,
        },
      },
    });

    if (!purchaseOrder) throw new NotFoundError("Pedido de compra");
    return NextResponse.json(purchaseOrder);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const session = await requirePermission(request, "purchasing", "write");
    const { id } = await params;
    const body = await request.json();
    const input = updatePurchaseOrderStatusSchema.parse(body);
    const status = input.status;

    const existing = await prisma.purchaseOrder.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundError("Pedido de compra");

    const validNext = PO_TRANSITIONS[existing.status];
    if (!validNext.includes(status)) {
      throw new ValidationError(
        `Transição de status inválida: ${existing.status} → ${status}.`,
      );
    }

    if (status === "APPROVED" && !APPROVAL_ROLES.includes(session.role as (typeof APPROVAL_ROLES)[number])) {
      throw new ForbiddenError("Apenas administradores ou gerentes podem aprovar pedidos de compra.");
    }

    const data: Record<string, unknown> = { status };
    if (input.notes !== undefined) data.notes = input.notes;
    if (status === "APPROVED") {
      data.approvedById = session.sub;
      data.approvedAt = new Date();
    }

    const purchaseOrder = await prisma.purchaseOrder.update({ where: { id }, data });

    await createAuditLog(
      { session, ipAddress: getClientIp(request) },
      "UPDATE",
      "PurchaseOrder",
      id,
      { status },
    );

    return NextResponse.json(purchaseOrder);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const session = await requirePermission(request, "purchasing", "write");
    const { id } = await params;

    const existing = await prisma.purchaseOrder.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundError("Pedido de compra");

    if (existing.status !== "DRAFT") {
      return NextResponse.json(
        { error: "Apenas pedidos em rascunho podem ser removidos." },
        { status: 400 },
      );
    }

    await prisma.purchaseOrder.update({ where: { id }, data: { deletedAt: new Date() } });

    await createAuditLog(
      { session, ipAddress: getClientIp(request) },
      "DELETE",
      "PurchaseOrder",
      id,
    );

    return NextResponse.json({ message: "Pedido de compra removido com sucesso." });
  } catch (error) {
    return handleApiError(error);
  }
}
