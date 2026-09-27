import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword, signToken } from "@/lib/auth";
import { integrationDatabaseUrl } from "./database";

let passwordHash: string | undefined;

export async function resetDatabase(): Promise<void> {
  integrationDatabaseUrl();
  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;
  if (tables.some(({ tablename }) => !/^[a-z_]+$/.test(tablename))) {
    throw new Error("Nome de tabela inesperado no banco de testes.");
  }
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables.map(({ tablename }) => `"public"."${tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
}

export async function createFixture() {
  passwordHash ??= await hashPassword("Integration-only-123");
  const location = await prisma.location.create({ data: { name: "Loja Teste", code: "TEST", type: "STORE" } });
  const user = await prisma.user.create({
    data: { email: "operator@example.test", name: "Operador Teste", passwordHash, role: "SUPER_ADMIN", locationId: location.id },
  });
  const customer = await prisma.customer.create({ data: { code: "CLI-TEST", fullName: "Cliente Teste", phone: "11999999001" } });
  const collection = await prisma.collection.create({ data: { code: "TEST", name: "Teste", season: "Teste", year: 2026 } });
  const line = await prisma.line.create({ data: { code: "TEST", name: "Teste" } });
  const category = await prisma.category.create({ data: { code: "TEST", name: "Teste", slug: "teste" } });
  const color = await prisma.color.create({ data: { code: "TEST", name: "Preto", hexValue: "#000000" } });
  const size = await prisma.size.create({ data: { code: "M", name: "M", sortOrder: 1 } });
  const product = await prisma.product.create({
    data: {
      code: "PROD-TEST", name: "Camiseta Teste", collectionId: collection.id, lineId: line.id,
      categoryId: category.id, technology: [], costPrice: 40, basePrice: 100, markup: 2.5,
    },
  });
  const variant = await prisma.productVariant.create({
    data: { productId: product.id, sku: "TEST-PRETO-M", colorId: color.id, sizeId: size.id },
  });
  await prisma.stockPosition.create({ data: { variantId: variant.id, locationId: location.id, quantity: 10 } });
  const token = await signToken({ sub: user.id, email: user.email, role: user.role, locationId: location.id, tokenVersion: user.tokenVersion });
  return { location, user, customer, variant, product, token };
}

export function request(method: string, path: string, token: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: { "Content-Type": "application/json", Cookie: `session=${token}` },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
}

export function params(id: string) {
  return { params: Promise.resolve({ id }) };
}