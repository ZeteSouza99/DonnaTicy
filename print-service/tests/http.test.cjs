const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'donnaticy-print-http-'))
process.env.DONNATICY_PRINT_CONFIG = path.join(temp, 'config.json')
process.env.ALLOWED_ORIGINS = 'https://donnaticy.vercel.app'
process.env.PRINTER_NAME = 'FILA-SIMULADA'
fs.writeFileSync(process.env.DONNATICY_PRINT_CONFIG, JSON.stringify({ installationId: 'isolated-test' }))
let jobs = 0
let fail = false
const printer = require('../win-print')
printer.printRaw = async () => { jobs++; if (fail) throw Error('spooler simulado indisponivel') }
const { app } = require('../server')
let server, base
before(async () => {
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve) })
  base = `http://127.0.0.1:${server.address().port}`
})
after(async () => {
  server.closeAllConnections()
  await new Promise(resolve => server.close(resolve))
  fs.rmSync(temp, { recursive: true }) // mkdtemp conhecido, exclusivo deste teste
})
const payload = { type: 'sale_receipt', data: { code: 'TESTE', createdAt: '2026-11-14T12:00:00Z', items: [], subtotal: 0, discountTotal: 0, total: 0, payments: [] } }
const post = (origin, body=payload) => fetch(base + '/print', { method:'POST', headers:{ Origin:origin, 'Content-Type':'application/json' }, body:JSON.stringify(body) })

test('status identifica a instalacao sem imprimir', async () => {
  const response = await fetch(base + '/status')
  assert.equal(response.status, 200)
  const status = await response.json()
  assert.equal(status.service, 'donnaticy-print')
  assert.equal(status.installationId, 'isolated-test')
  assert.equal(status.printer, 'FILA-SIMULADA')
  assert.equal(jobs, 0)
})
test('origem externa nao envia nada ao spooler', async () => {
  assert.equal((await post('https://outro-site.example')).status, 403)
  assert.equal(jobs, 0)
})
test('preflight autoriza apenas a origem configurada', async () => {
  const response = await fetch(base + '/print', { method:'OPTIONS', headers:{ Origin:'https://donnaticy.vercel.app', 'Access-Control-Request-Method':'POST', 'Access-Control-Request-Private-Network':'true' } })
  assert.equal(response.headers.get('access-control-allow-origin'), 'https://donnaticy.vercel.app')
  assert.equal(response.headers.get('access-control-allow-private-network'), 'true')
})
test('tipo invalido nao imprime', async () => {
  assert.equal((await post('https://donnaticy.vercel.app', { type:'other', data:{} })).status, 400)
  assert.equal(jobs, 0)
})
test('envio valido recebe confirmacao da fila simulada', async () => {
  assert.deepEqual(await (await post('https://donnaticy.vercel.app')).json(), { success:true })
  assert.equal(jobs, 1)
})
test('falha da fila nao vira sucesso e nao e reenviada', async () => {
  fail = true
  const response = await post('https://donnaticy.vercel.app')
  assert.equal(response.status, 500)
  assert.match((await response.json()).error, /spooler simulado/)
  assert.equal(jobs, 2)
})
