// Etiqueta de produto compartilhada pelo navegador e pelo serviço ESC/POS. Sem APIs de Node.
const { money, clean, code128Bits } = require('./receipt-layout')

const MAX_COPIES = 99
const MAX_LABELS = 500
const escape = (value) => clean(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

/** Valida a lista recebida e devolve uma etiqueta por cópia, na ordem pedida. */
function expandLabels(labels) {
  if (!Array.isArray(labels) || labels.length === 0) throw new Error('Nenhuma etiqueta para imprimir')
  const result = []
  for (const label of labels) {
    if (!label || typeof label !== 'object' || Array.isArray(label)) throw new Error('Etiqueta inválida')
    const copies = label.copies ?? 1
    if (!Number.isInteger(copies) || copies < 1 || copies > MAX_COPIES) throw new Error(`Cópias devem ficar entre 1 e ${MAX_COPIES}`)
    if (typeof label.productName !== 'string' || !clean(label.productName) ||
        typeof label.sku !== 'string' || !clean(label.sku)) throw new Error('Etiqueta sem nome ou SKU')
    if ([label.colorName, label.sizeName, label.barcode].some(v => v != null && typeof v !== 'string')) throw new Error('Variante ou código de barras inválido')
    if (typeof label.price !== 'number' || !Number.isFinite(label.price) || label.price < 0) throw new Error('Preço inválido na etiqueta')
    for (let i = 0; i < copies; i++) result.push(label)
    if (result.length > MAX_LABELS) throw new Error(`Limite de ${MAX_LABELS} etiquetas por impressão`)
  }
  return result
}

function variantText(label) {
  return [label.colorName, label.sizeName].map(clean).filter(Boolean).join(' · ')
}

const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011']
const G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111']
const R = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100']
const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL']

/** Barras do EAN-13 (95 módulos), ou null se o código não tiver 13 dígitos com DV correto. */
function ean13Bits(value) {
  if (typeof value !== 'string' || !/^\d{13}$/.test(value)) return null
  const d = Array.from(value, Number)
  const sum = d.slice(0, 12).reduce((total, digit, i) => total + digit * (i % 2 ? 3 : 1), 0)
  if ((10 - (sum % 10)) % 10 !== d[12]) return null
  const left = d.slice(1, 7).map((digit, i) => (PARITY[d[0]][i] === 'L' ? L : G)[digit]).join('')
  return `101${left}01010${d.slice(7).map((digit) => R[digit]).join('')}101`
}

// A cabeça imprime 8 pontos/mm. Sobram 72 mm úteis na bobina de 80 mm.
const STRIP_WIDTH = 576
const GAP = 24
const CARD = (STRIP_WIDTH - GAP) / 2
const TEXT_WIDTH = CARD - 16

function textLines(value, limit) {
  const lines = []
  let line = ''
  let used = 0
  const cells = char => char.codePointAt(0) > 255 ? 2 : 1
  for (const word of clean(value).split(/\s+/)) {
    const width = Array.from(word).reduce((sum, ch) => sum + cells(ch), 0)
    if (line) {
      if (used + 1 + width > limit) {
        lines.push(line)
        line = ''
        used = 0
      } else {
        line += ' '
        used++
      }
    }
    for (const ch of word) {
      if (used + cells(ch) > limit) {
        lines.push(line)
        line = ''
        used = 0
      }
      line += ch
      used += cells(ch)
    }
  }
  if (line) lines.push(line)
  return lines
}

function cardContent(label) {
  let y = 0
  const parts = []
  function text(value, size, bold = false) {
    for (const line of textLines(value, Math.floor(TEXT_WIDTH / (size * 0.62)))) {
      parts.push(`<text x="${CARD / 2}" y="${y + size}" font-size="${size}"${bold ? ' font-weight="bold"' : ''}>${escape(line)}</text>`)
      y += size + 3
    }
    y += 4
  }
  text(label.productName, 24, true)
  const variant = variantText(label)
  if (variant) text(variant, 20, true)
  const price = money(label.price)
  const priceSize = Math.min(40, Math.max(24, Math.floor(TEXT_WIDTH / (price.length * 0.62))))
  text(price, priceSize, true)
  y += 4
  const ean = ean13Bits(label.barcode)
  const bits = ean ? '0'.repeat(11) + ean + '0'.repeat(10) : code128Bits(label.barcode)
  if (bits) {
    const width = bits.length * 2
    // Girar um Code 128 largo preserva os módulos de dois pontos e as margens do leitor.
    const rotate = width > CARD - 8
    const x = rotate ? CARD / 2 + 40 : Math.floor((CARD - width) / 2)
    const bars = [...bits.matchAll(/1+/g)].map(m => `M${m.index * 2} 0h${m[0].length * 2}v80h-${m[0].length * 2}z`).join(' ')
    parts.push(`<path shape-rendering="crispEdges" transform="translate(${x} ${y})${rotate ? ' rotate(90)' : ''}" d="${bars}"/>`)
    y += (rotate ? width : 80) + 2
  }
  if (label.barcode) text(label.barcode, 20)
  text(label.sku, 19, true)
  return { height: y, svg: parts.join('') }
}

function* labelStripRows(labels) {
  const copies = expandLabels(labels)
  for (let i = 0; i < copies.length; i += 2) {
    const cards = copies.slice(i, i + 2).map(cardContent)
    const inner = Math.max(...cards.map(c => c.height))
    const inset = 26
    const height = inner + 2 * inset
    const contents = cards.map((c, column) => {
      const top = inset + Math.floor((inner - c.height) / 2)
      return `<g transform="translate(${column * (CARD + GAP)} 0)"><rect x="1" y="8" width="${CARD - 2}" height="${height - 16}" rx="12" fill="white" stroke="black" stroke-width="2"/><g transform="translate(0 ${top})">${c.svg}</g></g>`
    }).join('')
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${STRIP_WIDTH}" height="${height}" viewBox="0 0 ${STRIP_WIDTH} ${height}" font-family="Courier New, monospace" text-anchor="middle"><rect width="100%" height="100%" fill="white"/>${contents}</svg>`
    yield { height, svg }
  }
}

function renderProductLabelsHtml(labels) {
  return Array.from(labelStripRows(labels), row => `<div class="print-label-row">${row.svg}</div>`).join('')
}

module.exports = { MAX_COPIES, MAX_LABELS, STRIP_WIDTH, expandLabels, variantText, ean13Bits, labelStripRows, renderProductLabelsHtml }
