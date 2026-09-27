import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { handleApiError, NotFoundError } from "@/lib/errors";
import { bulkDeleteProductsSchema } from "@/schemas/catalog";
import { createAuditLog, getClientIp } from "@/lib/audit";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await requirePermission(request, "catalog", "manage");
    const body = await request.json();
    const { ids } = bulkDeleteProductsSchema.parse(body);

    const uniqueIds = [...new Set(ids)];

    const existing = await prisma.product.findMany({
      where: { id: { in: uniqueIds }, deletedAt: null },
      select: { id: true, code: true, name: true },
    });

    if (existing.length === 0) throw new NotFoundError("Produto");

    const deletedAt = new Date();
    const productIds = existing.map((p) => p.id);
    const [, result] = await prisma.$transaction([
      prisma.productVariant.updateMany({
        where: { productId: { in: productIds }, deletedAt: null },
        data: { deletedAt },
      }),
      prisma.product.updateMany({
        where: { id: { in: productIds }, deletedAt: null },
        data: { deletedAt },
      }),
    ]);

    const ipAddress = getClientIp(request);
    for (const product of existing) {
      await createAuditLog(
        { session, ipAddress },
        "DELETE",
        "Product",
        product.id,
        { code: product.code, name: product.name, bulk: true },
      );
    }

    return NextResponse.json({
      deleted: result.count,
      message: `${result.count} produto(s) removido(s) com sucesso.`,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
