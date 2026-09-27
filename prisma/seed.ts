import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import { seedPassword } from "../scripts/seed-password";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main(): Promise<void> {
  console.log("🌱 Iniciando seed...");

  // ============================================================================
  // Admin User
  // ============================================================================
  const brandName = process.env.NEXT_PUBLIC_BRAND_NAME ?? "DonnaTicy";
  const superAdminUsers = [
    {
      email: (process.env.SEED_ADMIN_EMAIL ?? "admin@donnaticy.com").trim().toLowerCase(),
      password: seedPassword("SEED_ADMIN_PASSWORD"),
      name: `Administrador ${brandName}`,
    },
    {
      email: "all@donnaticy.com",
      password: seedPassword("SEED_ALL_PASSWORD", "SEED_ADMIN_PASSWORD"),
      name: "All",
    },
    {
      email: "dav@donnaticy.com",
      password: seedPassword("SEED_DAV_PASSWORD", "SEED_ADMIN_PASSWORD"),
      name: "Dav",
    },
  ];

  for (const seedUser of superAdminUsers) {
    const passwordHash = await bcrypt.hash(seedUser.password, 12);
    const user = await prisma.user.upsert({
      where: { email: seedUser.email },
      update: {
        name: seedUser.name,
        role: "SUPER_ADMIN",
        isActive: true,
        deletedAt: null,
      },
      create: {
        email: seedUser.email,
        passwordHash,
        name: seedUser.name,
        role: "SUPER_ADMIN",
        mustChangePassword: true,
      },
    });
    console.log(`✅ Usuário SUPER_ADMIN pronto: ${user.email}`);
  }

  // ============================================================================
  // Locations
  // ============================================================================
  const lojaCentro = await prisma.location.upsert({
    where: { code: "LJ-CENTRO" },
    update: {},
    create: {
      name: "Loja Centro",
      code: "LJ-CENTRO",
      type: "STORE",
      address: { street: "Rua XV de Novembro", number: "100", city: "Curitiba", state: "PR", zipCode: "80020-310", district: "Centro" },
    },
  });

  const cdPrincipal = await prisma.location.upsert({
    where: { code: "CD-PRINCIPAL" },
    update: {},
    create: {
      name: "Centro de Distribuição",
      code: "CD-PRINCIPAL",
      type: "WAREHOUSE",
      address: { street: "Rod. BR-116", number: "5000", city: "São José dos Pinhais", state: "PR", zipCode: "83010-500", district: "Industrial" },
    },
  });
  console.log(`✅ Locais criados: ${lojaCentro.name}, ${cdPrincipal.name}`);

  // ============================================================================
  // Collections
  // ============================================================================
  const colecaoVerao = await prisma.collection.upsert({
    where: { code: "VER-2025" },
    update: {},
    create: { name: "Verão 2025", code: "VER-2025", season: "Primavera/Verão", year: 2025 },
  });

  const colecaoBasic = await prisma.collection.upsert({
    where: { code: "BASIC-2025" },
    update: {},
    create: { name: "Básicos 2025", code: "BASIC-2025", season: "Permanente", year: 2025 },
  });
  console.log(`✅ Coleções criadas: ${colecaoVerao.name}, ${colecaoBasic.name}`);

  // ============================================================================
  // Lines
  // ============================================================================
  const linhaPerformance = await prisma.line.upsert({
    where: { code: "PERF" },
    update: {},
    create: { name: "Performance", code: "PERF" },
  });

  const linhaLifestyle = await prisma.line.upsert({
    where: { code: "LIFE" },
    update: {},
    create: { name: "Lifestyle", code: "LIFE" },
  });
  console.log(`✅ Linhas criadas: ${linhaPerformance.name}, ${linhaLifestyle.name}`);

  // ============================================================================
  // Categories
  // ============================================================================
  const catLegging = await prisma.category.upsert({
    where: { code: "LEG" },
    update: {},
    create: { name: "Legging", code: "LEG", slug: "legging" },
  });

  const catTop = await prisma.category.upsert({
    where: { code: "TOP" },
    update: {},
    create: { name: "Top", code: "TOP", slug: "top" },
  });

  const catShort = await prisma.category.upsert({
    where: { code: "SHR" },
    update: {},
    create: { name: "Short", code: "SHR", slug: "short" },
  });
  console.log(`✅ Categorias criadas: ${catLegging.name}, ${catTop.name}, ${catShort.name}`);

  // ============================================================================
  // Colors
  // ============================================================================
  const colors = await Promise.all([
    prisma.color.upsert({ where: { code: "PRT" }, update: {}, create: { name: "Preto", code: "PRT", hexValue: "#000000" } }),
    prisma.color.upsert({ where: { code: "BRC" }, update: {}, create: { name: "Branco", code: "BRC", hexValue: "#FFFFFF" } }),
    prisma.color.upsert({ where: { code: "VLT" }, update: {}, create: { name: "Violeta", code: "VLT", hexValue: "#7C3AED" } }),
    prisma.color.upsert({ where: { code: "RSA" }, update: {}, create: { name: "Rosa", code: "RSA", hexValue: "#EC4899" } }),
    prisma.color.upsert({ where: { code: "VDE" }, update: {}, create: { name: "Verde Militar", code: "VDE", hexValue: "#4D7C0F" } }),
  ]);
  console.log(`✅ ${colors.length} cores criadas`);

  // ============================================================================
  // Sizes
  // ============================================================================
  const sizes = await Promise.all([
    prisma.size.upsert({ where: { code: "PP" }, update: {}, create: { name: "PP", code: "PP", sortOrder: 1 } }),
    prisma.size.upsert({ where: { code: "P" }, update: {}, create: { name: "P", code: "P", sortOrder: 2 } }),
    prisma.size.upsert({ where: { code: "M" }, update: {}, create: { name: "M", code: "M", sortOrder: 3, isPeakSize: true } }),
    prisma.size.upsert({ where: { code: "G" }, update: {}, create: { name: "G", code: "G", sortOrder: 4, isPeakSize: true } }),
    prisma.size.upsert({ where: { code: "GG" }, update: {}, create: { name: "GG", code: "GG", sortOrder: 5 } }),
  ]);
  console.log(`✅ ${sizes.length} tamanhos criados`);

  // ============================================================================
  // Products
  // ============================================================================
  const leggingPerf = await prisma.product.upsert({
    where: { code: "LEG-PERF-001" },
    update: {},
    create: {
      code: "LEG-PERF-001",
      name: "Legging Power Compression",
      description: "Legging de alta compressão com tecnologia Emana. Ideal para treinos de alta intensidade.",
      collectionId: colecaoVerao.id,
      lineId: linhaPerformance.id,
      categoryId: catLegging.id,
      composition: "80% Poliamida PA6.6, 20% Elastano",
      weight: 0.25,
      fabricType: "POLIAMIDA_66",
      technology: ["EMANA", "UV_PROTECTION"],
      costPrice: 38.50,
      basePrice: 149.90,
      markup: 2.89,
      abcClass: "A",
      seasonality: "BASIC",
    },
  });

  const topPerf = await prisma.product.upsert({
    where: { code: "TOP-PERF-001" },
    update: {},
    create: {
      code: "TOP-PERF-001",
      name: "Top Crossback Pro",
      description: "Top com sustentação alta e costas cruzadas. Tecido com secagem rápida.",
      collectionId: colecaoVerao.id,
      lineId: linhaPerformance.id,
      categoryId: catTop.id,
      composition: "85% Poliamida, 15% Elastano",
      weight: 0.12,
      fabricType: "POLIAMIDA_6",
      technology: ["SUPPLEX", "DRI_FIT"],
      costPrice: 22.00,
      basePrice: 89.90,
      markup: 3.09,
      abcClass: "A",
      seasonality: "BASIC",
    },
  });

  const shortLife = await prisma.product.upsert({
    where: { code: "SHR-LIFE-001" },
    update: {},
    create: {
      code: "SHR-LIFE-001",
      name: "Short Confort Lifestyle",
      description: "Short cintura alta com bolso lateral. Perfeito para o dia a dia.",
      collectionId: colecaoBasic.id,
      lineId: linhaLifestyle.id,
      categoryId: catShort.id,
      composition: "75% Poliamida, 25% Elastano",
      weight: 0.15,
      fabricType: "POLIAMIDA_6",
      technology: [],
      costPrice: 28.00,
      basePrice: 109.90,
      markup: 2.93,
      abcClass: "B",
      seasonality: "SEASONAL",
    },
  });
  console.log(`✅ Produtos criados: ${leggingPerf.name}, ${topPerf.name}, ${shortLife.name}`);

  // ============================================================================
  // Variants + Stock
  // ============================================================================
  const [preto, , violeta] = colors;
  const [, , sizeM, sizeG] = sizes;

  const variants = [
    { product: leggingPerf, color: preto, size: sizeM, sku: "LEG-PERF-001-PRT-M" },
    { product: leggingPerf, color: preto, size: sizeG, sku: "LEG-PERF-001-PRT-G" },
    { product: leggingPerf, color: violeta, size: sizeM, sku: "LEG-PERF-001-VLT-M" },
    { product: leggingPerf, color: violeta, size: sizeG, sku: "LEG-PERF-001-VLT-G" },
    { product: topPerf, color: preto, size: sizeM, sku: "TOP-PERF-001-PRT-M" },
    { product: topPerf, color: preto, size: sizeG, sku: "TOP-PERF-001-PRT-G" },
    { product: shortLife, color: preto, size: sizeM, sku: "SHR-LIFE-001-PRT-M" },
    { product: shortLife, color: preto, size: sizeG, sku: "SHR-LIFE-001-PRT-G" },
  ];

  for (const v of variants) {
    const variant = await prisma.productVariant.upsert({
      where: { sku: v.sku },
      update: {},
      create: {
        productId: v.product.id,
        sku: v.sku,
        colorId: v.color.id,
        sizeId: v.size.id,
      },
    });

    // Create stock at warehouse
    await prisma.stockPosition.upsert({
      where: { variantId_locationId: { variantId: variant.id, locationId: cdPrincipal.id } },
      update: {},
      create: {
        variantId: variant.id,
        locationId: cdPrincipal.id,
        quantity: 50,
        minStock: 10,
        safetyStock: 15,
        maxStock: 100,
      },
    });

    // Create stock at store
    await prisma.stockPosition.upsert({
      where: { variantId_locationId: { variantId: variant.id, locationId: lojaCentro.id } },
      update: {},
      create: {
        variantId: variant.id,
        locationId: lojaCentro.id,
        quantity: 15,
        minStock: 3,
        safetyStock: 5,
        maxStock: 25,
      },
    });
  }
  console.log(`✅ ${variants.length} variantes com estoque criadas`);

  // ============================================================================
  // Supplier
  // ============================================================================
  await prisma.supplier.upsert({
    where: { cnpj: "12345678000190" },
    update: {},
    create: {
      type: "FABRIC_SUPPLIER",
      companyName: "Tecidos Premium Ltda",
      tradeName: "TecPremium",
      cnpj: "12345678000190",
      contactName: "João Silva",
      phone: "41999990000",
      email: "contato@tecpremium.com.br",
      qualityScore: 4.5,
      deliveryScore: 4.2,
      paymentTerms: "30/60/90 DDL",
    },
  });

  await prisma.supplier.upsert({
    where: { cnpj: "98765432000110" },
    update: {},
    create: {
      type: "CMT_FACTORY",
      companyName: "Confecções Fitness Pro Ltda",
      tradeName: "FitPro Confecções",
      cnpj: "98765432000110",
      contactName: "Maria Santos",
      phone: "41988880000",
      email: "producao@fitpro.com.br",
      qualityScore: 4.8,
      deliveryScore: 4.0,
      paymentTerms: "30 DDL",
    },
  });
  console.log("✅ Fornecedores criados");

  // ============================================================================
  // Sample Customer
  // ============================================================================
  await prisma.customer.upsert({
    where: { phone: "41999001234" },
    update: {},
    create: {
      code: "CLI-SEED001",
      fullName: "Ana Carolina Ferreira",
      email: "ana@email.com",
      phone: "41999001234",
      cpf: "12345678901",
      birthDate: new Date("1992-03-15"),
      gender: "FEMALE",
      tier: "GOLD",
      lifetimeValue: 2850.00,
      totalOrders: 12,
      avgTicket: 237.50,
      whatsappOptIn: true,
      emailOptIn: true,
      acquisitionChannel: "STORE",
    },
  });
  console.log("✅ Cliente de exemplo criada");

  // ============================================================================
  // Cost Centers
  // ============================================================================
  await prisma.costCenter.upsert({
    where: { code: "CC-LJ-CENTRO" },
    update: {},
    create: { code: "CC-LJ-CENTRO", name: "Loja Centro", type: "STORE", locationId: lojaCentro.id },
  });

  await prisma.costCenter.upsert({
    where: { code: "CC-CD" },
    update: {},
    create: { code: "CC-CD", name: "Centro de Distribuição", type: "WAREHOUSE", locationId: cdPrincipal.id },
  });

  await prisma.costCenter.upsert({
    where: { code: "CC-CORP" },
    update: {},
    create: { code: "CC-CORP", name: "Corporativo", type: "CORPORATE" },
  });
  console.log("✅ Centros de custo criados");

  // ============================================================================
  // Settings
  // ============================================================================
  await prisma.setting.upsert({
    where: { key: "loyalty.pointsPerReal" },
    update: {},
    create: { key: "loyalty.pointsPerReal", value: 1, group: "loyalty" },
  });

  await prisma.setting.upsert({
    where: { key: "loyalty.tierThresholds" },
    update: {},
    create: {
      key: "loyalty.tierThresholds",
      value: { BRONZE: 0, SILVER: 500, GOLD: 2000, VIP: 5000 },
      group: "loyalty",
    },
  });

  await prisma.setting.upsert({
    where: { key: "stock.reservationMinutes" },
    update: {},
    create: { key: "stock.reservationMinutes", value: 15, group: "stock" },
  });
  console.log("✅ Configurações criadas");

  console.log("\n🎉 Seed concluído com sucesso!");
}

main()
  .catch((e) => {
    console.error("❌ Erro no seed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
