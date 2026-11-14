param(
    [string]$SiteUrl = 'https://donnaticy.vercel.app',
    [string]$PrinterName,
    [switch]$NonInteractive
)
. (Join-Path $PSScriptRoot 'windows-common.ps1')
$root = Get-PrintInstallRoot
$changed = $false
$previous = $null
$previousConfig = $null
$previousManager = $null
$previousCommon = $null
$hadStartup = $false
$lock = $null
$locked = $false
$exitCode = 0
try {
    Write-Host 'Donna Ticy - instalador de impressao USB' -ForegroundColor Cyan
    Write-Host 'Use a conta do Windows que sera usada no caixa. Nao precisa executar como administrador.'
    if (-not [Environment]::Is64BitOperatingSystem) { throw 'Este pacote requer Windows 10/11 de 64 bits.' }
    $arch = if ($env:PROCESSOR_ARCHITEW6432) { $env:PROCESSOR_ARCHITEW6432 } else { $env:PROCESSOR_ARCHITECTURE }
    if ($arch -ne 'AMD64') { throw 'Este pacote e para Windows x64 (Intel/AMD). Solicite a versao ARM64 para este computador.' }
    $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    $lock = [Threading.Mutex]::new($false, "Local\DonnaTicyPrintSetup-$sid")
    try { $locked = $lock.WaitOne(0) } catch [Threading.AbandonedMutexException] { $locked = $true }
    if (-not $locked) { throw 'Outro instalador Donna Ticy ja esta em execucao.' }
    [void](Assert-PrintChildPath ([Environment]::GetFolderPath('LocalApplicationData')) $root)
    Write-Host '[1/5] Conferindo integridade do pacote...'
    $manifest = Test-PrintPackage $PSScriptRoot
    if ($manifest.architecture -ne 'x64') { throw 'Arquitetura do pacote invalida.' }
    $currentFile = Join-Path $root 'current.json'
    $configFile = Join-Path $root 'config.json'
    if (Test-Path -LiteralPath $currentFile) { $previous = Read-PrintJson $currentFile }
    if (Test-Path -LiteralPath $configFile) { $previousConfig = Read-PrintJson $configFile }
    if (Test-Path -LiteralPath (Join-Path $root 'manage.ps1')) { $previousManager = [IO.File]::ReadAllText((Join-Path $root 'manage.ps1')) }
    if (Test-Path -LiteralPath (Join-Path $root 'windows-common.ps1')) { $previousCommon = [IO.File]::ReadAllText((Join-Path $root 'windows-common.ps1')) }
    $hadStartup = Test-Path -LiteralPath (Get-PrintStartupPath)
    if ($null -ne $previousConfig -and -not $PSBoundParameters.ContainsKey('SiteUrl') -and @($previousConfig.allowedOrigins).Count -gt 0) {
        $SiteUrl = @($previousConfig.allowedOrigins)[0]
    }
    $origin = ConvertTo-PrintOrigin $SiteUrl

    Write-Host '[2/5] Identificando a impressora instalada...'
    $printers = @(Get-Printer | Sort-Object Name)
    if ($printers.Count -eq 0) { throw 'Nenhuma impressora encontrada. Instale o driver oficial da Bematech e conecte o USB antes de continuar.' }
    if (-not $PrinterName -and $null -ne $previousConfig) { $PrinterName = $previousConfig.printerName }
    $selected = @($printers | Where-Object { $_.Name -eq $PrinterName })
    if ($selected.Count -ne 1) {
        if ($PSBoundParameters.ContainsKey('PrinterName')) { throw "A fila informada nao existe: $PrinterName" }
        $recommended = @($printers | Where-Object { ($_.Name + ' ' + $_.DriverName) -match '(?i)MP[- ]?4200' })
        if ($recommended.Count -eq 1) { $selected = $recommended }
        elseif ($NonInteractive) { throw 'Nao foi possivel escolher a impressora automaticamente. Informe -PrinterName com o nome exato da fila.' }
        else {
            Write-Host 'Escolha a impressora termica ESC/POS de 80 mm. Nao escolha PDF ou impressora comum.'
            for ($i=0; $i -lt $printers.Count; $i++) { Write-Host ("[{0}] {1} - {2}" -f ($i+1), $printers[$i].Name, $printers[$i].PortName) }
            $answer = Read-Host 'Numero da impressora'
            $number = 0
            if (-not [int]::TryParse($answer, [ref]$number) -or $number -lt 1 -or $number -gt $printers.Count) { throw 'Selecao invalida. Nenhuma configuracao foi alterada.' }
            $selected = @($printers[$number-1])
        }
    }
    $PrinterName = $selected[0].Name
    Write-Host "Impressora: $PrinterName ($($selected[0].PortName))"
    Write-Host "Site: $origin"
    if ((Get-Service Spooler).Status -ne 'Running') { throw 'O Spooler de Impressao do Windows esta parado. Inicie esse servico e execute o instalador novamente.' }

    Write-Host '[3/5] Preparando a versao em pasta propria...'
    $releaseId = 'v111-' + [Guid]::NewGuid().ToString('N')
    $release = Assert-PrintChildPath $root (Join-Path $root "releases\$releaseId")
    [void][IO.Directory]::CreateDirectory($release)
    foreach ($entry in $manifest.files) {
        $from = Assert-PrintChildPath $PSScriptRoot (Join-Path $PSScriptRoot $entry.path)
        $to = Assert-PrintChildPath $release (Join-Path $release $entry.path)
        [void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($to))
        Copy-Item -LiteralPath $from -Destination $to -Force
        if ((Get-FileHash -LiteralPath $to -Algorithm SHA256).Hash -ne $entry.sha256) { throw "Falha na copia: $($entry.path)" }
    }
    # Executa somente o runtime cujo SHA foi verificado no empacotamento e na copia.
    $node = Join-Path $release 'runtime\node.exe'
    $version = & $node --version
    if ($LASTEXITCODE -ne 0 -or $version.Trim() -ne $manifest.nodeVersion) { throw 'O runtime nao passou na verificacao.' }
    & $node -e 'require(process.argv[1]); require(process.argv[2]); require(process.argv[3]);' (Join-Path $release 'node_modules\express') (Join-Path $release 'node_modules\cors') (Join-Path $release 'node_modules\iconv-lite')
    if ($LASTEXITCODE -ne 0) { throw 'Dependencias ausentes ou invalidas no pacote.' }
    $occupied = Get-PrintStatus
    if ((Test-PrintPortInUse) -and ($null -eq $previousConfig -or -not ($previousConfig.PSObject.Properties.Name -contains 'installationId') -or -not (Test-PrintIdentity $occupied $previousConfig.installationId))) {
        throw 'Ja existe outro servico na porta 15555. Feche a instalacao antiga e execute novamente. Ela nao foi encerrada automaticamente.'
    }

    Write-Host '[4/5] Ativando e registrando inicio automatico...'
    $changed = $true
    Stop-PrintSupervisor $root
    $installationId = [Guid]::NewGuid().ToString('N')
    if ($null -ne $previousConfig -and $previousConfig.PSObject.Properties.Name -contains 'installationId' -and $previousConfig.installationId) { $installationId = $previousConfig.installationId }
    $origins = @($origin)
    if ($null -ne $previousConfig -and -not $PSBoundParameters.ContainsKey('SiteUrl')) {
        $origins = @($previousConfig.allowedOrigins | ForEach-Object { ConvertTo-PrintOrigin $_ } | Select-Object -Unique)
    }
    Write-PrintJson $configFile @{ printerName=$PrinterName; allowedOrigins=$origins; installationId=$installationId }
    Copy-Item -LiteralPath (Join-Path $release 'manage.ps1') -Destination (Join-Path $root 'manage.ps1') -Force
    Copy-Item -LiteralPath (Join-Path $release 'windows-common.ps1') -Destination (Join-Path $root 'windows-common.ps1') -Force
    Write-PrintJson $currentFile @{ release=$releaseId; version=$manifest.version; installedAt=(Get-Date).ToString('o') }
    Register-PrintStartup $root
    Write-Host '[5/5] Iniciando e verificando conexao local...'
    $status = Start-PrintSupervisor $root
    Write-Host ''
    Write-Host "INSTALADO. Servico online: $($status.printer)" -ForegroundColor Green
    Write-Host 'O servico inicia escondido ao entrar nesta conta do Windows e reinicia se cair.'
    Write-Host 'O pacote extraido pode ser removido; a instalacao nao depende dele.'
    Write-Host "Pasta instalada: $root"
    Write-Host "Abra: $origin/dashboard/configuracoes/impressao"
    Write-Host 'Clique em Verificar conexao e Imprimir teste. Permita acesso a rede local se o navegador solicitar.'
    Write-Host 'Nenhum recibo foi impresso pelo instalador e nenhuma venda foi criada.'
} catch {
    Write-Host ("ERRO: " + $_.Exception.Message) -ForegroundColor Red
    $exitCode = 1
    if ($changed) {
        try {
            Stop-PrintSupervisor $root
            if ($null -ne $previous) {
                Write-PrintJson (Join-Path $root 'current.json') $previous
                Write-PrintJson (Join-Path $root 'config.json') $previousConfig
                if ($null -ne $previousManager) { [IO.File]::WriteAllText((Join-Path $root 'manage.ps1'), $previousManager, [Text.UTF8Encoding]::new($true)) }
                if ($null -ne $previousCommon) { [IO.File]::WriteAllText((Join-Path $root 'windows-common.ps1'), $previousCommon, [Text.UTF8Encoding]::new($true)) }
                if ($hadStartup) { Register-PrintStartup $root } else { Remove-PrintStartup $root }
                [void](Start-PrintSupervisor $root)
                Write-Host 'A versao anterior foi restaurada.' -ForegroundColor Yellow
            } else {
                Remove-PrintStartup $root
                $pointer = Join-Path $root 'current.json'
                if (Test-Path -LiteralPath $pointer) { Remove-Item -LiteralPath $pointer -Force }
                Write-Host 'Instalacao nao foi ativada. Arquivos preservados para diagnostico.' -ForegroundColor Yellow
            }
        } catch { Write-Host "Nao foi possivel concluir a recuperacao: $($_.Exception.Message). Consulte $root\logs." -ForegroundColor Red }
    }
} finally {
    if ($null -ne $lock) { if ($locked) { $lock.ReleaseMutex() }; $lock.Dispose() }
}
if (-not $NonInteractive) { [void](Read-Host 'Pressione Enter para fechar') }
exit $exitCode
