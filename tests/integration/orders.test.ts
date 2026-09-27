import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { Client } from "pg";
import { NextRequest } from "next/server";
import type { Order } from "@prisma/client";
import { prisma } from "@/lib/db";
import { signToken } from "@/lib/auth";
import { POST as createOrder } from "@/app/api/orders/route";
import { PATCH as changeOrderStatus, GET as getOrder } from "@/app/api/orders/[id]/route";
import { GET as health } from "@/app/api/health/route";
import { PUT as updateEntry, DELETE as deleteEntry } from "@/app/api/financial/entries/[id]/route";
import { POST as createEntry, GET as listEntries } from "@/app/api/financial/entries/route";
import { POST as bulkDeleteEntries } from "@/app/api/financial/entries/bulk-delete/route";
import { GET as getSummary } from "@/app/api/financial/summary/route";
import { GET as getReport } from "@/app/api/reports/financial/route";
import { POST as createReturn } from "@/app/api/logistics/returns/route";
import { PATCH as resolveReturn } from "@/app/api/logistics/returns/[id]/route";
import { POST as createExchange } from "@/app/api/sales/exchanges/route";
import { createFixture, params, request, resetDatabase } from "./fixtures";
import { integrationDatabaseUrl } from "./database";

let fixture: Awaited<ReturnType<typeof createFixture>>;

beforeEach(async () => {
  await resetDatabase();
  fixture = await createFixture();
});
afterAll(() => prisma.$disconnect());

function orderInput(overrides: Record<string, unknown> = {}) {
  return {
    channel: "ECOMMERCE",
    customerId: fixture.customer.id,
    locationId: fixture.location.id,
    items: [{ variantId: fixture.variant.id, quantity: 2 }],
    payments: [{ method: "PIX", amount: 200 }],
    ...overrides,
  };
}

async function sell(overrides: Record<string, unknown> = {}, { pending = false } = {}): Promise<Order> {
  const response = await createOrder(request("POST", "/api/orders", fixture.token, orderInput(overrides)));
  const body = await response.json();
  expect(response.status, JSON.stringify(body)).toBe(201);
  if (pending || body.status !== "PENDING_PAYMENT") return body as Order;
  // Canal remoto nasce aguardando pagamento; a maioria dos cenários parte da venda já paga.
  const paid = await transition(body.id, "PAID");
  expect(paid.status).toBe(200);
  return (await paid.json()) as Order;
}

function transition(id: string, status = "CANCELLED") {
  return changeOrderStatus(request("PATCH", `/api/orders/${id}`, fixture.token, { status, cancelReason: "Teste de cancelamento" }), params(id));
}

function stock() {
  return prisma.stockPosition.findUniqueOrThrow({ where: { variantId_locationId: { variantId: fixture.variant.id, locationId: fixture.location.id } } });
}

async function refundFor(orderId: string) {
  return prisma.financialEntry.findUniqueOrThrow({ where: { cancellationOrderId: orderId } });
}

function settle(id: string, overrides: Record<string, unknown> = {}) {
  return updateEntry(request("PUT", `/api/financial/entries/${id}`, fixture.token, {
    status: "PAID", paymentMethod: "PIX", cashDate: "2026-09-21", ...overrides,
  }), params(id));
}

function resolve(id: string, overrides: Record<string, unknown> = {}) {
  return resolveReturn(request("PATCH", `/api/logistics/returns/${id}`, fixture.token, {
    status: "RESOLVED", inspectionResult: "APPROVED", resolution: "REFUND", refundAmount: 100, ...overrides,
  }), params(id));
}

async function secondVariant() {
  const size = await prisma.size.create({ data: { code: "G", name: "G", sortOrder: 2 } });
  const variant = await prisma.productVariant.create({ data: {
    productId: fixture.product.id, colorId: fixture.variant.colorId, sizeId: size.id, sku: "TEST-PRETO-G",
  } });
  await prisma.stockPosition.create({ data: { locationId: fixture.location.id, variantId: variant.id, quantity: 10 } });
  return variant;
}

async function assertNeutralDre() {
  const suffix = "?from=2000-01-01&to=2100-12-31";
  const summaryResponse = await getSummary(request("GET", `/api/financial/summary${suffix}`, fixture.token));
  const reportResponse = await getReport(request("GET", `/api/reports/financial${suffix}`, fixture.token));
  expect(summaryResponse.status).toBe(200);
  expect(reportResponse.status).toBe(200);
  const { dre } = await summaryResponse.json();
  const { summary } = await reportResponse.json();
  expect(dre.receitaLiquida).toBe(0);
  expect(dre.lucroBruto).toBe(0);
  expect(dre.resultadoOperacional).toBe(0);
  expect(summary.netRevenue).toBe(0);
  expect(summary.grossProfit).toBe(0);
  expect(summary.operatingProfit).toBe(0);
}

