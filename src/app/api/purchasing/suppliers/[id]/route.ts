import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { handleApiError, NotFoundError } from "@/lib/errors";
import { updateSupplierSchema } from "@/schemas/purchasing";
import { createAuditLog, getClientIp } from "@/lib/audit";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    await requirePermission(request, "purchasing", "read");
    const { id } = await params;

    const supplier = await prisma.supplier.findFirst({
      where: { id, deletedAt: null },
      include: {
        _count: {
          select: {
            purchaseOrders: true,
            productionOrders: true,
            primaryMaterials: true,
          },
        },
      },
    });

    if (!supplier) throw new NotFoundError("Fornecedor");
    return NextResponse.json(supplier);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const session = await requirePermission(request, "purchasing", "write");
    const { id } = await params;
    const body = await request.json();
    const input = updateSupplierSchema.parse(body);

    const existing = await prisma.supplier.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundError("Fornecedor");

    const supplier = await prisma.supplier.update({ where: { id }, data: input });

    await createAuditLog(
      { session, ipAddress: getClientIp(request) },
      "UPDATE",
      "Supplier",
      id,
      { companyName: input.companyName },
    );

    return NextResponse.json(supplier);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const session = await requirePermission(request, "purchasing", "write");
    const { id } = await params;

    const existing = await prisma.supplier.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundError("Fornecedor");

    await prisma.supplier.update({ where: { id }, data: { deletedAt: new Date() } });

    await createAuditLog(
      { session, ipAddress: getClientIp(request) },
      "DELETE",
      "Supplier",
      id,
    );

    return NextResponse.json({ message: "Fornecedor removido com sucesso." });
  } catch (error) {
    return handleApiError(error);
  }
}
