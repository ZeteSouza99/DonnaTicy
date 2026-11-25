import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { ean13Bits, expandLabels, renderProductLabelsHtml, type ProductLabelData } from '../print-service/label-layout';
import { encodeEan13 } from '../src/lib/barcode';

const requireLocal = createRequire(import.meta.url);
const { buildProductLabels } = requireLocal('../print-service/label-builder') as {
  buildProductLabels: (labels: ProductLabelData[]) => Buffer;
};
const strip = requireLocal('../print-service/label-builder') as {
  buildLabelStrip: (labels: ProductLabelData[]) => Promise<Buffer>;
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

  it('monta pares sem inventar cópia ímpar e mantém preço e texto escapado', () => {
    const html = renderProductLabelsHtml([legging, { ...top, productName: '<img src=x>' }]);
    expect(html.match(/<svg\b/g)).toHaveLength(2);
    expect(html.match(/LEG-PRE-M/g)).toHaveLength(2);
    expect(html.match(/TOP-01/g)).toHaveLength(1);
    expect(html).toContain('R$ 189,90');
    expect(html).toContain('Preto · M');
    expect(html).toContain('2000000012346');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });

  it('rasteriza seis EAN em três duplas, com vão branco de 3 mm e um só corte', async () => {
    const raw = await strip.buildLabelStrip([{ ...legging, copies: 6 }]);
    const start = Buffer.from([0x1d, 0x76, 0x30, 0]);
    let pos = raw.indexOf(start);
    expect(pos).toBeGreaterThanOrEqual(0);
    const chunks: Buffer[] = [];
    while (raw.subarray(pos, pos + 4).equals(start)) {
      expect(raw.readUInt16LE(pos + 4)).toBe(72);
      const length = 72 * raw.readUInt16LE(pos + 6);
      expect(length).toBeGreaterThan(0);
      chunks.push(raw.subarray(pos + 8, pos + 8 + length));
      pos += 8 + length;
    }
    expect(raw.subarray(pos)).toEqual(Buffer.concat([Buffer.from([27, 100, 3]), CUT]));
    const ink = Buffer.concat(chunks);
    const dot = (x: number, y: number) => (ink[y * 72 + (x >> 3)] & (128 >> (x % 8))) !== 0 ? '1' : '0';
    const modules = '0'.repeat(11) + encodeEan13('2000000012346') + '0'.repeat(10);
    const expected = [...modules].map(bit => bit + bit).join('');
    let runs = 0, reading = false, blackRows = 0;
    for (let y = 0; y < ink.length / 72; y++) {
      for (let x = 276; x < 300; x++) if (dot(x, y) !== '0') throw Error('Vão de corte invadido');
      const matches = [22, 322].every(x => Array.from({ length: 232 }, (_, i) => dot(x + i, y)).join('') === expected);
      if (matches && !reading) runs++;
      if (matches) blackRows++;
      reading = matches;
    }
    expect(runs).toBe(3);
    expect(blackRows).toBe(3 * 80);
  });

  it('aumenta a altura com o nome e preserva Code 128 longo sem estreitar as barras', () => {
    const compact = renderProductLabelsHtml([top]);
    const long = renderProductLabelsHtml([{ ...top, productName: 'Peça '.repeat(35) + 'FINAL', barcode: 'FORNECEDOR-123456789' }]);
    const height = (s: string) => Number(/viewBox="0 0 576 (\d+)"/.exec(s)?.[1]);
    expect(height(long)).toBeGreaterThan(height(compact));
    expect(long).toContain('FINAL');
    expect(long).toContain('FORNECEDOR-123456789');
    expect(long).toMatch(/rotate\(90\)/);
  });

  it('mantém o vão da tesoura livre quando a fonte usa glifos de largura dupla', async () => {
    const raw = await strip.buildLabelStrip([{ ...top, productName: 'ＬＥＧＧＩＮＧ　ＥＳＰＯＲＴＩＶＡ', copies: 2 }]);
    const header = Buffer.from([29, 118, 48, 0]);
    let at = raw.indexOf(header);
    expect(at).toBeGreaterThanOrEqual(0);
    while (raw.subarray(at, at + 4).equals(header)) {
      const lines = raw.readUInt16LE(at + 6);
      for (let y = 0; y < lines; y++) {
        const start = at + 8 + y * 72;
        for (let x = 276; x < 300; x++) {
          if (raw[start + (x >> 3)] & (128 >> (x % 8))) throw Error('Texto atravessou a margem da coluna');
        }
      }
      at += 8 + lines * 72;
    }
  });
});
