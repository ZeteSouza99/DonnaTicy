import { prisma } from "@/lib/db";
import type { ParsedRow } from "./spreadsheet-parser";

export interface ImportSummary {
  invoicesProcessed: number;
  invoicesCreated: number;
  invoicesUpdated: number;
  productsCreated: number;
  productsUpdated: number;
  variantsCreated: number;
  variantsUpdated: number;
  stockEntered: number;
  totalUnits: number;
  errors: { line: number; sku?: string; message: string }[];
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function slug(s: string): string {
  return String(s)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

function pseudoCnpjFromName(name: string): string {
  // 14 dígitos pseudo-determinísticos (não tenta validar dígito verificador)
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return String(h).padStart(14, "0").slice(0, 14);
}

const SIZE_ORDER: Record<string, number> = {
  PP: 1, P: 2, M: 3, G: 4, GG: 5, XGG: 6,
  "34": 10, "36": 11, "38": 12, "40": 13, "42": 14, "44": 15, "46": 16, "48": 17,
};

const COLOR_HEX: Record<string, string> = {
  PRETO: "#000000", BRANCO: "#FFFFFF", "AZUL MARINHO": "#1B2A4E",
  "AZUL BEBE": "#A6D2EE", VERDE: "#1E7A3A", "VERDE OLIVA": "#5C5A2E",
  "VERDE MILITAR": "#3E422C", VERMELHO: "#C0392B", VINHO: "#5A1F2C",
  TERRA: "#9C5A3C", MARROM: "#5A3924", BEGE: "#D4B896", ROXO: "#5B2A86",
  AMARELO: "#F1C40F", ROSA: "#E48BBA", LILAS: "#B19CD9", CINZA: "#7F8C8D",
};

function hexFor(name: string): string {
  return COLOR_HEX[name.toUpperCase()] ?? "#9CA3AF";
}

// ----------------------------------------------------------------------------
// Executor
// ----------------------------------------------------------------------------

export async function executeImport(rows: ParsedRow[], dryRun = false): Promise<ImportSummary> {
  const summary: ImportSummary = {
    invoicesProcessed: 0,
    invoicesCreated: 0,
    invoicesUpdated: 0,
    productsCreated: 0,
    productsUpdated: 0,
    variantsCreated: 0,
    variantsUpdated: 0,
    stockEntered: 0,
    totalUnits: 0,
    errors: [],
  };

  if (rows.length === 0) return summary;

  // Localização padrão (estoque destino) — deve existir após reset
  const location = await prisma.location.findFirst({ where: { code: "MATRIZ" } });
  if (!location) throw new Error("Location 'MATRIZ' não encontrada. Rode `npm run db:reset` primeiro.");

  const collection = await prisma.collection.findFirst({ where: { code: "DEFAULT" } });
  const line = await prisma.line.findFirst({ where: { code: "DEFAULT" } });
  if (!collection || !line) {
    throw new Error("Collection/Line 'DEFAULT' não encontrada. Rode `npm run db:reset` primeiro.");
  }

  const invoicesSeen = new Set<string>();
  // Caches em memória para não bater no banco em cada linha
  const categoryCache = new Map<string, string>(); // code -> id
  const colorCache = new Map<string, string>();
  const sizeCache = new Map<string, string>();
  const supplierCache = new Map<string, string>(); // companyName -> id
  const invoiceCache = new Map<string, string>(); // `${number}::${supplierName}` -> invoiceId
  // NFs cujos itens já foram limpos nesta execução (para idempotência sem duplicar)
  const invoicesCleared = new Set<string>();

  for (const [idx, row] of rows.entries()) {
    try {
      // ---------- DRY RUN: só simula ----------
      if (dryRun) {
        invoicesSeen.add(row.invoiceNumber);
        summary.totalUnits += row.quantity;
        const variant = await prisma.productVariant.findUnique({ where: { sku: row.sku } });
        if (variant) summary.variantsUpdated++;
        else summary.variantsCreated++;
        continue;
      }

      // ---------- 1. Categoria (cache) ----------
      const catCode = slug(row.categoryName).toUpperCase().slice(0, 30) || "GERAL";
      let categoryId = categoryCache.get(catCode);
      if (!categoryId) {
        const cat = await prisma.category.upsert({
          where: { code: catCode },
          create: { code: catCode, name: row.categoryName, slug: slug(row.categoryName) || "geral" },
          update: { name: row.categoryName },
        });
        categoryId = cat.id;
        categoryCache.set(catCode, categoryId);
      }

      // ---------- 2. Cor (cache) ----------
      const colorCode = slug(row.colorName).toUpperCase().slice(0, 30) || "INDEFINIDO";
      let colorId = colorCache.get(colorCode);
      if (!colorId) {
        const col = await prisma.color.upsert({
          where: { code: colorCode },
          create: { code: colorCode, name: row.colorName, hexValue: hexFor(row.colorName) },
          update: { name: row.colorName },
        });
        colorId = col.id;
        colorCache.set(colorCode, colorId);
      }

      // ---------- 3. Tamanho (cache) ----------
      const sizeCode = row.sizeName.toUpperCase().slice(0, 10);
      let sizeId = sizeCache.get(sizeCode);
      if (!sizeId) {
        const sz = await prisma.size.upsert({
          where: { code: sizeCode },
          create: {
            code: sizeCode,
            name: row.sizeName,
            sortOrder: SIZE_ORDER[sizeCode] ?? 99,
            isPeakSize: ["M", "G", "38", "40"].includes(sizeCode),
          },
          update: {},
        });
        sizeId = sz.id;
        sizeCache.set(sizeCode, sizeId);
      }

      // ---------- 4. Fornecedor (cache) ----------
      let supplierId = supplierCache.get(row.supplierName);
      if (!supplierId) {
        let supplier = await prisma.supplier.findFirst({
          where: { companyName: row.supplierName, deletedAt: null },
          select: { id: true },
        });
        if (!supplier) {
          supplier = await prisma.supplier.create({
            data: {
              companyName: row.supplierName,
              cnpj: pseudoCnpjFromName(row.supplierName),
              type: "FABRIC_SUPPLIER",
              isActive: true,
            },
            select: { id: true },
          });
        }
        supplierId = supplier.id;
        supplierCache.set(row.supplierName, supplierId);
      }

      // ---------- 5. Produto (chave: code = slug(internalName)) ----------
      const productCode = slug(row.internalName).toUpperCase().slice(0, 40);
      const productData = {
        name: row.internalName,
        description: row.invoiceDescription || null,
        collectionId: collection.id,
        lineId: line.id,
        categoryId,
        composition: null,
        weight: null,
        fabricType: null,
        technology: {},
        costPrice: row.realCost,
        basePrice: row.commercialValue,
        markup: row.commercialValue > 0 && row.realCost > 0 ? row.commercialValue / row.realCost : 1,
      };
      const existingProduct = await prisma.product.findUnique({ where: { code: productCode } });
      const product = existingProduct
        ? await prisma.product.update({
            where: { code: productCode },
            data: { ...productData, updatedAt: new Date() },
          })
        : await prisma.product.create({ data: { code: productCode, ...productData } });
      if (existingProduct) summary.productsUpdated++;
      else summary.productsCreated++;

      // ---------- 6. Variante (chave: sku) ----------
      const variantData = {
        productId: product.id,
        colorId,
        sizeId,
        ncm: row.ncm || null,
        additionalCost: 0,
        isActive: true,
      };
      const existingVariant = await prisma.productVariant.findUnique({ where: { sku: row.sku } });
      const variant = existingVariant
        ? await prisma.productVariant.update({
            where: { sku: row.sku },
            data: { ...variantData, updatedAt: new Date() },
          })
        : await prisma.productVariant.create({
            data: { sku: row.sku, ...variantData },
          });
      if (existingVariant) summary.variantsUpdated++;
      else summary.variantsCreated++;

      // ---------- 7. Estoque (incrementa) ----------
      await prisma.stockPosition.upsert({
        where: { variantId_locationId: { variantId: variant.id, locationId: location.id } },
        create: {
          variantId: variant.id,
          locationId: location.id,
          quantity: row.quantity,
        },
        update: { quantity: { increment: row.quantity } },
      });

      // ---------- 8. Movimento ----------
      await prisma.stockMovement.create({
        data: {
          variantId: variant.id,
          toLocationId: location.id,
          quantity: row.quantity,
          reason: "PURCHASE_RECEIVED",
          referenceType: "INVOICE",
          referenceId: row.invoiceNumber,
          notes: `Importação NF ${row.invoiceNumber} (${row.supplierName})`,
        },
      });

      // ---------- 9. Nota Fiscal (cabeçalho, cache) ----------
      const invoiceCacheKey = `${row.invoiceNumber}::${row.supplierName}`;
      let invoiceId = invoiceCache.get(invoiceCacheKey);
      if (!invoiceId) {
        const existingInvoice = await prisma.invoice.findUnique({
          where: { number_supplierName: { number: row.invoiceNumber, supplierName: row.supplierName } },
          select: { id: true },
        });
        const invoice = existingInvoice
          ? await prisma.invoice.update({
              where: { id: existingInvoice.id },
              data: {
                issueDate: row.invoiceDate,
                description: row.invoiceDescription || null,
                freight: row.freight,
                productsTotal: row.productsTotal,
                invoiceTotal: row.invoiceTotal,
                supplierId,
              },
              select: { id: true },
            })
          : await prisma.invoice.create({
              data: {
                number: row.invoiceNumber,
                supplierName: row.supplierName,
                supplierId,
                issueDate: row.invoiceDate,
                description: row.invoiceDescription || null,
                freight: row.freight,
                productsTotal: row.productsTotal,
                invoiceTotal: row.invoiceTotal,
              },
              select: { id: true },
            });
        invoiceId = invoice.id;
        invoiceCache.set(invoiceCacheKey, invoiceId);
        if (!existingInvoice) summary.invoicesCreated++;
        else summary.invoicesUpdated++;
        // Idempotência: limpa itens antigos da NF antes de recriar
        if (existingInvoice && !invoicesCleared.has(invoiceId)) {
          await prisma.invoiceItem.deleteMany({ where: { invoiceId } });
          invoicesCleared.add(invoiceId);
        }
      }

      // ---------- 10. Item da Nota Fiscal ----------
      await prisma.invoiceItem.create({
        data: {
          invoiceId,
          variantId: variant.id,
          sku: row.sku,
          description: row.invoiceDescription || row.internalName,
          ncm: row.ncm || null,
          cfop: row.cfop || null,
          csosn: row.csosn || null,
          unit: row.unit,
          quantity: row.quantity,
          unitPrice: row.unitPrice,
          totalPrice: row.totalPrice,
          realCost: row.realCost,
          margin: row.margin,
          costMargin: row.costMargin,
          commercialValue: row.commercialValue,
          discount: row.discount,
          icmsBase: row.icmsBase,
          icmsValue: row.icmsValue,
          ipiValue: row.ipiValue,
          icmsRate: row.icmsRate,
          ipiRate: row.ipiRate,
        },
      });

      invoicesSeen.add(row.invoiceNumber);
      summary.totalUnits += row.quantity;
      summary.stockEntered++;
    } catch (e) {
      summary.errors.push({
        line: idx + 2, // +2 por causa do header e zero-based
        sku: row.sku,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  summary.invoicesProcessed = invoicesSeen.size;
  return summary;
}
