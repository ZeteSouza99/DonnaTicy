import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { handleApiError, NotFoundError } from "@/lib/errors";
import { updateShipmentSchema } from "@/schemas/logistics";
import { createAuditLog, getClientIp } from "@/lib/audit";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    await requirePermission(request, "logistics", "read");
    const { id } = await params;

    const shipment = await prisma.shipment.findUnique({
      where: { id },
      include: {
        order: {
          select: {
            id: true,
            code: true,
            customer: { select: { id: true, fullName: true } },
          },
        },
      },
    });

    if (!shipment) throw new NotFoundError("Envio");
    return NextResponse.json(shipment);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const session = await requirePermission(request, "logistics", "write");
    const { id } = await params;
    const body = await request.json();
    const input = updateShipmentSchema.parse(body);

    const existing = await prisma.shipment.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError("Envio");

    const data: Record<string, unknown> = { ...input };
    if (input.pickedAt) data.pickedAt = new Date(input.pickedAt);
    if (input.packedAt) data.packedAt = new Date(input.packedAt);
    if (input.shippedAt) data.shippedAt = new Date(input.shippedAt);
    if (input.deliveredAt) data.deliveredAt = new Date(input.deliveredAt);

    const shipment = await prisma.shipment.update({ where: { id }, data });

    await createAuditLog(
      { session, ipAddress: getClientIp(request) },
      "UPDATE",
      "Shipment",
      id,
      input,
    );

    return NextResponse.json(shipment);
  } catch (error) {
    return handleApiError(error);
  }
}
