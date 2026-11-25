import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { POST as batchImport } from "@/app/api/catalog/batch-import/route";
import { createFixture, request, resetDatabase } from "./fixtures";

let fixture: Awaited<ReturnType<typeof createFixture>>;

beforeEach(async () => {
  await resetDatabase();
  fixture = await createFixture();
});
afterAll(() => prisma.$disconnect());

describe("cadastro de produto em lote", () => {
  it("devolve o preço de venda para as etiquetas geradas", async () => {
    const color = await prisma.color.findFirstOrThrow();
    const size = await prisma.size.findFirstOrThrow();
    const response = await batchImport(request("POST", "/api/catalog/batch-import", fixture.token, {
      collectionId: fixture.product.collectionId,
      lineId: fixture.product.lineId,
      locationId: fixture.location.id,
      rows: [{
        code: "VESTIDO-PRET-M", internalDescription: "Vestido Midi", colorId: color.id, sizeId: size.id,
        categoryId: fixture.product.categoryId, quantity: 2, costUnit: 70, priceSuggestion: "189,90",
      }],
    }));

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.results).toHaveLength(1);
    expect(body.results[0]).toMatchObject({ productName: "VESTIDO MIDI", basePrice: 189.9 });
    expect(body.results[0].variants[0]).toMatchObject({ sku: "VESTIDO-PRET-M", quantity: 2 });
  });
});
