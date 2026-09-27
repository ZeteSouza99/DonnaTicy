import { z } from "@/lib/zod";

// ============================================================================
// Return Request
// ============================================================================

export const createReturnRequestSchema = z.object({
  orderId: z.string().min(1, "Pedido é obrigatório."),
  customerId: z.string().min(1, "Cliente é obrigatório."),
  type: z.enum(["RETURN", "EXCHANGE"]),
  items: z
    .array(
      z.object({
        orderItemId: z.string().min(1),
        variantId: z.string().min(1),
        quantity: z.number().int().positive("Quantidade deve ser positiva."),
        reason: z.enum(["WRONG_SIZE", "COLOR_MISMATCH", "DEFECT", "REGRET", "OTHER"]),
        exchangeVariantId: z.string().optional(),
      }),
    )
    .min(1, "Devolução deve ter pelo menos 1 item."),
  reasonDetail: z.string().optional(),
});

export const updateReturnStatusSchema = z.object({
  status: z.enum([
    "REQUESTED",
    "POSTAGE_GENERATED",
    "POSTED",
    "RECEIVED",
    "INSPECTING",
    "APPROVED",
    "REJECTED",
    "RESOLVED",
  ]),
  inspectionResult: z
    .enum(["APPROVED", "APPROVED_WITH_NOTE", "REJECTED", "OUTLET", "DISPOSED"])
    .optional(),
  inspectionNotes: z.string().optional(),
  resolution: z.enum(["REFUND", "STORE_CREDIT", "EXCHANGE_SENT"]).optional(),
  refundAmount: z.number().min(0).optional(),
  storeCreditAmount: z.number().min(0).optional(),
});

// ============================================================================
// Shipment
// ============================================================================

export const createShipmentSchema = z.object({
  orderId: z.string().min(1, "Pedido é obrigatório."),
  carrier: z.enum(["CORREIOS", "JADLOG", "LOGGI", "KANGU", "MELHOR_ENVIO", "OWN_FLEET"]),
  priority: z.enum(["P1_SAME_DAY", "P2_EXPRESS", "P3_STANDARD", "P4_CLICK_COLLECT"]),
  weight: z.number().positive().optional(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  length: z.number().positive().optional(),
});

export const updateShipmentSchema = z.object({
  trackingCode: z.string().optional(),
  labelUrl: z.string().url("URL da etiqueta inválida.").optional(),
  shippingCost: z.number().min(0).optional(),
  pickedAt: z.string().optional(),
  packedAt: z.string().optional(),
  shippedAt: z.string().optional(),
  deliveredAt: z.string().optional(),
});
