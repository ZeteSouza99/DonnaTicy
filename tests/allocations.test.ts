import { describe, expect, it } from "vitest";
import { allocateCents, partialItemCents } from "@/lib/allocations";
import { comparableMonthEnd, startOfDayInZone } from "@/lib/date";

describe("rateio monetário", () => {
 it("conserva cada centavo em rateios desiguais", () => {
  for (let total = 0; total < 1000; total++) {
   const result = allocateCents(total,[1,3,7]); expect(result.reduce((a,b)=>a+b,0)).toBe(total);
   expect(result.every(Number.isSafeInteger)).toBe(true);
  }
 });
 it("devoluções parceladas não criam centavos", () => {
  expect([0,1,2].map(used => partialItemCents(100,3,used,1))).toEqual([33,34,33]);
 });
 it("arredonda fevereiro sem avançar para março", () => {
  expect(comparableMonthEnd(new Date("2026-03-31T16:00:00Z"),"America/Manaus").toISOString()).toBe("2026-02-28T16:00:00.000Z");
 });
 it("interpreta início do dia no fuso da loja", () => {
  expect(startOfDayInZone("2026-11-14","America/Manaus").toISOString()).toBe("2026-11-14T04:00:00.000Z");
 });
});
