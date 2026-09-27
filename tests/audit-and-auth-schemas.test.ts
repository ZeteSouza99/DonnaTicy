import { beforeAll, describe, expect, it } from "vitest";
import { createUserSchema, loginSchema, mfaActionSchema, strongPasswordSchema } from "@/schemas/auth";

let sanitizePayload: (payload: Record<string, unknown>) => Record<string, unknown>;

beforeAll(async () => {
  // audit.ts importa o Prisma; o cliente só conecta na primeira query.
  process.env.DATABASE_URL ??= "postgresql://unit:unit@127.0.0.1:1/unit";
  ({ sanitizePayload } = await import("@/lib/audit"));
});

describe("sanitizePayload", () => {
  it("mascara dados pessoais em qualquer nível", () => {
    const result = sanitizePayload({
      code: "PED-2609-ABC123",
      customer: { fullName: "Ana", cpf: "12345678901", addresses: [{ city: "Curitiba", phone: "41999999999" }] },
      email: "ana@loja.com",
      birthDate: new Date("1990-01-01"),
      password: "",
    });
    expect(result).toEqual({
      code: "PED-2609-ABC123",
      customer: { fullName: "Ana", cpf: "***", addresses: [{ city: "Curitiba", phone: "***" }] },
      email: "***",
      birthDate: "***",
      password: "",
    });
  });

  it("preserva datas e valores que se serializam sozinhos", () => {
    const placedAt = new Date("2026-09-26T12:00:00Z");
    expect(sanitizePayload({ placedAt, total: 10, tags: ["a"] })).toEqual({ placedAt, total: 10, tags: ["a"] });
  });
});

describe("schemas de autenticação", () => {
  it("normaliza o e-mail de login e de cadastro", () => {
    expect(loginSchema.parse({ email: "  Dav@DonnaTicy.com ", password: "123456" }).email).toBe("dav@donnaticy.com");
    const user = createUserSchema.parse({ email: "ANA@Loja.com", password: "Senha-Forte1", name: "Ana", role: "SELLER" });
    expect(user.email).toBe("ana@loja.com");
  });

  it("exige senha forte", () => {
    expect(strongPasswordSchema.safeParse("admin123").success).toBe(false);
    expect(strongPasswordSchema.safeParse("Admin1234").success).toBe(true);
  });

  it("aceita só código TOTP de 6 dígitos", () => {
    expect(loginSchema.safeParse({ email: "a@b.com", password: "123456", code: "12345" }).success).toBe(false);
    expect(mfaActionSchema.safeParse({ action: "enable", code: " 123456 " }).success).toBe(true);
    expect(mfaActionSchema.safeParse({ action: "disable", code: "123456" }).success).toBe(false);
  });
});
