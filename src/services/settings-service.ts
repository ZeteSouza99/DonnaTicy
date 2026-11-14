import { prisma } from "@/lib/db";
import { operationalSettingsSchema } from "@/lib/operational-settings";
export async function getOperationalSettings() {
  const setting = await prisma.setting.findUnique({ where: { key: "operational" } });
  return operationalSettingsSchema.parse(setting?.value ?? {});
}
