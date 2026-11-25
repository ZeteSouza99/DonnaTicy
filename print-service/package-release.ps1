param(
    [Parameter(Mandatory=$true)][string]$NodeExe,
    [Parameter(Mandatory=$true)][string]$NodeLicense,
    [Parameter(Mandatory=$true)][string]$OutputDirectory
)
. (Join-Path $PSScriptRoot 'windows-common.ps1')
$expectedHash = 'd702daa815eabbff763c7d3808e235cf031cf2ca70211b56847bc72f51e240e5'
if ((Get-FileHash -LiteralPath $NodeExe -Algorithm SHA256).Hash -ne $expectedHash) { throw 'Use o node.exe oficial v24.22.1 Windows x64; SHA-256 diferente do revisado.' }
if (-not (Test-Path -LiteralPath $NodeLicense -PathType Leaf)) { throw 'LICENSE do Node.js e obrigatorio.' }
$licenseText = [IO.File]::ReadAllText($NodeLicense)
if (-not $licenseText.Contains('Node.js') -or $licenseText.Length -lt 10000) { throw 'Forneca o LICENSE completo da distribuicao Node.js.' }
$output = [IO.Path]::GetFullPath($OutputDirectory)
[void][IO.Directory]::CreateDirectory($output)
$stage = Assert-PrintChildPath $output (Join-Path $output ('package-' + [Guid]::NewGuid().ToString('N')))
$payload = Join-Path $stage 'DonnaTicy-Impressao'
[void][IO.Directory]::CreateDirectory($payload)
$files = @(
    'server.js','escpos.js','receipt-builder.js','receipt-layout.js','receipt-layout.d.ts',
    'raw-printer.ps1','win-print.js','package.json','package-lock.json',
    'windows-common.ps1','setup.ps1','manage.ps1','LEIA-ME.md',
    'INSTALAR.cmd','INICIAR.cmd','REINICIAR.cmd','PARAR.cmd','DIAGNOSTICO.cmd','DESINSTALAR.cmd'
)
foreach ($file in $files) { Copy-Item -LiteralPath (Join-Path $PSScriptRoot $file) -Destination (Join-Path $payload $file) }
$modules = Join-Path $PSScriptRoot 'node_modules'
if (-not (Test-Path -LiteralPath $modules)) { throw 'Execute npm ci --ignore-scripts --omit=dev na pasta print-service.' }
foreach ($item in (Get-ChildItem -LiteralPath $modules -Recurse -Force)) {
    if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Dependencia redirecionada nao permitida: $($item.FullName)" }
}
Copy-Item -LiteralPath $modules -Destination (Join-Path $payload 'node_modules') -Recurse
# Cada arquivo distribuido tem origem explicitamente selecionada. Nenhuma configuracao local entra no ZIP.
[void][IO.Directory]::CreateDirectory((Join-Path $payload 'runtime'))
Copy-Item -LiteralPath $NodeExe -Destination (Join-Path $payload 'runtime\node.exe')
Copy-Item -LiteralPath $NodeLicense -Destination (Join-Path $payload 'runtime\LICENSE')
$node = Join-Path $payload 'runtime\node.exe'
$nodeVersion = (& $node --version).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Falha no runtime empacotado.' }
& $node -e 'require(process.argv[1]); require(process.argv[2]); require(process.argv[3]);' (Join-Path $payload 'node_modules\express') (Join-Path $payload 'node_modules\cors') (Join-Path $payload 'node_modules\iconv-lite')
if ($LASTEXITCODE -ne 0) { throw 'Dependencias incompletas.' }
$package = Read-PrintJson (Join-Path $payload 'package.json')
$entries = @(Get-ChildItem -LiteralPath $payload -Recurse -File -Force | ForEach-Object {
    @{ path=$_.FullName.Substring($payload.Length + 1).Replace('\','/'); sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant() }
})
Write-PrintJson (Join-Path $payload 'manifest.json') @{ product='donnaticy-print'; version=$package.version; architecture='x64'; nodeVersion=$nodeVersion; files=$entries }
[void](Test-PrintPackage $payload)
$zip = Join-Path $output ("DonnaTicy_Impressao_Windows_x64_{0}.zip" -f $package.version)
if (Test-Path -LiteralPath $zip) { throw 'O ZIP de destino ja existe. Use outra pasta de saida para nao sobrescrever uma entrega.' }
Add-Type -AssemblyName System.IO.Compression.FileSystem
[IO.Compression.ZipFile]::CreateFromDirectory($stage, $zip, [IO.Compression.CompressionLevel]::Optimal, $false)
Write-Host "Pacote: $zip"
Write-Host "SHA256: $((Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash)"
Write-Host "Pasta de validacao: $payload"
