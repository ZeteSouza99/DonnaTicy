const { test } = require('node:test')
const assert = require('node:assert/strict')
const { spawn, execFile } = require('node:child_process')
const { promisify } = require('node:util')
const { once } = require('node:events')
const fs = require('node:fs')
const net = require('node:net')
const os = require('node:os')
const path = require('node:path')

// As funcoes de windows-common.ps1 consultam a porta fixa 15555.
function portIsFree(port) {
  return new Promise((resolve) => {
    const probe = net.createServer()
    probe.once('error', () => resolve(false))
    probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(true)))
  })
}

test('PowerShell consulta o servico real na porta exclusiva, sem imprimir', { skip:process.platform !== 'win32', timeout:15000 }, async (t) => {
  if (!(await portIsFree(15555))) return t.skip('porta 15555 ocupada (servico instalado em execucao)')
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'donnaticy-health-'))
  const config = path.join(folder, 'config.json')
  fs.writeFileSync(config, JSON.stringify({ installationId:'health-smoke', printerName:'SEM-IMPRESSAO', allowedOrigins:['https://donnaticy.vercel.app'] }))
  const root = path.resolve(__dirname, '..')
  const child = spawn(process.execPath, [path.join(root, 'server.js')], {
    cwd:root, env:{ ...process.env, PORT:'15555', DONNATICY_PRINT_CONFIG:config }, windowsHide:true, stdio:['ignore','pipe','pipe'],
  })
  let error = ''
  child.stderr.on('data', chunk => { error += chunk })
  try {
    await new Promise((resolve,reject) => {
      const timer = setTimeout(() => reject(Error('Servico nao iniciou: '+error)), 5000)
      child.stdout.once('data', () => { clearTimeout(timer); resolve() })
      child.once('error', err => { clearTimeout(timer); reject(err) })
      child.once('exit', code => { clearTimeout(timer); reject(Error(`Servico encerrou: ${code} ${error}`)) })
    })
    const common = path.join(root, 'windows-common.ps1').replace(/'/g, "''")
    const command = `. '${common}'; $status=Get-PrintStatus; if(-not (Test-PrintIdentity $status 'health-smoke')){throw 'Identidade nao reconhecida'}; if(-not (Test-PrintPortInUse)){throw 'Porta ativa nao detectada'}; Write-Output 'HEALTH_OK'`
    const result = await promisify(execFile)('powershell.exe', ['-NoProfile','-ExecutionPolicy','Bypass','-Command',command], { windowsHide:true, timeout:5000 })
    assert.match(result.stdout, /HEALTH_OK/)
  } finally {
    if (child.exitCode === null) { const exited = once(child,'exit'); child.kill(); await exited }
    fs.rmSync(folder, { recursive:true }) // Pasta exclusiva criada por mkdtemp neste teste.
  }
})
