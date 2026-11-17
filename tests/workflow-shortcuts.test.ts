import { describe, expect, it } from "vitest";
import { fillReceiptBlanks, singleReceiptOptions } from "../src/lib/import/receipt-autofill";
import { movementInput } from "../src/lib/inventory-movement";
import { dashboardPeriod } from "../src/lib/dashboard-period";
import type { ReceiptReview } from "../src/lib/import/invoice-document";
import { invoiceFixture } from "./fixtures/invoice-document";

function review(): ReceiptReview {
  return { locationId: "local", collectionId: "colecao", lineId: "linha", confirmed: true,
    items: [{ line: 1, categoryId: "", salePrice: 0, allocations: [{ quantity: 4, color: "", size: "" }] }] };
}
const values = { categoryId: "cat", color: " Preto ", size: " M ", multiplier: "2,5" };

describe("preenchimento assistido da nota", () => {
  it("preenche campos vazios e inclui o frete no preço sem alterar o original", () => {
    const original = review();
    const result = fillReceiptBlanks(invoiceFixture(), original, values);
    expect(result.changed).toBe(4);
    expect(result.review.items[0]).toEqual({ line: 1, categoryId: "cat", salePrice: 68.75, allocations: [{ quantity: 4, color: "Preto", size: "M" }] });
    expect(original).toEqual(review());
  });
  it("preserva preços, categoria, cores, tamanhos e quantidades já conferidos", () => {
    const original = review();
    original.items[0] = { line: 1, categoryId: "outra", salePrice: 99.90, allocations: [{ quantity: 2, color: "Azul", size: "G" }, { quantity: 2, color: "", size: "" }] };
    const result = fillReceiptBlanks(invoiceFixture(), original, values);
    expect(result.changed).toBe(2);
    expect(result.review.items[0]).toEqual({ ...original.items[0], allocations: [original.items[0].allocations[0], { quantity: 2, color: "Preto", size: "M" }] });
  });
  it("mantém produtos vinculados intactos mesmo em uma linha mista", () => {
    const original = review();
    original.items[0].allocations = [{ variantId: "existente", quantity: 2, color: "", size: "" }, { quantity: 2, color: "", size: "" }];
    const result = fillReceiptBlanks(invoiceFixture(), original, values);
    expect(result.review.items[0].allocations[0]).toEqual(original.items[0].allocations[0]);
    original.items[0].allocations = [original.items[0].allocations[0]];
    expect(fillReceiptBlanks(invoiceFixture(), original, values)).toEqual({ review: original, changed: 0 });
  });
  it("reaplicar o lote não sobrescreve nada e permite preencher apenas cor", () => {
    const first = fillReceiptBlanks(invoiceFixture(), review(), values);
    expect(fillReceiptBlanks(invoiceFixture(), first.review, { ...values, color: "Rosa", multiplier: "5" }).changed).toBe(0);
    const colorOnly = fillReceiptBlanks(invoiceFixture(), review(), { categoryId: "", color: "Azul", size: "", multiplier: "" });
    expect(colorOnly.changed).toBe(1);
    expect(colorOnly.review.items[0].salePrice).toBe(0);
  });
  it.each(["abc", "-1", "0", "Infinity", "999999999999999"])("recusa multiplicador inválido %s sem alterar a conferência", multiplier => {
    const original = review();
    expect(() => fillReceiptBlanks(invoiceFixture(), original, { ...values, multiplier })).toThrow();
    expect(original).toEqual(review());
  });
  it("seleciona apenas opções únicas, sem escolher arbitrariamente entre alternativas", () => {
    expect(singleReceiptOptions({ locations: [{ id: "local" }], collections: [{ id: "a" }, { id: "b" }], lines: [] })).toEqual({ locationId: "local", collectionId: "", lineId: "" });
    expect(singleReceiptOptions(null)).toEqual({ locationId: "", collectionId: "", lineId: "" });
  });
  it("calcula o preço pelo número da linha e não pela posição no array", () => {
    const doc = invoiceFixture();
    doc.items.push({ ...doc.items[0], line: 2, quantity: 2, total: 200 });
    doc.productsTotal = 300; doc.invoiceTotal = 330;
    const input = review();
    input.items = [{ ...input.items[0], line: 2 }, input.items[0]];
    expect(fillReceiptBlanks(doc, input, values).review.items.map(i => i.salePrice)).toEqual([275, 68.75]);
  });
});

describe("movimentação guiada", () => {
  const input = { variantId: "produto", locationId: "loja", destinationId: "deposito", quantity: "3", reason: "ADJUSTMENT", notes: " conferido " };
  it("entrada usa somente destino e saída usa somente origem", () => {
    expect(movementInput({ ...input, kind: "entry" })).toMatchObject({ quantity: 3, fromLocationId: undefined, toLocationId: "loja", notes: "conferido" });
    expect(movementInput({ ...input, kind: "exit" })).toMatchObject({ fromLocationId: "loja", toLocationId: undefined });
  });
  it("transferência preserva origem e destino distintos", () => {
    expect(movementInput({ ...input, kind: "transfer", reason: "TRANSFER" })).toMatchObject({ fromLocationId: "loja", toLocationId: "deposito" });
    expect(() => movementInput({ ...input, kind: "transfer", reason: "TRANSFER", destinationId: "loja" })).toThrow(/diferente/);
    expect(() => movementInput({ ...input, kind: "transfer", reason: "TRANSFER", destinationId: "" })).toThrow(/diferente/);
  });
  it.each(["", "0", "-1", "1.5", "abc", "Infinity", "2147483648"])("recusa quantidade inválida %s", quantity => {
    expect(() => movementInput({ ...input, kind: "entry", quantity })).toThrow(/inteira/);
  });
  it("recusa produto, local ou motivo incompatíveis", () => {
    expect(() => movementInput({ ...input, kind: "entry", variantId: "" })).toThrow(/produto/);
    expect(() => movementInput({ ...input, kind: "exit", locationId: "" })).toThrow(/local/);
    expect(() => movementInput({ ...input, kind: "entry", reason: "LOSS" })).toThrow(/motivo/);
  });
});

describe("períodos rápidos no fuso da loja", () => {
  it("Hoje acompanha a data de Manaus mesmo após a virada do dia em UTC", () => {
    expect(dashboardPeriod("today", new Date("2026-12-01T02:30:00Z"), "America/Manaus")).toEqual({ from: "2026-11-30", to: "2026-11-30" });
  });
  it("Últimos 7 dias inclui hoje e atravessa mês e ano", () => {
    expect(dashboardPeriod("week", new Date("2027-01-03T15:00:00Z"), "America/Manaus")).toEqual({ from: "2026-12-28", to: "2027-01-03" });
  });
  it("Este mês usa o período padrão da API", () => {
    expect(dashboardPeriod("month", new Date(), "America/Manaus")).toEqual({ from: "", to: "" });
  });
});
