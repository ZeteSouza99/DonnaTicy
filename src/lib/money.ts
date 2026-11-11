import type { Prisma } from "@prisma/client";

/**
 * Dinheiro em centavos inteiros: somas e comparações exatas, sem resíduo de ponto flutuante.
 * Sem dependências de servidor em tempo de execução, para servir também a client components.
 */
export function toCents(value: number | Prisma.Decimal): number {
  return Math.round(Number(value) * 100);
}

export function fromCents(cents: number): number {
  return cents / 100;
}
