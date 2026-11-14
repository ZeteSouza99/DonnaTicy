const { EscPosBuilder } = require('./escpos')
const { DEFAULT_EXCHANGE_POLICY, money, clean, itemName, receiptDetails, code128Bits, receiptDate } = require('./receipt-layout')

/** Modelo B: texto, variantes, abatimentos separados e Code 128 do pedido. */
function buildSaleReceipt(sale, store = {}) {
  const esc = new EscPosBuilder()
  const details = receiptDetails(sale)
  esc.alignCenter().boldOn().sizeDouble().wrapped(store.storeName || 'Donna Ticy', 21)
  esc.sizeNormal().boldOff().wrapped(store.storeTagline ?? 'MODA FITNESS')
  if (store.storeCnpj) esc.wrapped(`CNPJ: ${store.storeCnpj}`)
  if (store.storeAddress) esc.wrapped(store.storeAddress)
  if (store.storePhone) esc.wrapped(`Tel: ${store.storePhone}`)
  esc.alignLeft().dashedLine()
  esc.alignCenter().boldOn().line('COMPROVANTE DE VENDA').boldOff().line('NÃO É DOCUMENTO FISCAL')
  if (sale.reprint) esc.boldOn().line('2ª VIA').boldOff()
  esc.alignLeft().leftRight(`Pedido ${sale.code}`, receiptDate(sale.createdAt, store.timeZone))
  if (sale.sellerName) esc.leftRight('Vendedor(a):', sale.sellerName)
  if (sale.customerName) esc.leftRight('Cliente:', sale.customerName)
  esc.dashedLine().boldOn().leftRight('ITEM / QTD x UNIT', 'TOTAL').boldOff()
  for (const item of sale.items || []) {
    esc.wrapped(itemName(item))
    esc.leftRight(`${item.quantity} x ${money(item.unitPrice)}`, money(item.totalPrice))
  }
  esc.dashedLine().leftRight(details.subtotalLabel, money(sale.subtotal))
  for (const deduction of details.deductions) esc.leftRight(deduction.label, `-${money(deduction.amount)}`)
  esc.boldOn().sizeDoubleHeight().leftRight('TOTAL', money(sale.total)).sizeNormal().boldOff()
  esc.dashedLine().boldOn().line('PAGAMENTO').boldOff()
  for (const payment of sale.payments || []) {
    esc.leftRight(`${payment.label}${payment.installments > 1 ? ` ${payment.installments}x` : ''}`, money(payment.amount))
  }
  if (!sale.reprint && Number(sale.change) > 0) esc.boldOn().leftRight('Troco', money(sale.change)).boldOff()
  const policy = store.exchangePolicy ?? DEFAULT_EXCHANGE_POLICY
  if (policy) esc.dashedLine().alignCenter().boldOn().line('POLÍTICA DE TROCA').boldOff().alignLeft().wrapped(policy)
  esc.dashedLine().alignCenter()
  if (code128Bits(sale.code)) {
    esc.line('Apresente este código na troca:').feed(1).barcode128(sale.code)
  } else {
    esc.line('Código do pedido para troca:')
  }
  esc.wrapped(sale.code).feed(1).line('Obrigada pela preferência!')
  const instagram = store.instagram === undefined ? '@donnaticy' : store.instagram
  if (instagram) esc.wrapped(`@${clean(instagram).replace(/^@/, '')}`)
  if (store.receiptFooter) for (const line of String(store.receiptFooter).split('\n')) esc.wrapped(line)
  return esc.alignLeft().cut().toBuffer()
}

module.exports = { buildSaleReceipt }
