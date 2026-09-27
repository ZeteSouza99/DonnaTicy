import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, hashPassword, verifyPassword, setSessionCookie, signToken } from "@/lib/auth";
import { handleApiError, NotFoundError, ValidationError } from "@/lib/errors";
import { changePasswordSchema } from "@/schemas/auth";
import { createAuditLog, getClientIp } from "@/lib/audit";
import { checkRateLimit } from "@/lib/rate-limit";

const WINDOW_MS = 15 * 60 * 1000; // 15 min
const MAX_REQUESTS = 5;

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await requireAuth(request);

    const { allowed, retryAfterMs } = await checkRateLimit(
      `change-password:${session.sub}`,
      WINDOW_MS,
      MAX_REQUESTS,
    );

    if (!allowed) {
      return NextResponse.json(
        {
          error: {
            message: "Muitas tentativas. Tente novamente mais tarde.",
            code: "RATE_LIMITED",
          },
        },
        { status: 429, headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) } },
      );
    }

    const body = await request.json();
    const { currentPassword, newPassword } = changePasswordSchema.parse(body);

    const user = await prisma.user.findFirst({
      where: { id: session.sub, deletedAt: null, isActive: true },
    });
    if (!user) throw new NotFoundError("Usuário");

    const isValid = await verifyPassword(currentPassword, user.passwordHash);
    if (!isValid) {
      return NextResponse.json(
        { error: { message: "Senha atual incorreta.", code: "INVALID_CREDENTIALS" } },
        { status: 401 },
      );
    }

    if (await verifyPassword(newPassword, user.passwordHash)) {
      throw new ValidationError("A nova senha deve ser diferente da senha atual.");
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await hashPassword(newPassword),
        failedAttempts: 0,
        lockedUntil: null,
        mustChangePassword: false,
        // Invalida todos os tokens emitidos antes da troca de senha.
        tokenVersion: { increment: 1 },
      },
    });

    await createAuditLog(
      { session, ipAddress: getClientIp(request) },
      "PASSWORD_CHANGE",
      "User",
      user.id,
      { email: user.email, role: user.role, changedAt: new Date().toISOString() },
    );

    // Reemite o token para manter a sessão válida após a troca.
    const token = await signToken({
      sub: user.id,
      email: user.email,
      role: user.role,
      locationId: user.locationId,
      tokenVersion: updated.tokenVersion,
    });

    const response = NextResponse.json({ message: "Senha alterada com sucesso." });
    setSessionCookie(response, token);
    return response;
  } catch (error) {
    return handleApiError(error, request);
  }
}
