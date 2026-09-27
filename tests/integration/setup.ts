import { expect } from "vitest";
import { Prisma } from "@prisma/client";
import { integrationDatabaseUrl } from "./database";

// Executado antes de importar handlers que inicializam o Prisma.
integrationDatabaseUrl();

// Dinheiro vem do banco como Decimal: toEqual/toMatchObject comparam pelo valor numérico.
expect.addEqualityTesters([
  (a: unknown, b: unknown) => {
    if (Prisma.Decimal.isDecimal(a) && typeof b === "number") return a.equals(b);
    if (Prisma.Decimal.isDecimal(b) && typeof a === "number") return b.equals(a);
    return undefined;
  },
]);