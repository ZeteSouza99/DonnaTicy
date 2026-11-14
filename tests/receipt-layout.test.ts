import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { code128Bits, receiptDetails, renderReceiptHtml, type SaleReceiptData } from '../print-service/receipt-layout';

const requireLocal = createRequire(import.meta.url);
const { buildSaleReceipt } = requireLocal('../print-service/receipt-builder') as {
  buildSaleReceipt: (sale: SaleReceiptData, store?: Record<string, string>) => Buffer;
};
const iconv = requireLocal('iconv-lite') as { decode: (data: Buffer, encoding: string) => string };
const sale: SaleReceiptData = {
  code: 'PED-2611-A7K2QZ', createdAt: '2026-11-13T01:40:00Z',
  sellerName: 'Ana Paula', customerName: 'Maria Souza',
  items: [
    { name: 'Legging Compressão Zíper', color: 'Preto', size: 'M', quantity: 1, unitPrice: 189.9, totalPrice: 189.9 },
    { name: 'Top Nadador Flor', color: 'Rosa', size: 'P', quantity: 2, unitPrice: 89.9, totalPrice: 179.8 },
    { name: 'Shorts Saia Fitness', color: 'Verde Oliva', size: 'G', quantity: 1, unitPrice: 119.9, totalPrice: 119.9 },
  ],
  subtotal: 489.6, discountTotal: 98.96, total: 390.64,
  couponCode: 'BEMVINDA10', couponDiscount: 48.96,
  storeCreditCode: 'VLT-2610-K3M9Q1', usedStoreCreditAmount: 50,
  payments: [{ label: 'Dinheiro', amount: 210 }, { label: 'Crédito', amount: 190.64, installments: 2 }], change: 10,
};

describe('recibo modelo B', () => {
  it('concilia cupom, vale e total sem descontar o vale duas vezes', () => {
    const result = receiptDetails(sale);
    expect(result.subtotalLabel).toBe('Subtotal (4 peças)');
    expect(result.deductions).toEqual([
      { label: 'Cupom BEMVINDA10', amount: 48.96 },
      { label: 'Vale-troca VLT-2610-K3M9Q1', amount: 50 },
    ]);
    expect(Math.round((sale.subtotal - result.deductions.reduce((sum, d) => sum + d.amount, 0)) * 100)).toBe(39064);
    expect(sale.payments.reduce((sum, p) => sum + p.amount, 0) - sale.change!).toBe(sale.total);
  });
  it('preserva desconto manual adicional e pedidos antigos sem detalhamento', () => {
    expect(receiptDetails({ ...sale, discountTotal: 108.96 }).deductions[1]).toEqual({ label: 'Desconto', amount: 10 });
    expect(receiptDetails({ ...sale, couponCode: undefined, couponDiscount: undefined, usedStoreCreditAmount: undefined }).deductions).toEqual([{ label: 'Desconto', amount: 98.96 }]);
  });
  it('renderiza variantes, política, pagamentos e barcode nos dois formatos', () => {
    const html = renderReceiptHtml(sale);
    const raw = buildSaleReceipt(sale);
    const decoded = iconv.decode(raw, 'cp850');
    for (const text of ['Preto/M', 'Subtotal (4 peças)', 'Cupom BEMVINDA10', 'POLÍTICA DE TROCA', 'Crédito 2x', 'R$ 210,00', 'R$ 10,00', '@donnaticy']) {
      expect(html).toContain(text);
      expect(decoded).toContain(text);
    }
    expect(html).toContain('<svg');
    const barcode = Buffer.from('{B' + sale.code, 'ascii');
    expect(raw.includes(Buffer.concat([Buffer.from([0x1d, 0x6b, 73, barcode.length]), barcode]))).toBe(true);
    expect(raw.subarray(-4)).toEqual(Buffer.from([0x1d, 0x56, 0x42, 0x03]));
    expect(decoded).toContain('12/11/2026 21:40');
  });
  it('gera Code128 B com checksum conhecido, margens e limite de largura', () => {
    const widths = ['211214', '111323', '131123', '411131', '2331112'];
    const expected = '0'.repeat(10) + widths.map((w) => [...w].map((n, i) => (i % 2 ? '0' : '1').repeat(Number(n))).join('')).join('') + '0'.repeat(10);
    expect(code128Bits('AB')).toBe(expected);
    expect(code128Bits('A'.repeat(20))!.length * 2).toBeLessThanOrEqual(576);
    expect(code128Bits('A'.repeat(21))).toBeNull();
    expect(code128Bits('PED\x1b@')).toBeNull();
  });
  it('escapa conteúdo HTML e impede comandos de impressora em texto', () => {
    const input = { ...sale, customerName: '<img src=x onerror=alert(1)>\x1b@' };
    expect(renderReceiptHtml(input)).not.toContain('<img');
    expect(renderReceiptHtml(input)).toContain('&lt;img');
    const raw = buildSaleReceipt(input);
    expect(raw.indexOf(Buffer.from([0x1b, 0x40]), 2)).toBe(-1);
  });
  it('omite política vazia, respeita singular e não imprime troco em segunda via', () => {
    const input = { ...sale, items: [sale.items[0]], reprint: true };
    const html = renderReceiptHtml(input, { exchangePolicy: '', instagram: '' });
    expect(html).toContain('Subtotal (1 peça)');
    expect(html).toContain('2ª VIA');
    expect(html).not.toContain('Troco');
    expect(html).not.toContain('POLÍTICA DE TROCA');
  });
});
