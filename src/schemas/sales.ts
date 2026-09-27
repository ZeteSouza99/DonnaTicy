import { z } from "@/lib/zod";

// ============================================================================
// Customer
// ============================================================================

export const createCustomerSchema = z.object({
  fullName: z.string().min(2, "Nome completo deve ter no mínimo 2 caracteres."),
  email: z.email("E-mail inválido.").optional(),
  phone: z.string().min(10, "Telefone deve ter no mínimo 10 dígitos."),
  cpf: z
    .string()
    .regex(/^\d{11}$/, "CPF deve ter 11 dígitos numéricos.")
    .optional(),
  birthDate: z.string().optional(),
  gender: z.enum(["FEMALE", "MALE", "NON_BINARY", "PREFER_NOT_SAY"]).optional(),
  whatsappOptIn: z.boolean().optional(),
  emailOptIn: z.boolean().optional(),
  smsOptIn: z.boolean().optional(),
  acquisitionChannel: z
    .enum(["STORE", "ECOMMERCE", "WHATSAPP", "INSTAGRAM", "REFERRAL"])
    .optional(),
  referredById: z.string().optional(),
});

export const updateCustomerSchema = createCustomerSchema.partial();

// ============================================================================
// Customer Address
// ============================================================================

export const createAddressSchema = z.object({
  label: z.string().optional(),
  street: z.string().min(1, "Rua é obrigatória."),
  number: z.string().min(1, "Número é obrigatório."),
  complement: z.string().optional(),
  district: z.string().min(1, "Bairro é obrigatório."),
  city: z.string().min(1, "Cidade é obrigatória."),
  state: z.string().length(2, "Estado deve ter 2 caracteres (UF)."),
  zipCode: z.string().regex(/^\d{5}-?\d{3}$/, "CEP inválido."),
  isDefault: z.boolean().optional(),
});

// ============================================================================
// Order
// ============================================================================

export const createOrderSchema = z.object({
  channel: z.enum(["STORE", "ECOMMERCE", "CLICK_COLLECT", "WHATSAPP", "MARKETPLACE"]),
  customerId: z.string().optional(),
  locationId: z.string().optional(),
  sellerId: z.string().optional(),
  deliveryMethod: z.enum(["PICKUP", "STANDARD", "EXPRESS", "SAME_DAY"]).optional(),
  shippingAddress: z
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
  couponCode: z.string().optional(),
  storeCreditCode: z.string().optional(),
  discount: z.number().min(0, "Desconto não pode ser negativo.").optional(),
  discountApprovalId: z.string().optional(),
  items: z
    .array(
      z.object({
        variantId: z.string().min(1),
        quantity: z.number().int().positive("Quantidade deve ser positiva."),
      }),
    )
    .min(1, "Pedido deve ter pelo menos 1 item."),
  payments: z
    .array(
      z.object({
        method: z.enum(["CREDIT", "DEBIT", "PIX", "CASH", "VOUCHER"]),
        gateway: z.enum(["PAGARME", "STONE", "CIELO", "REDE", "INTERNAL"]).optional(),
        amount: z.number().positive("Valor deve ser positivo."),
        installments: z.number().int().min(1).max(12).optional(),
      }),
    )
    .default([]),
  notes: z.string().optional(),
});

// ============================================================================
// Discount Approval (aprovação remota de desconto no PDV)
// ============================================================================

export const discountRequestItemSchema = z.object({
  variantId: z.string().min(1),
  sku: z.string().min(1),
  productName: z.string().min(1),
  colorName: z.string().optional(),
  sizeName: z.string().optional(),
  quantity: z.number().int().positive(),
  unitPrice: z.number().nonnegative(),
});

export const createDiscountRequestSchema = z.object({
  cartTotal: z.number().positive("Total do carrinho deve ser positivo."),
  reason: z.string().max(500).optional(),
  /** Snapshot dos itens da venda — usado na trilha de auditoria da aprovação. */
  items: z.array(discountRequestItemSchema).max(200).optional(),
  customerId: z.string().optional(),
  customerName: z.string().max(200).optional(),
  locationId: z.string().optional(),
  locationName: z.string().max(200).optional(),
});

export const resolveDiscountRequestSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("approve"),
      discountType: z.enum(["PERCENT", "AMOUNT"]),
      discountValue: z.number().positive("Valor do desconto deve ser positivo."),
    })
    .refine((v) => v.discountType !== "PERCENT" || v.discountValue <= 100, {
      message: "Percentual não pode exceder 100%.",
      path: ["discountValue"],
    }),
  z.object({ action: z.literal("reject") }),
]);

// ============================================================================
// Order Status Transition
// ============================================================================

export const updateOrderStatusSchema = z.object({
  status: z.enum([
    "PENDING_PAYMENT",
    "PAID",
    "PICKING",
    "PACKED",
    "SHIPPED",
    "IN_TRANSIT",
    "OUT_FOR_DELIVERY",
    "DELIVERED",
    "CANCELLED",
  ]),
  cancelReason: z.string().optional(),
});

// ============================================================================
// Coupon
// ============================================================================

export const createCouponSchema = z.object({
  code: z.string().min(2).max(30).regex(/^[A-Z0-9-]+$/, "Código deve conter apenas letras maiúsculas, números e hífens."),
  description: z.string().optional(),
  discountType: z.enum(["PERCENTAGE", "FIXED"]),
  discountValue: z.number().positive("Valor do desconto deve ser positivo."),
  minOrderValue: z.number().positive().optional(),
  maxUses: z.number().int().positive().optional(),
  validFrom: z.string().min(1, "Data de início é obrigatória."),
  validUntil: z.string().min(1, "Data de expiração é obrigatória."),
  isActive: z.boolean().optional(),
});

export const updateCouponSchema = createCouponSchema.partial();

// ============================================================================
// Exchange (Troca PDV)
// ============================================================================

export const createExchangeSchema = z.object({
  orderId: z.string().min(1, "Pedido original é obrigatório."),
  locationId: z.string().min(1, "Local de estoque é obrigatório."),
  customerId: z.string().optional(),
  returnedItems: z
    .array(
      z.object({
        orderItemId: z.string().min(1),
        quantity: z.number().int().positive("Quantidade deve ser positiva."),
      }),
    )
    .min(1, "Informe pelo menos 1 item devolvido."),
  newItems: z
    .array(
      z.object({
        variantId: z.string().min(1),
        quantity: z.number().int().positive("Quantidade deve ser positiva."),
      }),
    )
    .default([]),
  paymentMethod: z.enum(["CREDIT", "DEBIT", "PIX", "CASH", "VOUCHER", "STORE_CREDIT"]).optional(),
  notes: z.string().optional(),
});
