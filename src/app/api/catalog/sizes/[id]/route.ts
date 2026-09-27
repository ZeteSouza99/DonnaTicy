import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { handleApiError, NotFoundError } from "@/lib/errors";
import { updateSizeSchema } from "@/schemas/catalog";
import { createAuditLog, getClientIp } from "@/lib/audit";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    await requirePermission(request, "catalog", "read");
    const { id } = await params;

    const size = await prisma.size.findFirst({ where: { id, isActive: true } });
    if (!size) throw new NotFoundError("Tamanho");
    return NextResponse.json(size);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const session = await requirePermission(request, "catalog", "manage");
    const { id } = await params;
    const body = await request.json();
    const input = updateSizeSchema.parse(body);

    const existing = await prisma.size.findFirst({ where: { id, isActive: true } });
    if (!existing) throw new NotFoundError("Tamanho");

    const size = await prisma.size.update({ where: { id }, data: input });

    await createAuditLog(
      { session, ipAddress: getClientIp(request) },
      "UPDATE",
      "Size",
      id,
      input,
    );

    return NextResponse.json(size);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const session = await requirePermission(request, "catalog", "manage");
    const { id } = await params;

    const existing = await prisma.size.findFirst({ where: { id, isActive: true } });
    if (!existing) throw new NotFoundError("Tamanho");

    await prisma.size.update({ where: { id }, data: { isActive: false } });

    await createAuditLog(
      { session, ipAddress: getClientIp(request) },
      "DELETE",
      "Size",
      id,
    );

    return NextResponse.json({ message: "Tamanho desativado com sucesso." });
  } catch (error) {
    return handleApiError(error);
  }
}
