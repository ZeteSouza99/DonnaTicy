import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { signToken } from "@/lib/auth";
import { GET as kpis } from "@/app/api/dashboard/kpis/route";
import { createFixture, request, resetDatabase } from "./fixtures";

let fixture: Awaited<ReturnType<typeof createFixture>>;
let sequence = 0;
const processTimeZone = process.env.TZ;

// Mesmo relógio da Vercel: o servidor roda em UTC, a loja em America/Manaus (UTC-4).
beforeAll(() => {
  process.env.TZ = "UTC";
});
beforeEach(async () => {
  await resetDatabase();
  fixture = await createFixture();
});
afterEach(() => {
  vi.useRealTimers();
});
afterAll(async () => {
  if (processTimeZone === undefined) delete process.env.TZ;
  else process.env.TZ = processTimeZone;
  await prisma.$disconnect();
});

function deliveredOrder(total: number, placedAt: string) {
  sequence += 1;
  return prisma.order.create({
    data: {
      code: `PED-KPI-${sequence}`, channel: "STORE", status: "DELIVERED", customerId: fixture.customer.id,
      locationId: fixture.location.id, subtotal: total, total, placedAt: new Date(placedAt),
    },
  });
}

/** Consulta os KPIs como se agora fosse `now`; o token é emitido no mesmo relógio para não nascer vencido. */
async function kpisAt(now: string) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(now));
  const token = await signToken({
    sub: fixture.user.id, email: fixture.user.email, role: fixture.user.role,
    locationId: fixture.location.id, tokenVersion: fixture.user.tokenVersion,
  });
  const response = await kpis(request("GET", "/api/dashboard/kpis", token));
  expect(response.status).toBe(200);
  return (await response.json()).kpis as { faturamentoMes: number; crescimentoVsMesAnterior: number; totalPedidosMes: number };
}

describe("KPIs do dashboard", () => {
  it("compara com o mês anterior inteiro, incluindo as vendas do último dia", async () => {
    await deliveredOrder(100, "2026-10-31T23:00:00Z"); // 31/10 às 19:00 em Manaus
    await deliveredOrder(150, "2026-11-15T16:00:00Z");

    const result = await kpisAt("2026-11-15T16:00:00Z");
    expect(result.faturamentoMes).toBe(150);
    expect(result.crescimentoVsMesAnterior).toBe(50);
  });

  it("vira o mês no horário da loja, e não no UTC do servidor", async () => {
    await deliveredOrder(60, "2026-10-20T15:00:00Z"); // outubro
    await deliveredOrder(100, "2026-11-10T15:00:00Z"); // novembro
    await deliveredOrder(50, "2026-12-01T01:00:00Z"); // 30/11 às 21:00 em Manaus: ainda novembro

    // 01/12 às 02:30 UTC são 22:30 de 30/11 na loja.
    const result = await kpisAt("2026-12-01T02:30:00Z");
    expect(result.faturamentoMes).toBe(150);
    expect(result.totalPedidosMes).toBe(2);
    expect(result.crescimentoVsMesAnterior).toBe(150);
  });
});
