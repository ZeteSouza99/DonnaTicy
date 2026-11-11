import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { Client } from "pg";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { prisma } from "@/lib/db";
import { POST as moveStock } from "@/app/api/inventory/movements/route";
import { PATCH as adjustPosition } from "@/app/api/inventory/stock/[id]/route";
import { POST as createOrder } from "@/app/api/orders/route";
import { POST as createExchange } from "@/app/api/sales/exchanges/route";
import { createFixture, params, request, resetDatabase } from "./fixtures";
import { integrationDatabaseUrl } from "./database";

let fixture: Awaited<ReturnType<typeof createFixture>>;

beforeEach(async () => {
  await resetDatabase();
  fixture = await createFixture();
});
afterAll(() => prisma.$disconnect());

function position(variantId = fixture.variant.id, locationId = fixture.location.id) {
  return prisma.stockPosition.findUniqueOrThrow({ where: { variantId_locationId: { variantId, locationId } } });
}

function move(body: Record<string, unknown>) {
  return moveStock(request("POST", "/api/inventory/movements", fixture.token, {
    variantId: fixture.variant.id, reason: "LOSS", ...body,
  }));
}

function sellAtCounter(variantId: string, quantity: number) {
  return createOrder(request("POST", "/api/orders", fixture.token, {
    channel: "STORE", customerId: fixture.customer.id, locationId: fixture.location.id,
    items: [{ variantId, quantity }], payments: [{ method: "PIX", amount: 100 * quantity }],
  }));
}

/** Simula pedidos remotos pagos aguardando separação. */
async function reserve(reservedQty: number, variantId = fixture.variant.id) {
  await prisma.stockPosition.update({
    where: { variantId_locationId: { variantId, locationId: fixture.location.id } },
    data: { reservedQty },
  });
}

describe("movimentação manual de estoque", () => {
  it("registra a saída com movimento e auditoria", async () => {
    expect((await move({ fromLocationId: fixture.location.id, quantity: 3 })).status).toBe(201);
    expect(await position()).toMatchObject({ quantity: 7, reservedQty: 0 });
    expect(await prisma.stockMovement.findFirstOrThrow()).toMatchObject({ quantity: 3, reason: "LOSS", fromLocationId: fixture.location.id, toLocationId: null });
    expect(await prisma.auditLog.count({ where: { entity: "StockMovement", action: "CREATE" } })).toBe(1);
  });

  it("transfere entre locais e cria a posição de destino", async () => {
    const warehouse = await prisma.location.create({ data: { name: "Depósito Teste", code: "DEP", type: "WAREHOUSE" } });
    const response = await move({ fromLocationId: fixture.location.id, toLocationId: warehouse.id, quantity: 4, reason: "TRANSFER" });
    expect(response.status).toBe(201);
    expect(await position()).toMatchObject({ quantity: 6 });
    expect(await position(fixture.variant.id, warehouse.id)).toMatchObject({ quantity: 4, reservedQty: 0 });
  });

  it("recusa saída maior que o saldo sem gravar movimento", async () => {
    expect((await move({ fromLocationId: fixture.location.id, quantity: 11 })).status).toBe(400);
    expect(await position()).toMatchObject({ quantity: 10 });
    expect(await prisma.stockMovement.count()).toBe(0);
  });

  it("serializa duas saídas simultâneas sem deixar o saldo negativo", async () => {
    const blocker = new Client({ connectionString: integrationDatabaseUrl() });
    const observer = new Client({ connectionString: integrationDatabaseUrl() });
    const operations: Array<Promise<Response>> = [];
    await blocker.connect();
    await observer.connect();
    const blockedCount = async () => {
      const result = await observer.query(`
        SELECT count(*)::int AS count FROM pg_stat_activity
        WHERE datname = current_database() AND wait_event_type = 'Lock'
          AND (query ILIKE '%stock_positions%' OR query ILIKE '%pg_advisory_xact_lock%')
      `);
      return result.rows[0].count as number;
    };
    try {
      // Segura a posição até as duas requisições já terem lido o saldo de 10.
      await blocker.query("BEGIN");
      await blocker.query("SELECT id FROM stock_positions WHERE variant_id = $1 AND location_id = $2 FOR UPDATE", [fixture.variant.id, fixture.location.id]);
      operations.push(
        move({ fromLocationId: fixture.location.id, quantity: 7 }),
        move({ fromLocationId: fixture.location.id, quantity: 7 }),
      );
      await expect.poll(blockedCount, { timeout: 2_000, interval: 10 }).toBe(2);
      await blocker.query("COMMIT");
      expect((await Promise.all(operations)).map((response) => response.status).sort()).toEqual([201, 400]);
    } finally {
      await blocker.query("ROLLBACK");
      await Promise.allSettled(operations);
      await blocker.end();
      await observer.end();
    }
    expect(await position()).toMatchObject({ quantity: 3 });
    expect(await prisma.stockMovement.count()).toBe(1);
  });

  it("não retira peça reservada para pedido", async () => {
    await reserve(8);
    expect((await move({ fromLocationId: fixture.location.id, quantity: 3 })).status).toBe(400);
    expect(await position()).toMatchObject({ quantity: 10, reservedQty: 8 });
    expect(await prisma.stockMovement.count()).toBe(0);
    expect((await move({ fromLocationId: fixture.location.id, quantity: 2 })).status).toBe(201);
    expect(await position()).toMatchObject({ quantity: 8, reservedQty: 8 });
  });
});

