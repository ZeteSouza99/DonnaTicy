import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { executableAutomationSchema } from "@/lib/automation-config";
import { serverEnv } from "@/lib/env";
import { createAuditLogTx } from "@/lib/audit";

/** Rotinas internas. A execução e seu efeito são confirmados juntos; não envia mensagens externas. */
export async function runAutomations(now = new Date()) {
  const rules = await prisma.automationTrigger.findMany({ where: { isActive: true, deletedAt: null, actionType: { in: ["CREATE_TASK", "ASSIGN_POINTS", "UPGRADE_TIER"] }, conditionType: { in: ["BIRTHDAY", "CHURN_RISK", "REPURCHASE_WINDOW", "LTV_MILESTONE", "POST_DELIVERY"] } }, select: { id: true }, orderBy: { id: "asc" }, take: 100 });
  let processed = 0;
  for (const rule of rules) {
    processed += await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM automation_triggers WHERE id = ${rule.id} FOR UPDATE`;
      const trigger = await tx.automationTrigger.findUniqueOrThrow({ where: { id: rule.id } });
      const parsed = executableAutomationSchema.safeParse(trigger);
      if (!trigger.isActive || trigger.deletedAt || !parsed.success) return 0;
      const { conditionType, conditionConfig: config, actionType, actionConfig: action } = parsed.data;
      const cutoff = new Date(now.getTime() - config.days * 86400000);
      const cooldown = new Date(now.getTime() - trigger.throttleDays * 86400000);
      const zone = serverEnv().APP_TIMEZONE;
      let condition = Prisma.sql`false`;
      if (conditionType === "BIRTHDAY") condition = Prisma.sql`to_char(c.birth_date, 'MM-DD') = to_char(${now}::timestamptz AT TIME ZONE ${zone}, 'MM-DD')`;
      if (conditionType === "CHURN_RISK" || conditionType === "REPURCHASE_WINDOW") condition = Prisma.sql`c.last_purchase_at <= ${cutoff}`;
      if (conditionType === "LTV_MILESTONE") condition = Prisma.sql`c.lifetime_value >= ${config.amount}`;
      if (conditionType === "POST_DELIVERY") condition = Prisma.sql`EXISTS (SELECT 1 FROM orders o WHERE o.customer_id=c.id AND o.status::text='DELIVERED' AND o.deleted_at IS NULL AND o.delivered_at BETWEEN ${cutoff} AND ${now})`;
      const eligible = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT c.id FROM customers c WHERE c.deleted_at IS NULL AND c.is_active AND c.phone <> '00000000000' AND ${condition}
        AND NOT EXISTS (SELECT 1 FROM automation_executions e WHERE e.trigger_id=${trigger.id} AND e.customer_id=c.id AND e.sent_at >= ${cooldown})
        AND (${trigger.maxFiresPerCustomer}::int IS NULL OR (SELECT COUNT(*) FROM automation_executions e WHERE e.trigger_id=${trigger.id} AND e.customer_id=c.id) < ${trigger.maxFiresPerCustomer}::int)
        ORDER BY c.id LIMIT 50`;
      for (const { id } of eligible) {
        await tx.$queryRaw`SELECT id FROM customers WHERE id=${id} FOR UPDATE`;
        const execution = await tx.automationExecution.create({ data: { triggerId: trigger.id, customerId: id, channel: "INTERNAL", status: "COMPLETED", sentAt: now, messageContent: actionType } });
        if (actionType === "CREATE_TASK") await tx.crmTask.create({ data: { executionId: execution.id, customerId: id, title: action.title } });
        if (actionType === "ASSIGN_POINTS") {
          await tx.loyaltyTransaction.create({ data: { customerId: id, type: "BONUS", points: action.points, description: trigger.name } });
          await tx.customer.update({ where: { id }, data: { loyaltyPoints: { increment: action.points } } });
        }
        if (actionType === "UPGRADE_TIER") {
          const customer = await tx.customer.findUniqueOrThrow({ where: { id }, select: { tier: true } });
          const tiers = ["BRONZE", "SILVER", "GOLD", "VIP"];
          if (tiers.indexOf(action.tier) > tiers.indexOf(customer.tier)) await tx.customer.update({ where: { id }, data: { tier: action.tier } });
        }
        await createAuditLogTx(tx, { session: null }, "EXECUTE", "AutomationExecution", execution.id, { triggerId: trigger.id, customerId: id, actionType });
      }
      await tx.automationTrigger.update({ where: { id: trigger.id }, data: { totalFired: { increment: eligible.length } } });
      return eligible.length;
    }, { timeout: 20000, maxWait: 10000 });
  }
  return processed;
}
