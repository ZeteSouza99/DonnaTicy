import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ConflictError, ValidationError } from "@/lib/errors";

export async function runIdempotent<T>(actorId: string, scope: string, key: string | null, input: unknown, execute: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  if (key && !/^[a-zA-Z0-9_-]{16,100}$/.test(key)) throw new ValidationError("Identificador da operação inválido.");
  const hash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  return prisma.$transaction(async (tx) => {
    if (!key) return execute(tx); // Compatibilidade com integrações anteriores.
    const operationKey = `${actorId}:${scope}:${key}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${operationKey}, 0))`;
    const existing = await tx.operationRequest.findUnique({ where: { key: operationKey } });
    if (existing) {
      if (existing.inputHash !== hash) throw new ConflictError("Esta operação já foi enviada com outros dados. Inicie uma nova operação.");
      return existing.response as T;
    }
    const result = await execute(tx);
    await tx.operationRequest.create({ data: { key: operationKey, actorId, scope, inputHash: hash, response: JSON.parse(JSON.stringify(result)) as Prisma.InputJsonValue } });
    return result;
  }, { timeout: 20_000, maxWait: 10_000 });
}
