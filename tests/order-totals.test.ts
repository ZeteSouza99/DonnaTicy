import { describe, expect, it } from "vitest";
import {
  PAYMENT_TOLERANCE,
  calculateCouponDiscount,
  capManualDiscount,
  paymentsCoverTotal,
} from "@/lib/order-totals";

describe("calculateCouponDiscount", () => {
  it("aplica cupom percentual", () => {
    expect(calculateCouponDiscount(250, "PERCENT", 20)).toBe(50);
  });

  it("aplica cupom de valor fixo", () => {
    expect(calculateCouponDiscount(250, "AMOUNT", 40)).toBe(40);
  });

  it("limita o cupom ao subtotal", () => {
    expect(calculateCouponDiscount(80, "AMOUNT", 200)).toBe(80);
    expect(calculateCouponDiscount(80, "PERCENT", 200)).toBe(80);
  });

  it("ignora valores negativos", () => {
    expect(calculateCouponDiscount(80, "AMOUNT", -10)).toBe(0);
  });
});

describe("capManualDiscount", () => {
  it("mantém o desconto quando cabe no restante", () => {
    expect(capManualDiscount(30, 200, 50)).toBe(30);
  });

  it("limita ao que sobrou depois do cupom", () => {
    expect(capManualDiscount(500, 200, 50)).toBe(150);
  });

  it("zera quando o cupom já consumiu o subtotal", () => {
    expect(capManualDiscount(40, 200, 200)).toBe(0);
  });

  it("nunca retorna negativo", () => {
    expect(capManualDiscount(-40, 200, 0)).toBe(0);
    expect(capManualDiscount(10, 100, 300)).toBe(0);
  });
});

describe("paymentsCoverTotal", () => {
  it("aceita pagamento exato", () => {
    expect(paymentsCoverTotal(199.9, 199.9)).toBe(true);
  });

  it("aceita diferença dentro da tolerância de centavos", () => {
    expect(paymentsCoverTotal(199.9 + PAYMENT_TOLERANCE, 199.9)).toBe(true);
    expect(paymentsCoverTotal(199.9 - PAYMENT_TOLERANCE, 199.9)).toBe(true);
  });

  it("rejeita pagamento a menos", () => {
    expect(paymentsCoverTotal(150, 199.9)).toBe(false);
  });

  it("rejeita pagamento a mais fora da tolerância", () => {
    expect(paymentsCoverTotal(250, 199.9)).toBe(false);
  });
});

describe("composição do total do pedido", () => {
  it("cupom e desconto manual não deixam o total negativo", () => {
    const subtotal = 120;
    const coupon = calculateCouponDiscount(subtotal, "PERCENT", 50);
    const manual = capManualDiscount(999, subtotal, coupon);
    const total = subtotal - coupon - manual;
    expect(total).toBe(0);
  });
});
