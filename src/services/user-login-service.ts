import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { z } from "@/lib/zod";
import { usernameSchema } from "@/schemas/auth";
import { createAuditLogTx } from "@/lib/audit";

// Manutenção local por operador com acesso ao banco. Não expor como rota pública.
const inputSchema = z.object({
  userId: z.string().min(1),
  username: usernameSchema,
  password: z.string().min(6).max(72),
});

export async function setUserLogin(raw: unknown): Promise<{ username: string }> {
  const input = inputSchema.parse(raw);
  if (Buffer.byteLength(input.password, "utf8") > 72) throw new Error("Senha excede 72 bytes.");
  const passwordHash = await bcrypt.hash(input.password, 12);
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({
      where: { id: input.userId, deletedAt: null, isActive: true },
    });
    await tx.user.update({
      where: { id: user.id },
      data: {
        username: input.username,
        passwordHash,
        mustChangePassword: false,
        failedAttempts: 0,
        lockedUntil: null,
        tokenVersion: { increment: 1 },
      },
    });
    await createAuditLogTx(tx, { session: null }, "UPDATE_LOGIN", "User", user.id, {
      source: "local-maintenance", username: input.username, passwordChanged: true,
    });
    return { username: input.username };
  });
}
