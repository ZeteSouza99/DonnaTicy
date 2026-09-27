import { z } from "@/lib/zod";

// ============================================================================
// Collection
// ============================================================================

export const createCollectionSchema = z.object({
  name: z.string().min(2, "Nome deve ter no mínimo 2 caracteres."),
  code: z.string().min(2).max(20).regex(/^[A-Z0-9-]+$/, "Código deve conter apenas letras maiúsculas, números e hífens."),
  season: z.string().min(1, "Estação é obrigatória."),
  year: z.number().int().min(2020).max(2099),
});

export const updateCollectionSchema = createCollectionSchema.partial();

// ============================================================================
// Line
// ============================================================================

export const createLineSchema = z.object({
  name: z.string().min(2, "Nome deve ter no mínimo 2 caracteres."),
  code: z.string().min(2).max(20).regex(/^[A-Z0-9-]+$/, "Código deve conter apenas letras maiúsculas, números e hífens."),
});

export const updateLineSchema = createLineSchema.partial();

// ============================================================================
// Category
// ============================================================================

export const createCategorySchema = z.object({
  name: z.string().min(2, "Nome deve ter no mínimo 2 caracteres."),
  code: z.string().min(2).max(20).regex(/^[A-Z0-9-]+$/, "Código deve conter apenas letras maiúsculas, números e hífens."),
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/, "Slug deve conter apenas letras minúsculas, números e hífens."),
});

export const updateCategorySchema = createCategorySchema.partial();

// ============================================================================
// Color
// ============================================================================

export const createColorSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório."),
  code: z.string().min(1).max(10),
  hexValue: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Cor hexadecimal inválida."),
});

export const updateColorSchema = createColorSchema.partial();

// ============================================================================
// Size
// ============================================================================

export const createSizeSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório."),
  code: z.string().min(1).max(10),
  sortOrder: z.number().int().min(0),
  isPeakSize: z.boolean().optional(),
});

export const updateSizeSchema = createSizeSchema.partial();

// ============================================================================
// Product
// ============================================================================

export const createProductSchema = z.object({
  code: z.string().min(2, "Código é obrigatório."),
  name: z.string().min(2, "Nome deve ter no mínimo 2 caracteres."),
  description: z.string().optional(),
  collectionId: z.string().min(1, "Coleção é obrigatória."),
  lineId: z.string().min(1, "Linha é obrigatória."),
  categoryId: z.string().min(1, "Categoria é obrigatória."),
  composition: z.string().optional(),
  weight: z.number().positive().optional(),
  fabricType: z.enum(["POLIAMIDA_6", "POLIAMIDA_66", "POLIESTER", "ALGODAO", "BLEND"]).optional(),
  technology: z.array(z.string()).optional(),
  costPrice: z.number().positive("Preço de custo deve ser positivo."),
  basePrice: z.number().positive("Preço base deve ser positivo."),
  markup: z.number().positive("Markup deve ser positivo."),
  abcClass: z.enum(["A", "B", "C"]).optional(),
  seasonality: z.enum(["BASIC", "SEASONAL", "FASHION_BET"]).optional(),
});

export const updateProductSchema = createProductSchema.partial();

export const bulkDeleteProductsSchema = z.object({
  ids: z
    .array(z.string().min(1))
    .min(1, "Selecione ao menos um produto.")
    .max(100, "Máximo de 100 produtos por operação."),
});

// ============================================================================
// ProductVariant
// ============================================================================

export const createVariantSchema = z.object({
  productId: z.string().min(1, "Produto é obrigatório."),
  sku: z.string().min(2, "SKU é obrigatório."),
  barcode: z.string().optional(),
  rfidTag: z.string().optional(),
  colorId: z.string().min(1, "Cor é obrigatória."),
  sizeId: z.string().min(1, "Tamanho é obrigatório."),
  additionalCost: z.number().min(0).optional(),
});

export const updateVariantSchema = createVariantSchema.omit({ productId: true }).partial();
