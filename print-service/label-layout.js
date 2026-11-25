// Etiqueta de produto compartilhada pelo navegador e pelo serviço ESC/POS. Sem APIs de Node.
const { money, clean } = require('./receipt-layout')

const MAX_COPIES = 99
const MAX_LABELS = 500
const escape = (value) => clean(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

/** Valida a lista recebida e devolve uma etiqueta por cópia, na ordem pedida. */
function expandLabels(labels) {
  if (!Array.isArray(labels) || labels.length === 0) throw new Error('Nenhuma etiqueta para imprimir')
  const result = []
  for (const label of labels) {
    const copies = label.copies ?? 1
    if (!Number.isInteger(copies) || copies < 1 || copies > MAX_COPIES) throw new Error(`Cópias devem ficar entre 1 e ${MAX_COPIES}`)
    if (!clean(label.productName) || !clean(label.sku)) throw new Error('Etiqueta sem nome ou SKU')
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

function barcodeSvg(value) {
  const bits = ean13Bits(value)
  if (!bits) return ''
  const bars = []
  for (let x = 0; x < bits.length; x++) {
    if (bits[x] === '1') bars.push(`<rect x="${x}" y="0" width="1" height="40"/>`)
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Código de barras ${value}" viewBox="0 0 95 40" width="36mm" height="12mm" preserveAspectRatio="none" style="display:block;shape-rendering:crispEdges"><rect width="95" height="40" fill="white"/><g fill="black">${bars.join('')}</g></svg>`
}

/** Uma página de 80 x 50 mm por cópia; o CSS de impressão define o tamanho da página. */
function renderProductLabelsHtml(labels) {
  return expandLabels(labels).map((label) => {
    const variant = variantText(label)
    const svg = barcodeSvg(label.barcode)
    const code = svg
      ? `${svg}<div style="font:11px/1 'Courier New',monospace;letter-spacing:1px">${escape(label.barcode)}</div>`
      : label.barcode ? `<div style="font:12px 'Courier New',monospace">${escape(label.barcode)}</div>` : ''
    return `<div class="print-label" style="box-sizing:border-box;width:80mm;height:50mm;padding:3mm 4mm;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1mm;overflow:hidden;text-align:center;font-family:Arial,Helvetica,sans-serif;color:black;background:white">
      <div style="font-size:13px;font-weight:bold;line-height:1.2;max-height:2.4em;overflow:hidden">${escape(label.productName)}</div>
      ${variant ? `<div style="font-size:11px">${escape(variant)}</div>` : ''}
      <div style="font-size:24px;font-weight:bold;line-height:1.1">${escape(money(label.price))}</div>
      ${code}
      <div style="font:10px 'Courier New',monospace">${escape(label.sku)}</div>
    </div>`
  }).join('')
}

module.exports = { MAX_COPIES, MAX_LABELS, expandLabels, variantText, ean13Bits, renderProductLabelsHtml }
