import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { handleApiError, NotFoundError } from "@/lib/errors";
import { updateCategorySchema } from "@/schemas/catalog";
import { createAuditLog, getClientIp } from "@/lib/audit";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    await requirePermission(request, "catalog", "read");
    const { id } = await params;

    const category = await prisma.category.findFirst({
      where: { id, deletedAt: null },
      include: { _count: { select: { products: true } } },
    });

    if (!category) throw new NotFoundError("Categoria");
    return NextResponse.json(category);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const session = await requirePermission(request, "catalog", "manage");
    const { id } = await params;
    const body = await request.json();
    const input = updateCategorySchema.parse(body);

    const existing = await prisma.category.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundError("Categoria");

    const category = await prisma.category.update({ where: { id }, data: input });

    await createAuditLog(
      { session, ipAddress: getClientIp(request) },
      "UPDATE",
      "Category",
      id,
      input,
    );

    return NextResponse.json(category);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const session = await requirePermission(request, "catalog", "manage");
    const { id } = await params;

    const existing = await prisma.category.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundError("Categoria");

    await prisma.category.update({ where: { id }, data: { deletedAt: new Date() } });

    await createAuditLog(
      { session, ipAddress: getClientIp(request) },
      "DELETE",
      "Category",
      id,
    );

    return NextResponse.json({ message: "Categoria removida com sucesso." });
  } catch (error) {
    return handleApiError(error);
  }
}
