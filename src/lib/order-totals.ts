import type { DiscountType } from "./discount-approval";
import { fromCents, toCents } from "./money";

/** Tolerância em reais entre a soma dos pagamentos e o total do pedido. */
export const PAYMENT_TOLERANCE = 0.01;

/**
 * Desconto do cupom em reais, arredondado em centavos. Nunca ultrapassa o subtotal.
 */
export function calculateCouponDiscount(
  subtotal: number,
  discountType: DiscountType,
  discountValue: number,
): number {
  const subtotalCents = toCents(subtotal);
  const raw =
    discountType === "PERCENT" ? Math.round((subtotalCents * discountValue) / 100) : toCents(discountValue);
  return fromCents(Math.min(Math.max(raw, 0), subtotalCents));
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
  const remaining = Math.max(toCents(subtotal) - toCents(couponDiscount), 0);
  return fromCents(Math.min(Math.max(toCents(requested), 0), remaining));
}

/**
 * A soma dos pagamentos precisa cobrir o total dentro da tolerância de centavos.
 */
export function paymentsCoverTotal(paymentSum: number, total: number): boolean {
  return Math.abs(toCents(paymentSum) - toCents(total)) <= toCents(PAYMENT_TOLERANCE);
}
