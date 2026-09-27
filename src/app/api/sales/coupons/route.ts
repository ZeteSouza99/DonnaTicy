import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";
import { getPaginationParams, paginate } from "@/lib/pagination";
import { createCouponSchema } from "@/schemas/sales";
import { createAuditLog, getClientIp } from "@/lib/audit";
import { startOfDayUtc, endOfDayUtc } from "@/lib/date";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requirePermission(request, "orders", "read");
    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = getPaginationParams(searchParams);
    const search = searchParams.get("search") ?? undefined;
    const active = searchParams.get("active");

    const where = {
      deletedAt: null,
      ...(active === "true" && { isActive: true }),
      ...(active === "false" && { isActive: false }),
      ...(search && {
        OR: [
          { code: { contains: search, mode: "insensitive" as const } },
          { description: { contains: search, mode: "insensitive" as const } },
        ],
      }),
    };

    const [data, total] = await Promise.all([
      prisma.coupon.findMany({
        where,
        include: { _count: { select: { orders: true } } },
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      prisma.coupon.count({ where }),
    ]);

    return NextResponse.json(paginate(data, total, page, limit));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await requirePermission(request, "orders", "write");
    const body = await request.json();
    const input = createCouponSchema.parse(body);

    const coupon = await prisma.coupon.create({
      data: {
        ...input,
        validFrom: startOfDayUtc(input.validFrom),
        validUntil: endOfDayUtc(input.validUntil),
      },
    });

    await createAuditLog(
      { session, ipAddress: getClientIp(request) },
      "CREATE",
      "Coupon",
      coupon.id,
      { code: input.code },
    );

    return NextResponse.json(coupon, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
