import { NextRequest, NextResponse } from "next/server";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAuth, setSessionCookie, signToken, verifyPassword } from "@/lib/auth";
import { ConflictError, UnauthorizedError, ValidationError, handleApiError } from "@/lib/errors";
import { mfaActionSchema } from "@/schemas/auth";
import { createAuditLog, getClientIp } from "@/lib/audit";
import { checkRateLimit } from "@/lib/rate-limit";
import { encryptMfaSecret, generateMfaSecret, otpauthUrl, verifyMfaCode } from "@/lib/mfa";
import { brand } from "@/lib/brand";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_REQUESTS = 10;

// Ativar/desativar o 2FA derruba as outras sessões; esta segue com um token novo.
async function withRenewedSession(response: NextResponse, user: User, tokenVersion: number): Promise<NextResponse> {
  const token = await signToken({
    sub: user.id,
    email: user.email,
    role: user.role,
    locationId: user.locationId,
    tokenVersion,
  });
  setSessionCookie(response, token);
  return response;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await requireAuth(request);
    const limit = await checkRateLimit(`mfa:${session.sub}`, WINDOW_MS, MAX_REQUESTS);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: { message: "Muitas tentativas. Tente novamente mais tarde.", code: "RATE_LIMITED" } },
        { status: 429, headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) } },
      );
    }

    const input = mfaActionSchema.parse(await request.json());
    const user = await prisma.user.findUniqueOrThrow({ where: { id: session.sub } });
    const audit = { session, ipAddress: getClientIp(request) };

    if (input.action === "setup") {
      if (user.mfaEnabled) throw new ConflictError("O 2FA já está ativo. Desative-o antes de gerar outro QR Code.");
      const secret = generateMfaSecret();
      await prisma.user.update({
        where: { id: user.id },
        data: { mfaSecret: encryptMfaSecret(secret), mfaLastStep: null },
      });
      return NextResponse.json({ secret, otpauthUrl: otpauthUrl(secret, user.email, brand.name) });
    }

    if (!user.mfaSecret) throw new ValidationError("Gere o QR Code antes de confirmar o código.");

    if (input.action === "enable") {
      if (user.mfaEnabled) throw new ConflictError("O 2FA já está ativo.");
      const step = verifyMfaCode(user.mfaSecret, input.code, user.mfaLastStep);
      if (step === null) throw new ValidationError("Código inválido. Confira a hora do celular e tente de novo.");
      const updated = await prisma.user.update({
        where: { id: user.id },
        data: { mfaEnabled: true, mfaLastStep: step, tokenVersion: { increment: 1 } },
      });
      await createAuditLog(audit, "MFA_ENABLE", "User", user.id);
      return withRenewedSession(NextResponse.json({ mfaEnabled: true }), user, updated.tokenVersion);
    }

    if (!user.mfaEnabled) throw new ConflictError("O 2FA não está ativo.");
    if (!(await verifyPassword(input.password, user.passwordHash))) {
      throw new UnauthorizedError("Senha incorreta.");
    }
    if (verifyMfaCode(user.mfaSecret, input.code, user.mfaLastStep) === null) {
      throw new ValidationError("Código inválido ou já utilizado.");
    }
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { mfaEnabled: false, mfaSecret: null, mfaLastStep: null, tokenVersion: { increment: 1 } },
    });
    await createAuditLog(audit, "MFA_DISABLE", "User", user.id);
    return withRenewedSession(NextResponse.json({ mfaEnabled: false }), user, updated.tokenVersion);
  } catch (error) {
    return handleApiError(error, request);
  }
}
