/**
 * Gera código de barras EAN-13 interno para todas as variantes que ainda não têm.
 * Idempotente: variantes com código existente são preservadas.
 *
 * Uso:
 *   npx tsx scripts/backfill-barcodes.ts          -> relatório (dry-run)
 *   npx tsx scripts/backfill-barcodes.ts --yes    -> grava os códigos
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "dotenv";
import { barcodeCandidate, internalCodeToSeed, normalizeInternalCode } from "../src/lib/barcode";

config({ path: ".env.local" });
config();

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const CONFIRM = process.argv.includes("--yes");

async function main(): Promise<void> {
  const total = await prisma.productVariant.count({ where: { deletedAt: null } });
  const pending = await prisma.productVariant.findMany({
    where: { deletedAt: null, barcode: null },
    select: { id: true, sku: true, product: { select: { code: true } } },
    orderBy: { sku: "asc" },
  });

  console.log(`\n🏷️  Variantes: ${total} | sem código de barras: ${pending.length}`);

  if (pending.length === 0) {
    console.log("✅ Nada a gerar.\n");
    return;
  }

  if (!CONFIRM) {
    console.log("⚠️  DRY-RUN. Rode com --yes para gravar.\n");
    return;
  }

  const taken = new Set<string>(
    (
      await prisma.productVariant.findMany({
        where: { barcode: { not: null } },
        select: { barcode: true },
      })
    ).flatMap((v) => (v.barcode ? [v.barcode] : [])),
  );

  const perProduct = new Map<string, number>();
  let generated = 0;

  for (const variant of pending) {
    const productCode = variant.product.code;
    const index = perProduct.get(productCode) ?? 0;
    perProduct.set(productCode, index + 1);

    const seed = internalCodeToSeed(normalizeInternalCode(productCode));
    let barcode: string | null = null;
    for (let attempt = 0; attempt < 500; attempt++) {
      const candidate = barcodeCandidate(seed, index + attempt);
      if (!taken.has(candidate)) {
        barcode = candidate;
        break;
      }
    }
    if (!barcode) {
      console.warn(`   ⚠️  Não foi possível gerar código para ${variant.sku}`);
      continue;
    }

    taken.add(barcode);
    await prisma.productVariant.update({ where: { id: variant.id }, data: { barcode } });
    generated++;
  }

  console.log(`✅ ${generated} código(s) de barras gerado(s).\n`);
}

main()
  .catch((error) => {
    console.error("❌ Falha:", error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
