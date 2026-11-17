export type MovementKind = "entry" | "exit" | "transfer";

export const movementReasons = {
  entry: [{ value: "ADJUSTMENT", label: "Ajuste de entrada" }, { value: "PURCHASE_RECEIVED", label: "Recebimento de compra" }, { value: "PRODUCTION_RECEIVED", label: "Recebimento de produção" }, { value: "RETURN_APPROVED", label: "Devolução aprovada" }],
  exit: [{ value: "ADJUSTMENT", label: "Ajuste de saída" }, { value: "LOSS", label: "Perda" }, { value: "DAMAGE", label: "Avaria" }, { value: "SALE", label: "Baixa manual de venda" }],
  transfer: [{ value: "TRANSFER", label: "Transferência entre locais" }],
} as const;

export function movementInput(input: {
  kind: MovementKind; variantId: string; locationId: string; destinationId: string;
  quantity: string; reason: string; notes: string;
}) {
  if (!input.variantId) throw new Error("Escolha o produto que será movimentado.");
  if (!input.locationId) throw new Error("Escolha o local de estoque.");
  const quantity = Number(input.quantity);
  if (!Number.isSafeInteger(quantity) || quantity <= 0 || quantity > 2_147_483_647) throw new Error("Informe uma quantidade inteira maior que zero.");
  if (!movementReasons[input.kind].some(r => r.value === input.reason)) throw new Error("Escolha um motivo compatível com a movimentação.");
  if (input.kind === "transfer" && (!input.destinationId || input.destinationId === input.locationId)) throw new Error("Escolha um destino diferente da origem.");
  return {
    variantId: input.variantId, quantity, reason: input.reason, notes: input.notes.trim() || undefined,
    fromLocationId: input.kind === "entry" ? undefined : input.locationId,
    toLocationId: input.kind === "entry" ? input.locationId : input.kind === "transfer" ? input.destinationId : undefined,
  };
}
