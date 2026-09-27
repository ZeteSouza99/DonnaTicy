import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { handleApiError, ForbiddenError } from "@/lib/errors";
import { bulkDeleteFinancialEntriesSchema } from "@/schemas/financial";
import { getClientIp } from "@/lib/audit";
import { deleteFinancialEntries } from "@/services/financial-entry-service";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await requirePermission(request, "financial", "write");
    if (session.role === "SELLER") {
      throw new ForbiddenError("Seu perfil não pode excluir lançamentos.");
    }

    const body = await request.json();
    const { ids } = bulkDeleteFinancialEntriesSchema.parse(body);
    const deleted = await prisma.$transaction((tx) =>
      deleteFinancialEntries(tx, { ids, session, ipAddress: getClientIp(request), bulk: true }),
    );

    return NextResponse.json({
      deleted,
      message: `${deleted} lançamento(s) removido(s) com sucesso.`,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
