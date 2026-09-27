import { Prisma } from "@prisma/client";

/** Compara por valor entradas da API com o que veio do banco (Decimal e Date inclusos). */
export function sameValue(value: unknown, existing: unknown): boolean {
  if (value instanceof Date && existing instanceof Date) {
    return value.getTime() === existing.getTime();
  }
  if (Prisma.Decimal.isDecimal(existing)) {
    return (typeof value === "number" || Prisma.Decimal.isDecimal(value)) && existing.equals(value as Prisma.Decimal.Value);
  }
  return value === existing;
}
