import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";

const execFileAsync = promisify(execFile);

export function integrationDatabaseUrl(): string {
  const value = process.env.DONNATICY_TEST_DATABASE_URL;
  if (!value || process.env.DATABASE_URL !== value || process.env.DIRECT_DATABASE_URL !== value) {
    throw new Error("Use npm run test:integration. Os testes não aceitam DATABASE_URL do ambiente normal.");
  }
  assertTestDatabaseUrl(value);
  return value;
}

export function assertTestDatabaseUrl(value: string): void {
  const url = new URL(value);
  if (
    url.hostname !== "127.0.0.1" || url.username !== "donnaticy_test" ||
    !/^\/donnaticy_test_[a-z0-9_]+$/.test(url.pathname) || !url.port ||
    url.protocol !== "postgresql:"
  ) {
    throw new Error("Operação recusada: banco não pertence ao PostgreSQL local de testes.");
  }
}

export async function runPrisma(args: string[], databaseUrl = integrationDatabaseUrl()): Promise<string> {
  assertTestDatabaseUrl(databaseUrl);
  const { stdout } = await execFileAsync(process.execPath, [resolve("node_modules/prisma/build/index.js"), ...args], {
    env: { ...process.env, DATABASE_URL: databaseUrl, DIRECT_DATABASE_URL: databaseUrl },
    timeout: 90_000,
    maxBuffer: 2 * 1024 * 1024,
  });
  return stdout;
}