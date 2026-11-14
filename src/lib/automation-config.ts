import { z } from "zod";
export const executableAutomationSchema = z.object({
  conditionType: z.enum(["BIRTHDAY", "CHURN_RISK", "REPURCHASE_WINDOW", "LTV_MILESTONE", "POST_DELIVERY"]),
  conditionConfig: z.object({ days: z.number().int().min(1).max(730).default(60), amount: z.number().positive().max(10000000).default(1000) }),
  actionType: z.enum(["CREATE_TASK", "ASSIGN_POINTS", "UPGRADE_TIER"]),
  actionConfig: z.object({ title: z.string().trim().min(2).max(200).default("Acompanhar cliente"), points: z.number().int().min(1).max(10000).default(100), tier: z.enum(["BRONZE", "SILVER", "GOLD", "VIP"]).default("GOLD") }),
});
export function automationAvailability(value: unknown) {
  return executableAutomationSchema.safeParse(value).success ? "READY" : "UNSUPPORTED";
}