describe("API → autenticação → pedido → estoque → financeiro", () => {
  it("persiste venda de balcão, baixa física, receita e auditoria atomicamente", async () => {
    const order = await sell({ channel: "STORE" });
    expect(order.status).toBe("DELIVERED");
    expect(await stock()).toMatchObject({ quantity: 8, reservedQty: 0 });
    expect(await prisma.stockMovement.count({ where: { referenceId: order.id, reason: "SALE" } })).toBe(1);
    expect(await prisma.financialEntry.findFirst({ where: { orderId: order.id } })).toMatchObject({ type: "REVENUE", status: "PAID", amount: 200 });
    expect(await prisma.paymentTransaction.count({ where: { orderId: order.id, status: "CONFIRMED" } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { entityId: order.id, action: "CREATE" } })).toBe(1);
    expect((await transition(order.id)).status).toBe(400); // Não amplia cancelamento para vendas entregues.
  });

  it("cancela venda paga, libera reserva e cria obrigação de reembolso, sem simular devolução bancária", async () => {
    const order = await sell({ payments: [{ method: "PIX", amount: 120 }, { method: "CASH", amount: 80 }] });
    expect(await stock()).toMatchObject({ quantity: 10, reservedQty: 2 });
    expect((await transition(order.id)).status).toBe(200);
    expect(await stock()).toMatchObject({ quantity: 10, reservedQty: 0 });
    const refund = await refundFor(order.id);
    expect(refund).toMatchObject({ type: "REFUND", status: "PENDING", amount: 200, cashDate: null });
    expect(await prisma.paymentTransaction.count({ where: { orderId: order.id, status: "REFUND_PENDING" } })).toBe(2);
    expect(await prisma.financialEntry.findFirst({ where: { orderId: order.id, type: "REVENUE" } })).toMatchObject({ status: "PAID", amount: 200 });
    expect(await prisma.customer.findUnique({ where: { id: fixture.customer.id } })).toMatchObject({ totalOrders: 0, lifetimeValue: 0, avgTicket: 0, firstPurchaseAt: null, lastPurchaseAt: null });
    await assertNeutralDre();
    const detail = await getOrder(request("GET", `/api/orders/${order.id}`, fixture.token), params(order.id));
    expect(await detail.json()).toMatchObject({ status: "CANCELLED", cancellationRefund: { id: refund.id, status: "PENDING" } });

    expect((await settle(refund.id)).status).toBe(200);
    expect(await refundFor(order.id)).toMatchObject({ status: "PAID", paymentMethod: "PIX", cashDate: new Date("2026-09-21T12:00:00Z"), competenceDate: refund.competenceDate });
    expect(await prisma.paymentTransaction.count({ where: { orderId: order.id, status: "REFUNDED" } })).toBe(2);
    await assertNeutralDre();
  });

  it("cancela obrigações pendentes sem gerar reembolso nem caixa", async () => {
    const order = await sell({}, { pending: true });
    expect(order.status).toBe("PENDING_PAYMENT");
    expect((await transition(order.id)).status).toBe(200);
    expect(await prisma.financialEntry.findFirst({ where: { orderId: order.id } })).toMatchObject({ status: "CANCELLED", cashDate: null });
    expect(await prisma.paymentTransaction.findFirst({ where: { orderId: order.id } })).toMatchObject({ status: "CANCELLED" });
    expect(await prisma.financialEntry.count({ where: { cancellationOrderId: order.id } })).toBe(0);
    expect(await stock()).toMatchObject({ quantity: 10, reservedQty: 0 });
    await assertNeutralDre();
    const listed = await listEntries(request("GET", "/api/financial/entries", fixture.token));
    expect((await listed.json()).data[0]).toMatchObject({ status: "CANCELLED", order: { status: "CANCELLED" } });
  });

  it("após separação recompõe físico, sem decrementar reserva duas vezes", async () => {
    const order = await sell();
    expect((await transition(order.id, "PICKING")).status).toBe(200);
    expect(await stock()).toMatchObject({ quantity: 8, reservedQty: 0 });
    expect((await transition(order.id)).status).toBe(200);
    expect(await stock()).toMatchObject({ quantity: 10, reservedQty: 0 });
    expect(await prisma.stockMovement.count({ where: { referenceId: order.id, reason: "ADJUSTMENT" } })).toBe(1);
  });

  it("cancela o financeiro mesmo sem local de estoque", async () => {
    const order = await sell();
    // Pedido legado: antes o local era opcional e a venda não reservava estoque.
    await prisma.order.update({ where: { id: order.id }, data: { locationId: null } });
    await prisma.stockPosition.updateMany({ data: { reservedQty: 0 } });
    expect((await transition(order.id)).status).toBe(200);
    expect((await refundFor(order.id)).amount).toEqual(200);
    expect(await stock()).toMatchObject({ quantity: 10, reservedQty: 0 });
    expect(await prisma.stockMovement.count()).toBe(0);
  });

  it("serializa dois cancelamentos simultâneos e mantém retry idempotente", async () => {
    const order = await sell();
    const responses = await Promise.all([transition(order.id), transition(order.id)]);
    expect(responses.map((r) => r.status)).toEqual([200, 200]);
    const cancelled = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect((await transition(order.id)).status).toBe(200);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).cancelledAt).toEqual(cancelled.cancelledAt);
    expect(await prisma.financialEntry.count({ where: { cancellationOrderId: order.id } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { entityId: order.id, action: "STATUS_CHANGE", payload: { path: ["to"], equals: "CANCELLED" } } })).toBe(1);
    expect(await stock()).toMatchObject({ quantity: 10, reservedQty: 0 });
  });

  it("serializa separação contra cancelamento sem perda de estoque", async () => {
    const order = await sell();
    const [picking, cancel] = await Promise.all([transition(order.id, "PICKING"), transition(order.id)]);
    expect([200, 400]).toContain(picking.status);
    expect(cancel.status).toBe(200);
    expect(await stock()).toMatchObject({ quantity: 10, reservedQty: 0 });
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("CANCELLED");
    expect(await prisma.financialEntry.count({ where: { cancellationOrderId: order.id } })).toBe(1);
  });

  it("reverte a venda inteira quando um item posterior não tem saldo", async () => {
    const response = await createOrder(request("POST", "/api/orders", fixture.token, orderInput({
      channel: "STORE",
      items: [{ variantId: fixture.variant.id, quantity: 2 }, { variantId: fixture.variant.id, quantity: 20 }],
      payments: [{ method: "PIX", amount: 2200 }],
    })));
    expect(response.status).toBe(409);
    expect(await stock()).toMatchObject({ quantity: 10, reservedQty: 0 });
    expect(await prisma.order.count()).toBe(0);
    expect(await prisma.paymentTransaction.count()).toBe(0);
    expect(await prisma.financialEntry.count()).toBe(0);
    expect(await prisma.auditLog.count()).toBe(0);
  });

  it("reverte o cancelamento inteiro se houver falha ao gravar auditoria", async () => {
    const order = await sell();
    // Falha real do Postgres após estoque/financeiro: sem mocks de transação.
    await prisma.$executeRawUnsafe(`CREATE FUNCTION test_reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'falha de auditoria de teste'; END $$`);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER test_reject_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION test_reject_audit()`);
    try {
      expect((await transition(order.id)).status).toBe(500);
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER test_reject_audit ON audit_logs`);
      await prisma.$executeRawUnsafe(`DROP FUNCTION test_reject_audit()`);
    }
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("PAID");
    expect(await stock()).toMatchObject({ quantity: 10, reservedQty: 2 });
    expect(await prisma.paymentTransaction.findFirst({ where: { orderId: order.id } })).toMatchObject({ status: "CONFIRMED" });
    expect(await prisma.financialEntry.count({ where: { cancellationOrderId: order.id } })).toBe(0);
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: fixture.customer.id } })).totalOrders).toBe(1);
  });

  it("recusa cancelamento se a reserva foi alterada, sem estorno parcial", async () => {
    const order = await sell();
    await prisma.stockPosition.updateMany({ data: { reservedQty: 0 } });
    expect((await transition(order.id)).status).toBe(409);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("PAID");
    expect(await prisma.financialEntry.count({ where: { cancellationOrderId: order.id } })).toBe(0);
  });

  it("restitui cupom e vale rastreado uma vez, sem converter o crédito em dinheiro", async () => {
    const coupon = await prisma.coupon.create({ data: { code: "TESTE", discountType: "FIXED", discountValue: 20, validFrom: new Date("2000-01-01"), validUntil: new Date("2100-01-01"), maxUses: 1 } });
    const credit = await prisma.storeCredit.create({ data: { code: "VALETESTE", customerId: fixture.customer.id, amount: 50, remainingAmount: 50 } });
    const order = await sell({ couponCode: coupon.code, storeCreditCode: credit.code, payments: [{ method: "PIX", amount: 130 }] });
    expect(order).toMatchObject({ total: 130, usedStoreCreditId: credit.id, usedStoreCreditAmount: 50 });
    expect((await transition(order.id)).status).toBe(200);
    expect((await transition(order.id)).status).toBe(200);
    expect(await prisma.storeCredit.findUnique({ where: { id: credit.id } })).toMatchObject({ remainingAmount: 50, status: "ACTIVE" });
    expect((await prisma.coupon.findUniqueOrThrow({ where: { id: coupon.id } })).usedCount).toBe(0);
    expect((await refundFor(order.id)).amount).toEqual(130);
    await assertNeutralDre();
  });

  it("recusa crédito de loja avulso como pagamento sem debitar um vale", async () => {
    const response = await createOrder(request("POST", "/api/orders", fixture.token, orderInput({
      payments: [{ method: "PIX", amount: 100 }, { method: "STORE_CREDIT", amount: 100 }],
    })));
    expect(response.status).toBe(400);
    expect(await prisma.order.count()).toBe(0);
    expect(await prisma.paymentTransaction.count()).toBe(0);
    expect(await stock()).toMatchObject({ quantity: 10, reservedQty: 0 });
  });

  it("não converte pagamento legado STORE_CREDIT em reembolso monetário", async () => {
    const order = await sell();
    await prisma.paymentTransaction.updateMany({ where: { orderId: order.id }, data: { method: "STORE_CREDIT" } });
    expect((await transition(order.id)).status).toBe(409);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("PAID");
    expect(await prisma.financialEntry.count({ where: { cancellationOrderId: order.id } })).toBe(0);
    expect(await stock()).toMatchObject({ quantity: 10, reservedQty: 2 });
  });

  it("exige conciliação do vale legado desconhecido em vez de perder o crédito", async () => {
    const credit = await prisma.storeCredit.create({ data: { code: "LEGADO", customerId: fixture.customer.id, amount: 50, remainingAmount: 50 } });
    const order = await sell({ storeCreditCode: credit.code, payments: [{ method: "PIX", amount: 150 }] });
    // Simula o estado preservado pela migração: desconto antigo sem rastreio do vale.
    await prisma.order.update({ where: { id: order.id }, data: { usedStoreCreditId: null, usedStoreCreditAmount: null } });
    expect((await transition(order.id)).status).toBe(409);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("PAID");
    expect(await prisma.storeCredit.findUnique({ where: { id: credit.id } })).toMatchObject({ remainingAmount: 0, status: "USED" });
    expect(await prisma.financialEntry.count({ where: { cancellationOrderId: order.id } })).toBe(0);
    expect(await stock()).toMatchObject({ quantity: 10, reservedQty: 2 });

    // Após conciliação explícita, a restituição volta a ser verificável e segura.
    await prisma.order.update({ where: { id: order.id }, data: { usedStoreCreditId: credit.id, usedStoreCreditAmount: 50 } });
    expect((await transition(order.id)).status).toBe(200);
    expect((await refundFor(order.id)).amount).toEqual(150);
    expect(await prisma.storeCredit.findUnique({ where: { id: credit.id } })).toMatchObject({ remainingAmount: 50, status: "ACTIVE" });
  });

  it("permite cancelar pedido legado sem desconto nem consumo de crédito", async () => {
    const order = await sell();
    await prisma.order.update({ where: { id: order.id }, data: { usedStoreCreditAmount: null } });
    expect((await transition(order.id)).status).toBe(200);
    expect((await refundFor(order.id)).amount).toEqual(200);
  });

  it("restitui venda coberta integralmente pelo vale sem criar saída de dinheiro", async () => {
    const credit = await prisma.storeCredit.create({ data: { code: "TOTAL", customerId: fixture.customer.id, amount: 200, remainingAmount: 200 } });
    const order = await sell({ storeCreditCode: credit.code, payments: [] });
    expect(order).toMatchObject({ total: 0, usedStoreCreditAmount: 200 });
    expect((await transition(order.id)).status).toBe(200);
    expect(await prisma.storeCredit.findUnique({ where: { id: credit.id } })).toMatchObject({ remainingAmount: 200, status: "ACTIVE" });
    expect(await prisma.financialEntry.count({ where: { cancellationOrderId: order.id } })).toBe(0);
    expect(await prisma.paymentTransaction.count()).toBe(0);
    expect(await stock()).toMatchObject({ quantity: 10, reservedQty: 0 });
    await assertNeutralDre();
  });

  it("preserva indicadores das outras vendas do cliente", async () => {
    const first = await sell();
    await sell({ items: [{ variantId: fixture.variant.id, quantity: 1 }], payments: [{ method: "CASH", amount: 100 }] });
    expect((await transition(first.id)).status).toBe(200);
    expect(await prisma.customer.findUnique({ where: { id: fixture.customer.id } })).toMatchObject({ totalOrders: 1, lifetimeValue: 100, avgTicket: 100 });
    expect(await stock()).toMatchObject({ quantity: 10, reservedQty: 1 });
  });

  it("recusa sessão ausente/revogada e perfil sem escrita antes de alterar dados", async () => {
    const order = await sell();
    expect((await changeOrderStatus(request("PATCH", `/api/orders/${order.id}`, "", { status: "CANCELLED" }), params(order.id))).status).toBe(401);
    const viewer = await prisma.user.create({ data: { email: "viewer@example.test", name: "Leitor", passwordHash: fixture.user.passwordHash, role: "VIEWER" } });
    const viewerToken = await signToken({ sub: viewer.id, email: viewer.email, role: viewer.role, locationId: null, tokenVersion: 0 });
    expect((await changeOrderStatus(request("PATCH", `/api/orders/${order.id}`, viewerToken, { status: "CANCELLED" }), params(order.id))).status).toBe(403);
    await prisma.user.update({ where: { id: fixture.user.id }, data: { tokenVersion: { increment: 1 } } });
    expect((await transition(order.id)).status).toBe(401);
    expect(await stock()).toMatchObject({ quantity: 10, reservedQty: 2 });
  });

  it("bloqueia troca/devolução em cancelado e cancelamento com devolução existente", async () => {
    const order = await sell();
    const item = await prisma.orderItem.findFirstOrThrow({ where: { orderId: order.id } });
    const returnBody = { orderId: order.id, customerId: fixture.customer.id, type: "RETURN", items: [{ orderItemId: item.id, variantId: item.variantId, quantity: 1, reason: "REGRET" }] };
    expect((await createReturn(request("POST", "/api/logistics/returns", fixture.token, returnBody))).status).toBe(201);
    expect((await transition(order.id)).status).toBe(409);

    const second = await sell();
    const secondItem = await prisma.orderItem.findFirstOrThrow({ where: { orderId: second.id } });
    expect((await transition(second.id)).status).toBe(200);
    expect((await createReturn(request("POST", "/api/logistics/returns", fixture.token, { ...returnBody, orderId: second.id, items: [{ orderItemId: secondItem.id, variantId: secondItem.variantId, quantity: 1, reason: "REGRET" }] }))).status).toBe(409);
    expect((await createExchange(request("POST", "/api/sales/exchanges", fixture.token, { orderId: second.id, locationId: fixture.location.id, returnedItems: [{ orderItemId: secondItem.id, quantity: 1 }] }))).status).toBe(400);
  });

  it("trava todas as posições em ordem comum ao cancelar e trocar pedidos distintos", async () => {
    const otherVariant = await secondVariant();
    const [first, last] = [fixture.variant, otherVariant].sort((a, b) => a.id < b.id ? -1 : 1);
    const cancellable = await sell({ items: [{ variantId: first.id, quantity: 1 }, { variantId: last.id, quantity: 1 }] });
    const otherCustomer = await prisma.customer.create({ data: { code: "CLI-OTHER", fullName: "Outro cliente", phone: "11999999002" } });
    const delivered = await sell({
      channel: "STORE", customerId: otherCustomer.id,
      items: [{ variantId: last.id, quantity: 1 }], payments: [{ method: "PIX", amount: 100 }],
    });
    const returned = await prisma.orderItem.findFirstOrThrow({ where: { orderId: delivered.id } });
    const blocker = new Client({ connectionString: integrationDatabaseUrl() });
    const observer = new Client({ connectionString: integrationDatabaseUrl() });
    const operations: Array<ReturnType<typeof transition>> = [];
    await blocker.connect();
    await observer.connect();
    const blockedCount = async () => {
      const result = await observer.query(`
        SELECT count(*)::int AS count FROM pg_stat_activity
        WHERE datname = current_database() AND wait_event_type = 'Lock'
          AND (query ILIKE '%stock_positions%' OR query ILIKE '%pg_advisory_xact_lock%')
      `);
      return result.rows[0].count as number;
    };
    try {
      await blocker.query("BEGIN");
      await blocker.query("SELECT id FROM stock_positions WHERE variant_id = $1 AND location_id = $2 FOR UPDATE", [first.id, fixture.location.id]);
      operations.push(transition(cancellable.id));
      await expect.poll(blockedCount, { timeout: 2_000, interval: 10 }).toBe(1);
      operations.push(createExchange(request("POST", "/api/sales/exchanges", fixture.token, {
        orderId: delivered.id, locationId: fixture.location.id,
        returnedItems: [{ orderItemId: returned.id, quantity: 1 }],
        newItems: [{ variantId: first.id, quantity: 1 }],
      })));
      await expect.poll(blockedCount, { timeout: 2_000, interval: 10 }).toBe(2);
      // A troca devolve o último SKU, mas não pode travá-lo antes do primeiro.
      await blocker.query("SELECT id FROM stock_positions WHERE variant_id = $1 AND location_id = $2 FOR UPDATE NOWAIT", [last.id, fixture.location.id]);
      await blocker.query("COMMIT");
      expect((await Promise.all(operations)).map((response) => response.status)).toEqual([200, 201]);
    } finally {
      await blocker.query("ROLLBACK");
      await Promise.allSettled(operations);
      await blocker.end();
      await observer.end();
    }
    const positions = await prisma.stockPosition.findMany({ where: { locationId: fixture.location.id }, orderBy: { variantId: "asc" } });
    expect(positions).toMatchObject([{ variantId: first.id, quantity: 9, reservedQty: 0 }, { variantId: last.id, quantity: 10, reservedQty: 0 }]);
    expect(await prisma.exchange.count()).toBe(1);
    expect((await refundFor(cancellable.id)).amount).toEqual(200);
  });
});

