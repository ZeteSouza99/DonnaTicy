const { EscPosBuilder } = require('./escpos')

function formatCurrency(value) {
  return 'R$ ' + Number(value).toFixed(2).replace('.', ',')
}

function formatDateTime(dateStr) {
  const d = new Date(dateStr)
  const day = String(d.getDate()).padStart(2, '0')
  const mon = String(d.getMonth() + 1).padStart(2, '0')
  const year = d.getFullYear()
  const hour = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${day}/${mon}/${year} ${hour}:${min}`
}

function storeHeader(esc, store) {
  esc.alignCenter().boldOn().sizeDouble()
  esc.line(store.storeName || 'Loja')
  esc.sizeNormal().boldOff()
  if (store.storeCnpj) esc.line(`CNPJ: ${store.storeCnpj}`)
  if (store.storeAddress) esc.line(store.storeAddress)
  if (store.storePhone) esc.line(`Tel: ${store.storePhone}`)
  esc.alignLeft()
}

function storeFooter(esc, store) {
  if (!store.receiptFooter) return
  const lines = String(store.receiptFooter).split('\n').map(l => l.trim()).filter(Boolean)
  if (lines.length === 0) return
  esc.alignCenter()
  for (const line of lines) esc.line(line)
  esc.alignLeft()
}

/**
 * Comprovante de venda do ERP.
 * data: { code, createdAt, sellerName?, customerName?, items: [{ name, quantity, unitPrice, totalPrice }],
 *         subtotal, discountTotal, total, payments: [{ label, amount, installments? }], change? }
 */
function buildSaleReceipt(sale, store) {
  const esc = new EscPosBuilder()

  storeHeader(esc, store)
  esc.dashedLine()

  esc.alignCenter().boldOn()
  esc.line('COMPROVANTE DE VENDA')
  esc.line('SEM VALOR FISCAL')
  esc.boldOff().alignLeft()

  esc.leftRight(`Venda ${sale.code}`, formatDateTime(sale.createdAt))
  if (sale.sellerName) esc.leftRight('Vendedor:', sale.sellerName)
  if (sale.customerName) esc.leftRight('Cliente:', sale.customerName)

  esc.dashedLine()

  esc.boldOn().line('ITENS').boldOff()

  for (const item of sale.items || []) {
    esc.line(item.name || 'Produto')
    esc.leftRight(
      `  ${item.quantity}x ${formatCurrency(item.unitPrice)}`,
      formatCurrency(item.totalPrice),
    )
  }

  esc.dashedLine()

  esc.leftRight('Subtotal', formatCurrency(sale.subtotal))
  if (Number(sale.discountTotal) > 0) {
    esc.leftRight('Desconto', `-${formatCurrency(sale.discountTotal)}`)
  }

  esc.boldOn().sizeDoubleHeight()
  esc.leftRight('TOTAL', formatCurrency(sale.total))
  esc.sizeNormal().boldOff()

  esc.dashedLine()

  esc.boldOn().line('PAGAMENTO').boldOff()
  for (const p of sale.payments || []) {
    const label = p.installments > 1 ? `${p.label} ${p.installments}x` : p.label
    esc.leftRight(label, formatCurrency(p.amount))
  }
  if (Number(sale.change) > 0) {
    esc.boldOn()
    esc.leftRight('Troco', formatCurrency(sale.change))
    esc.boldOff()
  }

  esc.dashedLine()

  esc.alignCenter()
  esc.line('Obrigado pela preferencia!')
  esc.alignLeft()

  storeFooter(esc, store)

  esc.cut()

  return esc.toBuffer()
}

module.exports = { buildSaleReceipt }
