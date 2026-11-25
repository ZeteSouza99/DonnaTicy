const { EscPosBuilder } = require('./escpos')
const { money, code128Bits } = require('./receipt-layout')
const { expandLabels, variantText, ean13Bits } = require('./label-layout')

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

module.exports = { buildProductLabels }
