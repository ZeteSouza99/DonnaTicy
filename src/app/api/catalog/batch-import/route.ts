import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "@/lib/zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { handleApiError, ValidationError } from "@/lib/errors";
import { createAuditLog, getClientIp } from "@/lib/audit";
import { barcodeCandidate, internalCodeToSeed, isValidEan13, normalizeInternalCode, onlyDigits } from "@/lib/barcode";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const rowSchema = z.object({
  code: z.string().min(1, "Código (SKU) obrigatório."),
  barcode: z.string().optional(),
  fiscalDescription: z.string().default(""),
  internalDescription: z.string().min(1, "Descrição interna obrigatória."),
  colorId: z.string().min(1, "Cor obrigatória."),
  sizeId: z.string().min(1, "Tamanho obrigatório."),
  categoryId: z.string().min(1, "Categoria obrigatória."),
  quantity: z.number().int().min(0).default(0),
  costUnit: z.number().min(0, "Valor de custo inválido."),
  priceSuggestion: z.string().default(""),
  supplierId: z.string().optional(),
  notes: z.string().optional(),
});

const batchImportSchema = z.object({
  collectionId: z.string().min(1, "Coleção obrigatória."),
  lineId: z.string().min(1, "Linha obrigatória."),
  locationId: z.string().min(1, "Local de estoque obrigatório."),
  /** Código interno do produto — base do código de barras gerado. */
  internalCode: z.string().optional(),
  rows: z.array(rowSchema).min(1, "Inclua pelo menos uma peça."),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Converte "$159 à $169" ou "159-169" em ponto médio. */
function parsePriceAvg(text: string, fallback: number): number {
  const nums = (text.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => Number(n.replace(",", ".")));
  if (nums.length === 0) return fallback;
  if (nums.length === 1) return nums[0];
  return Math.round((nums[0] + nums[1]) / 2);
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function buildProductCode(name: string): string {
  return slug(name).toUpperCase().replace(/-/g, "-").slice(0, 30);
}

/**
 * Gera um EAN-13 interno único para a variante.
 * Parte da semente derivada do código interno e incrementa até não colidir —
 * tanto com o banco quanto com os códigos já gerados nesta requisição.
 */
async function generateUniqueBarcode(
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
  throw new ValidationError("Não foi possível gerar um código de barras único. Use outro código interno.");
}

// ---------------------------------------------------------------------------
// POST /api/catalog/batch-import
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await requirePermission(request, "catalog", "write");
    const body = await request.json();
    const input = batchImportSchema.parse(body);

    // Agrupa linhas por Descrição Interna (um produto por grupo)
    const groups = new Map<string, typeof input.rows>();
    for (const row of input.rows) {
      const key = row.internalDescription.trim().toUpperCase();
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(row);
    }

    const results = await prisma.$transaction(async (tx) => {
      const created: {
        productId: string;
        productName: string;
        variants: { id: string; sku: string; barcode: string }[];
      }[] = [];
      const takenBarcodes = new Set<string>();
      let barcodeOffset = 0;

      for (const [name, group] of groups) {
        const sample = group[0];
        const avgCost = group.reduce((s, r) => s + r.costUnit, 0) / group.length;
        const basePrice = parsePriceAvg(sample.priceSuggestion, Math.round(avgCost * 2.5));
        const markup = avgCost > 0 ? ((basePrice - avgCost) / avgCost) * 100 : 0;

        let productCode = buildProductCode(name);
        const existing = await tx.product.findUnique({ where: { code: productCode } });
        if (existing) {
          productCode = `${productCode}-${Date.now().toString(36).toUpperCase().slice(-4)}`;
        }

        const product = await tx.product.create({
          data: {
            code: productCode,
            name,
            description: sample.fiscalDescription || undefined,
            collectionId: input.collectionId,
            lineId: input.lineId,
            categoryId: sample.categoryId,
            costPrice: Number(avgCost.toFixed(2)),
            basePrice: Number(basePrice.toFixed(2)),
            markup: Number(markup.toFixed(2)),
            technology: [],
          },
        });

        const variantIds: { id: string; sku: string; barcode: string }[] = [];
        const seedBase = internalCodeToSeed(
          normalizeInternalCode(input.internalCode ?? "") || productCode,
        );

        for (const row of group) {
          // Checa duplicidade de SKU
          const skuExists = await tx.productVariant.findUnique({ where: { sku: row.code } });
          if (skuExists) {
            throw new ValidationError(`SKU "${row.code}" já existe no catálogo.`);
          }

          // Código de barras: usa o informado (se for EAN-13 válido) ou gera um interno.
          let barcode: string;
          if (row.barcode && isValidEan13(row.barcode)) {
            barcode = onlyDigits(row.barcode);
            const barcodeExists = await tx.productVariant.findUnique({
              where: { barcode },
              select: { id: true },
            });
            if (barcodeExists || takenBarcodes.has(barcode)) {
              throw new ValidationError(`Código de barras "${barcode}" já está em uso.`);
            }
            takenBarcodes.add(barcode);
          } else {
            barcode = await generateUniqueBarcode(tx, seedBase, barcodeOffset, takenBarcodes);
          }
          barcodeOffset++;

          const variant = await tx.productVariant.create({
            data: {
              productId: product.id,
              sku: row.code,
              barcode,
              colorId: row.colorId,
              sizeId: row.sizeId,
              additionalCost: 0,
            },
          });

          if (row.quantity > 0) {
            await tx.stockPosition.create({
              data: {
                variantId: variant.id,
                locationId: input.locationId,
                quantity: row.quantity,
                minStock: 1,
                safetyStock: 2,
                maxStock: Math.max(row.quantity * 2, 10),
              },
            });

            await tx.stockMovement.create({
              data: {
                variantId: variant.id,
                toLocationId: input.locationId,
                quantity: row.quantity,
                reason: "PURCHASE_RECEIVED",
                notes: row.notes || "Entrada inicial via cadastro de produto.",
              },
            });
          }
          variantIds.push({ id: variant.id, sku: variant.sku, barcode });
        }
        created.push({ productId: product.id, productName: name, variants: variantIds });
      }
      return created;
    });

    await createAuditLog(
      { session, ipAddress: getClientIp(request) },
      "CREATE",
      "Product",
      "BATCH_IMPORT",
      { count: results.length, variantsTotal: input.rows.length },
    );

    return NextResponse.json({
      productsCreated: results.length,
      variantsCreated: input.rows.length,
      results,
    }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
