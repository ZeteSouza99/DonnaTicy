const express = require('express')
const cors = require('cors')
const fs = require('fs')
const path = require('path')
const { buildSaleReceipt } = require('./receipt-builder')
const { printRaw } = require('./win-print')

// config.json (criado pelo install.bat) ou variáveis de ambiente, que têm prioridade.
function loadConfig() {
  const configPath = path.join(__dirname, 'config.json')
  let file = {}
  if (fs.existsSync(configPath)) {
    // O PowerShell 5.1 grava UTF-8 com BOM, que o JSON.parse rejeita.
    file = JSON.parse(fs.readFileSync(configPath, 'utf8').replace(/^\uFEFF/, ''))
  }
  const origins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',')
    : [].concat(file.allowedOrigins || [])
  const allowedOrigins = origins.map((o) => String(o).trim().replace(/\/+$/, '')).filter(Boolean)
  return {
    printerName: process.env.PRINTER_NAME || file.printerName || 'MP-4200 TH',
    allowedOrigins: allowedOrigins.length > 0 ? allowedOrigins : ['http://localhost:3000'],
  }
}

const config = loadConfig()
const PRINTER_NAME = config.printerName
const ALLOWED_ORIGINS = config.allowedOrigins

const app = express()

// Chrome pede autorização explícita (Private Network Access) para um site acessar o loopback.
app.use((req, res, next) => {
  if (req.headers['access-control-request-private-network'] === 'true') {
    res.setHeader('Access-Control-Allow-Private-Network', 'true')
  }
  next()
})
app.use(cors({ origin: ALLOWED_ORIGINS }))
// O cors() só omite cabeçalhos; aqui a requisição de outra origem é de fato recusada.
app.use((req, res, next) => {
  const origin = req.headers.origin
  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    return res.status(403).json({ error: 'Origem não autorizada a imprimir' })
  }
  next()
})
app.use(express.json())

app.get('/status', (_req, res) => {
  res.json({ status: 'online', printer: PRINTER_NAME })
})

app.post('/print', async (req, res) => {
  const { type, data, store } = req.body || {}

  if (!type || !data) {
    return res.status(400).json({ error: 'Campos type e data são obrigatórios' })
  }

  let buffer
  try {
    switch (type) {
      case 'sale_receipt':
        buffer = buildSaleReceipt(data, store || {})
        break
      default:
        return res.status(400).json({ error: `Tipo de impressão inválido: ${type}` })
    }
  } catch (err) {
    return res.status(400).json({ error: `Erro ao gerar recibo: ${err.message}` })
  }

  try {
    await printRaw(PRINTER_NAME, buffer)
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: `Erro ao imprimir: ${err.message}` })
  }
})

const PORT = process.env.PORT || 5555

app.listen(PORT, '127.0.0.1', () => {
  console.log(`\n  Donna Ticy Print Service`)
  console.log(`  ------------------------`)
  console.log(`  URL:        http://127.0.0.1:${PORT}`)
  console.log(`  Impressora: ${PRINTER_NAME}`)
  console.log(`  Origens:    ${ALLOWED_ORIGINS.join(', ')}`)
  console.log(`  Status:     http://127.0.0.1:${PORT}/status\n`)
})
