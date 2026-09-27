import { describe, expect, it } from "vitest";

import { buildRecurringTxid, generatePixPayload, sanitizeTxid } from "@/lib/pix";
import { SYSTEM_SUBSCRIPTION, getSubscriptionCycle } from "@/lib/subscription";

describe("generatePixPayload", () => {
  const base = {
    pixKey: "02607265240",
    merchantName: "ZETE TELES DE SOUZA",
    merchantCity: "SAO PAULO",
    amount: 100,
  };

  it("abre com o payload format indicator e o domínio do BACEN", () => {
    const payload = generatePixPayload(base);
    expect(payload.startsWith("000201")).toBe(true);
    expect(payload).toContain("br.gov.bcb.pix");
  });

  it("grava o valor com duas casas decimais", () => {
    expect(generatePixPayload(base)).toContain("5406100.00");
  });

  it("omite o campo de valor quando não há cobrança", () => {
    expect(generatePixPayload({ ...base, amount: 0 })).not.toContain("5406");
  });

  it("termina com um CRC16 de 4 dígitos hexadecimais", () => {
    const payload = generatePixPayload(base);
    expect(payload.slice(-8, -4)).toBe("6304");
    expect(payload.slice(-4)).toMatch(/^[0-9A-F]{4}$/);
  });

  it("remove acentos do nome e da cidade", () => {
    const payload = generatePixPayload({ ...base, merchantCity: "SÃO PAULO" });
    expect(payload).toContain("SAO PAULO");
    expect(payload).not.toContain("Ã");
  });

  it("muda o CRC quando o valor muda", () => {
    const a = generatePixPayload(base);
    const b = generatePixPayload({ ...base, amount: 50 });
    expect(a.slice(-4)).not.toBe(b.slice(-4));
  });
});

describe("sanitizeTxid", () => {
  it("descarta caracteres não alfanuméricos", () => {
    expect(sanitizeTxid("SISTEMA-2026/08")).toBe("SISTEMA202608");
  });

  it("limita a 25 caracteres", () => {
    expect(sanitizeTxid("A".repeat(40))).toHaveLength(25);
  });

  it("cai no marcador padrão quando não sobra nada", () => {
    expect(sanitizeTxid("///")).toBe("***");
  });
});

describe("buildRecurringTxid", () => {
  it("compõe categoria e competência da data informada", () => {
    expect(buildRecurringTxid("SISTEMA", new Date(2026, 7, 20))).toBe("SISTEMA202608");
  });

  it("usa o mês corrente quando a data é inválida", () => {
    const now = new Date();
    const esperado = `SISTEMA${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
    expect(buildRecurringTxid("SISTEMA", "data-invalida")).toBe(esperado);
  });
});

describe("getSubscriptionCycle", () => {
  const { dueDay, graceDays, notifyDaysBefore } = SYSTEM_SUBSCRIPTION;

  it("aponta para o vencimento do mês corrente antes da data", () => {
    const cycle = getSubscriptionCycle(new Date(2026, 7, dueDay - 1));
    expect(cycle.dueDate.getMonth()).toBe(7);
    expect(cycle.daysUntilDue).toBe(1);
    expect(cycle.isOverdue).toBe(false);
  });

  it("marca como vencida dentro do período de tolerância", () => {
    const cycle = getSubscriptionCycle(new Date(2026, 7, dueDay + 1));
    expect(cycle.isOverdue).toBe(true);
    expect(cycle.dueDate.getMonth()).toBe(7);
    expect(cycle.shouldNotify).toBe(true);
  });

  it("pula para o mês seguinte depois da tolerância", () => {
    const cycle = getSubscriptionCycle(new Date(2026, 7, dueDay + graceDays + 1));
    expect(cycle.dueDate.getMonth()).toBe(8);
    expect(cycle.isOverdue).toBe(false);
  });

  it("só notifica dentro da janela configurada", () => {
    const longe = getSubscriptionCycle(new Date(2026, 7, dueDay - notifyDaysBefore - 1));
    expect(longe.shouldNotify).toBe(false);

    const perto = getSubscriptionCycle(new Date(2026, 7, dueDay - notifyDaysBefore));
    expect(perto.shouldNotify).toBe(true);
  });

  it("identifica a cobrança pela competência do vencimento", () => {
    expect(getSubscriptionCycle(new Date(2026, 7, dueDay)).txid).toBe("SISTEMA202608");
  });
});
