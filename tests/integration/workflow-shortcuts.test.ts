import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { POST as moveStock } from "@/app/api/inventory/movements/route";
import { GET as stockList } from "@/app/api/inventory/stock/route";
import { GET as variants } from "@/app/api/catalog/variants/route";
import { GET as variantDetail } from "@/app/api/catalog/variants/[id]/route";
import { GET as kpis } from "@/app/api/dashboard/kpis/route";
import { movementInput } from "@/lib/inventory-movement";
import { createFixture, params, request, resetDatabase } from "./fixtures";

let fixture: Awaited<ReturnType<typeof createFixture>>;
beforeEach(async () => { await resetDatabase(); fixture = await createFixture(); });
afterAll(() => prisma.$disconnect());

describe("atalhos de estoque e painel", () => {
  it("os dados da linha do estoque permitem abrir o produto correto e pesquisar seu SKU", async () => {
    const stock = await stockList(request("GET", "/api/inventory/stock", fixture.token));
    expect(stock.status).toBe(200);
    const row = (await stock.json()).data[0];
    expect(row.variant.id).toBe(fixture.variant.id);
    expect(row.location.id).toBe(fixture.location.id);
    const detail = await variantDetail(request("GET", "/api/catalog/variants/" + row.variant.id, fixture.token), params(row.variant.id));
    expect(detail.status).toBe(200);
    expect((await detail.json()).stockPositions[0]).toMatchObject({ locationId: row.location.id, quantity: 10 });
    const found = await variants(request("GET", "/api/catalog/variants?search=" + encodeURIComponent(fixture.variant.sku), fixture.token));
    expect(found.status).toBe(200);
    expect((await found.json()).data.map((v: { id: string }) => v.id)).toContain(row.variant.id);
    expect(await prisma.stockMovement.count()).toBe(0);
  });

  it("registra entrada, saída e transferência geradas pelo formulário com saldos e auditoria corretos", async () => {
    const warehouse = await prisma.location.create({ data: { name: "Outro local", code: "OUTRO", type: "WAREHOUSE" } });
    const base = { variantId: fixture.variant.id, locationId: fixture.location.id, destinationId: warehouse.id, notes: "", reason: "ADJUSTMENT" };
    for (const operation of [
      { kind: "entry" as const, quantity: "2", reason: "ADJUSTMENT" },
      { kind: "exit" as const, quantity: "3", reason: "LOSS" },
      { kind: "transfer" as const, quantity: "4", reason: "TRANSFER" },
    ]) {
      const response = await moveStock(request("POST", "/api/inventory/movements", fixture.token, movementInput({ ...base, ...operation })));
      expect(response.status).toBe(201);
    }
    const positions = await prisma.stockPosition.findMany({ where: { variantId: fixture.variant.id } });
    expect(positions.find(p => p.locationId === fixture.location.id)?.quantity).toBe(5);
    expect(positions.find(p => p.locationId === warehouse.id)?.quantity).toBe(4);
    expect(await prisma.stockMovement.count()).toBe(3);
    expect(await prisma.auditLog.count({ where: { entity: "StockMovement", action: "CREATE" } })).toBe(3);
  });

  it("devolve o fuso da loja para os botões de período", async () => {
    const response = await kpis(request("GET", "/api/dashboard/kpis", fixture.token));
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.period.timeZone).toBe("America/Manaus");
  });
});
