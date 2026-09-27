import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";
import { getPaginationParams, paginate } from "@/lib/pagination";
import { createColorSchema } from "@/schemas/catalog";
import { createAuditLog, getClientIp } from "@/lib/audit";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requirePermission(request, "catalog", "read");
    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = getPaginationParams(searchParams);

    const [data, total] = await Promise.all([
      prisma.color.findMany({
        where: { isActive: true },
        include: { _count: { select: { variants: true } } },
        skip,
        take: limit,
        orderBy: { name: "asc" },
      }),
      prisma.color.count({ where: { isActive: true } }),
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
    const input = createColorSchema.parse(body);

    const color = await prisma.color.create({ data: input });

    await createAuditLog(
      { session, ipAddress: getClientIp(request) },
      "CREATE",
      "Color",
      color.id,
      { code: input.code, name: input.name },
    );

    return NextResponse.json(color, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
