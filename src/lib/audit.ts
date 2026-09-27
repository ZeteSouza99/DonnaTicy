import { prisma } from "./db";
import { JwtPayload } from "./auth";
import { Prisma } from "@prisma/client";

interface AuditContext {
  /** `null` em ações automáticas do sistema (cron), gravadas sem usuário. */
  session: Pick<JwtPayload, "sub"> | null;
  ipAddress?: string;
}

const SENSITIVE_FIELDS = new Set([
  "cpf",
  "email",
  "phone",
  "password",
  "passwordHash",
  "currentPassword",
  "newPassword",
  "mfaSecret",
  "birthDate",
]);

const MAX_DEPTH = 8;

function maskValue(value: unknown): unknown {
  return value === null || value === undefined || value === "" ? value : "***";
}

function sanitizeValue(value: unknown, depth: number): unknown {
  if (depth > MAX_DEPTH) return "[truncado]";
  if (Array.isArray(value)) return value.map((item) => sanitizeValue(item, depth + 1));
  if (value === null || typeof value !== "object") return value;
  // Date, Decimal etc. já sabem se serializar.
  if (typeof (value as { toJSON?: unknown }).toJSON === "function") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, inner]) => [
      key,
      SENSITIVE_FIELDS.has(key) ? maskValue(inner) : sanitizeValue(inner, depth + 1),
    ]),
  );
}

/** Mascara dados pessoais e segredos em qualquer nível do payload (objetos e listas aninhados). */
export function sanitizePayload(payload: Record<string, unknown>): Record<string, unknown> {
  return sanitizeValue(payload, 0) as Record<string, unknown>;
}

export async function createAuditLog(
  ctx: AuditContext,
  action: string,
  entity: string,
  entityId: string,
  payload?: Record<string, unknown>,
): Promise<void> {
  const safePayload = payload ? sanitizePayload(payload) : undefined;
  try {
    await prisma.auditLog.create({
      data: {
        userId: ctx.session?.sub ?? null,
        action,
        entity,
        entityId,
        payload: safePayload !== undefined ? (safePayload as Prisma.InputJsonValue) : undefined,
        ipAddress: ctx.ipAddress,
      },
    });
  } catch (error) {
    console.error("Falha ao gravar audit log (best-effort):", error);
  }
}

/**
 * Grava o audit log dentro de uma transação já aberta.
 * Diferente de `createAuditLog`, a falha NÃO é silenciada: o erro propaga e
 * desfaz a operação, garantindo que nenhuma escrita sensível fique sem trilha.
 */
export async function createAuditLogTx(
  tx: Prisma.TransactionClient,
  ctx: AuditContext,
  action: string,
  entity: string,
  entityId: string,
  payload?: Record<string, unknown>,
): Promise<void> {
  const safePayload = payload ? sanitizePayload(payload) : undefined;
  await tx.auditLog.create({
    data: {
      userId: ctx.session?.sub ?? null,
      action,
      entity,
      entityId,
      payload: safePayload !== undefined ? (safePayload as Prisma.InputJsonValue) : undefined,
      ipAddress: ctx.ipAddress,
    },
  });
}

export function getClientIp(request: Request): string | undefined {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    undefined
  );
}
