import { describe, expect, it, vi, afterEach } from "vitest";
import {
  DISCOUNT_ADMIN_ROLES,
  DISCOUNT_REQUEST_TTL_MS,
  calculateDiscount,
  isDiscountRequestExpired,
} from "@/lib/discount-approval";

afterEach(() => {
  vi.useRealTimers();
});

describe("calculateDiscount", () => {
  it("converte percentual em reais", () => {
    expect(calculateDiscount(200, "PERCENT", 10)).toEqual({
      discountAmount: 20,
      finalTotal: 180,
    });
  });

  it("aplica valor fixo direto", () => {
    expect(calculateDiscount(200, "AMOUNT", 35.5)).toEqual({
      discountAmount: 35.5,
      finalTotal: 164.5,
    });
  });

  it("arredonda em centavos", () => {
    const { discountAmount, finalTotal } = calculateDiscount(99.99, "PERCENT", 13);
    expect(discountAmount).toBe(13);
    expect(finalTotal).toBe(86.99);
  });

  it("nunca deixa o desconto passar do total do carrinho", () => {
    expect(calculateDiscount(100, "AMOUNT", 500)).toEqual({
      discountAmount: 100,
      finalTotal: 0,
    });
    expect(calculateDiscount(100, "PERCENT", 150)).toEqual({
      discountAmount: 100,
      finalTotal: 0,
    });
  });

  it("ignora desconto negativo", () => {
    expect(calculateDiscount(100, "AMOUNT", -50)).toEqual({
      discountAmount: 0,
      finalTotal: 100,
    });
  });

  it("nunca gera total negativo", () => {
    const { finalTotal } = calculateDiscount(49.9, "AMOUNT", 1000);
    expect(finalTotal).toBeGreaterThanOrEqual(0);
  });
});

describe("isDiscountRequestExpired", () => {
  it("considera válida uma solicitação recém-criada", () => {
    expect(isDiscountRequestExpired(new Date())).toBe(false);
  });

  it("expira depois da janela de 30 minutos", () => {
    vi.useFakeTimers();
    const createdAt = new Date();
    vi.setSystemTime(new Date(createdAt.getTime() + DISCOUNT_REQUEST_TTL_MS + 1));
    expect(isDiscountRequestExpired(createdAt)).toBe(true);
  });

  it("ainda é válida no limite exato da janela", () => {
    vi.useFakeTimers();
    const createdAt = new Date();
    vi.setSystemTime(new Date(createdAt.getTime() + DISCOUNT_REQUEST_TTL_MS));
    expect(isDiscountRequestExpired(createdAt)).toBe(false);
  });
});

describe("DISCOUNT_ADMIN_ROLES", () => {
  it("mantém apenas os papéis que podem aprovar desconto", () => {
    expect(DISCOUNT_ADMIN_ROLES).toEqual(["SUPER_ADMIN", "STORE_MANAGER"]);
  });

  it("não permite que o caixa aprove", () => {
    expect(DISCOUNT_ADMIN_ROLES).not.toContain("SELLER");
  });
});