describe("devoluções vinculadas e idempotentes", () => {
  it("recusa itens de pedido cancelado sob outro pedido e vínculos inconsistentes", async () => {
    const cancelled = await sell();
    const foreignItem = await prisma.orderItem.findFirstOrThrow({ where: { orderId: cancelled.id } });
    await transition(cancelled.id);
    const active = await sell();
    const ownItem = await prisma.orderItem.findFirstOrThrow({ where: { orderId: active.id } });
    const other = await secondVariant();
    const otherCustomer = await prisma.customer.create({ data: { code: "CLI-OTHER", fullName: "Outro cliente", phone: "11999999002" } });
    const base = { orderId: active.id, customerId: fixture.customer.id, type: "RETURN" };
    const own = { orderItemId: ownItem.id, variantId: ownItem.variantId, quantity: 1, reason: "REGRET" };
    const cases = [
      { ...base, items: [{ ...own, orderItemId: foreignItem.id }] },
      { ...base, items: [{ ...own, variantId: other.id }] },
      { ...base, customerId: otherCustomer.id, items: [own] },
      { ...base, items: [own, own] },
      { ...base, items: [{ ...own, quantity: ownItem.quantity + 1 }] },
    ];
    for (const body of cases) {
      expect((await createReturn(request("POST", "/api/logistics/returns", fixture.token, body))).status).toBe(400);
    }
    expect(await prisma.returnRequest.count()).toBe(0);
    expect(await stock()).toMatchObject({ quantity: 10, reservedQty: 2 });
    expect(await prisma.financialEntry.count({ where: { type: "REFUND" } })).toBe(1);

    // Também barra registros inconsistentes que já existiam antes da validação.
    const legacy = await prisma.returnRequest.create({ data: {
      code: "DEV-LEGACY", orderId: active.id, customerId: fixture.customer.id, type: "RETURN", reason: "REGRET", inspectionPhotos: [],
      items: { create: [{ orderItemId: foreignItem.id, variantId: foreignItem.variantId, quantity: 1, reason: "REGRET" }] },
    } });
    expect((await resolve(legacy.id)).status).toBe(409);
    expect((await prisma.returnRequest.findUniqueOrThrow({ where: { id: legacy.id } })).status).toBe("REQUESTED");
    expect(await prisma.financialEntry.count({ where: { type: "REFUND" } })).toBe(1);
  });

  it("resolve chamadas concorrentes e retries sem repetir estoque, reembolso ou auditoria", async () => {
    const order = await sell({ channel: "STORE" });
    const item = await prisma.orderItem.findFirstOrThrow({ where: { orderId: order.id } });
    const created = await createReturn(request("POST", "/api/logistics/returns", fixture.token, {
      orderId: order.id, customerId: fixture.customer.id, type: "RETURN",
      items: [{ orderItemId: item.id, variantId: item.variantId, quantity: 1, reason: "REGRET" }],
    }));
    expect(created.status).toBe(201);
    const { id } = await created.json();
    const input = { inspectionNotes: "" };
    expect((await Promise.all([resolve(id, input), resolve(id, input)])).map((response) => response.status)).toEqual([200, 200]);
    const resolved = await prisma.returnRequest.findUniqueOrThrow({ where: { id } });
    expect(resolved.inspectionNotes).toBe("");
    expect((await resolve(id, input)).status).toBe(200);
    expect((await resolve(id, { refundAmount: 90 })).status).toBe(409);
    expect((await resolve(id, { status: "APPROVED" })).status).toBe(409);
    expect((await prisma.returnRequest.findUniqueOrThrow({ where: { id } })).resolvedAt).toEqual(resolved.resolvedAt);
    expect(await stock()).toMatchObject({ quantity: 9, reservedQty: 0 });
    expect(await prisma.stockMovement.count({ where: { referenceId: id, reason: "RETURN_APPROVED" } })).toBe(1);
    expect(await prisma.financialEntry.findMany({ where: { orderId: order.id, type: "REFUND" } }))
      .toMatchObject([{ amount: 100, status: "PENDING", cashDate: null }]);
    expect(await prisma.auditLog.count({ where: { entityId: id, action: "UPDATE" } })).toBe(1);
  });

  it("desfaz toda a resolução da devolução se a auditoria falhar", async () => {
    const order = await sell({ channel: "STORE" });
    const item = await prisma.orderItem.findFirstOrThrow({ where: { orderId: order.id } });
    const response = await createReturn(request("POST", "/api/logistics/returns", fixture.token, {
      orderId: order.id, customerId: fixture.customer.id, type: "RETURN",
      items: [{ orderItemId: item.id, variantId: item.variantId, quantity: 1, reason: "REGRET" }],
    }));
    expect(response.status).toBe(201);
    const { id } = await response.json();
    await prisma.$executeRawUnsafe(`CREATE FUNCTION test_reject_return_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'falha de devolucao de teste'; END $$`);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER test_reject_return_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION test_reject_return_audit()`);
    try {
      expect((await resolve(id)).status).toBe(500);
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER test_reject_return_audit ON audit_logs`);
      await prisma.$executeRawUnsafe(`DROP FUNCTION test_reject_return_audit()`);
    }
    expect((await prisma.returnRequest.findUniqueOrThrow({ where: { id } })).status).toBe("REQUESTED");
    expect(await stock()).toMatchObject({ quantity: 8, reservedQty: 0 });
    expect(await prisma.financialEntry.count({ where: { type: "REFUND" } })).toBe(0);
    expect(await prisma.stockMovement.count({ where: { referenceId: id } })).toBe(0);
  });
});

