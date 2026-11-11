import { describe, expect, it } from "vitest";
import { startOfMonthInZone } from "@/lib/date";

describe("startOfMonthInZone", () => {
  it("usa o mês do fuso informado quando em UTC o mês já virou", () => {
    // 01/12 02:30 UTC ainda é 30/11 22:30 em Manaus (UTC-4).
    expect(startOfMonthInZone(new Date("2026-12-01T02:30:00Z"), "America/Manaus").toISOString()).toBe("2026-11-01T04:00:00.000Z");
    expect(startOfMonthInZone(new Date("2026-12-01T04:00:00Z"), "America/Manaus").toISOString()).toBe("2026-12-01T04:00:00.000Z");
  });

  it("usa o mês do fuso informado quando ele está à frente do UTC", () => {
    // 30/11 16:00 UTC já é 01/12 01:00 em Tóquio (UTC+9).
    expect(startOfMonthInZone(new Date("2026-11-30T16:00:00Z"), "Asia/Tokyo").toISOString()).toBe("2026-11-30T15:00:00.000Z");
  });

  it("desloca meses inteiros, inclusive na virada do ano", () => {
    expect(startOfMonthInZone(new Date("2026-01-15T12:00:00Z"), "America/Manaus", -1).toISOString()).toBe("2025-12-01T04:00:00.000Z");
    expect(startOfMonthInZone(new Date("2026-12-15T12:00:00Z"), "America/Manaus", 1).toISOString()).toBe("2027-01-01T04:00:00.000Z");
  });

  it("usa o deslocamento vigente no dia 1º quando o fuso tem horário de verão", () => {
    // Nova York em 20/03/2026 está em UTC-4, mas o dia 1º de março ainda era UTC-5.
    expect(startOfMonthInZone(new Date("2026-03-20T12:00:00Z"), "America/New_York").toISOString()).toBe("2026-03-01T05:00:00.000Z");
  });
});
