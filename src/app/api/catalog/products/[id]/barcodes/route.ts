import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { handleApiError, NotFoundError, ValidationError } from "@/lib/errors";
import { createAuditLog, getClientIp } from "@/lib/audit";
import { barcodeCandidate, internalCodeToSeed, normalizeInternalCode } from "@/lib/barcode";

interface RouteParams {
  params: Promise<{ id: string }>;
}

async function nextFreeBarcode(
  tx: Prisma.TransactionClient,
  seedBase: string,
  offset: number,
  taken: Set<string>,
): Promise<string> {
  for (let attempt = 0; attempt < 200; attempt++) {
    const candidate = barcodeCandidate(seedBase, offset + attempt);
    if (taken.has(candidate)) continue;    const exists = await tx.productVariant.findUnique({ where: { barcode: candidate }, select: { id: true } });
    if (!exists) {
      taken.add(candidate);
      return candidate;
    }
  }
  throw new ValidationError("Não foi possível gerar códigos de barras únicos para este produto.");
}

/**
 * POST /api/catalog/products/[id]/barcodes
 *
 * Gera código de barras EAN-13 interno para as variantes que ainda não têm.
 * Variantes com código existente são preservadas.
 */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const session = await requirePermission(request, "catalog", "write");
    const { id } = await params;

    const product = await prisma.product.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, code: true },
    });
    if (!product) throw new NotFoundError("Produto");

    const updated = await prisma.$transaction(async (tx) => {
      const pending = await tx.productVariant.findMany({
        where: { productId: id, deletedAt: null, barcode: null },
        select: { id: true, sku: true },
        orderBy: { sku: "asc" },
      });

      const seedBase = internalCodeToSeed(normalizeInternalCode(product.code));
      const taken = new Set<string>();
      const result: { id: string; sku: string; barcode: string }[] = [];

      for (let i = 0; i < pending.length; i++) {
        const barcode = await nextFreeBarcode(tx, seedBase, i, taken);
        await tx.productVariant.update({ where: { id: pending[i].id }, data: { barcode } });
        result.push({ id: pending[i].id, sku: pending[i].sku, barcode });
      }
      return result;
    });

    if (updated.length > 0) {
      await createAuditLog(
        { session, ipAddress: getClientIp(request) },
        "UPDATE",
        "ProductVariant",
        product.id,
        { action: "GENERATE_BARCODES", count: updated.length },
      );
    }

    return NextResponse.json({ generated: updated.length, variants: updated });
  } catch (error) {
    return handleApiError(error);
  }
}
