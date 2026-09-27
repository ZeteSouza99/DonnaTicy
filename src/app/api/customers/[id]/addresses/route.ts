import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { handleApiError, NotFoundError } from "@/lib/errors";
import { createAddressSchema } from "@/schemas/sales";
import { createAuditLog, getClientIp } from "@/lib/audit";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    await requirePermission(request, "customers", "read");
    const { id } = await params;

    const customer = await prisma.customer.findFirst({ where: { id, deletedAt: null } });
    if (!customer) throw new NotFoundError("Cliente");

    const addresses = await prisma.customerAddress.findMany({
      where: { customerId: id },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    });

    return NextResponse.json(addresses);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const session = await requirePermission(request, "customers", "write");
    const { id } = await params;
    const body = await request.json();
    const input = createAddressSchema.parse(body);

    const customer = await prisma.customer.findFirst({ where: { id, deletedAt: null } });
    if (!customer) throw new NotFoundError("Cliente");

    const address = await prisma.$transaction(async (tx) => {
      if (input.isDefault) {
        await tx.customerAddress.updateMany({
          where: { customerId: id },
          data: { isDefault: false },
        });
      }

      return tx.customerAddress.create({
        data: { ...input, customerId: id },
      });
    });

    await createAuditLog(
      { session, ipAddress: getClientIp(request) },
      "CREATE",
      "CustomerAddress",
      address.id,
      { customerId: id, city: input.city },
    );

    return NextResponse.json(address, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
