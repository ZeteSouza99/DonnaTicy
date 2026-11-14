import { z } from "@/lib/zod";
export const operationalSettingsSchema = z.object({
  monthlySalesGoal: z.number().min(0).max(999999999).default(0),
  activeCustomerDays: z.number().int().min(1).max(730).default(90),
  storeCreditValidityDays: z.number().int().min(0).max(3650).default(0),
});
export type OperationalSettings = z.infer<typeof operationalSettingsSchema>;
export const DEFAULT_OPERATIONAL_SETTINGS = operationalSettingsSchema.parse({});
