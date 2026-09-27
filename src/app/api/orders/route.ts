import { NextRequest, NextResponse } from "next/server";
import { OrderStatus, OrderChannel } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";
import { parseEnumParam } from "@/lib/query-params";
import { getPaginationParams, paginate } from "@/lib/pagination";
import { createOrderSchema } from "@/schemas/sales";
import { getClientIp } from "@/lib/audit";
import { createOrder } from "@/services/order-service";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requirePermission(request, "orders", "read");
    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = getPaginationParams(searchParams);
    const statusParam = searchParams.get("status");
    const statuses = statusParam
      ? statusParam
          .split(",")
          .map((s) => parseEnumParam(s.trim(), OrderStatus, "status"))
          .filter((s): s is OrderStatus => Boolean(s))
      : undefined;
    const channel = parseEnumParam(searchParams.get("channel"), OrderChannel, "channel");
    const customerId = searchParams.get("customerId") ?? undefined;
    const locationId = searchParams.get("locationId") ?? undefined;
    const search = searchParams.get("search") ?? undefined;

    const where = {
      deletedAt: null,
      ...(statuses && statuses.length > 0 && { status: { in: statuses } }),
      ...(channel && { channel }),
      ...(customerId && { customerId }),
      ...(locationId && { locationId }),
      ...(search && {
        OR: [
          { code: { contains: search, mode: "insensitive" as const } },
          { customer: { fullName: { contains: search, mode: "insensitive" as const } } },
          { items: { some: { variant: { product: { name: { contains: search, mode: "insensitive" as const } } } } } },
          { items: { some: { variant: { sku: { contains: search, mode: "insensitive" as const } } } } },
        ],
      }),
    };

    const [data, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: {
          customer: { select: { id: true, code: true, fullName: true, phone: true } },
          location: { select: { id: true, name: true } },
          seller: { select: { id: true, name: true } },
          _count: { select: { items: true } },
        },
        skip,
        take: limit,
        orderBy: { placedAt: "desc" },
      }),
      prisma.order.count({ where }),
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
    const input = createOrderSchema.parse(body);

    const order = await prisma.$transaction((tx) =>
      createOrder(tx, { input, session, ipAddress: getClientIp(request) }),
    );

    return NextResponse.json(order, { status: 201 });
  } catch (error) {
    return handleApiError(error, request);
  }
}
