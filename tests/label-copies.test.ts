import { describe, expect, it } from "vitest";
import {
  defaultCopiesForStock,
  defaultLabelCopies,
  expandLabelCopies,
  totalStockQuantity,
} from "../src/lib/label-copies";

describe("etiquetas conforme a quantidade cadastrada", () => {
  it("usa a quantidade de cada variante e omite as zeradas quando há peças", () => {
    expect(defaultLabelCopies([3])).toEqual([3]);
    expect(defaultLabelCopies([0, 3, 2])).toEqual([0, 3, 2]);
    expect(defaultLabelCopies([150])).toEqual([99]);
  });

  it("mantém 1 etiqueta por variante quando nenhuma tem quantidade", () => {
    expect(defaultLabelCopies([0, 0])).toEqual([1, 1]);
  });

  it("soma o estoque entre locais e usa 1 na seleção avulsa sem estoque", () => {
    expect(totalStockQuantity([{ quantity: 2 }, { quantity: 1 }])).toBe(3);
    expect(totalStockQuantity(undefined)).toBe(0);
    expect(defaultCopiesForStock(3)).toBe(3);
    expect(defaultCopiesForStock(0)).toBe(1);
    expect(defaultCopiesForStock(120)).toBe(99);
  });

  it("monta a folha com uma etiqueta por cópia, na ordem", () => {
    const sheet = expandLabelCopies([
      { sku: "CAMISA-AZUL-P", copies: 0 },
      { sku: "CAMISA-AZUL-M", copies: 3 },
      { sku: "CAMISA-AZUL-G", copies: 1 },
    ]);
    expect(sheet.map((l) => l.sku)).toEqual(["CAMISA-AZUL-M", "CAMISA-AZUL-M", "CAMISA-AZUL-M", "CAMISA-AZUL-G"]);
  });
});
