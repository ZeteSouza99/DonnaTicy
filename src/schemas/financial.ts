import { z } from "@/lib/zod";

// ============================================================================
// Financial Entry
// ============================================================================

export const EXPENSE_CATEGORIES = [
  "Custo de Mercadoria",
  "Despesas Operacionais",
  "Despesas Administrativas",
  "Despesas Variáveis",
] as const;

const financialDateSchema = z.union([z.iso.date(), z.iso.datetime({ offset: true })]);

const financialEntryBaseSchema = z.object({
  type: z.enum(["REVENUE", "COGS", "TAX", "FEE", "EXPENSE", "REFUND"]),
  category: z.string().min(1, "Categoria é obrigatória."),
  description: z.string().min(1, "Descrição é obrigatória."),
  orderId: z.string().min(1).optional(),
  locationId: z.string().optional(),
  amount: z.number().positive("Valor deve ser maior que zero."),
  dueDate: financialDateSchema,
  competenceDate: financialDateSchema.optional(),
  cashDate: financialDateSchema.optional(),
  status: z.enum(["PENDING", "PAID"]).default("PENDING"),
  paymentMethod: z
    .enum(["CASH", "DEBIT", "CREDIT", "PIX", "VOUCHER", "BARTER", "INVOICED"])
    .nullable()
    .optional(),
  documentType: z.enum(["INVOICE", "RECEIPT", "PROOF"]).optional(),
  documentNumber: z.string().optional(),
  costCenterId: z.string().min(1).nullable().optional(),
});

export const PAYMENT_METHODS = [
  "CASH",
  "DEBIT",
  "CREDIT",
  "PIX",
  "VOUCHER",
  "BARTER",
  "INVOICED",
] as const;

export const bulkDeleteFinancialEntriesSchema = z.object({
  ids: z.array(z.string().min(1)).min(1, "Selecione ao menos um lançamento."),
});

export const createFinancialEntrySchema = financialEntryBaseSchema.superRefine((data, ctx) => {
  if (data.type === "EXPENSE" && !EXPENSE_CATEGORIES.includes(data.category as (typeof EXPENSE_CATEGORIES)[number])) {
    ctx.addIssue({ code: "custom", path: ["category"], message: "Categoria de despesa inválida." });
  }
  if (data.status === "PAID") {
    if (!data.cashDate) {
      ctx.addIssue({ code: "custom", path: ["cashDate"], message: "Data de pagamento é obrigatória quando o status é Pago." });
    }
    if (!data.paymentMethod) {
      ctx.addIssue({ code: "custom", path: ["paymentMethod"], message: "Forma de pagamento é obrigatória quando o status é Pago." });
    }
  }
});

export const updateFinancialEntrySchema = financialEntryBaseSchema.partial().extend({
  // Omitir status em um PUT não pode aplicar o default PENDING da criação.
  status: z.enum(["PENDING", "PAID"]).optional(),
  orderId: z.string().min(1).nullable().optional(),
  cancellationOrderId: z.string().min(1).nullable().optional(),
  locationId: financialEntryBaseSchema.shape.locationId.nullable(),
  documentType: financialEntryBaseSchema.shape.documentType.nullable(),
  documentNumber: financialEntryBaseSchema.shape.documentNumber.nullable(),
  dueDate: financialDateSchema.nullable().optional(),
  cashDate: financialDateSchema.nullable().optional(),
});

// ============================================================================
// Cost Center
// ============================================================================

export const createCostCenterSchema = z.object({
  code: z.string().min(2).regex(/^[A-Z0-9-]+$/, "Código deve conter apenas letras maiúsculas, números e hífens."),
  name: z.string().min(2, "Nome deve ter no mínimo 2 caracteres."),
  type: z.enum(["STORE", "ECOMMERCE", "WAREHOUSE", "CORPORATE"]),
  locationId: z.string().optional(),
});

export const updateCostCenterSchema = createCostCenterSchema.partial();
