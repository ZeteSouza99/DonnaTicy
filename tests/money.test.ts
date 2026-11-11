import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { fromCents, toCents } from "@/lib/money";

describe("toCents", () => {
  it("converte reais em centavos inteiros mesmo quando o float não representa o valor", () => {
    expect(toCents(1.15)).toBe(115);
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(toCents(19.9)).toBe(1990);
    expect(toCents(0)).toBe(0);
  });

  it("aceita o Decimal que vem do banco", () => {
    expect(toCents(new Prisma.Decimal("99.90"))).toBe(9990);
    expect(toCents(new Prisma.Decimal("0.07"))).toBe(7);
  });
});

describe("fromCents", () => {
  it("devolve o valor em reais com duas casas", () => {
    expect(fromCents(9990)).toBe(99.9);
    expect(fromCents(7)).toBe(0.07);
    expect(fromCents(toCents(84.91))).toBe(84.91);
  });
});
