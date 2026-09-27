import { describe, expect, it } from "vitest";
import { availableAt, hasEnoughStock, totalAvailable } from "@/lib/stock";

describe("availableAt", () => {
  it("desconta o reservado do físico", () => {
    expect(availableAt({ quantity: 10, reservedQty: 3 })).toBe(7);
  });

  it("retorna zero quando tudo está reservado", () => {
    expect(availableAt({ quantity: 4, reservedQty: 4 })).toBe(0);
  });

  it("expõe saldo negativo em caso de inconsistência (não mascara)", () => {
    expect(availableAt({ quantity: 2, reservedQty: 5 })).toBe(-3);
  });
});

describe("totalAvailable", () => {
  it("soma o disponível de todas as localizações", () => {
    expect(
      totalAvailable([
        { quantity: 10, reservedQty: 2 },
        { quantity: 5, reservedQty: 5 },
        { quantity: 3, reservedQty: 0 },
      ]),
    ).toBe(11);
  });

  it("retorna zero sem posições", () => {
    expect(totalAvailable([])).toBe(0);
  });
});

describe("hasEnoughStock", () => {
  const positions = [
    { quantity: 6, reservedQty: 1 },
    { quantity: 2, reservedQty: 2 },
  ];

  it("permite quando há saldo suficiente", () => {
    expect(hasEnoughStock(positions, 5)).toBe(true);
  });

  it("permite no limite exato", () => {
    expect(hasEnoughStock(positions, 5)).toBe(true);
  });

  it("bloqueia acima do disponível", () => {
    expect(hasEnoughStock(positions, 6)).toBe(false);
  });

  it("não considera o estoque reservado como vendável", () => {
    expect(hasEnoughStock([{ quantity: 10, reservedQty: 10 }], 1)).toBe(false);
  });
});
