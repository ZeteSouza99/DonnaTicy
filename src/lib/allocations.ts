/** Rateio proporcional em centavos, com desempate estável pela ordem dos itens. */
export function allocateCents(total: number, weights: number[]): number[] {
  if (!Number.isSafeInteger(total) || total < 0 || weights.some((w) => !Number.isSafeInteger(w) || w < 0)) {
    throw new Error("Valores inválidos para rateio.");
  }
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum === 0) {
    if (total !== 0) throw new Error("Não é possível ratear um valor sem itens.");
    return weights.map(() => 0);
  }
  const denominator = BigInt(sum);
  const parts = weights.map((weight, index) => {
    const numerator = BigInt(total) * BigInt(weight);
    return { index, value: Number(numerator / denominator), rest: numerator % denominator };
  });
  let remaining = total - parts.reduce((n, p) => n + p.value, 0);
  for (const part of [...parts].sort((a, b) => a.rest === b.rest ? a.index - b.index : a.rest > b.rest ? -1 : 1)) {
    if (remaining-- <= 0) break;
    part.value++;
  }
  return parts.map((p) => p.value);
}

/** As parcelas sucessivas fecham exatamente no valor do item, inclusive em devoluções parciais. */
export function partialItemCents(total: number, quantity: number, returned: number, requested: number): number {
  if (![total,quantity,returned,requested].every(Number.isSafeInteger) || total < 0 || quantity <= 0 || returned < 0 || requested <= 0 || returned + requested > quantity) throw new Error("Quantidade inválida.");
  const cumulative = (count: number) => Number((BigInt(total) * BigInt(count) * BigInt(2) + BigInt(quantity)) / (BigInt(2) * BigInt(quantity)));
  return cumulative(returned + requested) - cumulative(returned);
}