describe("baixa e proteção do reembolso", () => {
  it("exige data/método, rejeita divergência e mantém a obrigação pendente", async () => {
    const order = await sell();
    await transition(order.id);
    const refund = await refundFor(order.id);
    expect((await settle(refund.id, { cashDate: undefined })).status).toBe(400);
    expect((await settle(refund.id, { paymentMethod: undefined })).status).toBe(400);
    expect((await settle(refund.id, { cashDate: "data-inválida" })).status).toBe(400);
    await prisma.paymentTransaction.updateMany({ where: { orderId: order.id }, data: { grossAmount: 190 } });
    expect((await settle(refund.id)).status).toBe(409);
    expect((await refundFor(order.id)).status).toBe("PENDING");
  });

  it("serializa baixas simultâneas sem duplicar auditoria ou estorno", async () => {
    const order = await sell();
    await transition(order.id);
    const refund = await refundFor(order.id);
    const responses = await Promise.all([settle(refund.id), settle(refund.id)]);
    expect(responses.map((r) => r.status)).toEqual([200, 200]);
    expect(await prisma.auditLog.count({ where: { entityId: refund.id, action: "UPDATE" } })).toBe(1);
    expect((await updateEntry(request("PUT", `/api/financial/entries/${refund.id}`, fixture.token, { status: "PENDING" }), params(refund.id))).status).toBe(409);
    expect((await refundFor(order.id)).status).toBe("PAID");
    await assertNeutralDre();
  });

  it("reverte também pagamentos quando a auditoria da baixa falha", async () => {
    const order = await sell();
    await transition(order.id);
    const refund = await refundFor(order.id);
    await prisma.$executeRawUnsafe(`CREATE FUNCTION test_reject_refund_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'falha de baixa de teste'; END $$`);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER test_reject_refund_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION test_reject_refund_audit()`);
    try {
      expect((await settle(refund.id)).status).toBe(500);
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER test_reject_refund_audit ON audit_logs`);
      await prisma.$executeRawUnsafe(`DROP FUNCTION test_reject_refund_audit()`);
    }
    expect((await refundFor(order.id)).status).toBe("PENDING");
    expect(await prisma.paymentTransaction.findFirst({ where: { orderId: order.id } })).toMatchObject({ status: "REFUND_PENDING" });
  });

  it("protege reembolso e receita histórica contra edição e exclusão, inclusive em lote", async () => {
    const order = await sell();
    await transition(order.id);
    const refund = await refundFor(order.id);
    const revenue = await prisma.financialEntry.findFirstOrThrow({ where: { orderId: order.id, type: "REVENUE" } });
    expect((await updateEntry(request("PUT", `/api/financial/entries/${refund.id}`, fixture.token, { amount: 1 }), params(refund.id))).status).toBe(400);
    expect((await updateEntry(request("PUT", `/api/financial/entries/${revenue.id}`, fixture.token, { amount: 1 }), params(revenue.id))).status).toBe(409);
    expect((await deleteEntry(request("DELETE", `/api/financial/entries/${refund.id}`, fixture.token), params(refund.id))).status).toBe(409);
    expect((await deleteEntry(request("DELETE", `/api/financial/entries/${revenue.id}`, fixture.token), params(revenue.id))).status).toBe(409);
    const manual = await prisma.financialEntry.create({ data: { type: "EXPENSE", category: "Teste", description: "Avulso", amount: 10, competenceDate: new Date() } });
    expect((await bulkDeleteEntries(request("POST", "/api/financial/entries/bulk-delete", fixture.token, { ids: [manual.id, refund.id] }))).status).toBe(409);
    expect((await prisma.financialEntry.findUniqueOrThrow({ where: { id: manual.id } })).deletedAt).toBeNull();
    expect((await createEntry(request("POST", "/api/financial/entries", fixture.token, { type: "REVENUE", category: "Vendas", description: "Duplicada", orderId: order.id, amount: 200, dueDate: "2026-09-21" }))).status).toBe(409);
  });

  it("não altera competência nem aplica desconto duplo ao baixar em outro período", async () => {
    const order = await sell();
    await prisma.financialEntry.updateMany({ where: { orderId: order.id }, data: { competenceDate: new Date("2026-01-10T12:00:00Z"), cashDate: new Date("2026-01-10T12:00:00Z") } });
    await transition(order.id);
    const refund = await refundFor(order.id);
    await prisma.financialEntry.update({ where: { id: refund.id }, data: { competenceDate: new Date("2026-02-10T12:00:00Z") } });
    expect((await settle(refund.id, { cashDate: "2026-03-10" })).status).toBe(200);
    const january = await getReport(request("GET", "/api/reports/financial?from=2026-01-01&to=2026-01-31", fixture.token));
    const february = await getReport(request("GET", "/api/reports/financial?from=2026-02-01&to=2026-02-28", fixture.token));
    const march = await getReport(request("GET", "/api/reports/financial?from=2026-03-01&to=2026-03-31", fixture.token));
    expect((await january.json()).summary.netRevenue).toBe(200);
    expect((await february.json()).summary.netRevenue).toBe(-200);
    expect((await march.json()).summary.netRevenue).toBe(0);
    expect((await refundFor(order.id)).cashDate).toEqual(new Date("2026-03-10T12:00:00Z"));
    await assertNeutralDre();
  });
});

