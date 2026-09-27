import { NextRequest, NextResponse } from "next/server";
import { Carrier } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { handleApiError, NotFoundError } from "@/lib/errors";
import { getPaginationParams, paginate } from "@/lib/pagination";
import { createShipmentSchema } from "@/schemas/logistics";
import { createAuditLog, getClientIp } from "@/lib/audit";
import { parseEnumParam } from "@/lib/query-params";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requirePermission(request, "logistics", "read");
    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = getPaginationParams(searchParams);
    const orderId = searchParams.get("orderId") ?? undefined;
    const carrier = parseEnumParam(searchParams.get("carrier"), Carrier, "carrier");

    const where = {
      ...(orderId && { orderId }),
      ...(carrier && { carrier }),
    };

    const [data, total] = await Promise.all([
      prisma.shipment.findMany({
        where,
        include: {
          order: { select: { id: true, code: true, customer: { select: { fullName: true } } } },
        },
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      prisma.shipment.count({ where }),
    ]);

    return NextResponse.json(paginate(data, total, page, limit));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await requirePermission(request, "logistics", "write");
    const body = await request.json();
    const input = createShipmentSchema.parse(body);

    // FK validation
    const order = await prisma.order.findFirst({
      where: { id: input.orderId, deletedAt: null },
    });
    if (!order) throw new NotFoundError("Pedido");

    const shipment = await prisma.shipment.create({
      data: input,
      include: {
        order: { select: { code: true } },
      },
    });

    await createAuditLog(
      { session, ipAddress: getClientIp(request) },
      "CREATE",
      "Shipment",
      shipment.id,
      { orderId: input.orderId, carrier: input.carrier },
    );

    return NextResponse.json(shipment, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
