import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { handleApiError, NotFoundError, ConflictError } from "@/lib/errors";
import { updateCustomerSchema } from "@/schemas/sales";
import { createAuditLog, getClientIp } from "@/lib/audit";
import { parseDateOnly } from "@/lib/date";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    await requirePermission(request, "customers", "read");
    const { id } = await params;

    const customer = await prisma.customer.findFirst({
      where: { id, deletedAt: null },
      include: {
        addresses: true,
        orders: {
          where: { deletedAt: null },
          select: { id: true, code: true, status: true, total: true, placedAt: true, channel: true },
          orderBy: { placedAt: "desc" },
          take: 10,
        },
        loyaltyTransactions: {
          orderBy: { createdAt: "desc" },
          take: 20,
        },
        _count: {
          select: { orders: true, returnRequests: true },
        },
      },
    });

    if (!customer) throw new NotFoundError("Cliente");

    return NextResponse.json(customer);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const session = await requirePermission(request, "customers", "write");
    const { id } = await params;
    const body = await request.json();
    const input = updateCustomerSchema.parse(body);

    const existing = await prisma.customer.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundError("Cliente");

    // Unique constraint checks with soft-delete awareness
    if (input.email) {
      const dup = await prisma.customer.findFirst({
        where: { email: input.email, deletedAt: null, id: { not: id } },
      });
      if (dup) throw new ConflictError("E-mail já cadastrado.");
    }
    if (input.phone) {
      const dup = await prisma.customer.findFirst({
        where: { phone: input.phone, deletedAt: null, id: { not: id } },
      });
      if (dup) throw new ConflictError("Telefone já cadastrado.");
    }
    if (input.cpf) {
      const dup = await prisma.customer.findFirst({
        where: { cpf: input.cpf, deletedAt: null, id: { not: id } },
      });
      if (dup) throw new ConflictError("CPF já cadastrado.");
    }

    const customer = await prisma.customer.update({
      where: { id },
      data: {
        ...input,
        birthDate: input.birthDate ? parseDateOnly(input.birthDate) : undefined,
      },
    });

    await createAuditLog(
      { session, ipAddress: getClientIp(request) },
      "UPDATE",
      "Customer",
      id,
      input,
    );

    return NextResponse.json(customer);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const session = await requirePermission(request, "customers", "manage");
    const { id } = await params;

    const existing = await prisma.customer.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundError("Cliente");

    const activeOrders = await prisma.order.count({
      where: {
        customerId: id,
        deletedAt: null,
        status: { notIn: ["CANCELLED", "DELIVERED"] },
      },
    });
    if (activeOrders > 0) {
      throw new ConflictError(
        `Cliente possui ${activeOrders} pedido(s) em andamento e não pode ser removido.`,
      );
    }

    await prisma.customer.update({ where: { id }, data: { deletedAt: new Date() } });

    await createAuditLog(
      { session, ipAddress: getClientIp(request) },
      "DELETE",
      "Customer",
      id,
    );

    return NextResponse.json({ message: "Cliente removido com sucesso." });
  } catch (error) {
    return handleApiError(error);
  }
}
