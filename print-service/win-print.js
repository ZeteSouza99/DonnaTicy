const { execFile } = require('child_process')
const fs = require('fs')
const path = require('path')
const os = require('os')

function printRaw(printerName, buffer) {
  return new Promise((resolve, reject) => {
    const tmpFile = path.join(os.tmpdir(), `pdv-receipt-${Date.now()}.bin`)
    fs.writeFileSync(tmpFile, buffer)

    const psScript = path.join(__dirname, 'raw-printer.ps1')

    execFile('powershell', [
      '-ExecutionPolicy', 'Bypass',
      '-File', psScript,
      '-FilePath', tmpFile,
      '-PrinterName', printerName
    ], { timeout: 10000 }, (error, stdout, stderr) => {
      try { fs.unlinkSync(tmpFile) } catch {}

      if (error) {
        reject(new Error(stderr || error.message))
      } else {
        resolve(stdout.trim())
      }
    })
  })
}

module.exports = { printRaw }
