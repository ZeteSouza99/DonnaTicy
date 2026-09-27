import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { handleApiError, NotFoundError } from "@/lib/errors";
import { updateColorSchema } from "@/schemas/catalog";
import { createAuditLog, getClientIp } from "@/lib/audit";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    await requirePermission(request, "catalog", "read");
    const { id } = await params;

    const color = await prisma.color.findFirst({ where: { id, isActive: true } });
    if (!color) throw new NotFoundError("Cor");
    return NextResponse.json(color);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const session = await requirePermission(request, "catalog", "manage");
    const { id } = await params;
    const body = await request.json();
    const input = updateColorSchema.parse(body);

    const existing = await prisma.color.findFirst({ where: { id, isActive: true } });
    if (!existing) throw new NotFoundError("Cor");

    const color = await prisma.color.update({ where: { id }, data: input });

    await createAuditLog(
      { session, ipAddress: getClientIp(request) },
      "UPDATE",
      "Color",
      id,
      input,
    );

    return NextResponse.json(color);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const session = await requirePermission(request, "catalog", "manage");
    const { id } = await params;

    const existing = await prisma.color.findFirst({ where: { id, isActive: true } });
    if (!existing) throw new NotFoundError("Cor");

    await prisma.color.update({ where: { id }, data: { isActive: false } });

    await createAuditLog(
      { session, ipAddress: getClientIp(request) },
      "DELETE",
      "Color",
      id,
    );

    return NextResponse.json({ message: "Cor desativada com sucesso." });
  } catch (error) {
    return handleApiError(error);
  }
}
