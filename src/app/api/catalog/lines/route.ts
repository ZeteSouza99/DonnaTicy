import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";
import { getPaginationParams, paginate } from "@/lib/pagination";
import { createLineSchema } from "@/schemas/catalog";
import { createAuditLog, getClientIp } from "@/lib/audit";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requirePermission(request, "catalog", "read");
    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = getPaginationParams(searchParams);
    const search = searchParams.get("search") ?? undefined;

    const where = {
      deletedAt: null,
      ...(search && {
        OR: [
          { name: { contains: search, mode: "insensitive" as const } },
          { code: { contains: search, mode: "insensitive" as const } },
        ],
      }),
    };

    const [data, total] = await Promise.all([
      prisma.line.findMany({
        where,
        include: { _count: { select: { products: true } } },
        skip,
        take: limit,
        orderBy: { name: "asc" },
      }),
      prisma.line.count({ where }),
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
    const session = await requirePermission(request, "catalog", "write");
    const body = await request.json();
    const input = createLineSchema.parse(body);

    const line = await prisma.line.create({ data: input });

    await createAuditLog(
      { session, ipAddress: getClientIp(request) },
      "CREATE",
      "Line",
      line.id,
      { code: input.code, name: input.name },
    );

    return NextResponse.json(line, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
