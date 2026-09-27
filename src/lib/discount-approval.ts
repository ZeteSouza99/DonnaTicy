import { UserRole } from "@prisma/client";

/** Solicitações PENDING/APPROVED expiram em 30 minutos. */
export const DISCOUNT_REQUEST_TTL_MS = 30 * 60 * 1000;

/** Papéis que aprovam descontos e podem dar desconto livre no PDV. */
export const DISCOUNT_ADMIN_ROLES: UserRole[] = ["SUPER_ADMIN", "STORE_MANAGER"];

export function isDiscountRequestExpired(createdAt: Date): boolean {
  return Date.now() - createdAt.getTime() > DISCOUNT_REQUEST_TTL_MS;
}

export type DiscountType = "PERCENT" | "AMOUNT";

export interface DiscountResult {
  /** Valor efetivo do desconto em reais, já arredondado em centavos. */
  discountAmount: number;
  /** Total do carrinho após o desconto. */
  finalTotal: number;
}

/**
 * Converte o desconto aprovado (percentual ou valor fixo) para reais.
 * O desconto nunca ultrapassa o total do carrinho, e o resultado é sempre
 * arredondado em centavos para bater com o que é cobrado no PDV.
 */
export function calculateDiscount(
  cartTotal: number,
  discountType: DiscountType,
  discountValue: number,
): DiscountResult {
  const raw =
    discountType === "PERCENT" ? (cartTotal * discountValue) / 100 : discountValue;
  const capped = Math.min(Math.max(raw, 0), cartTotal);
  const discountAmount = Math.round(capped * 100) / 100;
  const finalTotal = Math.round((cartTotal - discountAmount) * 100) / 100;
  return { discountAmount, finalTotal };
}
