/* eslint-disable no-console */
/**
 * Zera o catálogo e todo o movimento vinculado a ele:
 * produtos, variantes, estoque, notas de entrada e pedidos de venda.
 *
 * PRESERVA: usuários, clientes, fornecedores, categorias, cores, tamanhos,
 * linhas, coleções, locais de estoque, centros de custo, categorias
 * financeiras e lançamentos financeiros manuais (sem vínculo com venda/nota).
 *
 * Uso:
 *   npx tsx scripts/purge-catalog.ts          -> apenas relatório (dry-run)
 *   npx tsx scripts/purge-catalog.ts --yes    -> executa a exclusão
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "dotenv";

config({ path: ".env.local" });
config();

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const CONFIRM = process.argv.includes("--yes");

/** Alvos da limpeza, na ordem de exclusão (filhos antes dos pais). */
const PURGE_ORDER = [
  // Vendas
  "payment_transactions",
  "order_payments",
  "order_items",
  "shipments",
  "return_request_items",
  "return_requests",
  "exchanges",
  "stock_reservations",
  "orders",
  // Notas de entrada
  "invoice_items",
  "invoices",
  // Estoque
  "stock_movements",
  "stock_positions",
  "inventory_count_items",
  "inventory_counts",
  // Compras e produção
  "receiving_order_items",
  "receiving_orders",
  "purchase_order_items",
  "purchase_orders",
  "production_order_items",
  "production_orders",
  // Catálogo
  "product_bom",
  "product_boms",
  "product_variants",
  "products",
];

interface ForeignKey {
  table: string;
  column: string;
  refTable: string;
  nullable: string;
}

async function tableExists(name: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::bigint AS count FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = ${name}
  `;
  return Number(rows[0]?.count ?? 0) > 0;
}

async function countRows(table: string): Promise<number> {
  const rows = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
    `SELECT COUNT(*)::bigint AS count FROM "${table}"`,
  );
  return Number(rows[0]?.count ?? 0);
}

async function main(): Promise<void> {
  const present: string[] = [];
  for (const table of PURGE_ORDER) {
    if (await tableExists(table)) present.push(table);
  }

  console.log("\n🗂️  Tabelas que serão esvaziadas:");
  let total = 0;
  for (const table of present) {
    const count = await countRows(table);
    total += count;
    console.log(`   ${table.padEnd(24)} ${count} registro(s)`);
  }
  console.log(`   ${"TOTAL".padEnd(24)} ${total} registro(s)`);

  // Segurança: nenhuma tabela fora da lista pode ficar apontando para as apagadas
  const purgeSet = new Set(present);
  const fks = await prisma.$queryRaw<ForeignKey[]>`
    SELECT
      tc.table_name   AS "table",
      kcu.column_name AS "column",
      ccu.table_name  AS "refTable",
      c.is_nullable   AS "nullable"
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
    JOIN information_schema.columns c
      ON c.table_schema = tc.table_schema AND c.table_name = tc.table_name AND c.column_name = kcu.column_name
    WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
  `;

  const outsiders = fks.filter((fk) => purgeSet.has(fk.refTable) && !purgeSet.has(fk.table));
  const toNullify: ForeignKey[] = [];
  const blockers: ForeignKey[] = [];

  for (const fk of outsiders) {
    const rows = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT COUNT(*)::bigint AS count FROM "${fk.table}" WHERE "${fk.column}" IS NOT NULL`,
    );
    if (Number(rows[0]?.count ?? 0) === 0) continue;
    if (fk.nullable === "YES") toNullify.push(fk);
    else blockers.push(fk);
  }

  if (toNullify.length) {
    console.log("\n🔗 Vínculos que serão desfeitos (registro preservado, campo zerado):");
    for (const fk of toNullify) console.log(`   ${fk.table}.${fk.column} -> ${fk.refTable}`);
  }

  if (blockers.length) {
    console.log("\n❌ Bloqueios (FK obrigatória em tabela fora do escopo):");
    for (const fk of blockers) console.log(`   ${fk.table}.${fk.column} -> ${fk.refTable}`);
    console.log("   Ajuste o escopo antes de continuar.");
    return;
  }

  if (!CONFIRM) {
    console.log("\n⚠️  DRY-RUN. Nada foi alterado. Rode com --yes para executar.\n");
    return;
  }

  console.log("\n🗑️  Executando exclusão definitiva...");

  await prisma.$transaction(
    async (tx) => {
      for (const fk of toNullify) {
        const updated = await tx.$executeRawUnsafe(
          `UPDATE "${fk.table}" SET "${fk.column}" = NULL WHERE "${fk.column}" IS NOT NULL`,
        );
        console.log(`   ${fk.table}.${fk.column}: ${updated} vínculo(s) desfeito(s)`);
      }
      for (const table of present) {
        const deleted = await tx.$executeRawUnsafe(`DELETE FROM "${table}"`);
        if (deleted > 0) console.log(`   ${table}: ${deleted} linha(s) removida(s)`);
      }
    },
    { timeout: 120_000 },
  );

  console.log("\n✅ Concluído. Cadastros de apoio e lançamentos manuais foram preservados.\n");
}

main()
  .catch((error) => {
    console.error("❌ Falha:", error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
