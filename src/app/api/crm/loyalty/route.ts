import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { handleApiError, NotFoundError } from "@/lib/errors";
import { createLoyaltyTransactionSchema } from "@/schemas/crm";
import { createAuditLog, getClientIp } from "@/lib/audit";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requirePermission(request, "crm", "read");
    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get("customerId") ?? undefined;

    const where = {
      ...(customerId && { customerId }),
    };

    const transactions = await prisma.loyaltyTransaction.findMany({
      where,
      include: {
        customer: { select: { id: true, fullName: true, tier: true, loyaltyPoints: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return NextResponse.json({ data: transactions });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await requirePermission(request, "crm", "write");
    const body = await request.json();
    const input = createLoyaltyTransactionSchema.parse(body);

    // FK validation
    const customer = await prisma.customer.findFirst({
      where: { id: input.customerId, deletedAt: null },
    });
    if (!customer) throw new NotFoundError("Cliente");

    const transaction = await prisma.$transaction(async (tx) => {
      const loyaltyTx = await tx.loyaltyTransaction.create({
        data: {
          customerId: input.customerId,
          points: input.points,
          type: input.type,
          description: input.description,
          orderId: input.orderId,
          expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        },
      });

      await tx.customer.update({
        where: { id: input.customerId },
        data: { loyaltyPoints: { increment: input.points } },
      });

      return loyaltyTx;
    });

    await createAuditLog(
      { session, ipAddress: getClientIp(request) },
      "CREATE",
      "LoyaltyTransaction",
      transaction.id,
      { customerId: input.customerId, points: input.points, type: input.type },
    );

    return NextResponse.json(transaction, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
