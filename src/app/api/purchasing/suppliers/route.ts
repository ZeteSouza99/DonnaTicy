import { NextRequest, NextResponse } from "next/server";
import { SupplierType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";
import { getPaginationParams, paginate } from "@/lib/pagination";
import { createSupplierSchema } from "@/schemas/purchasing";
import { createAuditLog, getClientIp } from "@/lib/audit";
import { parseEnumParam } from "@/lib/query-params";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requirePermission(request, "purchasing", "read");
    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = getPaginationParams(searchParams);
    const search = searchParams.get("search") ?? undefined;
    const type = parseEnumParam(searchParams.get("type"), SupplierType, "type");

    const where = {
      deletedAt: null,
      ...(type && { type }),
      ...(search && {
        OR: [
          { companyName: { contains: search, mode: "insensitive" as const } },
          { tradeName: { contains: search, mode: "insensitive" as const } },
          { cnpj: { contains: search } },
        ],
      }),
    };

    const [data, total] = await Promise.all([
      prisma.supplier.findMany({
        where,
        skip,
        take: limit,
        orderBy: { companyName: "asc" },
      }),
      prisma.supplier.count({ where }),
    ]);

    return NextResponse.json(paginate(data, total, page, limit));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await requirePermission(request, "purchasing", "write");
    const body = await request.json();
    const input = createSupplierSchema.parse(body);

    const supplier = await prisma.supplier.create({ data: input });

    await createAuditLog(
      { session, ipAddress: getClientIp(request) },
      "CREATE",
      "Supplier",
      supplier.id,
      { companyName: input.companyName, cnpj: input.cnpj },
    );

    return NextResponse.json(supplier, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
