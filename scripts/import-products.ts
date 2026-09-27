/**
 * Importação de produtos a partir da planilha "DashBoard DonnaTicy.xlsx".
 *
 * O script:
 *   1. Limpa todos os dados de catálogo/estoque/vendas do banco (mantém admin e locais).
 *   2. Cria coleção, linha, fornecedor, categorias, cores e tamanhos a partir da planilha.
 *   3. Agrupa as linhas pela "Descrição Interna" para gerar Produtos.
 *   4. Cria uma ProductVariant por linha da planilha (SKU = Código).
 *   5. Cria uma StockPosition inicial no CD principal com a Quantidade informada.
 *
 * Execute via: npx tsx scripts/import-products.ts
 */

import "dotenv/config";
import * as XLSX from "xlsx";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const EXCEL_PATH = "C:\\Users\\Zete-\\Downloads\\DashBoard DonnaTicy.xlsx";

// ---------------------------------------------------------------------------
// Prisma bootstrap
// ---------------------------------------------------------------------------

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

// ---------------------------------------------------------------------------
// Tipos e helpers
// ---------------------------------------------------------------------------

interface SheetRow {
  code: string;
  fiscalDescription: string;
  internalDescription: string;
  color: string;
  size: string;
  category: string;
  quantity: number;
  costUnit: number;
  priceSuggestion: string;
  supplier: string;
  notes: string;
}

const SIZE_ORDER: Record<string, number> = {
  PP: 1,
  P: 2,
  M: 3,
  G: 4,
  GG: 5,
  XG: 6,
  XXG: 7,
};

const COLOR_HEX: Record<string, string> = {
  PRETO: "#000000",
  BRANCO: "#FFFFFF",
  CINZA: "#808080",
  "AZUL MARINHO": "#1B2A49",
  "AZUL BEBE": "#A7D8F5",
  "VERDE MILITAR": "#4B5320",
  "VERDE OLIVA": "#708238",
  "VERDE JADE": "#00A86B",
  VINHO: "#722F37",
  MARROM: "#5D4037",
  TERRA: "#B1775A",
  ROXO: "#6A0DAD",
  "ROSA PINK": "#FF1493",
};

