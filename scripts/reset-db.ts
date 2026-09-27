import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "dotenv";

config({ path: ".env.local" });
config();

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

/**
 * Tabelas que NÃO são apagadas.
 * - users: preserva o login (sem isso ninguém entra no sistema)
 * - locations: users.location_id aponta para cá; truncar com CASCADE apagaria os usuários
 * - settings: parâmetros do sistema, não são dado transacional
 * - _prisma_migrations: controle de migrações do Prisma
 */
const PRESERVED = new Set(["users", "locations", "settings", "_prisma_migrations"]);

const APPLY = process.argv.includes("--yes");

interface TableRow { table_name: string }
interface ForeignKeyRow { child_table: string; parent_table: string; constraint_name: string }

async function main(): Promise<void> {
  const allTables = await prisma.$queryRaw<TableRow[]>`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `;

  const target = allTables.map((t) => t.table_name).filter((t) => !PRESERVED.has(t));
  const targetSet = new Set(target);

  // Guarda: nenhuma tabela preservada pode referenciar uma tabela do escopo,
  // senão o TRUNCATE ... CASCADE apagaria a preservada junto.
  const foreignKeys = await prisma.$queryRaw<ForeignKeyRow[]>`
    SELECT
      con.conrelid::regclass::text AS child_table,
      con.confrelid::regclass::text AS parent_table,
      con.conname AS constraint_name
    FROM pg_constraint con
    JOIN pg_namespace ns ON ns.oid = con.connamespace
    WHERE con.contype = 'f' AND ns.nspname = 'public'
  `;

  const unsafe = foreignKeys.filter(
    (fk) => PRESERVED.has(fk.child_table) && targetSet.has(fk.parent_table),
  );

  if (unsafe.length > 0) {
    console.error("❌ ABORTADO: tabelas preservadas dependem de tabelas do escopo.");
    console.error("   O TRUNCATE CASCADE apagaria os dados que deveriam ser mantidos:");
    for (const fk of unsafe) {
      console.error(`   - ${fk.child_table} -> ${fk.parent_table} (${fk.constraint_name})`);
    }
    console.error("   Adicione a tabela pai a PRESERVED ou remova o vínculo antes de rodar.");
    process.exit(1);
  }

  // Contagem antes
  const counts: { table: string; rows: number }[] = [];
  for (const table of target) {
    const [{ count }] = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT COUNT(*)::bigint AS count FROM "${table}"`,
    );
    counts.push({ table, rows: Number(count) });
  }

  const withData = counts.filter((c) => c.rows > 0);
  const totalRows = withData.reduce((sum, c) => sum + c.rows, 0);

  console.log(`\nBanco: ${process.env.DATABASE_URL?.replace(/:\/\/[^@]+@/, "://***@")}`);
  console.log(`Preservadas: ${[...PRESERVED].join(", ")}`);
  console.log(`\nTabelas no escopo: ${target.length} | Registros a apagar: ${totalRows}\n`);
  for (const c of withData) console.log(`  ${c.table.padEnd(30)} ${c.rows}`);
  if (withData.length === 0) console.log("  (nenhum registro — banco já está vazio)");

  if (!APPLY) {
    console.log("\n🔍 DRY-RUN. Nada foi apagado. Rode com --yes para aplicar.");
    return;
  }

  console.log("\n⚠️  Apagando...");
  const stmt = `TRUNCATE ${target.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE;`;
  await prisma.$executeRawUnsafe(stmt);
  console.log(`✅ ${target.length} tabelas limpas (${totalRows} registros).`);

  console.log("\n📦 Recriando fixtures mínimas...");
  const collection = await prisma.collection.upsert({
    where: { code: "DEFAULT" },
    update: {},
    create: {
      code: "DEFAULT",
      name: "Padrão",
      season: "ALL_SEASONS",
      year: new Date().getFullYear(),
      isActive: true,
    },
  });

  const line = await prisma.line.upsert({
    where: { code: "DEFAULT" },
    update: {},
    create: { code: "DEFAULT", name: "Padrão", isActive: true },
  });

  const location = await prisma.location.upsert({
    where: { code: "MATRIZ" },
    update: {},
    create: { code: "MATRIZ", name: "Estoque Matriz", type: "WAREHOUSE", isActive: true },
  });

  const users = await prisma.user.count({ where: { deletedAt: null } });

  console.log(`✅ Coleção ${collection.code}, Linha ${line.code}, Local ${location.code}`);
  console.log(`✅ ${users} usuário(s) preservado(s) — o login continua funcionando.`);
  console.log("\n🎉 Sistema zerado. Cadastre categorias, cores e tamanhos antes dos produtos.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
