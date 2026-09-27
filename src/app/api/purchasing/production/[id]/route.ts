import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { handleApiError, NotFoundError } from "@/lib/errors";
import { updateProductionStatusSchema } from "@/schemas/purchasing";
import { createAuditLog, getClientIp } from "@/lib/audit";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    await requirePermission(request, "purchasing", "read");
    const { id } = await params;

    const order = await prisma.productionOrder.findFirst({
      where: { id, deletedAt: null },
      include: {
        supplier: { select: { id: true, companyName: true, tradeName: true } },
        collection: { select: { id: true, name: true, code: true } },
        items: {
          include: {
            product: { select: { id: true, code: true, name: true } },
            variant: {
              select: {
                id: true,
                sku: true,
                color: { select: { name: true } },
                size: { select: { name: true } },
              },
            },
          },
        },
      },
    });

    if (!order) throw new NotFoundError("Ordem de produção");
    return NextResponse.json(order);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const session = await requirePermission(request, "purchasing", "write");
    const { id } = await params;
    const body = await request.json();
    const input = updateProductionStatusSchema.parse(body);

    const existing = await prisma.productionOrder.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundError("Ordem de produção");

    const data: Record<string, unknown> = { status: input.status };
    if (input.status === "COMPLETED") data.completedAt = new Date();

    const order = await prisma.productionOrder.update({ where: { id }, data });

    await createAuditLog(
      { session, ipAddress: getClientIp(request) },
      "UPDATE",
      "ProductionOrder",
      id,
      { status: input.status },
    );

    return NextResponse.json(order);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const session = await requirePermission(request, "purchasing", "write");
    const { id } = await params;

    const existing = await prisma.productionOrder.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundError("Ordem de produção");

    if (existing.status !== "DRAFT") {
      return NextResponse.json(
        { error: "Apenas ordens em rascunho podem ser removidas." },
        { status: 400 },
      );
    }

    await prisma.productionOrder.update({ where: { id }, data: { deletedAt: new Date() } });

    await createAuditLog(
      { session, ipAddress: getClientIp(request) },
      "DELETE",
      "ProductionOrder",
      id,
    );

    return NextResponse.json({ message: "Ordem de produção removida com sucesso." });
  } catch (error) {
    return handleApiError(error);
  }
}
