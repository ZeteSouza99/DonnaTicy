import { z } from "@/lib/zod";

// ============================================================================
// Stock Movement
// ============================================================================

export const createStockMovementSchema = z.object({
  variantId: z.string().min(1, "Variante é obrigatória."),
  fromLocationId: z.string().optional(),
  toLocationId: z.string().optional(),
  quantity: z.number().int().positive("Quantidade deve ser positiva."),
  reason: z.enum([
    "SALE",
    "PURCHASE_RECEIVED",
    "PRODUCTION_RECEIVED",
    "RETURN_APPROVED",
    "TRANSFER",
    "ADJUSTMENT",
    "LOSS",
    "DAMAGE",
  ]),
  referenceId: z.string().optional(),
  referenceType: z.string().optional(),
  notes: z.string().optional(),
});

// ============================================================================
// Stock Reservation
// ============================================================================

export const createReservationSchema = z.object({
  variantId: z.string().min(1, "Variante é obrigatória."),
  locationId: z.string().min(1, "Local é obrigatório."),
  quantity: z.number().int().positive("Quantidade deve ser positiva."),
  orderRef: z.string().optional(),
  expiresInMinutes: z.number().int().min(1).max(60).default(15),
});

// ============================================================================
// Location
// ============================================================================

export const createLocationSchema = z.object({
  name: z.string().min(2, "Nome deve ter no mínimo 2 caracteres."),
  code: z.string().min(2).max(20).regex(/^[A-Z0-9-]+$/, "Código deve conter apenas letras maiúsculas, números e hífens."),
  type: z.enum(["STORE", "WAREHOUSE", "IN_TRANSIT", "VIRTUAL"]),
  address: z
    .object({
      street: z.string(),
      number: z.string(),
      complement: z.string().optional(),
      district: z.string(),
      city: z.string(),
      state: z.string(),
      zipCode: z.string(),
    })
    .optional(),
});

export const updateLocationSchema = createLocationSchema.partial();

// ============================================================================
// Stock Position
// ============================================================================

export const updateStockPositionSchema = z.object({
  quantity: z.number().int().min(0, "Quantidade deve ser >= 0.").optional(),
  minStock: z.number().int().min(0, "Estoque mínimo deve ser >= 0.").optional(),
  safetyStock: z.number().int().min(0, "Estoque de segurança deve ser >= 0.").optional(),
  maxStock: z.number().int().min(0, "Estoque máximo deve ser >= 0.").optional(),
});

// ============================================================================
// Inventory Count
// ============================================================================

export const createInventoryCountSchema = z.object({
  locationId: z.string().min(1, "Local é obrigatório."),
});

export const updateCountItemSchema = z.object({
  countedQty: z.number().int().min(0, "Quantidade contada deve ser >= 0."),
});
