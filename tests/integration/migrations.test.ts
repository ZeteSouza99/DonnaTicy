import { describe, expect, it } from "vitest";
import { Client } from "pg";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { assertTestDatabaseUrl, integrationDatabaseUrl, runPrisma } from "./database";

const execFileAsync = promisify(execFile);
const securityMigration = "prisma/migrations/20260921000100_security_and_search/migration.sql";
const cancellationMigration = "prisma/migrations/20260921000200_order_cancellation/migration.sql";

async function withDatabase(run: (client: Client, url: string) => Promise<void>): Promise<void> {
  const admin = new Client({ connectionString: integrationDatabaseUrl() });
  await admin.connect();
  const name = `donnaticy_test_migrations_${randomBytes(8).toString("hex")}`;
  const url = new URL(integrationDatabaseUrl());
  url.pathname = `/${name}`;
  assertTestDatabaseUrl(url.toString());
  const client = new Client({ connectionString: url.toString() });
  try {
    await admin.query(`CREATE DATABASE "${name}"`);
    await client.connect();
    await run(client, url.toString());
  } finally {
    await client.end();
    try {
      await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    } finally {
      await admin.end();
    }
  }
}

async function assertSchema(client: Client, url: string) {
  await runPrisma(["migrate", "diff", "--from-config-datasource", "--to-schema=prisma/schema.prisma", "--exit-code"], url);
  const tables = await client.query(`SELECT count(*)::int AS count FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`);
  expect(tables.rows[0].count).toBe(52);
  const indexes = await client.query(`
    SELECT count(*)::int AS count FROM pg_index i
    JOIN pg_class c ON c.oid = i.indexrelid
    WHERE c.relname LIKE '%_trgm_idx' AND i.indisvalid
  `);
  expect(indexes.rows[0].count).toBe(7);
  const extension = await client.query(`SELECT extname FROM pg_extension WHERE extname = 'pg_trgm'`);
  expect(extension.rowCount).toBe(1);
  const history = await client.query(`SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY migration_name`);
  expect(history.rows.map((row) => row.migration_name)).toEqual([
    "0_init", "20260921000100_security_and_search", "20260921000200_order_cancellation",
    "20260926000100_auth_hardening", "20260926000200_money_decimal", "20261110000100_stock_position_checks", "20261114000100_operations_and_import_jobs",
  ]);
}

describe("histórico Prisma reproduzível", () => {
  it("instala em banco vazio e reaplica deploy sem diferenças ou migrações duplicadas", async () => {
    await withDatabase(async (client, url) => {
      await runPrisma(["migrate", "deploy"], url);
      await runPrisma(["migrate", "deploy"], url);
      await assertSchema(client, url);
    });
  }, 90_000);

  it("converge após scripts legados, sem apagar dados nem reiniciar tokenVersion", async () => {
    await withDatabase(async (client, url) => {
      await client.query(await readFile(resolve("prisma/migrations/0_init/migration.sql"), "utf8"));
      await runPrisma(["migrate", "resolve", "--applied", "0_init"], url);
      await execFileAsync(process.execPath, [resolve("node_modules/tsx/dist/cli.mjs"), resolve("scripts/apply-schema-updates.ts")], {
        env: { ...process.env, DATABASE_URL: url, DIRECT_DATABASE_URL: url },
        timeout: 60_000,
      });
      await client.query(`INSERT INTO users (id, email, password_hash, name, role, token_version, updated_at) VALUES ('legacy', 'legacy@example.test', 'test', 'Legado', 'SUPER_ADMIN', 7, now())`);
      await client.query(`INSERT INTO users (id, email, password_hash, name, role, updated_at) VALUES ('mixed', ' Misto@Example.TEST', 'test', 'Misto', 'SELLER', now())`);
      await client.query(`INSERT INTO rate_limits (key, count, reset_at) VALUES ('legacy', 4, now() + interval '1 hour')`);
      await client.query(`INSERT INTO customers (id, code, full_name, phone, updated_at) VALUES ('legacy', 'LEGACY', 'Cliente Legado', '11999999000', now())`);
      await client.query(`INSERT INTO orders (id, code, channel, customer_id, subtotal, discount_total, total, updated_at) VALUES ('legacy', 'LEGACY', 'ECOMMERCE', 'legacy', 200, 50, 150, now())`);
      await runPrisma(["migrate", "deploy"], url);
      // Execução direta repetida cobre também recuperação de scripts parcialmente aplicados.
      await client.query(await readFile(resolve(securityMigration), "utf8"));
      await client.query(await readFile(resolve(cancellationMigration), "utf8"));
      expect((await client.query(`SELECT token_version FROM users WHERE id = 'legacy'`)).rows[0].token_version).toBe(7);
      expect((await client.query(`SELECT email, must_change_password FROM users WHERE id = 'mixed'`)).rows[0])
        .toEqual({ email: "misto@example.test", must_change_password: false });
      expect((await client.query(`SELECT count FROM rate_limits WHERE key = 'legacy'`)).rows[0].count).toBe(4);
      expect((await client.query(`SELECT used_store_credit_id, used_store_credit_amount FROM orders WHERE id = 'legacy'`)).rows[0])
        .toEqual({ used_store_credit_id: null, used_store_credit_amount: null });
      await assertSchema(client, url);
    });
  }, 90_000);

  it("completa estado parcial e usa pg_trgm fora do search_path, como no Supabase", async () => {
    await withDatabase(async (client, url) => {
      await client.query(await readFile(resolve("prisma/migrations/0_init/migration.sql"), "utf8"));
      await runPrisma(["migrate", "resolve", "--applied", "0_init"], url);
      await client.query(`ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0`);
      await client.query(`CREATE TABLE rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL DEFAULT 0, reset_at TIMESTAMP(3) NOT NULL, updated_at TIMESTAMP(3) NOT NULL)`);
      await client.query(`CREATE SCHEMA extensions; CREATE EXTENSION pg_trgm WITH SCHEMA extensions`);
      await runPrisma(["migrate", "deploy"], url);
      const ns = await client.query(`SELECT n.nspname FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace WHERE e.extname = 'pg_trgm'`);
      expect(ns.rows[0].nspname).toBe("extensions");
      const column = await client.query(`SELECT column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'rate_limits' AND column_name = 'updated_at'`);
      expect(column.rows[0].column_default).toBe("CURRENT_TIMESTAMP");
      await assertSchema(client, url);
    });
  }, 90_000);

  it("recusa URLs remotas e nomes de banco que não são de teste", () => {
    expect(() => assertTestDatabaseUrl("postgresql://donnaticy_test:test@db.example.com:5432/donnaticy_test_a")).toThrow();
    expect(() => assertTestDatabaseUrl("postgresql://donnaticy_test:test@127.0.0.1:5432/production")).toThrow();
  });
});