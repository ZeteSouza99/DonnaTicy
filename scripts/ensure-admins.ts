/**
 * Garante que os usuários administradores existam com papel SUPER_ADMIN.
 * Idempotente: pode ser executado quantas vezes for necessário.
 *
 *   npm run users:admins
 *
 * Senhas via ambiente (obrigatórias e fortes para criar usuários novos):
 *   SEED_ADMIN_PASSWORD, SEED_ALL_PASSWORD, SEED_DAV_PASSWORD
 * A senha só é gravada na CRIAÇÃO — usuários já existentes não têm a senha alterada.
 * Quem é criado aqui precisa trocar a senha no primeiro acesso.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "dotenv";
import bcrypt from "bcryptjs";
import { seedPassword } from "./seed-password";

config({ path: ".env.local" });
config();

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const ADMINS = [
  { email: "dav@donnaticy.com", name: "Dav", passwordEnv: "SEED_DAV_PASSWORD" },
  { email: "all@donnaticy.com", name: "All", passwordEnv: "SEED_ALL_PASSWORD" },
];

async function main(): Promise<void> {
  for (const admin of ADMINS) {
    const existing = await prisma.user.findUnique({ where: { email: admin.email } });

    if (existing) {
      await prisma.user.update({
        where: { email: admin.email },
        data: { name: admin.name, role: "SUPER_ADMIN", isActive: true, deletedAt: null },
      });
      console.log(`↻ Atualizado para SUPER_ADMIN (senha preservada): ${admin.email}`);
      continue;
    }

    await prisma.user.create({
      data: {
        email: admin.email,
        name: admin.name,
        passwordHash: await bcrypt.hash(seedPassword(admin.passwordEnv, "SEED_ADMIN_PASSWORD"), 12),
        role: "SUPER_ADMIN",
        mustChangePassword: true,
      },
    });
    console.log(`✅ Criado SUPER_ADMIN: ${admin.email}`);
  }

  const total = await prisma.user.count({ where: { role: "SUPER_ADMIN", deletedAt: null } });
  console.log(`\nAdministradores ativos que recebem aprovação de desconto: ${total}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
