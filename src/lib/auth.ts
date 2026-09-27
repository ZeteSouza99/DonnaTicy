import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { prisma } from "./db";
import { durationToSeconds, serverEnv } from "./env";
import { UnauthorizedError, ForbiddenError, PasswordChangeRequiredError } from "./errors";
import { can, type Action, type Resource } from "./permissions";

export const SESSION_COOKIE = "session";
const JWT_ALGORITHM = "HS256";
const SALT_ROUNDS = 12;

// Liberadas enquanto a senha provisória não é trocada.
const PASSWORD_CHANGE_PATHS = ["/api/auth/change-password", "/api/auth/me"];

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  locationId: string | null;
  /** Versão da credencial; invalida tokens antigos após troca de senha/desativação. */
  tokenVersion?: number;
  /** Identificador da sessão, revogado individualmente no logout. */
  jti?: string;
  /** Expiração em segundos desde a época (preenchida na verificação). */
  exp?: number;
}

function jwtKey(): Uint8Array {
  return new TextEncoder().encode(serverEnv().JWT_SECRET);
}

/** Validade da sessão (JWT e cookie), definida por JWT_EXPIRES_IN. */
export function sessionTtlSeconds(): number {
  return durationToSeconds(serverEnv().JWT_EXPIRES_IN);
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

let dummyHash: Promise<string> | undefined;

/** Gasta o mesmo tempo de um bcrypt real quando o usuário não existe (evita enumerar e-mails). */
export async function burnPasswordCheck(password: string): Promise<void> {
  dummyHash ??= bcrypt.hash("usuario-inexistente", SALT_ROUNDS);
  await bcrypt.compare(password, await dummyHash);
}

export async function signToken(payload: Omit<JwtPayload, "jti" | "exp">): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    email: payload.email,
    role: payload.role,
    locationId: payload.locationId,
    tokenVersion: payload.tokenVersion ?? 0,
  })
    .setProtectedHeader({ alg: JWT_ALGORITHM })
    .setSubject(payload.sub)
    .setJti(crypto.randomUUID())
    .setIssuedAt(now)
    .setExpirationTime(now + sessionTtlSeconds())
    .sign(jwtKey());
}

export async function verifyToken(token: string): Promise<JwtPayload> {
  const { payload } = await jwtVerify(token, jwtKey(), { algorithms: [JWT_ALGORITHM] });
  if (typeof payload.sub !== "string" || typeof payload.email !== "string" || typeof payload.role !== "string") {
    throw new UnauthorizedError("Sessão inválida.");
  }
  return {
    sub: payload.sub,
    email: payload.email,
    role: payload.role as UserRole,
    locationId: typeof payload.locationId === "string" ? payload.locationId : null,
    tokenVersion: typeof payload.tokenVersion === "number" ? payload.tokenVersion : undefined,
    jti: payload.jti,
    exp: payload.exp,
  };
}

export function setSessionCookie(response: NextResponse, token: string): void {
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: sessionTtlSeconds(),
    path: "/",
  });
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
}

/** Revoga só esta sessão (as demais do usuário continuam válidas). */
export async function revokeToken(token: string): Promise<void> {
  const session = await verifyToken(token).catch(() => null);
  if (!session?.jti || !session.exp) return;
  await prisma.revokedToken.upsert({
    where: { jti: session.jti },
    create: { jti: session.jti, expiresAt: new Date(session.exp * 1000) },
    update: {},
  });
}

async function verifyOrNull(token: string | undefined): Promise<JwtPayload | null> {
  if (!token) return null;
  try {
    return await verifyToken(token);
  } catch {
    return null;
  }
}

export async function getSessionFromCookie(): Promise<JwtPayload | null> {
  const cookieStore = await cookies();
  return verifyOrNull(cookieStore.get(SESSION_COOKIE)?.value);
}

export async function getSessionFromRequest(request: NextRequest): Promise<JwtPayload | null> {
  const bearer = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  return verifyOrNull(request.cookies.get(SESSION_COOKIE)?.value ?? bearer);
}

/**
 * Rejeita tokens emitidos antes de troca de senha, desativação/exclusão do
 * usuário ou encerrados no logout, sem depender da expiração do JWT.
 */
export async function loadSessionUser(session: JwtPayload) {
  const [user, revoked] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.sub },
      select: {
        name: true,
        isActive: true,
        deletedAt: true,
        tokenVersion: true,
        mustChangePassword: true,
        mfaEnabled: true,
      },
    }),
    session.jti ? prisma.revokedToken.findUnique({ where: { jti: session.jti }, select: { jti: true } }) : null,
  ]);

  if (!user || !user.isActive || user.deletedAt !== null) {
    throw new UnauthorizedError("Sessão inválida. Faça login novamente.");
  }
  if ((session.tokenVersion ?? 0) !== user.tokenVersion || revoked) {
    throw new UnauthorizedError("Sessão expirada. Faça login novamente.");
  }
  return user;
}

export async function requireAuth(request: NextRequest): Promise<JwtPayload> {
  const session = await getSessionFromRequest(request);
  if (!session) throw new UnauthorizedError();
  const user = await loadSessionUser(session);
  if (user.mustChangePassword && !PASSWORD_CHANGE_PATHS.includes(request.nextUrl.pathname)) {
    throw new PasswordChangeRequiredError();
  }
  return session;
}

/**
 * Autorização baseada na matriz central de `lib/permissions.ts`.
 * Toda rota de API usa este helper (inclusive leitura), não só o proxy.
 */
export async function requirePermission(
  request: NextRequest,
  resource: Resource,
  action: Action,
): Promise<JwtPayload> {
  const session = await requireAuth(request);
  if (!can(session.role, resource, action)) {
    throw new ForbiddenError("Você não tem permissão para esta ação.");
  }
  return session;
}
