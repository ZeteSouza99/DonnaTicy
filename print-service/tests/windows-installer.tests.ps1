param([Parameter(Mandatory=$true)][string]$PackagePath)
$ErrorActionPreference = 'Stop'
. (Join-Path (Split-Path $PSScriptRoot -Parent) 'windows-common.ps1')
function Assert($Condition, [string]$Message) { if (-not $Condition) { throw "TEST FAILED: $Message" }; Write-Host "PASS: $Message" }
function Assert-Throws([scriptblock]$Action, [string]$Message) {
    $failed=$false
    try { & $Action | Out-Null } catch { $failed=$true }
    Assert $failed $Message
}
Assert ((ConvertTo-PrintOrigin 'https://donnaticy.vercel.app/dashboard') -eq 'https://donnaticy.vercel.app') 'normaliza origem sem autorizar outros sites'
Assert-Throws { ConvertTo-PrintOrigin 'http://site-remoto.example' } 'recusa HTTP remoto'
Assert-Throws { ConvertTo-PrintOrigin 'https://user:pass@site.example' } 'recusa credencial na URL'
Assert-Throws { Assert-PrintChildPath 'C:\pasta' 'C:\pasta-vizinha\arquivo' } 'recusa prefixo parecido fora da pasta'
Assert-Throws { Assert-PrintChildPath 'C:\pasta' 'C:\pasta\..\fora' } 'recusa travessia de caminho'
Assert (-not (Test-PrintIdentity ([pscustomobject]@{ status='online' }) 'id')) 'nao confunde outro servidor com a instalacao'
Assert (Test-PrintIdentity ([pscustomobject]@{ service='donnaticy-print'; installationId='id' }) 'id') 'reconhece identidade correta'

# Integracao em pasta temporaria: runtime, dependencias, manifestos e copias reais.
# Impressoras, autostart, processos de background e endpoint sao substituidos.
# Nao toca em impressora real, Inicializar, configuracao ativa ou vendas.
$script:integrationRoot = Join-Path $env:TEMP ('DonnaTicy-installer-test-' + [Guid]::NewGuid().ToString('N'))
$script:startupFile = Join-Path $script:integrationRoot 'fake-startup.lnk'
$script:failNextStart = $false
$script:starts = 0
function Get-PrintInstallRoot { return $script:integrationRoot }
function Get-PrintStartupPath { return $script:startupFile }
function Get-Printer { return [pscustomobject]@{ Name='MP-4200 TH (TESTE)'; DriverName='Bematech MP-4200 TH'; PortName='USB001'; PrinterStatus='Normal' } }
function Get-Service { return [pscustomobject]@{ Status='Running' } }
function Get-PrintStatus { return $null }
function Test-PrintPortInUse { return $false }
function Stop-PrintSupervisor([string]$Root) { [IO.File]::WriteAllText((Join-Path $Root 'stopped'), 'test-only') }
function Register-PrintStartup([string]$Root) { [IO.File]::WriteAllText($script:startupFile, $Root) }
function Remove-PrintStartup([string]$Root) { if (Test-Path -LiteralPath $script:startupFile) { Remove-Item -LiteralPath $script:startupFile } }
function Start-PrintSupervisor([string]$Root) {
    $script:starts++
    if ($script:failNextStart) { $script:failNextStart=$false; throw 'Falha de ativacao simulada' }
    $config = Read-PrintJson (Join-Path $Root 'config.json')
    return [pscustomobject]@{ service='donnaticy-print'; installationId=$config.installationId; printer=$config.printerName }
}
# Mantem o script original, substituindo somente importacao ja feita e saida do host.
$setupText = [IO.File]::ReadAllText((Join-Path $PackagePath 'setup.ps1'))
$setupText = $setupText.Replace('. (Join-Path $PSScriptRoot ''windows-common.ps1'')', '')
$setupText = $setupText.Replace('$PSScriptRoot', '''' + $PackagePath.Replace("'","''") + '''')
$setupText = $setupText.Replace('exit $exitCode', 'return $exitCode')
$setup = [scriptblock]::Create($setupText)
$result = & $setup -NonInteractive
Assert ($result -eq 0) 'instala runtime, dependencias e configuracao no destino'
$first = Read-PrintJson (Join-Path $script:integrationRoot 'current.json')
$config = Read-PrintJson (Join-Path $script:integrationRoot 'config.json')
Assert ($config.printerName -eq 'MP-4200 TH (TESTE)') 'seleciona a fila automaticamente'
Assert (Test-Path -LiteralPath $script:startupFile) 'registra o inicio automatico (substituto isolado)'
Assert (@($config.allowedOrigins).Count -eq 1 -and $config.allowedOrigins[0] -eq 'https://donnaticy.vercel.app') 'autoriza somente o site correto'
$result = & $setup -NonInteractive
Assert ($result -eq 0) 'reinstala sem exigir nova escolha'
$second = Read-PrintJson (Join-Path $script:integrationRoot 'current.json')
Assert ($second.release -ne $first.release) 'atualizacao usa outra pasta de versao'
Assert ((Read-PrintJson (Join-Path $script:integrationRoot 'config.json')).installationId -eq $config.installationId) 'preserva identidade e configuracao'
$script:failNextStart = $true
$result = & $setup -NonInteractive
Assert ($result -eq 1) 'falha de ativacao gera codigo de erro'
Assert ((Read-PrintJson (Join-Path $script:integrationRoot 'current.json')).release -eq $second.release) 'restaura ponteiro da versao anterior'
Assert ((Read-PrintJson (Join-Path $script:integrationRoot 'config.json')).installationId -eq $config.installationId) 'restaura configuracao anterior'
$result = & $setup -NonInteractive -PrinterName 'NAO EXISTE'
Assert ($result -eq 1) 'fila inexistente interrompe antes de alterar instalacao'
Assert ((Read-PrintJson (Join-Path $script:integrationRoot 'current.json')).release -eq $second.release) 'erro de selecao preserva versao ativa'

$sampleFile = Join-Path $PackagePath 'LEIA-ME.md'
$original = [IO.File]::ReadAllBytes($sampleFile)
try {
    [IO.File]::AppendAllText($sampleFile, 'CORRUPCAO SIMULADA')
    Assert-Throws { Test-PrintPackage $PackagePath } 'recusa pacote corrompido antes de instalar'
} finally { [IO.File]::WriteAllBytes($sampleFile, $original) }
function Get-CimInstance {
    @(
        [pscustomobject]@{ Name='node.exe'; ProcessId=111; ExecutablePath=(Join-Path $script:integrationRoot 'releases\v1\runtime\node.exe'); CommandLine='node server.js' },
        [pscustomobject]@{ Name='node.exe'; ProcessId=222; ExecutablePath='C:\OutroPDV\node.exe'; CommandLine='node server.js' },
        [pscustomobject]@{ Name='powershell.exe'; ProcessId=333; ExecutablePath='C:\Windows\powershell.exe'; CommandLine=('powershell -File "' + (Join-Path $script:integrationRoot 'manage.ps1') + '" -Action Run') },
        [pscustomobject]@{ Name='powershell.exe'; ProcessId=444; ExecutablePath='C:\Windows\powershell.exe'; CommandLine='powershell -File "C:\OutroPDV\manage.ps1" -Action Run' }
    )
}
$owned = @(Get-PrintOwnedProcesses $script:integrationRoot | Select-Object -ExpandProperty ProcessId)
Assert (($owned -join ',') -eq '111,333') 'controle de processos preserva outro Node.js e outro PDV'
Write-Host "Validacao concluida. Artefatos isolados em: $script:integrationRoot"