describe("reserva protegida nas demais baixas físicas", () => {
  it("venda de balcão não consome peça reservada", async () => {
    await reserve(8);
    expect((await sellAtCounter(fixture.variant.id, 3)).status).toBe(409);
    expect(await position()).toMatchObject({ quantity: 10, reservedQty: 8 });
    expect(await prisma.order.count()).toBe(0);
    expect((await sellAtCounter(fixture.variant.id, 2)).status).toBe(201);
    expect(await position()).toMatchObject({ quantity: 8, reservedQty: 8 });
  });

  it("troca não entrega peça reservada", async () => {
    const size = await prisma.size.create({ data: { code: "G", name: "G", sortOrder: 2 } });
    const other = await prisma.productVariant.create({ data: {
      productId: fixture.product.id, colorId: fixture.variant.colorId, sizeId: size.id, sku: "TEST-PRETO-G",
    } });
    await prisma.stockPosition.create({ data: { locationId: fixture.location.id, variantId: other.id, quantity: 2, reservedQty: 2 } });
    const sale = await sellAtCounter(fixture.variant.id, 1);
    expect(sale.status).toBe(201);
    const sold = await prisma.orderItem.findFirstOrThrow({ where: { orderId: (await sale.json()).id } });

    const response = await createExchange(request("POST", "/api/sales/exchanges", fixture.token, {
      orderId: sold.orderId, locationId: fixture.location.id,
      returnedItems: [{ orderItemId: sold.id, quantity: 1 }],
      newItems: [{ variantId: other.id, quantity: 1 }],
    }));
    expect(response.status).toBe(409);
    expect(await position(other.id)).toMatchObject({ quantity: 2, reservedQty: 2 });
    expect(await position()).toMatchObject({ quantity: 9 });
    expect(await prisma.exchange.count()).toBe(0);
  });

  it("ajuste de posição não deixa o físico abaixo do reservado", async () => {
    await reserve(8);
    const { id } = await position();
    const adjust = (quantity: number) =>
      adjustPosition(request("PATCH", `/api/inventory/stock/${id}`, fixture.token, { quantity }), params(id));
    expect((await adjust(5)).status).toBe(400);
    expect(await position()).toMatchObject({ quantity: 10, reservedQty: 8 });
    expect((await adjust(8)).status).toBe(200);
    expect(await position()).toMatchObject({ quantity: 8, reservedQty: 8 });
  });

  it("o banco recusa saldo negativo e reserva acima do físico", async () => {
    const { id } = await position();
    await expect(prisma.stockPosition.update({ where: { id }, data: { quantity: -1 } })).rejects.toThrow();
    await expect(prisma.stockPosition.update({ where: { id }, data: { reservedQty: 11 } })).rejects.toThrow();
    await expect(prisma.stockPosition.update({ where: { id }, data: { reservedQty: -1 } })).rejects.toThrow();
    expect(await position()).toMatchObject({ quantity: 10, reservedQty: 0 });
  });

  it("purge-sales estorna o estoque de uma posição com reserva", async () => {
    await prisma.stockPosition.update({
      where: { variantId_locationId: { variantId: fixture.variant.id, locationId: fixture.location.id } },
      data: { quantity: 3, reservedQty: 2 },
    });
    const order = await prisma.order.create({
      data: {
        code: "PED-PURGE", channel: "ECOMMERCE", status: "CANCELLED", customerId: fixture.customer.id,
        locationId: fixture.location.id, subtotal: 200, total: 200,
      },
    });
    await prisma.stockMovement.create({
      data: {
        variantId: fixture.variant.id, toLocationId: fixture.location.id, quantity: 2,
        reason: "ADJUSTMENT", referenceId: order.id, referenceType: "Order",
      },
    });

    const databaseUrl = integrationDatabaseUrl();
    // Fora do repositório: o script lê .env.local do diretório atual e não pode achar o banco real.
    const cwd = await mkdtemp(join(tmpdir(), "donnaticy-purge-"));
    try {
      await promisify(execFile)(
        process.execPath,
        [resolve("node_modules/tsx/dist/cli.mjs"), resolve("scripts/purge-sales.ts"), "--yes"],
        { cwd, env: { ...process.env, DATABASE_URL: databaseUrl, DIRECT_DATABASE_URL: databaseUrl }, timeout: 60_000 },
      );
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }

    expect(await position()).toMatchObject({ quantity: 1, reservedQty: 0 });
    expect(await prisma.order.count()).toBe(0);
    expect(await prisma.stockMovement.count()).toBe(0);
  }, 90_000);
});
