import type { DiscountType } from "./discount-approval";

/** Tolerância em reais entre a soma dos pagamentos e o total do pedido. */
export const PAYMENT_TOLERANCE = 0.01;

/**
 * Desconto do cupom em reais. Nunca ultrapassa o subtotal.
 */
export function calculateCouponDiscount(
  subtotal: number,
  discountType: DiscountType,
  discountValue: number,
): number {
  const raw = discountType === "PERCENT" ? (subtotal * discountValue) / 100 : discountValue;
  return Math.min(Math.max(raw, 0), subtotal);
}

/**
 * Limita o desconto manual ao que ainda resta do subtotal depois do cupom,
 * impedindo total negativo mesmo com entrada maliciosa.
 */
export function capManualDiscount(
  requested: number,
  subtotal: number,
  couponDiscount: number,
): number {
  const remaining = Math.max(subtotal - couponDiscount, 0);
  return Math.min(Math.max(requested, 0), remaining);
}

/**
 * A soma dos pagamentos precisa cobrir o total dentro da tolerância de centavos.
 */
export function paymentsCoverTotal(paymentSum: number, total: number): boolean {
  return Math.abs(paymentSum - total) <= PAYMENT_TOLERANCE;
}
