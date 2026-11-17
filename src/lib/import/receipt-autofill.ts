import type { InvoiceDocument, ReceiptReview } from "./invoice-document";

type Options = { locations: { id: string }[]; collections: { id: string }[]; lines: { id: string }[] };
export function singleReceiptOptions(options?: Options | null) {
  const only = (items?: { id: string }[]) => items?.length === 1 ? items[0].id : "";
  return { locationId: only(options?.locations), collectionId: only(options?.collections), lineId: only(options?.lines) };
}

/** Completa apenas campos vazios de produtos novos; nunca altera quantidades ou vínculos. */
export function fillReceiptBlanks(doc: InvoiceDocument, review: ReceiptReview, values: { categoryId: string; color: string; size: string; multiplier: string }) {
  const factor = values.multiplier.trim() ? Number(values.multiplier.replace(",", ".")) : null;
  if (factor !== null && (!Number.isFinite(factor) || factor <= 0)) throw new Error("Informe um multiplicador maior que zero ou deixe o campo vazio.");
  const color = values.color.trim(), size = values.size.trim();
  if (color.length > 60 || size.length > 10) throw new Error("Use até 60 caracteres para cor e 10 para tamanho.");
  let changed = 0;
  const items = review.items.map(row => {
    if (!row.allocations.some(a => !a.variantId)) return row;
    let categoryId = row.categoryId, salePrice = row.salePrice;
    if (!categoryId.trim() && values.categoryId) { categoryId = values.categoryId; changed++; }
    if (salePrice === 0 && factor !== null) {
      const item = doc.items.find(i => i.line === row.line);
      if (!item || item.quantity <= 0 || doc.productsTotal <= 0) throw new Error("Confira os custos e quantidades da nota antes de calcular os preços.");
      salePrice = Math.round(doc.invoiceTotal * item.total / doc.productsTotal / item.quantity * factor * 100) / 100;
      if (!Number.isFinite(salePrice) || salePrice <= 0 || salePrice > 99_999_999) throw new Error("O multiplicador resultou em um preço inválido. Confira os valores.");
      changed++;
    }
    const allocations = row.allocations.map(a => {
      if (a.variantId) return a;
      const next = { ...a };
      if (!next.color.trim() && color) { next.color = color; changed++; }
      if (!next.size.trim() && size) { next.size = size; changed++; }
      return next;
    });
    return { ...row, categoryId, salePrice, allocations };
  });
  return { review: { ...review, items }, changed };
}
