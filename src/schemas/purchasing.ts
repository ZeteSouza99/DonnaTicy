import { z } from "@/lib/zod";

// ============================================================================
// Supplier
// ============================================================================

export const createSupplierSchema = z.object({
  type: z.enum(["FABRIC_SUPPLIER", "TRIM_SUPPLIER", "CMT_FACTORY", "FULL_PACKAGE"]),
  companyName: z.string().min(2, "Razão social é obrigatória."),
  tradeName: z.string().optional(),
  cnpj: z.string().regex(/^\d{14}$/, "CNPJ deve ter 14 dígitos numéricos."),
  stateReg: z.string().optional(),
  contactName: z.string().optional(),
  phone: z.string().optional(),
  email: z.email("E-mail inválido.").optional(),
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
  paymentTerms: z.string().optional(),
  minOrderValue: z.number().positive().optional(),
});

export const updateSupplierSchema = createSupplierSchema.partial();

// ============================================================================
// Purchase Order
// ============================================================================

export const createPurchaseOrderSchema = z.object({
  supplierId: z.string().min(1, "Fornecedor é obrigatório."),
  expectedAt: z.string().optional(),
  notes: z.string().optional(),
  items: z
    .array(
      z.object({
        rawMaterialId: z.string().min(1),
        quantity: z.number().positive("Quantidade deve ser positiva."),
        unitPrice: z.number().positive("Preço unitário deve ser positivo."),
      }),
    )
    .min(1, "Pedido de compra deve ter pelo menos 1 item."),
});

export const updatePurchaseOrderStatusSchema = z.object({
  status: z.enum([
    "DRAFT",
    "PENDING_APPROVAL",
    "APPROVED",
    "SENT_TO_SUPPLIER",
    "PARTIALLY_RECEIVED",
    "RECEIVED",
    "CANCELLED",
  ]),
  notes: z.string().optional(),
});

// ============================================================================
// Production Order
// ============================================================================

export const createProductionOrderSchema = z.object({
  supplierId: z.string().min(1, "Facção é obrigatória."),
  collectionId: z.string().optional(),
  deadlineAt: z.string().optional(),
  unitCostCmt: z.number().positive().optional(),
  technicalNotes: z.string().optional(),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        variantId: z.string().min(1),
        quantity: z.number().int().positive("Quantidade deve ser positiva."),
      }),
    )
    .min(1, "Ordem de produção deve ter pelo menos 1 item."),
});

export const updateProductionStatusSchema = z.object({
  status: z.enum([
    "DRAFT",
    "APPROVED",
    "MATERIAL_SENT",
    "IN_PRODUCTION",
    "PARTIAL_DELIVERY",
    "QUALITY_INSPECTION",
    "REWORK",
    "COMPLETED",
    "CANCELLED",
  ]),
});

// ============================================================================
// Raw Material
// ============================================================================

export const createRawMaterialSchema = z.object({
  code: z.string().min(2).max(20).regex(/^[A-Z0-9-]+$/, "Código deve conter apenas letras maiúsculas, números e hífens."),
  name: z.string().min(2, "Nome deve ter no mínimo 2 caracteres."),
  category: z.enum(["TECIDO", "AVIAMENTO", "EMBALAGEM", "ETIQUETA"]),
  fabricType: z.enum(["POLIAMIDA_6", "POLIAMIDA_66", "POLIESTER", "ALGODAO", "BLEND"]).optional(),
  yarnTechnology: z.enum(["STANDARD", "EMANA", "SUPPLEX", "AMNI", "LYCRA_SPORT"]).optional(),
  grammage: z.number().positive().optional(),
  width: z.number().positive().optional(),
  composition: z.string().optional(),
  elasticity: z.number().min(0).max(100).optional(),
  uvProtection: z.boolean().optional(),
  moistureWicking: z.boolean().optional(),
  compression: z.enum(["NONE", "LIGHT", "MEDIUM", "HIGH"]).optional(),
  oekoTexCertified: z.boolean().optional(),
  recycledContent: z.number().min(0).max(100).optional(),
  primarySupplierId: z.string().optional(),
  backupSupplierId: z.string().optional(),
  unitOfMeasure: z.enum(["METRO", "KG", "UNIDADE", "ROLO"]),
  unitCost: z.number().positive("Custo unitário deve ser positivo."),
  moq: z.number().int().positive().optional(),
  leadTimeDays: z.number().int().positive("Lead time deve ser positivo."),
});

export const updateRawMaterialSchema = createRawMaterialSchema.partial();
