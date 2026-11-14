param(
    [ValidateSet('Run','Start','Restart','Stop','Status','Uninstall')][string]$Action = 'Status',
    [switch]$Interactive
)
. (Join-Path $PSScriptRoot 'windows-common.ps1')
$root = Get-PrintInstallRoot
$exitCode = 0
try {
    if (-not (Test-Path -LiteralPath (Join-Path $root 'current.json'))) { throw 'Donna Ticy ainda nao esta instalada nesta conta. Execute INSTALAR.cmd.' }
    [void](Assert-PrintChildPath ([Environment]::GetFolderPath('LocalApplicationData')) $root)
    switch ($Action) {
        'Run' {
            $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
            $mutex = [Threading.Mutex]::new($false, "Local\DonnaTicyPrint-$sid")
            $locked = $false
            $child = $null
            try {
                try { $locked = $mutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $locked = $true }
                if (-not $locked) { exit 0 }
                # Um login novo deve reativar o servico apos Parar.
                $marker = Join-Path $root 'stopped'
                if (Test-Path -LiteralPath $marker) { Remove-Item -LiteralPath $marker -Force }
                $env:DONNATICY_PRINT_CONFIG = Join-Path $root 'config.json'
                $env:PORT = '15555'
                Remove-Item Env:PRINTER_NAME,Env:ALLOWED_ORIGINS -ErrorAction SilentlyContinue
                $delay = 5
                while (-not (Test-Path -LiteralPath $marker)) {
                    try {
                        $release = Get-PrintRelease $root
                        $config = Read-PrintJson $env:DONNATICY_PRINT_CONFIG
                        if (Test-PrintPortInUse) { throw 'Porta 15555 ocupada. Aguardando liberacao, sem encerrar outro processo.' }
                        $logs = Join-Path $root 'logs'
                        [void][IO.Directory]::CreateDirectory($logs)
                        foreach ($name in @('service-out.log','service-error.log')) {
                            $log = Join-Path $logs $name
                            if (Test-Path -LiteralPath $log) { Move-Item -LiteralPath $log -Destination "$log.1" -Force }
                        }
                        $child = Start-Process -FilePath (Join-Path $release 'runtime\node.exe') -ArgumentList ('"' + (Join-Path $release 'server.js') + '"') -WorkingDirectory $release -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logs 'service-out.log') -RedirectStandardError (Join-Path $logs 'service-error.log')
                        Write-PrintLog $root "Processo iniciado: $($child.Id)"
                        $ticks = 0
                        $failures = 0
                        while (-not $child.WaitForExit(1000)) {
                            if (Test-Path -LiteralPath $marker) { break }
                            $ticks++
                            if ($ticks % 15 -eq 0) {
                                if (Test-PrintIdentity (Get-PrintStatus) $config.installationId) { $failures = 0; $delay = 5 }
                                else { $failures++ }
                                if ($failures -ge 3) { Write-PrintLog $root 'Sem resposta por 3 verificacoes; reiniciando processo proprio.'; break }
                            }
                        }
                        if (-not $child.HasExited) { $child.Kill(); $child.WaitForExit() }
                        Write-PrintLog $root "Processo encerrado: $($child.ExitCode). Nova tentativa em $delay segundos."
                        $child.Dispose(); $child = $null
                    } catch { Write-PrintLog $root $_.Exception.Message }
                    for ($i=0; $i -lt $delay -and -not (Test-Path -LiteralPath $marker); $i++) { Start-Sleep -Seconds 1 }
                    $delay = [Math]::Min(60, $delay * 2)
                }
            } finally {
                if ($null -ne $child) { if (-not $child.HasExited) { $child.Kill() }; $child.Dispose() }
                if ($locked) { $mutex.ReleaseMutex() }
                $mutex.Dispose()
            }
        }
        'Start' { $status = Start-PrintSupervisor $root; Write-Host "Servico online. Impressora: $($status.printer)" -ForegroundColor Green }
        'Restart' { Stop-PrintSupervisor $root; $status = Start-PrintSupervisor $root; Write-Host "Servico reiniciado. Impressora: $($status.printer)" -ForegroundColor Green }
        'Stop' { Stop-PrintSupervisor $root; Write-Host 'Servico parado. Voltara no proximo login ou ao clicar em Iniciar.' }
        'Status' {
            $config = Read-PrintJson (Join-Path $root 'config.json')
            Write-Host "Instalacao: $root"
            Write-Host "Versao: $((Read-PrintJson (Join-Path (Get-PrintRelease $root) 'package.json')).version)"
            Write-Host "Impressora configurada: $($config.printerName)"
            Write-Host "Site: $($config.allowedOrigins -join ', ')"
            Write-Host "Inicio automatico nesta conta: $(Test-Path -LiteralPath (Get-PrintStartupPath))"
            $status = Get-PrintStatus
            if (Test-PrintIdentity $status $config.installationId) { Write-Host 'Conexao local: ONLINE' -ForegroundColor Green }
            else { Write-Host 'Conexao local: OFFLINE ou outro programa usa a porta 15555.' -ForegroundColor Yellow; $exitCode = 1 }
            $printer = @(Get-Printer | Where-Object Name -eq $config.printerName)
            if ($printer.Count -eq 1) { $printer | Format-Table Name, DriverName, PortName, PrinterStatus -AutoSize }
            else { Write-Host 'A fila configurada nao foi encontrada. Execute INSTALAR para escolher outra.' -ForegroundColor Yellow; $exitCode = 1 }
            Write-Host "Spooler do Windows: $((Get-Service Spooler).Status)"
            Write-Host "Logs: $root\logs"
            Write-Host 'ONLINE confirma o servico; a saida do papel deve ser conferida na impressora.'
            Write-Host 'Teste web: https://donnaticy.vercel.app/dashboard/configuracoes/impressao'
        }
        'Uninstall' {
            Stop-PrintSupervisor $root
            Remove-PrintStartup $root
            Write-Host 'Inicio automatico removido e processos encerrados.' -ForegroundColor Green
            Write-Host "Configuracao, versoes e logs preservados em: $root"
            Write-Host 'O driver e outras impressoras nao foram alterados.'
        }
    }
} catch { Write-Host $_.Exception.Message -ForegroundColor Red; $exitCode = 1 }
if ($Interactive) { [void](Read-Host 'Pressione Enter para fechar') }
exit $exitCode
