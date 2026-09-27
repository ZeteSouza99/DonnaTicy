import type { FinancialEntry, Order, Prisma } from "@prisma/client";
import type { z } from "@/lib/zod";
import type { JwtPayload } from "@/lib/auth";
import { createAuditLogTx } from "@/lib/audit";
import { parseDateOnly } from "@/lib/date";
import { sameValue } from "@/lib/decimal";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { paymentsCoverTotal } from "@/lib/order-totals";
import type { updateFinancialEntrySchema } from "@/schemas/financial";
import { lockOrder } from "./order-lock";

interface FinancialMutationContext {
  session: JwtPayload;
  ipAddress?: string;
}

interface UpdateFinancialEntryContext extends FinancialMutationContext {
  id: string;
  input: z.infer<typeof updateFinancialEntrySchema>;
}

interface DeleteFinancialEntriesContext extends FinancialMutationContext {
  ids: string[];
  bulk?: boolean;
}

async function lockFinancialEntries(tx: Prisma.TransactionClient, ids: string[]) {
  const uniqueIds = [...new Set(ids)].sort();
  const candidates = await tx.financialEntry.findMany({
    where: { id: { in: uniqueIds }, deletedAt: null },
    select: { id: true, orderId: true },
  });
  if (candidates.length !== uniqueIds.length || candidates.length === 0) {
    throw new NotFoundError("Lançamento financeiro");
  }

  // Todos os pedidos antes de qualquer lançamento, sempre em ordem determinística.
  const orderIds = [...new Set(candidates.flatMap((entry) => entry.orderId ? [entry.orderId] : []))].sort();
  const orders = new Map<string, Order>();
  for (const orderId of orderIds) {
    orders.set(orderId, await lockOrder(tx, orderId));
  }

  const initialOrderIds = new Map(candidates.map((entry) => [entry.id, entry.orderId]));
  const entries: FinancialEntry[] = [];
  for (const id of uniqueIds) {
    await tx.$queryRaw`SELECT id FROM financial_entries WHERE id = ${id} FOR UPDATE`;
    const entry = await tx.financialEntry.findFirst({ where: { id, deletedAt: null } });
    if (!entry) throw new NotFoundError("Lançamento financeiro");
    if (entry.orderId !== initialOrderIds.get(id)) {
      throw new ConflictError("O vínculo do lançamento mudou. Recarregue antes de continuar.");
    }
    entries.push(entry);
  }
  return { entries, orders };
}

function assertMutableEntry(entry: FinancialEntry, order?: Order): void {
  if (entry.status === "CANCELLED") {
    throw new ConflictError("Lançamentos cancelados são imutáveis e não podem ser excluídos.");
  }
  if (entry.type === "REVENUE" && order?.status === "CANCELLED") {
    throw new ConflictError("A receita histórica de um pedido cancelado deve ser preservada.");
  }
}

function parseEntryDate(value: string, existing: Date | null): Date {
  // O formulário usa apenas o dia: um valor idêntico não deve perder a hora original.
  if (existing && value === existing.toISOString().slice(0, 10)) return existing;
  return parseDateOnly(value);
}

