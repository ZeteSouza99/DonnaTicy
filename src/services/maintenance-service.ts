import { prisma } from "@/lib/db";
import { serverEnv } from "@/lib/env";
import { purgeExpiredRateLimits } from "@/lib/rate-limit";
import { updateOrderStatus } from "./order-status-service";

const EXPIRE_BATCH = 200;

function logFailure(task: string, error: unknown): void {
  console.error(JSON.stringify({
    scope: "maintenance",
    level: "error",
    task,
    message: error instanceof Error ? error.message : String(error),
    timestamp: new Date().toISOString(),
  }));
}

/** Cancela pedidos remotos sem pagamento confirmado no prazo, liberando a reserva de estoque. */
export async function expirePendingOrders(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - serverEnv().PENDING_ORDER_TTL_HOURS * 3_600_000);
  const stale = await prisma.order.findMany({
    where: { status: "PENDING_PAYMENT", channel: { not: "STORE" }, placedAt: { lt: cutoff }, deletedAt: null },
    select: { id: true },
    orderBy: { placedAt: "asc" },
    take: EXPIRE_BATCH,
  });

  let expired = 0;
  for (const { id } of stale) {
    try {
      await prisma.$transaction((tx) =>
        updateOrderStatus(tx, {
          id,
          input: { status: "CANCELLED", cancelReason: "Pagamento não confirmado no prazo" },
          session: null,
        }),
      );
      expired++;
    } catch (error) {
      // Um pedido que exige conciliação manual não impede expirar os demais.
      logFailure(`expire-order:${id}`, error);
    }
  }
  return expired;
}

export async function expireStoreCredits(now = new Date()): Promise<number> {
  const result = await prisma.storeCredit.updateMany({
    where: { status: { in: ["ACTIVE", "PARTIALLY_USED"] }, expiresAt: { lt: now } },
    data: { status: "EXPIRED" },
  });
  return result.count;
}

export async function purgeRevokedTokens(now = new Date()): Promise<number> {
  const result = await prisma.revokedToken.deleteMany({ where: { expiresAt: { lt: now } } });
  return result.count;
}

async function attempt(task: string, run: () => Promise<number>): Promise<number | null> {
  try {
    return await run();
  } catch (error) {
    logFailure(task, error);
    return null;
  }
}

/** Rotinas diárias do cron (/api/health); cada uma falha isoladamente. */
export async function runMaintenance() {
  return {
    purgedRateLimits: await attempt("rate-limits", purgeExpiredRateLimits),
    purgedRevokedTokens: await attempt("revoked-tokens", () => purgeRevokedTokens()),
    expiredStoreCredits: await attempt("store-credits", () => expireStoreCredits()),
    expiredOrders: await attempt("pending-orders", () => expirePendingOrders()),
  };
}
