import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { base32Decode, totpAt, totpStep } from "@/lib/mfa";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { GET as me } from "@/app/api/auth/me/route";
import { POST as changePassword } from "@/app/api/auth/change-password/route";
import { POST as mfa } from "@/app/api/auth/mfa/route";
import { GET as listOrders } from "@/app/api/orders/route";
import { purgeRevokedTokens } from "@/services/maintenance-service";
import { request, resetDatabase } from "./fixtures";

const PASSWORD = "Senha-Forte-123";
const EMAIL = "ana@example.test";
let ipCounter = 0;

beforeEach(async () => {
  await resetDatabase();
});
afterAll(() => prisma.$disconnect());

async function createUser(data: Partial<Pick<User, "mustChangePassword">> = {}): Promise<User> {
  return prisma.user.create({
    data: { email: EMAIL, name: "Ana", role: "SUPER_ADMIN", passwordHash: await hashPassword(PASSWORD), ...data },
  });
}

// IP diferente por tentativa: o limite por IP é testado à parte do bloqueio da conta.
function attempt(body: Record<string, unknown>): Promise<Response> {
  ipCounter += 1;
  return login(new NextRequest("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": `203.0.113.${ipCounter % 250}` },
    body: JSON.stringify(body),
  }));
}

function tokenFrom(response: Response): string {
  const token = /session=([^;]+)/.exec(response.headers.get("set-cookie") ?? "")?.[1];
  if (!token) throw new Error("Resposta sem cookie de sessão.");
  return token;
}

async function errorCode(response: Response): Promise<string | undefined> {
  return (await response.json())?.error?.code;
}

function currentCode(secret: string): string {
  return totpAt(base32Decode(secret), totpStep());
}

describe("login", () => {
  it("ignora maiúsculas e espaços no e-mail e usa a validade de JWT_EXPIRES_IN no cookie", async () => {
    await createUser();
    const response = await attempt({ email: "  ANA@Example.TEST ", password: PASSWORD });
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toMatch(/Max-Age=28800/);
    expect((await me(request("GET", "/api/auth/me", tokenFrom(response)))).status).toBe(200);
  });

  it("responde igual para e-mail inexistente e senha errada", async () => {
    await createUser();
    const unknown = await attempt({ email: "ninguem@example.test", password: PASSWORD });
    const wrong = await attempt({ email: EMAIL, password: "Senha-Errada-1" });
    expect([unknown.status, wrong.status]).toEqual([401, 401]);
    expect([await errorCode(unknown), await errorCode(wrong)]).toEqual(["INVALID_CREDENTIALS", "INVALID_CREDENTIALS"]);
  });

  it("bloqueia após 5 falhas, dobra o bloqueio na reincidência e não testa senha bloqueado", async () => {
    const user = await createUser();
    for (let i = 0; i < 5; i++) {
      expect((await attempt({ email: EMAIL, password: "Senha-Errada-1" })).status).toBe(401);
    }
    const locked = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(locked.lockedUntil!.getTime() - Date.now()).toBeGreaterThan(14 * 60_000);
    expect((await attempt({ email: EMAIL, password: PASSWORD })).status).toBe(423);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).failedAttempts).toBe(5);

    await prisma.user.update({ where: { id: user.id }, data: { lockedUntil: new Date(Date.now() - 1000) } });
    for (let i = 0; i < 5; i++) await attempt({ email: EMAIL, password: "Senha-Errada-1" });
    const relocked = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(relocked.lockedUntil!.getTime() - Date.now()).toBeGreaterThan(29 * 60_000);
  });

  it("limita tentativas do mesmo IP", async () => {
    await createUser();
    const fromSameIp = () => login(new NextRequest("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": "198.51.100.7" },
      body: JSON.stringify({ email: "ninguem@example.test", password: PASSWORD }),
    }));
    for (let i = 0; i < 10; i++) expect((await fromSameIp()).status).toBe(401);
    expect((await fromSameIp()).status).toBe(429);
  });
});

