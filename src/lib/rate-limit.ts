import { prisma } from "./db";

export interface RateLimitResult {
  allowed: boolean;
  retryAfterMs: number;
}

interface MemoryEntry {
  count: number;
  resetAt: number;
}

/** Fallback usado apenas quando o banco está indisponível. */
const memoryStore = new Map<string, MemoryEntry>();
let lastCleanup = Date.now();

function cleanupMemory(): void {
  const now = Date.now();
  if (now - lastCleanup < 60_000) return;
  lastCleanup = now;
  for (const [key, entry] of memoryStore) {
    if (now > entry.resetAt) memoryStore.delete(key);
  }
}

function checkInMemory(key: string, windowMs: number, maxRequests: number): RateLimitResult {
  cleanupMemory();
  const now = Date.now();
  const entry = memoryStore.get(key);

  if (!entry || now > entry.resetAt) {
    memoryStore.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterMs: 0 };
  }

  if (entry.count >= maxRequests) {
    return { allowed: false, retryAfterMs: entry.resetAt - now };
  }

  entry.count += 1;
  return { allowed: true, retryAfterMs: 0 };
}

/**
 * Rate limit persistido no Postgres — funciona entre instâncias serverless,
 * ao contrário de um contador em memória de processo.
 *
 * O incremento e a rotação da janela acontecem em um único statement atômico.
 */
export async function checkRateLimit(
  key: string,
  windowMs: number,
  maxRequests: number,
): Promise<RateLimitResult> {
  const resetAt = new Date(Date.now() + windowMs);

  try {
    const rows = await prisma.$queryRaw<Array<{ count: number; reset_at: Date }>>`
      INSERT INTO rate_limits (key, count, reset_at, updated_at)
      VALUES (${key}, 1, ${resetAt}, now())
      ON CONFLICT (key) DO UPDATE SET
        count = CASE WHEN rate_limits.reset_at <= now() THEN 1 ELSE rate_limits.count + 1 END,
        reset_at = CASE WHEN rate_limits.reset_at <= now() THEN ${resetAt} ELSE rate_limits.reset_at END,
        updated_at = now()
      RETURNING count, reset_at
    `;

    const row = rows[0];
    if (!row) return { allowed: true, retryAfterMs: 0 };

    if (row.count > maxRequests) {
      return { allowed: false, retryAfterMs: Math.max(0, row.reset_at.getTime() - Date.now()) };
    }
    return { allowed: true, retryAfterMs: 0 };
  } catch {
    return checkInMemory(key, windowMs, maxRequests);
  }
}

/** Remove janelas expiradas (chamado pelo endpoint de health/cron). */
export async function purgeExpiredRateLimits(): Promise<number> {
  const { count } = await prisma.rateLimit.deleteMany({ where: { resetAt: { lte: new Date() } } });
  return count;
}
