/**
 * LEGADO: mantido apenas como referência de instalações anteriores.
 * O DDL está versionado em prisma/migrations/20260921000100_security_and_search.
 * Para instalar/atualizar bancos, use npm run db:deploy com DIRECT_DATABASE_URL.
 *
 * O alias db:apply-updates agora também executa as migrações versionadas.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "dotenv";

config({ path: ".env.local" });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

/** Revogação de sessão (tokenVersion) + rate limit compartilhado. */
const SCHEMA_STATEMENTS = [
  `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "token_version" INTEGER NOT NULL DEFAULT 0`,
  `CREATE TABLE IF NOT EXISTS "rate_limits" (
     "key" TEXT PRIMARY KEY,
     "count" INTEGER NOT NULL DEFAULT 0,
     "reset_at" TIMESTAMP(3) NOT NULL,
     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
   )`,
  `CREATE INDEX IF NOT EXISTS "rate_limits_reset_at_idx" ON "rate_limits" ("reset_at")`,
];

/**
 * Busca textual: `contains` + `mode: insensitive` faz seq scan.
 * Índices GIN com `gin_trgm_ops` cobrem os campos usados nas telas de busca.
 */
const SEARCH_STATEMENTS = [
  `CREATE EXTENSION IF NOT EXISTS pg_trgm`,
  `CREATE INDEX IF NOT EXISTS "products_name_trgm_idx" ON "products" USING GIN ("name" gin_trgm_ops)`,
  `CREATE INDEX IF NOT EXISTS "products_code_trgm_idx" ON "products" USING GIN ("code" gin_trgm_ops)`,
  `CREATE INDEX IF NOT EXISTS "product_variants_sku_trgm_idx" ON "product_variants" USING GIN ("sku" gin_trgm_ops)`,
  `CREATE INDEX IF NOT EXISTS "customers_full_name_trgm_idx" ON "customers" USING GIN ("full_name" gin_trgm_ops)`,
  `CREATE INDEX IF NOT EXISTS "customers_phone_trgm_idx" ON "customers" USING GIN ("phone" gin_trgm_ops)`,
  `CREATE INDEX IF NOT EXISTS "orders_code_trgm_idx" ON "orders" USING GIN ("code" gin_trgm_ops)`,
  `CREATE INDEX IF NOT EXISTS "suppliers_company_name_trgm_idx" ON "suppliers" USING GIN ("company_name" gin_trgm_ops)`,
];

async function run(label: string, statements: string[]): Promise<void> {
  console.log(`\n== ${label} ==`);
  for (const sql of statements) {
    await prisma.$executeRawUnsafe(sql);
    console.log("OK:", sql.replace(/\s+/g, " ").slice(0, 90));
  }
}

async function main(): Promise<void> {
  await run("Schema (tokenVersion + rate_limits)", SCHEMA_STATEMENTS);
  await run("Índices de busca (pg_trgm)", SEARCH_STATEMENTS);
  console.log("\nConcluído.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
