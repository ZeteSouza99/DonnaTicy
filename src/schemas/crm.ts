import { z } from "@/lib/zod";

// ============================================================================
// Loyalty Transaction
// ============================================================================

export const createLoyaltyTransactionSchema = z.object({
  customerId: z.string().min(1, "Cliente é obrigatório."),
  points: z.number().int().refine((v) => v !== 0, { message: "Pontos não pode ser zero." }),
  type: z.enum(["EARN", "REDEEM", "EXPIRE", "ADJUST", "BONUS"]),
  description: z.string().optional(),
  orderId: z.string().optional(),
});

export type CreateLoyaltyTransactionInput = z.infer<typeof createLoyaltyTransactionSchema>;

// ============================================================================
// Automation Trigger
// ============================================================================

export const createAutomationTriggerSchema = z.object({
  name: z.string().min(2, "Nome deve ter no mínimo 2 caracteres."),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
  conditionType: z.enum([
    "REPURCHASE_WINDOW",
    "BIRTHDAY",
    "CART_ABANDONED",
    "POST_DELIVERY",
    "CHURN_RISK",
    "LTV_MILESTONE",
    "COLLECTION_LAUNCH",
    "CUSTOM",
  ]),
  conditionConfig: z.record(z.string(), z.json()),
  actionType: z.enum([
    "SEND_OFFER",
    "SEND_COUPON",
    "SEND_MESSAGE",
    "ASSIGN_POINTS",
    "UPGRADE_TIER",
    "CREATE_TASK",
  ]),
  actionConfig: z.record(z.string(), z.json()),
  channels: z.array(z.enum(["WHATSAPP", "EMAIL", "SMS", "PUSH"])),
  throttleDays: z.number().int().positive().optional(),
  maxFiresPerCustomer: z.number().int().positive().optional(),
});

export const updateAutomationTriggerSchema = createAutomationTriggerSchema.partial();
