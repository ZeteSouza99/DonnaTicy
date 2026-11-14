// Modelo B compartilhado pelo navegador e pelo serviço ESC/POS. Sem APIs de Node.
const DEFAULT_EXCHANGE_POLICY = 'Trocas em até 30 dias, com este comprovante e a peça com etiqueta, sem sinais de uso. Peças em promoção não têm troca.'
const cents = (value) => Math.round(Number(value || 0) * 100)
const money = (value) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/\u00a0/g, ' ')
const clean = (value) => String(value ?? '').replace(/[\x00-\x1f\x7f]/g, ' ').trim()
const escape = (value) => clean(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

function itemName(item) {
  const variant = [item.color, item.size].filter(Boolean).map(clean).join('/')
  return clean(item.name || 'Produto') + (variant ? ` - ${variant}` : '')
}

function receiptDetails(sale) {
  const credit = Math.min(Math.max(cents(sale.usedStoreCreditAmount), 0), Math.max(cents(sale.discountTotal), 0))
  const discount = Math.max(cents(sale.discountTotal) - credit, 0)
  const coupon = sale.couponDiscount == null ? null : Math.min(Math.max(cents(sale.couponDiscount), 0), discount)
  const deductions = []
  if (coupon === null && discount > 0) {
    deductions.push({ label: sale.couponCode ? `Cupom / desconto ${clean(sale.couponCode)}` : 'Desconto', amount: discount / 100 })
  } else {
    if (coupon > 0) deductions.push({ label: `Cupom ${clean(sale.couponCode)}`.trim(), amount: coupon / 100 })
    if (discount - (coupon || 0) > 0) deductions.push({ label: 'Desconto', amount: (discount - (coupon || 0)) / 100 })
  }
  if (credit > 0) deductions.push({ label: `Vale-troca ${clean(sale.storeCreditCode)}`.trim(), amount: credit / 100 })
  const pieces = (sale.items || []).reduce((sum, item) => sum + Number(item.quantity), 0)
  return { deductions, subtotalLabel: `Subtotal (${pieces} ${pieces === 1 ? 'peça' : 'peças'})` }
}

// Larguras alternadas de barras/espaços de cada símbolo Code 128 (ISO/IEC 15417).
const CODE128 = ('212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 123122 123221 223211 221132 221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 232121 111323 131123 131321 112313 132113 132311 211313 231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 314111 221411 431111 111224 111422 121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 114131 311141 411131 211412 211214 211232 2331112').split(' ')

function code128Bits(value) {
  // Limite de largura: 20 caracteres, módulo de 2 pontos e margens na bobina de 80 mm.
  if (typeof value !== 'string' || !/^[\x20-\x7e]{1,20}$/.test(value)) return null
  const data = Array.from(value, (c) => c.charCodeAt(0) - 32)
  const checksum = (104 + data.reduce((sum, symbol, i) => sum + symbol * (i + 1), 0)) % 103
  return '0'.repeat(10) + [104, ...data, checksum, 106].map((symbol) =>
    [...CODE128[symbol]].map((width, index) => (index % 2 ? '0' : '1').repeat(Number(width))).join('')
  ).join('') + '0'.repeat(10)
}

function barcodeSvg(value) {
  const bits = code128Bits(value)
  if (!bits) return ''
  const bars = []
  for (let x = 0; x < bits.length; x++) {
    if (bits[x] === '1') bars.push(`<rect x="${x}" y="0" width="1" height="54"/>`)
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Código de barras ${escape(value)}" viewBox="0 0 ${bits.length} 54" width="${bits.length * 0.25}mm" height="15mm" style="display:block;margin:2mm auto;max-width:100%;shape-rendering:crispEdges"><rect width="${bits.length}" height="54" fill="white"/><g fill="black">${bars.join('')}</g></svg>`
}

function receiptDate(value, timeZone = 'America/Manaus') {
  return new Date(value).toLocaleString('pt-BR', { timeZone, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', '')
}

function renderReceiptHtml(sale, store = {}) {
  const details = receiptDetails(sale)
  const row = (left, right, bold = false) => `<div style="display:flex;justify-content:space-between;gap:2mm;${bold ? 'font-weight:bold;' : ''}"><span style="overflow-wrap:anywhere">${escape(left)}</span><span style="white-space:nowrap">${escape(right)}</span></div>`
  const center = (text, bold = false) => `<div style="text-align:center;${bold ? 'font-weight:bold;' : ''}">${escape(text)}</div>`
  const divider = '<hr style="border:0;border-top:1px dashed black;margin:2mm 0"/>'
  const policy = store.exchangePolicy ?? DEFAULT_EXCHANGE_POLICY
  const instagram = store.instagram === undefined ? '@donnaticy' : store.instagram
  const barcode = barcodeSvg(sale.code)
  return `<div class="print-receipt" style="font:11px/1.3 'Courier New',monospace;color:black;background:white;overflow-wrap:anywhere">
    <div style="text-align:center;font-size:22px;font-weight:bold">${escape(store.storeName || 'Donna Ticy')}</div>
    ${center(store.storeTagline ?? 'MODA FITNESS')}
    ${store.storeCnpj ? center(`CNPJ: ${store.storeCnpj}`) : ''}
    ${store.storeAddress ? center(store.storeAddress) : ''}${store.storePhone ? center(`Tel: ${store.storePhone}`) : ''}
    ${divider}${center('COMPROVANTE DE VENDA', true)}${center('NÃO É DOCUMENTO FISCAL')}
    ${sale.reprint ? center('2ª VIA', true) : ''}
    ${row(`Pedido ${sale.code}`, receiptDate(sale.createdAt, store.timeZone))}
    ${sale.sellerName ? row('Vendedor(a):', sale.sellerName) : ''}${sale.customerName ? row('Cliente:', sale.customerName) : ''}
    ${divider}${row('ITEM / QTD x UNIT', 'TOTAL', true)}
    ${(sale.items || []).map((item) => `<div style="break-inside:avoid;margin-top:1mm">${escape(itemName(item))}${row(`  ${item.quantity} x ${money(item.unitPrice)}`, money(item.totalPrice))}</div>`).join('')}
    ${divider}${row(details.subtotalLabel, money(sale.subtotal))}
    ${details.deductions.map((d) => row(d.label, `-${money(d.amount)}`)).join('')}
    <div style="font-size:16px">${row('TOTAL', money(sale.total), true)}</div>
    ${divider}<b>PAGAMENTO</b>
    ${(sale.payments || []).map((p) => row(`${p.label}${p.installments > 1 ? ` ${p.installments}x` : ''}`, money(p.amount))).join('')}
    ${!sale.reprint && sale.change > 0 ? row('Troco', money(sale.change), true) : ''}
    ${policy ? `${divider}${center('POLÍTICA DE TROCA', true)}<div>${escape(policy)}</div>` : ''}
    ${divider}<div style="break-inside:avoid">${center(barcode ? 'Apresente este código na troca:' : 'Código do pedido para troca:')}${barcode}${center(sale.code)}</div>
    <div style="margin-top:3mm">${center('Obrigada pela preferência!')}${instagram ? center(`@${clean(instagram).replace(/^@/, '')}`) : ''}</div>
    ${store.receiptFooter ? String(store.receiptFooter).split('\n').map((line) => center(line)).join('') : ''}
  </div>`
}

module.exports = { DEFAULT_EXCHANGE_POLICY, money, clean, itemName, receiptDetails, code128Bits, receiptDate, renderReceiptHtml }
