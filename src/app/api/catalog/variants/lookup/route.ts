import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { handleApiError, NotFoundError, ValidationError } from "@/lib/errors";
import { onlyDigits } from "@/lib/barcode";

const VARIANT_INCLUDE = {
  product: {
    select: {
      id: true,
      code: true,
      name: true,
      basePrice: true,
      collection: { select: { name: true } },
      line: { select: { name: true } },
      category: { select: { name: true } },
    },
  },
  color: { select: { id: true, name: true, hexValue: true } },
  size: { select: { id: true, name: true, code: true } },
  stockPositions: { select: { locationId: true, quantity: true, reservedQty: true } },
} as const;

/**
 * GET /api/catalog/variants/lookup?code=<código de barras ou SKU>
 *
 * Busca EXATA, feita para leitor de código de barras no PDV.
 * Prioriza o código de barras; cai para o SKU quando não houver match.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requirePermission(request, "catalog", "read");

    const raw = (new URL(request.url).searchParams.get("code") ?? "").trim();
    if (!raw) throw new ValidationError("Informe o código a ser consultado.");

    const digits = onlyDigits(raw);

    const variant =
      (digits
        ? await prisma.productVariant.findFirst({
            where: { barcode: digits, deletedAt: null },
            include: VARIANT_INCLUDE,
          })
        : null) ??
      (await prisma.productVariant.findFirst({
        where: { sku: { equals: raw, mode: "insensitive" }, deletedAt: null },
        include: VARIANT_INCLUDE,
      }));

    if (!variant) throw new NotFoundError(`Peça com código "${raw}"`);

    return NextResponse.json(variant);
  } catch (error) {
    return handleApiError(error);
  }
}
