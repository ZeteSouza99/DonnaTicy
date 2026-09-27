import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { handleApiError, NotFoundError } from "@/lib/errors";
import { updateLineSchema } from "@/schemas/catalog";
import { createAuditLog, getClientIp } from "@/lib/audit";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    await requirePermission(request, "catalog", "read");
    const { id } = await params;

    const line = await prisma.line.findFirst({
      where: { id, deletedAt: null },
      include: { _count: { select: { products: true } } },
    });

    if (!line) throw new NotFoundError("Linha");
    return NextResponse.json(line);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const session = await requirePermission(request, "catalog", "manage");
    const { id } = await params;
    const body = await request.json();
    const input = updateLineSchema.parse(body);

    const existing = await prisma.line.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundError("Linha");

    const line = await prisma.line.update({ where: { id }, data: input });

    await createAuditLog(
      { session, ipAddress: getClientIp(request) },
      "UPDATE",
      "Line",
      id,
      input,
    );

    return NextResponse.json(line);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const session = await requirePermission(request, "catalog", "manage");
    const { id } = await params;

    const existing = await prisma.line.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundError("Linha");

    await prisma.line.update({ where: { id }, data: { deletedAt: new Date() } });

    await createAuditLog(
      { session, ipAddress: getClientIp(request) },
      "DELETE",
      "Line",
      id,
    );

    return NextResponse.json({ message: "Linha removida com sucesso." });
  } catch (error) {
    return handleApiError(error);
  }
}