export async function updateFinancialEntry(
  tx: Prisma.TransactionClient,
  { id, input, session, ipAddress }: UpdateFinancialEntryContext,
) {
  const { entries, orders } = await lockFinancialEntries(tx, [id]);
  const existing = entries[0];
  const order = existing.orderId ? orders.get(existing.orderId) : undefined;
  assertMutableEntry(existing, order);

  if (input.orderId !== undefined && input.orderId !== existing.orderId) {
    throw new ValidationError("O pedido do lançamento não pode ser alterado.");
  }
  if (input.cancellationOrderId !== undefined && input.cancellationOrderId !== existing.cancellationOrderId) {
    throw new ValidationError("O vínculo de cancelamento não pode ser alterado.");
  }
  if (order?.status === "CANCELLED" && input.type === "REVENUE") {
    throw new ConflictError("Não é permitido criar receita em um pedido cancelado.");
  }

  const data = {
    ...input,
    competenceDate: input.competenceDate === undefined
      ? undefined : parseEntryDate(input.competenceDate, existing.competenceDate),
    dueDate: input.dueDate == null ? input.dueDate : parseEntryDate(input.dueDate, existing.dueDate),
    cashDate: input.cashDate == null ? input.cashDate : parseEntryDate(input.cashDate, existing.cashDate),
  };
  delete data.orderId;
  delete data.cancellationOrderId;
  if (!existing.cancellationOrderId && input.status === "PENDING") data.cashDate = null;

  const changedFields = (Object.keys(data) as Array<keyof typeof data>).filter(
    (field) => data[field] !== undefined && !sameValue(data[field], existing[field]),
  );
  let refundedPaymentIds: string[] = [];

  if (existing.cancellationOrderId) {
    if (
      existing.type !== "REFUND" || !existing.orderId ||
      existing.cancellationOrderId !== existing.orderId || order?.status !== "CANCELLED"
    ) {
      throw new ConflictError("Vínculo do reembolso de cancelamento inconsistente.");
    }
    const accountingFields = ["type", "category", "amount", "competenceDate", "dueDate", "locationId", "costCenterId"];
    if (changedFields.some((field) => accountingFields.includes(field))) {
      throw new ValidationError("Os campos contábeis do reembolso de cancelamento não podem ser alterados.");
    }

    if (existing.status === "PAID") {
      if (changedFields.some((field) => ["status", "cashDate", "paymentMethod"].includes(field))) {
        throw new ConflictError("Um reembolso já baixado não pode ser reaberto nem ter sua baixa alterada.");
      }
    } else if (existing.status === "PENDING" && input.status === "PAID") {
      if (!input.paymentMethod || !input.cashDate || !data.cashDate || Number.isNaN(data.cashDate.getTime())) {
        throw new ValidationError("Informe a forma e a data da devolução efetiva para registrar a baixa.");
      }
      const payments = await tx.paymentTransaction.findMany({
        where: { orderId: existing.orderId, status: "REFUND_PENDING" },
        select: { id: true, grossAmount: true },
      });
      const refundTotal = payments.reduce((sum, payment) => sum + Number(payment.grossAmount), 0);
      if (payments.length === 0 || !paymentsCoverTotal(refundTotal, Number(existing.amount))) {
        throw new ConflictError("Os pagamentos a restituir não correspondem ao valor do reembolso. Concilie antes da baixa.");
      }
      refundedPaymentIds = payments.map((payment) => payment.id);
      // Apenas registro manual: não chama gateway nem altera o método dos recebimentos.
      const refunded = await tx.paymentTransaction.updateMany({
        where: { id: { in: refundedPaymentIds }, orderId: existing.orderId, status: "REFUND_PENDING" },
        data: { status: "REFUNDED" },
      });
      if (refunded.count !== payments.length) {
        throw new ConflictError("Os pagamentos foram alterados durante a baixa. Recarregue e confira os valores.");
      }
    } else if (changedFields.some((field) => ["cashDate", "paymentMethod"].includes(field))) {
      throw new ValidationError("A forma e a data da devolução só podem ser registradas junto com a baixa como Pago.");
    }
  } else if ((input.status ?? existing.status) === "PAID") {
    const paymentMethod = input.paymentMethod === undefined ? existing.paymentMethod : input.paymentMethod;
    const cashDate = data.cashDate === undefined ? existing.cashDate : data.cashDate;
    if (!paymentMethod || !cashDate || Number.isNaN(cashDate.getTime())) {
      throw new ValidationError("Data e forma de pagamento válidas são obrigatórias para um lançamento pago.");
    }
  }

  // Repetir a mesma baixa não regrava o lançamento, os pagamentos ou a auditoria.
  if (changedFields.length === 0) return existing;

  const updated = await tx.financialEntry.update({ where: { id }, data });
  await createAuditLogTx(tx, { session, ipAddress }, "UPDATE", "FinancialEntry", id, {
    ...input,
    ...(refundedPaymentIds.length > 0 && {
      manualRefund: true,
      from: "PENDING",
      to: "PAID",
      refundedPaymentIds,
    }),
  });
  return updated;
}

export async function deleteFinancialEntries(
  tx: Prisma.TransactionClient,
  { ids, session, ipAddress, bulk = false }: DeleteFinancialEntriesContext,
): Promise<number> {
  const { entries, orders } = await lockFinancialEntries(tx, ids);
  for (const entry of entries) {
    assertMutableEntry(entry, entry.orderId ? orders.get(entry.orderId) : undefined);
    if (entry.cancellationOrderId) {
      throw new ConflictError("Reembolsos de cancelamento não podem ser excluídos, nem em lote.");
    }
  }

  const result = await tx.financialEntry.updateMany({
    where: { id: { in: entries.map((entry) => entry.id) }, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  if (result.count !== entries.length) {
    throw new ConflictError("A seleção foi alterada. Nenhum lançamento foi excluído.");
  }
  for (const entry of entries) {
    await createAuditLogTx(tx, { session, ipAddress }, "DELETE", "FinancialEntry", entry.id, {
      description: entry.description,
      bulk,
    });
  }
  return result.count;
}