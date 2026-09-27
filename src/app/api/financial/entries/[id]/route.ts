import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { handleApiError, NotFoundError, ForbiddenError } from "@/lib/errors";
import { updateFinancialEntrySchema } from "@/schemas/financial";
import { getClientIp } from "@/lib/audit";
import { deleteFinancialEntries, updateFinancialEntry } from "@/services/financial-entry-service";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    await requirePermission(request, "financial", "read");
    const { id } = await params;

    const entry = await prisma.financialEntry.findFirst({
      where: { id, deletedAt: null },
      include: {
        order: { select: { id: true, code: true, status: true } },
        costCenter: { select: { id: true, code: true, name: true } },
      },
    });

    if (!entry) throw new NotFoundError("Lançamento financeiro");
    return NextResponse.json(entry);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const session = await requirePermission(request, "financial", "write");
    if (session.role === "SELLER") {
      throw new ForbiddenError("Seu perfil não pode editar lançamentos.");
    }
    const { id } = await params;
    const body = await request.json();
    const input = updateFinancialEntrySchema.parse(body);

    const entry = await prisma.$transaction((tx) =>
      updateFinancialEntry(tx, { id, input, session, ipAddress: getClientIp(request) }),
    );

    return NextResponse.json(entry);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const session = await requirePermission(request, "financial", "write");
    if (session.role === "SELLER") {
      throw new ForbiddenError("Seu perfil não pode excluir lançamentos.");
    }
    const { id } = await params;

    await prisma.$transaction((tx) =>
      deleteFinancialEntries(tx, { ids: [id], session, ipAddress: getClientIp(request) }),
    );

    return NextResponse.json({ message: "Lançamento removido com sucesso." });
  } catch (error) {
    return handleApiError(error);
  }
}
