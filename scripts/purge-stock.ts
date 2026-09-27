/**
 * Zera o estoque de teste: remove posicoes, movimentos, reservas e contagens.
 * Preserva produtos, variantes, locais, cores, tamanhos e categorias.
 *
 * Uso: npm run stock:purge          (dry-run)
 *      npm run stock:purge -- --yes (executa)
 */
import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config();

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const REPORT: { label: string; sql: string }[] = [
  { label: "stock_positions", sql: "SELECT COUNT(*)::int AS n FROM stock_positions" },
  { label: "  com quantidade > 0", sql: "SELECT COUNT(*)::int AS n FROM stock_positions WHERE quantity <> 0" },
  { label: "stock_movements", sql: "SELECT COUNT(*)::int AS n FROM stock_movements" },
  { label: "stock_reservations", sql: "SELECT COUNT(*)::int AS n FROM stock_reservations" },
  { label: "inventory_count_items", sql: "SELECT COUNT(*)::int AS n FROM inventory_count_items" },
  { label: "inventory_counts", sql: "SELECT COUNT(*)::int AS n FROM inventory_counts" },
];

const STEPS: { label: string; sql: string }[] = [
  { label: "Remove itens de contagem", sql: "DELETE FROM inventory_count_items" },
  { label: "Remove contagens de inventario", sql: "DELETE FROM inventory_counts" },
  { label: "Remove reservas de estoque", sql: "DELETE FROM stock_reservations" },
  { label: "Remove movimentos de estoque", sql: "DELETE FROM stock_movements" },
  { label: "Remove posicoes de estoque", sql: "DELETE FROM stock_positions" },
];

async function main(): Promise<void> {
  const apply = process.argv.includes("--yes");

  console.log("\n📦 Estoque atual:");
  let total = 0;
  for (const item of REPORT) {
    const [row] = await prisma.$queryRawUnsafe<{ n: number }[]>(item.sql);
    console.log(`   ${item.label.padEnd(30)} ${row.n}`);
    if (!item.label.startsWith(" ")) total += row.n;
  }
  console.log(`   ${"TOTAL".padEnd(30)} ${total}\n`);

  if (total === 0) {
    console.log("✅ Nada a remover.\n");
    return;
  }

  if (!apply) {
    console.log("⚠️  DRY-RUN. Nada foi alterado. Rode com --yes para executar.");
    console.log("   Produtos, variantes, locais, cores, tamanhos e categorias sao preservados.\n");
    return;
  }

  console.log("🗑️  Zerando estoque...");
  await prisma.$transaction(
    async (tx) => {
      for (const step of STEPS) {
        const count = await tx.$executeRawUnsafe(step.sql);
        console.log(`   ${step.label.padEnd(45)} ${count} linha(s)`);
      }
    },
    { timeout: 120_000 },
  );

  console.log("\n✅ Estoque zerado. Produtos e cadastros preservados.\n");
}

main()
  .catch((err) => {
    console.error("❌ Erro:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
