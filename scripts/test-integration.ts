import EmbeddedPostgres from "embedded-postgres";
import { Client } from "pg";
import { randomBytes } from "node:crypto";
import { mkdtemp, mkdir, rm, access } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";

async function availablePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Porta local indisponível.");
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

async function runNode(args: string[], env: NodeJS.ProcessEnv): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, args, { env, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`Validação terminou com código ${code ?? signal}.`));
    });
  });
}

async function main(): Promise<void> {
  if (process.platform === "win32") process.env.PG_RESTRICT_EXEC = "1"; // O processo de teste já roda com o token restrito do host.
  const directory = await mkdtemp(join(process.env.DONNATICY_TEST_TMP ?? tmpdir(), "donnaticy-integration-"));
  await mkdir(join(directory, "data"));
  const port = await availablePort();
  const password = randomBytes(24).toString("hex");
  const database = `donnaticy_test_${randomBytes(8).toString("hex")}`;
  const databaseUrl = `postgresql://donnaticy_test:${password}@127.0.0.1:${port}/${database}?sslmode=disable`;
  const postgres = new EmbeddedPostgres({
    databaseDir: join(directory, "data"),
    port,
    user: "donnaticy_test",
    password,
    authMethod: "scram-sha-256",
    // No Windows, stop() retorna antes de os processos filhos do PostgreSQL saírem, e com
    // persistent: false a biblioteca apaga a pasta sem nova tentativa (EBUSY). O runner apaga.
    persistent: true,
    createPostgresUser: false,
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
    postgresFlags: ["-h", "127.0.0.1", "-c", "shared_buffers=32MB", "-c", "max_connections=20"],
    onLog: () => undefined,
    onError: (error) => console.error("PostgreSQL de teste:", error),
  });
  if (process.platform === "win32") {
    // pg_ctl encerra o cluster de forma coordenada, sem taskkill (bloqueado em hosts restritos).
    postgres.stop = async () => {
      try { await access(join(directory, "data", "postmaster.pid")); } catch { return; }
      await promisify(execFile)(resolve("node_modules/@embedded-postgres/windows-x64/native/bin/pg_ctl.exe"), ["-D", join(directory, "data"), "-m", "fast", "-w", "stop"], { windowsHide: true, timeout: 60000 });
    };
  }
  // Sobrescreve AMBAS as URLs, inclusive se herdadas do Windows ou de arquivos locais.
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: "test",
    CRON_SECRET: randomBytes(32).toString("hex"),
    NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --require "${resolve("scripts/windows-test-compat.cjs").replaceAll("\\", "/")}"`,
    DATABASE_URL: databaseUrl,
    DIRECT_DATABASE_URL: databaseUrl,
    DONNATICY_TEST_DATABASE_URL: databaseUrl,
    JWT_SECRET: randomBytes(32).toString("hex"),
    NEXT_PUBLIC_REQUIRE_DISCOUNT_APPROVAL: "true",
  };

  try {
    console.log("Iniciando PostgreSQL descartável em loopback; nenhum banco externo será usado.");
    await postgres.initialise();
    await postgres.start();
    const adminUrl = new URL(databaseUrl);
    adminUrl.pathname = "/postgres";
    const admin = new Client({ connectionString: adminUrl.toString() });
    await admin.connect();
    try {
      await admin.query(`CREATE DATABASE "${database}"`);
    } finally {
      await admin.end();
    }
    const prismaCli = resolve("node_modules/prisma/build/index.js");
    await runNode([prismaCli, "migrate", "deploy"], env);
    await runNode([
      prismaCli, "migrate", "diff", "--from-config-datasource", "--to-schema=prisma/schema.prisma", "--exit-code",
    ], env);
    if (process.argv.includes("--preview")) {
      await runNode(["--import", "tsx", resolve("scripts/preview-fixture.ts")], env);
      await runNode([resolve("node_modules/next/dist/bin/next"), "dev", "--hostname", "127.0.0.1", "--port", "3100"], {
        ...env, NODE_ENV: "development", NEXT_BUILD_DIR: ".next-preview", NEXT_PUBLIC_FEATURE_RECEIPT_PRINTING: "false",
      });
      return;
    }
    await runNode([
      resolve("node_modules/vitest/vitest.mjs"), "run", "--config", "vitest.integration.config.mts", ...process.argv.slice(2),
    ], env);
  } finally {
    await postgres.stop();
    const expectedRoot = resolve(process.env.DONNATICY_TEST_TMP ?? tmpdir());
    if (!resolve(directory).startsWith(expectedRoot + sep) || !directory.split(sep).at(-1)?.startsWith("donnaticy-integration-")) throw new Error("Pasta de teste fora do diretório esperado.");
    await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    console.log("PostgreSQL de teste encerrado e dados temporários removidos.");
  }
}

// embedded-postgres registra beforeExit; encerrar explicitamente preserva falhas no CI.
main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);