import { describe, expect, it } from "vitest";
import { durationToSeconds, parseServerEnv } from "@/lib/env";
import { resolveRequestId } from "@/lib/request-context";

const BASE = {
  DATABASE_URL: "postgresql://u:p@127.0.0.1:5432/db",
  JWT_SECRET: "a".repeat(32),
};

describe("parseServerEnv", () => {
  it("aplica os padrões", () => {
    const env = parseServerEnv(BASE);
    expect(env.JWT_EXPIRES_IN).toBe("8h");
    expect(env.PENDING_ORDER_TTL_HOURS).toBe(48);
    expect(env.CRON_SECRET).toBeUndefined();
  });

  it("trata string vazia como ausente e converte números", () => {
    const env = parseServerEnv({ ...BASE, CRON_SECRET: "", PENDING_ORDER_TTL_HOURS: "72" });
    expect(env.CRON_SECRET).toBeUndefined();
    expect(env.PENDING_ORDER_TTL_HOURS).toBe(72);
  });

  it("falha com mensagem legível para configuração inválida", () => {
    expect(() => parseServerEnv({ ...BASE, JWT_SECRET: "curto" })).toThrow(/JWT_SECRET/);
    expect(() => parseServerEnv({ JWT_SECRET: BASE.JWT_SECRET })).toThrow(/DATABASE_URL/);
    expect(() => parseServerEnv({ ...BASE, JWT_EXPIRES_IN: "8 horas" })).toThrow(/JWT_EXPIRES_IN/);
  });
});

describe("durationToSeconds", () => {
  it("entende segundos puros e sufixos", () => {
    expect(durationToSeconds("3600")).toBe(3600);
    expect(durationToSeconds("30m")).toBe(1800);
    expect(durationToSeconds("8h")).toBe(28_800);
    expect(durationToSeconds("1d")).toBe(86_400);
    expect(() => durationToSeconds("1w")).toThrow();
  });
});

describe("resolveRequestId", () => {
  it("reaproveita ids seguros e troca os demais", () => {
    expect(resolveRequestId("abc-12345")).toBe("abc-12345");
    expect(resolveRequestId("curto")).not.toBe("curto");
    expect(resolveRequestId("<script>alert(1)</script>")).toMatch(/^[0-9a-f-]{36}$/);
    expect(resolveRequestId(null)).toMatch(/^[0-9a-f-]{36}$/);
  });
});
