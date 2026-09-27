import { NextRequest, NextResponse } from "next/server";
import { StoreCreditStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { handleApiError, ValidationError } from "@/lib/errors";
import { getPaginationParams, paginate } from "@/lib/pagination";
import { parseEnumParam } from "@/lib/query-params";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requirePermission(request, "orders", "read");
    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = getPaginationParams(searchParams);
    const customerId = searchParams.get("customerId") ?? undefined;
    const code = searchParams.get("code")?.trim().toUpperCase() || undefined;
    const status = parseEnumParam(searchParams.get("status"), StoreCreditStatus, "status");

    if (!customerId && !code) {
      throw new ValidationError("Informe customerId ou code para consultar vales-troca.");
    }

    const where = {
      ...(customerId && { customerId }),
      ...(code && { code }),
      ...(status
        ? { status }
        : code || customerId
          ? { status: { in: ["ACTIVE", "PARTIALLY_USED"] as StoreCreditStatus[] } }
          : {}),
    };

    const [data, total] = await Promise.all([
      prisma.storeCredit.findMany({
        where,
        include: {
          customer: { select: { id: true, fullName: true, phone: true } },
          exchange: { select: { id: true, code: true } },
        },
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      prisma.storeCredit.count({ where }),
    ]);

    return NextResponse.json(paginate(data, total, page, limit));
  } catch (error) {
    return handleApiError(error);
  }
}
