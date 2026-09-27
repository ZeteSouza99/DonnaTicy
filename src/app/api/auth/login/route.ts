import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { burnPasswordCheck, setSessionCookie, signToken, verifyPassword } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";
import { loginSchema } from "@/schemas/auth";
import { createAuditLog, getClientIp } from "@/lib/audit";
import { checkRateLimit } from "@/lib/rate-limit";
import { verifyMfaCode } from "@/lib/mfa";

const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 min
const LOGIN_MAX_REQUESTS = 10;
// Barreira contra tentativas distribuídas em muitos IPs contra a mesma conta.
const LOGIN_MAX_PER_EMAIL = 20;
const LOCK_THRESHOLD = 5;
const BASE_LOCK_MS = 15 * 60 * 1000;
const MAX_LOCK_MS = 24 * 60 * 60 * 1000;

function rateLimited(retryAfterMs: number): NextResponse {
  return NextResponse.json(
    { error: { message: "Muitas tentativas. Tente novamente mais tarde.", code: "RATE_LIMITED" } },
    { status: 429, headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) } },
  );
}

function denied(message: string, code: string, status = 401): NextResponse {
  return NextResponse.json({ error: { message, code } }, { status });
}

/** Incremento atômico; a cada 5 falhas o bloqueio dobra (15 min, 30 min, 1 h... até 24 h). */
async function registerFailedLogin(userId: string): Promise<void> {
  const { failedAttempts } = await prisma.user.update({
    where: { id: userId },
    data: { failedAttempts: { increment: 1 } },
    select: { failedAttempts: true },
  });
  if (failedAttempts % LOCK_THRESHOLD !== 0) return;
  const duration = Math.min(BASE_LOCK_MS * 2 ** (failedAttempts / LOCK_THRESHOLD - 1), MAX_LOCK_MS);
  await prisma.user.update({ where: { id: userId }, data: { lockedUntil: new Date(Date.now() + duration) } });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const ip = getClientIp(request) ?? "unknown";
    const byIp = await checkRateLimit(`login:${ip}`, LOGIN_WINDOW_MS, LOGIN_MAX_REQUESTS);
    if (!byIp.allowed) return rateLimited(byIp.retryAfterMs);

    const body = await request.json();
    const { email, password, code } = loginSchema.parse(body);

    const byEmail = await checkRateLimit(`login-email:${email}`, LOGIN_WINDOW_MS, LOGIN_MAX_PER_EMAIL);
    if (!byEmail.allowed) return rateLimited(byEmail.retryAfterMs);

    const user = await prisma.user.findUnique({
      where: { email, deletedAt: null },
    });

    if (!user || !user.isActive) {
      await burnPasswordCheck(password);
      return denied("Credenciais inválidas.", "INVALID_CREDENTIALS");
    }

    // Sem checar a senha durante o bloqueio: senão ele não impediria a adivinhação.
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      return denied("Conta temporariamente bloqueada. Tente novamente mais tarde.", "ACCOUNT_LOCKED", 423);
    }

    if (!(await verifyPassword(password, user.passwordHash))) {
      await registerFailedLogin(user.id);
      return denied("Credenciais inválidas.", "INVALID_CREDENTIALS");
    }

    let mfaStep: number | null = null;
    if (user.mfaEnabled && user.mfaSecret) {
      if (!code) {
        return denied("Informe o código do aplicativo autenticador.", "MFA_REQUIRED");
      }
      mfaStep = verifyMfaCode(user.mfaSecret, code, user.mfaLastStep);
      if (mfaStep === null) {
        await registerFailedLogin(user.id);
        return denied("Código de verificação inválido ou já utilizado.", "INVALID_MFA_CODE");
      }
    }

    // Guarda do passo TOTP: duas requisições com o mesmo código não entram ambas.
    const accepted = await prisma.user.updateMany({
      where: {
        id: user.id,
        ...(mfaStep !== null && { OR: [{ mfaLastStep: null }, { mfaLastStep: { lt: mfaStep } }] }),
      },
      data: {
        failedAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
        ...(mfaStep !== null && { mfaLastStep: mfaStep }),
      },
    });
    if (accepted.count === 0) {
      return denied("Código de verificação inválido ou já utilizado.", "INVALID_MFA_CODE");
    }

    const token = await signToken({
      sub: user.id,
      email: user.email,
      role: user.role,
      locationId: user.locationId,
      tokenVersion: user.tokenVersion,
    });

    await createAuditLog(
      { session: { sub: user.id }, ipAddress: getClientIp(request) },
      "LOGIN",
      "User",
      user.id,
      { mfa: mfaStep !== null },
    );

    const response = NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        locationId: user.locationId,
      },
      mustChangePassword: user.mustChangePassword,
    });

    setSessionCookie(response, token);
    return response;
  } catch (error) {
    return handleApiError(error, request);
  }
}
