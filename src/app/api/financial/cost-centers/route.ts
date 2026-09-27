import { NextRequest, NextResponse } from "next/server";
import { CostCenterType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { handleApiError, ForbiddenError } from "@/lib/errors";
import { getPaginationParams, paginate } from "@/lib/pagination";
import { createCostCenterSchema } from "@/schemas/financial";
import { createAuditLog, getClientIp } from "@/lib/audit";
import { parseEnumParam } from "@/lib/query-params";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requirePermission(request, "financial", "read");
    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = getPaginationParams(searchParams);
    const search = searchParams.get("search") ?? undefined;
    const type = parseEnumParam(searchParams.get("type"), CostCenterType, "type");

    const where = {
      deletedAt: null,
      ...(type && { type }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: "insensitive" as const } },
          { code: { contains: search, mode: "insensitive" as const } },
        ],
      }),
    };

    const [data, total] = await Promise.all([
      prisma.costCenter.findMany({
        where,
        include: {
          location: { select: { id: true, name: true } },
          _count: { select: { financialEntries: true } },
        },
        skip,
        take: limit,
        orderBy: { code: "asc" },
      }),
      prisma.costCenter.count({ where }),
    ]);

    return NextResponse.json(paginate(data, total, page, limit));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await requirePermission(request, "financial", "write");
    if (session.role === "SELLER") {
      throw new ForbiddenError("Seu perfil não pode criar centros de custo.");
    }
    const body = await request.json();
    const input = createCostCenterSchema.parse(body);

    const costCenter = await prisma.costCenter.create({
      data: input,
      include: { location: { select: { id: true, name: true } } },
    });

    await createAuditLog(
      { session, ipAddress: getClientIp(request) },
      "CREATE",
      "CostCenter",
      costCenter.id,
      { code: input.code, name: input.name },
    );

    return NextResponse.json(costCenter, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