describe("sessão", () => {
  it("logout revoga só aquela sessão e o cron limpa as revogações vencidas", async () => {
    await createUser();
    const first = tokenFrom(await attempt({ email: EMAIL, password: PASSWORD }));
    const second = tokenFrom(await attempt({ email: EMAIL, password: PASSWORD }));

    const response = await logout(request("POST", "/api/auth/logout", first));
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toMatch(/Max-Age=0/);
    expect((await me(request("GET", "/api/auth/me", first))).status).toBe(401);
    expect((await me(request("GET", "/api/auth/me", second))).status).toBe(200);

    await prisma.revokedToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await purgeRevokedTokens()).toBe(1);
  });

  it("senha provisória só libera a troca de senha", async () => {
    await createUser({ mustChangePassword: true });
    const response = await attempt({ email: EMAIL, password: PASSWORD });
    expect((await response.json()).mustChangePassword).toBe(true);
    const token = tokenFrom(response);

    const blocked = await listOrders(request("GET", "/api/orders", token));
    expect(blocked.status).toBe(403);
    expect(await errorCode(blocked)).toBe("PASSWORD_CHANGE_REQUIRED");
    expect((await (await me(request("GET", "/api/auth/me", token))).json()).mustChangePassword).toBe(true);

    const changed = await changePassword(request("POST", "/api/auth/change-password", token, {
      currentPassword: PASSWORD, newPassword: "Nova-Senha-456",
    }));
    expect(changed.status).toBe(200);
    expect((await listOrders(request("GET", "/api/orders", tokenFrom(changed)))).status).toBe(200);
    expect((await listOrders(request("GET", "/api/orders", token))).status).toBe(401);
  });
});

describe("2FA (TOTP)", () => {
  it("ativa, exige o código no login, recusa código reutilizado e desativa", async () => {
    const user = await createUser();
    let token = tokenFrom(await attempt({ email: EMAIL, password: PASSWORD }));

    const setup = await mfa(request("POST", "/api/auth/mfa", token, { action: "setup" }));
    expect(setup.status).toBe(200);
    const { secret, otpauthUrl } = await setup.json();
    expect(otpauthUrl).toContain(`secret=${secret}`);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).mfaSecret).not.toContain(secret);

    const enableCode = currentCode(secret);
    const enabled = await mfa(request("POST", "/api/auth/mfa", token, { action: "enable", code: enableCode }));
    expect(enabled.status).toBe(200);
    // Ativar derruba as outras sessões; a atual recebe um token novo.
    expect((await me(request("GET", "/api/auth/me", token))).status).toBe(401);
    token = tokenFrom(enabled);
    expect((await (await me(request("GET", "/api/auth/me", token))).json()).mfaEnabled).toBe(true);

    const withoutCode = await attempt({ email: EMAIL, password: PASSWORD });
    expect([withoutCode.status, await errorCode(withoutCode)]).toEqual([401, "MFA_REQUIRED"]);
    const reused = await attempt({ email: EMAIL, password: PASSWORD, code: enableCode });
    expect([reused.status, await errorCode(reused)]).toEqual([401, "INVALID_MFA_CODE"]);

    // Simula a passagem do tempo: o próximo código do aplicativo seria de um passo posterior.
    await prisma.user.update({ where: { id: user.id }, data: { mfaLastStep: totpStep() - 2 } });
    const accepted = await attempt({ email: EMAIL, password: PASSWORD, code: currentCode(secret) });
    expect(accepted.status).toBe(200);
    token = tokenFrom(accepted);

    await prisma.user.update({ where: { id: user.id }, data: { mfaLastStep: totpStep() - 2 } });
    const wrongPassword = await mfa(request("POST", "/api/auth/mfa", token, { action: "disable", password: "Outra-Senha-1", code: currentCode(secret) }));
    expect(wrongPassword.status).toBe(401);
    const disabled = await mfa(request("POST", "/api/auth/mfa", token, { action: "disable", password: PASSWORD, code: currentCode(secret) }));
    expect(disabled.status).toBe(200);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).toMatchObject({ mfaEnabled: false, mfaSecret: null });
    expect((await attempt({ email: EMAIL, password: PASSWORD })).status).toBe(200);
  });
});
