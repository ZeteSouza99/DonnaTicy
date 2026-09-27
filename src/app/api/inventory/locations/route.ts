import { NextRequest, NextResponse } from "next/server";
import { LocationType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";
import { getPaginationParams, paginate } from "@/lib/pagination";
import { createLocationSchema } from "@/schemas/inventory";
import { createAuditLog, getClientIp } from "@/lib/audit";
import { parseEnumParam } from "@/lib/query-params";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requirePermission(request, "inventory", "read");
    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = getPaginationParams(searchParams);
    const type = parseEnumParam(searchParams.get("type"), LocationType, "type");

    const where = {
      deletedAt: null,
      ...(type && { type }),
    };

    const [data, total] = await Promise.all([
      prisma.location.findMany({ where, skip, take: limit, orderBy: { name: "asc" } }),
      prisma.location.count({ where }),
    ]);

    return NextResponse.json(paginate(data, total, page, limit), {
      headers: { "Cache-Control": "private, max-age=0, s-maxage=60, stale-while-revalidate=300" },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await requirePermission(request, "inventory", "write");
    const body = await request.json();
    const input = createLocationSchema.parse(body);

    const location = await prisma.location.create({ data: input });

    await createAuditLog(
      { session, ipAddress: getClientIp(request) },
      "CREATE",
      "Location",
      location.id,
      { code: input.code, name: input.name },
    );

    return NextResponse.json(location, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
