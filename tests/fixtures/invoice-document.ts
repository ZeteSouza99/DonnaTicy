import type { InvoiceDocument } from "../../src/lib/import/invoice-document";

// Dados sintéticos; nenhuma identificação da nota da cliente é armazenada no teste.
export function invoiceKey(number = 52) {
  const prefix = `3526101234567800019055001${String(number).padStart(9, "0")}100000001`;
  let sum = 0;
  for (let i = 42, weight = 2; i >= 0; i--, weight = weight === 9 ? 2 : weight + 1) sum += Number(prefix[i]) * weight;
  const rest = sum % 11;
  return prefix + (rest < 2 ? 0 : 11 - rest);
}

export function invoiceFixture(): InvoiceDocument {
  return {
    source: "xml", fileName: "nota-teste.xml", fileHash: "a".repeat(64),
    accessKey: invoiceKey(), number: "52", series: "1", supplierName: "Fornecedor Teste",
    supplierDocument: "12345678000190", issueDate: "2026-10-08", productsTotal: 100,
    freight: 10, discount: 0, invoiceTotal: 110,
    items: [{line: 1, code: "001", description: "Produto Teste", ncm: "62046900", unit: "PÇ", quantity: 4, unitPrice: 25, total: 100, barcode: ""}],
  };
}

export function danfeFixture() {
  const values = [[3,30],[8,30],[6,30],[5,30],[10,30],[6,30],[6,32.5],[5,37.5],[4,32.5],[8,32.5],[3,32.5],[2,32.5],[15,37.5],[10,32.5],[6,35],[6,36.5],[2,35],[1,35],[6,37.5],[6,37.5],[6,39],[6,35]];
  const br = (n: number, digits: number) => n.toLocaleString("pt-BR", {minimumFractionDigits: digits, maximumFractionDigits: digits});
  const rows = values.map(([qty, price], i) => `${String(i+1).padStart(2,"0")} PRODUTO EXEMPLO ${i+1} 62046900 0102 6101 PÇ ${br(qty,4)} ${br(price,4)} ${br(qty*price,2)} 0,00 0,00`);
  return {
    text: `RECEBEMOS DE Fornecedor Teste OS PRODUTOS CONSTANTES DA NOTA\n${invoiceKey().match(/.{4}/g)!.join(" ")}\nDATA DA EMISSÃO\n08/10/2026\nBASE DE CÁLCULO VALOR TOTAL DOS PRODUTOS\n0,00 0,00 0,00 0,00 4.390,50\nVALOR DO FRETE SEGURO DESCONTO OUTRAS DESPESAS IPI VALOR TOTAL DA NOTA\n355,76 0,00 0,00 0,00 0,00 4.746,26\nDADOS DOS PRODUTOS\n${rows.slice(0,14).join("\n")}\nPÁGINA 2\nDADOS DOS PRODUTOS\n${rows.slice(14).join("\n")}`,
    rows,
  };
}
