const { EscPosBuilder } = require('./escpos')
const { money, code128Bits } = require('./receipt-layout')
const { expandLabels, variantText, ean13Bits, labelStripRows, STRIP_WIDTH } = require('./label-layout')
const sharp = require('sharp')

// Inclui mais bordas suavizadas dos caracteres no bitmap de 1 bit. As barras já são preto/branco.
const STRIP_INK_THRESHOLD = 180

/** Etiquetas de 80 mm: uma por cópia, separadas por corte parcial. */
function buildProductLabels(labels) {
  const esc = new EscPosBuilder()
  for (const label of expandLabels(labels)) {
    esc.alignCenter().boldOn().wrapped(label.productName).boldOff()
    const variant = variantText(label)
    if (variant) esc.wrapped(variant)
    esc.boldOn().sizeDouble().line(money(label.price)).sizeNormal().boldOff().feed(1)
    if (ean13Bits(label.barcode)) {
      esc.barcodeEan13(label.barcode)
    } else if (label.barcode) {
      if (code128Bits(label.barcode)) esc.barcode128(label.barcode)
      esc.wrapped(label.barcode)
    }
    esc.wrapped(label.sku).alignLeft().cut()
  }
  return esc.toBuffer()
}

async function buildLabelStrip(labels) {
  const esc = new EscPosBuilder().alignCenter()
  const stride = STRIP_WIDTH / 8
  let bytes = 0
  for (const { svg, height } of labelStripRows(labels)) {
    bytes += stride * height
    if (bytes > 16 * 1024 * 1024 || height > 32000) throw new Error('Tira extensa demais. Divida o lote ou revise os textos da etiqueta.')
    const pixels = await sharp(Buffer.from(svg)).flatten({ background: 'white' }).greyscale().raw().toBuffer()
    if (pixels.length !== STRIP_WIDTH * height) throw new Error('Dimensões inválidas na imagem da etiqueta')
    // GS v 0: blocos de até 64 linhas não adicionam avanço nem corte entre as duplas.
    for (let y = 0; y < height; y += 64) {
      const lines = Math.min(64, height - y)
      const block = Buffer.alloc(stride * lines)
      for (let p = 0; p < STRIP_WIDTH * lines; p++) {
        if (pixels[y * STRIP_WIDTH + p] < STRIP_INK_THRESHOLD) block[p >> 3] |= 128 >> (p % 8)
      }
      esc.push(Buffer.from([29, 118, 48, 0, stride, 0, lines, 0])).push(block)
    }
  }
  return esc.cut().toBuffer()
}

module.exports = { buildProductLabels, buildLabelStrip }
