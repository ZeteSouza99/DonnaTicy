import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { ean13Bits, expandLabels, renderProductLabelsHtml, type ProductLabelData } from '../print-service/label-layout';
import { encodeEan13 } from '../src/lib/barcode';
import {
  defaultCopiesForStock,
  defaultLabelCopies,
  prepareLabelsForPrint,
  totalStockQuantity,
} from '../src/lib/label-copies';

const requireLocal = createRequire(import.meta.url);
const { buildProductLabels } = requireLocal('../print-service/label-builder') as {
  buildProductLabels: (labels: ProductLabelData[]) => Buffer;
};
const iconv = requireLocal('iconv-lite') as { decode: (data: Buffer, encoding: string) => string };

const legging: ProductLabelData = {
  productName: 'Legging Compressão Zíper', colorName: 'Preto', sizeName: 'M',
  price: 189.9, barcode: '2000000012346', sku: 'LEG-PRE-M', copies: 2,
};
const top: ProductLabelData = { productName: 'Top Nadador', price: 89.9, barcode: null, sku: 'TOP-01' };
const CUT = Buffer.from([0x1d, 0x56, 0x42, 0x03]);

function count(haystack: Buffer, needle: Buffer): number {
  let total = 0;
  for (let i = haystack.indexOf(needle); i !== -1; i = haystack.indexOf(needle, i + 1)) total++;
  return total;
}

describe('etiqueta de produto 80 mm', () => {
  it('expande as cópias e valida a entrada antes de imprimir', () => {
    expect(expandLabels([legging, top]).map((l) => l.sku)).toEqual(['LEG-PRE-M', 'LEG-PRE-M', 'TOP-01']);
    expect(() => expandLabels([])).toThrow();
    expect(() => expandLabels([{ ...legging, copies: 100 }])).toThrow();
    expect(() => expandLabels([{ ...legging, copies: 1.5 }])).toThrow();
    expect(() => expandLabels([{ ...legging, productName: ' ' }])).toThrow();
    expect(() => expandLabels([{ ...legging, price: -1 }])).toThrow();
    expect(() => expandLabels(Array.from({ length: 6 }, () => ({ ...legging, copies: 99 })))).toThrow(/500/);
  });

  it('desenha o EAN-13 igual ao componente da tela', () => {
    expect(ean13Bits('2000000012346')).toBe(encodeEan13('2000000012346'));
    expect(ean13Bits('2000000012347')).toBeNull();
    expect(ean13Bits('ABC')).toBeNull();
  });

  it('imprime nome, variante, preço, EAN-13 e SKU com um corte por etiqueta', () => {
    const raw = buildProductLabels([legging, top]);
    const decoded = iconv.decode(raw, 'cp850');
    for (const text of ['Legging Compressão Zíper', 'Preto · M', 'R$ 189,90', 'LEG-PRE-M', 'R$ 89,90', 'TOP-01']) {
      expect(decoded).toContain(text);
    }
    const ean = Buffer.concat([Buffer.from([0x1d, 0x6b, 67, 12]), Buffer.from('200000001234', 'ascii')]);
    expect(count(raw, ean)).toBe(2);
    expect(count(raw, CUT)).toBe(3);
    expect(raw.subarray(-4)).toEqual(CUT);
  });

  it('usa Code 128 para código que não é EAN-13 e não injeta comandos', () => {
    const raw = buildProductLabels([{ ...top, barcode: 'FORN-778', productName: 'Top\x1b@' }]);
    expect(raw.includes(Buffer.from([0x1d, 0x6b, 73]))).toBe(true);
    expect(raw.includes(Buffer.from([0x1d, 0x6b, 67]))).toBe(false);
    expect(raw.indexOf(Buffer.from([0x1b, 0x40]), 2)).toBe(-1);
  });

  it('gera uma página HTML de 80 mm por cópia, com preço e texto escapado', () => {
    const html = renderProductLabelsHtml([legging, { ...top, productName: '<img src=x>' }]);
    expect(html.match(/class="print-label"/g)).toHaveLength(3);
    expect(html).toContain('R$ 189,90');
    expect(html).toContain('Preto · M');
    expect(html).toContain('2000000012346');
    expect(html.match(/<svg/g)).toHaveLength(2);
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });
});

describe('cópias de etiquetas conforme quantidade cadastrada', () => {
  it('usa a quantidade cadastrada de cada variante e omite tamanhos zerados quando há estoque', () => {
    expect(defaultLabelCopies([3])).toEqual([3]);
    expect(defaultLabelCopies([0, 3, 2])).toEqual([0, 3, 2]);
    expect(defaultLabelCopies([150])).toEqual([99]);
  });

  it('mantém 1 cópia por variante quando nenhuma tem quantidade cadastrada', () => {
    expect(defaultLabelCopies([0, 0])).toEqual([1, 1]);
  });

  it('soma estoque entre posições e aplica fallback para seleção avulsa', () => {
    expect(totalStockQuantity([{ quantity: 2 }, { quantity: 1 }])).toBe(3);
    expect(totalStockQuantity([])).toBe(0);
    expect(defaultCopiesForStock(3)).toBe(3);
    expect(defaultCopiesForStock(0)).toBe(1);
    expect(defaultCopiesForStock(120)).toBe(99);
  });

  it('prepara apenas etiquetas com cópias > 0 prontas para expandLabels', () => {
    const ready = prepareLabelsForPrint([
      { ...legging, sku: 'CAMISA-AZUL-P', sizeName: 'P', copies: 0 },
      { ...legging, sku: 'CAMISA-AZUL-M', sizeName: 'M', copies: 3 },
    ]);
    expect(ready).toHaveLength(1);
    expect(ready[0]).toMatchObject({ sku: 'CAMISA-AZUL-M', copies: 3 });
    expect(expandLabels(ready).map((l) => l.sku)).toEqual([
      'CAMISA-AZUL-M',
      'CAMISA-AZUL-M',
      'CAMISA-AZUL-M',
    ]);
  });
});
