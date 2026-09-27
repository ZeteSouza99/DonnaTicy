import { NextRequest, NextResponse } from "next/server";
import { FinancialEntryType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { handleApiError, ForbiddenError, ConflictError } from "@/lib/errors";
import { getPaginationParams, paginate } from "@/lib/pagination";
import { createFinancialEntrySchema } from "@/schemas/financial";
import { createAuditLogTx, getClientIp } from "@/lib/audit";
import { parseEnumParam, parseDateParam } from "@/lib/query-params";
import { parseDateOnly } from "@/lib/date";
import { lockOrder } from "@/services/order-lock";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requirePermission(request, "financial", "read");
    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = getPaginationParams(searchParams);
    const type = parseEnumParam(searchParams.get("type"), FinancialEntryType, "type");
    const costCenterId = searchParams.get("costCenterId") ?? undefined;
    const from = parseDateParam(searchParams.get("from"), "from");
    const to = parseDateParam(searchParams.get("to"), "to", "end");

    const where = {
      deletedAt: null,
      ...(type && { type }),
      ...(costCenterId && { costCenterId }),
      ...(from && to && {
        competenceDate: {
          gte: from,
          lte: to,
        },
      }),
    };

    const [data, total] = await Promise.all([
      prisma.financialEntry.findMany({
        where,
        include: {
          order: { select: { id: true, code: true, status: true } },
          costCenter: { select: { id: true, code: true, name: true } },
        },
        skip,
        take: limit,
        orderBy: { competenceDate: "desc" },
      }),
      prisma.financialEntry.count({ where }),
    ]);

    return NextResponse.json(paginate(data, total, page, limit));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await requirePermission(request, "financial", "write");
    const body = await request.json();
    const input = createFinancialEntrySchema.parse(body);

    if (session.role === "SELLER" && input.type !== "EXPENSE") {
      throw new ForbiddenError("Seu perfil só pode lançar despesas.");
    }

    const entry = await prisma.$transaction(async (tx) => {
      if (input.orderId) {
        const order = await lockOrder(tx, input.orderId);
        if (order.status === "CANCELLED") {
          throw new ConflictError("Não é permitido criar lançamentos manuais em um pedido cancelado.");
        }
      }
      const created = await tx.financialEntry.create({
        data: {
          type: input.type,
          category: input.category,
          description: input.description,
          orderId: input.orderId,
          locationId: input.locationId,
          amount: input.amount,
          competenceDate: parseDateOnly(input.competenceDate ?? input.dueDate),
          dueDate: parseDateOnly(input.dueDate),
          cashDate:
            input.status === "PAID" && input.cashDate ? parseDateOnly(input.cashDate) : undefined,
          status: input.status,
          paymentMethod: input.paymentMethod,
          documentType: input.documentType,
          documentNumber: input.documentNumber,
          costCenterId: input.costCenterId,
        },
      });

      await createAuditLogTx(
        tx,
        { session, ipAddress: getClientIp(request) },
        "CREATE",
        "FinancialEntry",
        created.id,
        { type: input.type, amount: input.amount },
      );

      return created;
    });

    return NextResponse.json(entry, { status: 201 });
  } catch (error) {
    return handleApiError(error, request);
  }
}