function slug(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function toCode(s: string): string {
  return slug(s).toUpperCase().replace(/-/g, "_");
}

/** Converte "$159 à $169" em { min: 159, max: 169, avg: 164 } */
function parsePriceRange(text: string): { min: number; max: number; avg: number } {
  const nums = (text.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => Number(n.replace(",", ".")));
  if (nums.length === 0) return { min: 0, max: 0, avg: 0 };
  if (nums.length === 1) return { min: nums[0], max: nums[0], avg: nums[0] };
  const [a, b] = nums;
  return { min: Math.min(a, b), max: Math.max(a, b), avg: Math.round((a + b) / 2) };
}

function normalize(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}

// ---------------------------------------------------------------------------
// Leitura da planilha
// ---------------------------------------------------------------------------

function readSheet(): SheetRow[] {
  const wb = XLSX.readFile(EXCEL_PATH);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: "" });
  const rows: SheetRow[] = [];

  // Linha 1 = título; Linha 2 = cabeçalhos; dados a partir da linha 3 (índice 2)
  for (let i = 2; i < raw.length; i++) {
    const r = raw[i];
    const code = String(r[0] ?? "").trim();
    if (!code) continue;

    rows.push({
      code,
      fiscalDescription: normalize(String(r[1] ?? "").replace(/\r?\n/g, " ")),
      internalDescription: normalize(String(r[2] ?? "")),
      color: normalize(String(r[3] ?? "")).toUpperCase(),
      size: normalize(String(r[4] ?? "")).toUpperCase(),
      category: normalize(String(r[5] ?? "")).toUpperCase(),
      quantity: Number(r[6]) || 0,
      costUnit: Number(r[7]) || 0,
      priceSuggestion: String(r[10] ?? "").trim(),
      supplier: normalize(String(r[11] ?? "")),
      notes: String(r[12] ?? "").trim(),
    });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Limpeza do banco (mantém admin + locais + customers)
// ---------------------------------------------------------------------------

async function wipeDatabase(): Promise<void> {
  console.log("🗑️  Limpando banco de dados...");
  // Ordem: filhos primeiro, depois pais
  await prisma.paymentTransaction.deleteMany();
  await prisma.returnRequestItem.deleteMany();
  await prisma.returnRequest.deleteMany();
  await prisma.shipment.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.financialEntry.deleteMany();
  await prisma.order.deleteMany();
  await prisma.stockReservation.deleteMany();
  await prisma.stockMovement.deleteMany();
  await prisma.stockPosition.deleteMany();
  await prisma.productionOrderItem.deleteMany();
  await prisma.productionOrder.deleteMany();
  await prisma.purchaseOrderItem.deleteMany();
  await prisma.receivingOrderItem.deleteMany();
  await prisma.receivingOrder.deleteMany();
  await prisma.purchaseOrder.deleteMany();
  await prisma.productBom.deleteMany();
  await prisma.rawMaterial.deleteMany();
  await prisma.productVariant.deleteMany();
  await prisma.product.deleteMany();
  await prisma.supplier.deleteMany();
  await prisma.color.deleteMany();
  await prisma.size.deleteMany();
  await prisma.category.deleteMany();
  await prisma.line.deleteMany();
  await prisma.collection.deleteMany();
  console.log("✅ Banco limpo.");
}

// ---------------------------------------------------------------------------
// Importação
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const rows = readSheet();
  console.log(`📄 Planilha lida: ${rows.length} variantes.`);

  await wipeDatabase();

  // --- Local padrão para estoque ---
  const cd = await prisma.location.upsert({
    where: { code: "CD-PRINCIPAL" },
    update: {},
    create: {
      name: "Centro de Distribuição",
      code: "CD-PRINCIPAL",
      type: "WAREHOUSE",
      address: {},
    },
  });

  // --- Coleção única (derivada do título "ABRIL") ---
  const collection = await prisma.collection.create({
    data: {
      name: "Abril 2026",
      code: "ABR-2026",
      season: "Abril",
      year: 2026,
    },
  });

  // --- Linha única ---
  const line = await prisma.line.create({
    data: { name: "Moda Feminina", code: "MODA-FEMININA" },
  });

  // --- Fornecedor (único na planilha) ---
  const supplierNames = [...new Set(rows.map((r) => r.supplier).filter(Boolean))];
  const suppliers = new Map<string, string>();
  for (const name of supplierNames) {
    const sup = await prisma.supplier.create({
      data: {
        type: "FULL_PACKAGE",
        companyName: name,
        tradeName: name,
        cnpj: `00.000.000/0001-${String(suppliers.size + 1).padStart(2, "0")}`,
      },
    });
    suppliers.set(name, sup.id);
  }
  console.log(`✅ ${suppliers.size} fornecedor(es).`);

  // --- Categorias ---
  const categoryNames = [...new Set(
    rows.map((r) => r.category || "CONJUNTO").map(normalize)
  )];
  const categories = new Map<string, string>();
  for (const name of categoryNames) {
    const cat = await prisma.category.create({
      data: {
        name,
        code: toCode(name).slice(0, 30),
        slug: slug(name),
      },
    });
    categories.set(name, cat.id);
  }
  console.log(`✅ ${categories.size} categoria(s): ${[...categories.keys()].join(", ")}`);

  // --- Cores ---
  const colorNames = [...new Set(rows.map((r) => normalize(r.color)).filter(Boolean))];
  const colors = new Map<string, string>();
  for (const name of colorNames) {
    const color = await prisma.color.create({
      data: {
        name,
        code: toCode(name).slice(0, 20),
        hexValue: COLOR_HEX[name] ?? "#CCCCCC",
      },
    });
    colors.set(name, color.id);
  }
  console.log(`✅ ${colors.size} cor(es).`);

  // --- Tamanhos ---
  const sizeNames = [...new Set(rows.map((r) => r.size.toUpperCase()).filter(Boolean))];
  const sizes = new Map<string, string>();
  for (const name of sizeNames) {
    const size = await prisma.size.create({
      data: {
        name,
        code: name,
        sortOrder: SIZE_ORDER[name] ?? 99,
        isPeakSize: name === "M" || name === "G",
      },
    });
    sizes.set(name, size.id);
  }
  console.log(`✅ ${sizes.size} tamanho(s).`);

  // --- Produtos (agrupados por Descrição Interna) ---
  const grouped = new Map<string, SheetRow[]>();
  for (const r of rows) {
    const key = normalize(r.internalDescription);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(r);
  }
  console.log(`📦 ${grouped.size} produto(s) únicos.`);

  let variantCount = 0;
  for (const [name, group] of grouped) {
    const sample = group[0];
    const categoryName = sample.category || "CONJUNTO";
    const categoryId = categories.get(normalize(categoryName))!;

    const avgCost = group.reduce((s, r) => s + r.costUnit, 0) / group.length;
    const priceInfo = parsePriceRange(sample.priceSuggestion);
    const basePrice = priceInfo.avg > 0 ? priceInfo.avg : avgCost * 2.5;
    const markup = avgCost > 0 ? ((basePrice - avgCost) / avgCost) * 100 : 0;

    // Gera código de produto a partir das duas primeiras palavras + hash curto
    const parts = name.split(" ").slice(0, 3).map((p) => p.toUpperCase());
    const productCode = parts.join("-").replace(/[^A-Z0-9-]/g, "").slice(0, 30);

    const product = await prisma.product.create({
      data: {
        code: productCode,
        name,
        description: sample.fiscalDescription,
        collectionId: collection.id,
        lineId: line.id,
        categoryId,
        costPrice: Number(avgCost.toFixed(2)),
        basePrice: Number(basePrice.toFixed(2)),
        markup: Number(markup.toFixed(2)),
        technology: [],
      },
    });

    for (const r of group) {
      const variant = await prisma.productVariant.create({
        data: {
          productId: product.id,
          sku: r.code,
          colorId: colors.get(normalize(r.color))!,
          sizeId: sizes.get(r.size)!,
          additionalCost: 0,
        },
      });

      if (r.quantity > 0) {
        await prisma.stockPosition.create({
          data: {
            variantId: variant.id,
            locationId: cd.id,
            quantity: r.quantity,
            minStock: 1,
            safetyStock: 2,
            maxStock: 20,
          },
        });
      }
      variantCount++;
    }
  }

  console.log(`\n✅ Importação concluída: ${grouped.size} produtos, ${variantCount} variantes.`);
}

main()
  .catch((e) => {
    console.error("❌ Erro na importação:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
