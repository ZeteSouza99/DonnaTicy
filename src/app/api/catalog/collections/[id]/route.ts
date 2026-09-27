import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { handleApiError, NotFoundError } from "@/lib/errors";
import { updateCollectionSchema } from "@/schemas/catalog";
import { createAuditLog, getClientIp } from "@/lib/audit";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    await requirePermission(request, "catalog", "read");
    const { id } = await params;

    const collection = await prisma.collection.findFirst({
      where: { id, deletedAt: null },
      include: { products: { where: { deletedAt: null }, select: { id: true, code: true, name: true } } },
    });

    if (!collection) throw new NotFoundError("Coleção");

    return NextResponse.json(collection);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const session = await requirePermission(request, "catalog", "manage");
    const { id } = await params;
    const body = await request.json();
    const input = updateCollectionSchema.parse(body);

    const existing = await prisma.collection.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundError("Coleção");

    const collection = await prisma.collection.update({ where: { id }, data: input });

    await createAuditLog(
      { session, ipAddress: getClientIp(request) },
      "UPDATE",
      "Collection",
      id,
      input,
    );

    return NextResponse.json(collection);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const session = await requirePermission(request, "catalog", "manage");
    const { id } = await params;

    const existing = await prisma.collection.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundError("Coleção");

    await prisma.collection.update({ where: { id }, data: { deletedAt: new Date() } });

    await createAuditLog(
      { session, ipAddress: getClientIp(request) },
      "DELETE",
      "Collection",
      id,
    );

    return NextResponse.json({ message: "Coleção removida com sucesso." });
  } catch (error) {
    return handleApiError(error);
  }
}
