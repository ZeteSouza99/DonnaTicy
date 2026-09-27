/**
 * Flags de funcionalidade por cliente (definidas no ambiente de cada deploy).
 * Sem dependências de servidor para poder ser usado também em client components.
 */

/** Quando false, vendedores aplicam desconto no PDV sem aprovação de administrador. */
export const REQUIRE_DISCOUNT_APPROVAL =
  process.env.NEXT_PUBLIC_REQUIRE_DISCOUNT_APPROVAL !== "false";

/** Quando true, o PDV imprime comprovante de venda na impressora térmica local (via print-service). */
export const RECEIPT_PRINTING =
  process.env.NEXT_PUBLIC_FEATURE_RECEIPT_PRINTING === "true";