describe("local, vendedor e pagamento pendente", () => {
  async function userToken(role: "SUPER_ADMIN" | "SELLER", locationId: string | null, email: string) {
    const user = await prisma.user.create({
      data: { email, name: role, passwordHash: fixture.user.passwordHash, role, locationId },
    });
    const token = await signToken({ sub: user.id, email: user.email, role: user.role, locationId, tokenVersion: 0 });
    return { user, token };
  }

  function runCron() {
    return health(new NextRequest("http://localhost/api/health"));
  }

  it("usa a loja do usuário quando o local não vem e recusa venda sem local", async () => {
    const order = await sell({ channel: "STORE", locationId: undefined });
    expect(order.locationId).toBe(fixture.location.id);
    expect(await stock()).toMatchObject({ quantity: 8 });

    const { token } = await userToken("SUPER_ADMIN", null, "semloja@example.test");
    const response = await createOrder(request("POST", "/api/orders", token, orderInput({ locationId: undefined })));
    expect(response.status).toBe(400);
  });

  it("vendedor não vende pelo estoque de outra loja", async () => {
    const other = await prisma.location.create({ data: { name: "Outra loja", code: "OUTRA", type: "STORE" } });
    const { token } = await userToken("SELLER", other.id, "vendedor@example.test");
    const response = await createOrder(request("POST", "/api/orders", token, orderInput({ channel: "STORE" })));
    expect(response.status).toBe(403);
    expect(await stock()).toMatchObject({ quantity: 10, reservedQty: 0 });
    expect(await prisma.order.count()).toBe(0);
  });

  it("só gerente ou admin registra a venda em nome de outro vendedor", async () => {
    const { user: seller, token } = await userToken("SELLER", fixture.location.id, "vendedor@example.test");
    const denied = await createOrder(request("POST", "/api/orders", token, orderInput({ channel: "STORE", sellerId: fixture.user.id })));
    expect(denied.status).toBe(403);
    const unknown = await createOrder(request("POST", "/api/orders", fixture.token, orderInput({ channel: "STORE", sellerId: "inexistente" })));
    expect(unknown.status).toBe(400);
    expect(await prisma.order.count()).toBe(0);

    const order = await sell({ channel: "STORE", sellerId: seller.id });
    expect(order.sellerId).toBe(seller.id);
  });

  it("canal remoto aguarda a baixa e confirma pagamentos e receita ao marcar como pago", async () => {
    const order = await sell({}, { pending: true });
    expect(order.status).toBe("PENDING_PAYMENT");
    expect(await prisma.paymentTransaction.findFirst({ where: { orderId: order.id } })).toMatchObject({ status: "PENDING" });
    expect(await prisma.financialEntry.findFirst({ where: { orderId: order.id } })).toMatchObject({ status: "PENDING", cashDate: null });
    expect(await stock()).toMatchObject({ quantity: 10, reservedQty: 2 });

    expect((await transition(order.id, "PAID")).status).toBe(200);
    expect(await prisma.paymentTransaction.findFirst({ where: { orderId: order.id } })).toMatchObject({ status: "CONFIRMED" });
    const revenue = await prisma.financialEntry.findFirstOrThrow({ where: { orderId: order.id } });
    expect(revenue.status).toBe("PAID");
    expect(revenue.cashDate).not.toBeNull();
  });

  it("recusa confirmar pagamento que não fecha com o total", async () => {
    const order = await sell({}, { pending: true });
    await prisma.paymentTransaction.updateMany({ where: { orderId: order.id }, data: { grossAmount: 150 } });
    expect((await transition(order.id, "PAID")).status).toBe(409);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("PENDING_PAYMENT");
  });

  it("cron expira só o pedido remoto vencido, libera a reserva e audita como sistema", async () => {
    const expired = await sell({}, { pending: true });
    await prisma.order.update({ where: { id: expired.id }, data: { placedAt: new Date(Date.now() - 49 * 3_600_000) } });
    const recent = await sell({ items: [{ variantId: fixture.variant.id, quantity: 1 }], payments: [{ method: "PIX", amount: 100 }] }, { pending: true });

    const response = await runCron();
    expect(response.status).toBe(200);
    expect((await response.json()).maintenance).toMatchObject({ expiredOrders: 1 });

    expect(await prisma.order.findUniqueOrThrow({ where: { id: expired.id } })).toMatchObject({
      status: "CANCELLED",
      cancelReason: "Pagamento não confirmado no prazo",
    });
    expect((await prisma.order.findUniqueOrThrow({ where: { id: recent.id } })).status).toBe("PENDING_PAYMENT");
    expect(await stock()).toMatchObject({ quantity: 10, reservedQty: 1 });
    expect(await prisma.auditLog.findFirst({ where: { entityId: expired.id, action: "STATUS_CHANGE" } })).toMatchObject({ userId: null });
    expect(await prisma.financialEntry.count({ where: { cancellationOrderId: expired.id } })).toBe(0);
  });

  it("cron marca vales vencidos como expirados", async () => {
    const credit = await prisma.storeCredit.create({
      data: { code: "VENCIDO", customerId: fixture.customer.id, amount: 50, remainingAmount: 50, expiresAt: new Date(Date.now() - 60_000) },
    });
    const response = await createOrder(request("POST", "/api/orders", fixture.token, orderInput({ storeCreditCode: credit.code, payments: [{ method: "PIX", amount: 150 }] })));
    expect(response.status).toBe(400);

    expect((await runCron()).status).toBe(200);
    expect(await prisma.storeCredit.findUniqueOrThrow({ where: { id: credit.id } })).toMatchObject({ status: "EXPIRED", remainingAmount: 50 });
  });
});