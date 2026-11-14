# PowerShell 5.1. Funcoes compartilhadas, sem efeitos ao importar.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-PrintInstallRoot {
    return Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'DonnaTicy\PrintService'
}

function Assert-PrintChildPath([string]$Parent, [string]$Child) {
    $base = [IO.Path]::GetFullPath($Parent).TrimEnd('\') + '\'
    $full = [IO.Path]::GetFullPath($Child)
    if (-not $full.StartsWith($base, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Caminho fora da pasta de instalacao: $full"
    }
    $probe = $full
    while ($probe -and $probe.Length -ge $base.TrimEnd('\').Length) {
        if (Test-Path -LiteralPath $probe) {
            $item = Get-Item -LiteralPath $probe -Force
            if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
                throw "Pasta redirecionada nao permitida: $probe"
            }
        }
        $probe = [IO.Path]::GetDirectoryName($probe)
    }
    return $full
}

function Write-PrintJson([string]$Path, $Value) {
    $temp = "$Path.new"
    [IO.File]::WriteAllText($temp, ($Value | ConvertTo-Json -Depth 8), [Text.UTF8Encoding]::new($false))
    Move-Item -LiteralPath $temp -Destination $Path -Force
}

function Read-PrintJson([string]$Path) {
    return Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json
}

function ConvertTo-PrintOrigin([string]$Value) {
    $uri = $null
    if (-not [Uri]::TryCreate($Value.Trim(), [UriKind]::Absolute, [ref]$uri)) { throw 'Endereco do site invalido.' }
    if ($uri.UserInfo -or $uri.Query -or $uri.Fragment) { throw 'Use apenas o endereco do site, sem senha ou parametros.' }
    if ($uri.Scheme -ne 'https' -and -not ($uri.Scheme -eq 'http' -and $uri.IsLoopback)) {
        throw 'O site precisa usar HTTPS (HTTP somente em localhost).'
    }
    return $uri.GetLeftPart([UriPartial]::Authority).TrimEnd('/')
}

function Get-PrintStatus {
    try {
        $request = [Net.HttpWebRequest]::Create('http://127.0.0.1:15555/status')
        $request.Proxy = $null
        $request.Timeout = 2000
        $response = $request.GetResponse()
        try {
            $reader = [IO.StreamReader]::new($response.GetResponseStream())
            try { return $reader.ReadToEnd() | ConvertFrom-Json } finally { $reader.Dispose() }
        } finally { $response.Dispose() }
    } catch { return $null }
}

function Test-PrintPortInUse {
    # Um programa pode ocupar a porta sem falar HTTP (por exemplo, um emulador).
    $listeners = [Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners()
    return @($listeners | Where-Object {
        $_.Port -eq 15555 -and ($_.Address.Equals([Net.IPAddress]::Loopback) -or
        $_.Address.Equals([Net.IPAddress]::Any) -or $_.Address.Equals([Net.IPAddress]::IPv6Any))
    }).Count -gt 0
}

function Test-PrintIdentity($Status, [string]$InstallationId) {
    return $null -ne $Status -and
        $Status.PSObject.Properties.Name -contains 'service' -and
        $Status.PSObject.Properties.Name -contains 'installationId' -and
        $Status.service -eq 'donnaticy-print' -and $Status.installationId -eq $InstallationId
}

function Get-PrintRelease([string]$Root) {
    $current = Read-PrintJson (Join-Path $Root 'current.json')
    if ($current.release -notmatch '^[a-zA-Z0-9-]+$') { throw 'Identificacao de versao invalida.' }
    $release = Assert-PrintChildPath $Root (Join-Path $Root "releases\$($current.release)")
    if (-not (Test-Path -LiteralPath (Join-Path $release 'server.js'))) { throw 'Instalacao incompleta. Execute INSTALAR novamente.' }
    return $release
}

function Write-PrintLog([string]$Root, [string]$Message) {
    $logs = Join-Path $Root 'logs'
    [void][IO.Directory]::CreateDirectory($logs)
    $file = Join-Path $logs 'supervisor.log'
    if ((Test-Path -LiteralPath $file) -and (Get-Item -LiteralPath $file).Length -gt 2MB) {
        Move-Item -LiteralPath $file -Destination "$file.1" -Force
    }
    Add-Content -LiteralPath $file -Value ("{0:yyyy-MM-dd HH:mm:ss} {1}" -f (Get-Date), $Message) -Encoding UTF8
}

function Get-PrintOwnedProcesses([string]$Root) {
    $releasePrefix = [IO.Path]::GetFullPath((Join-Path $Root 'releases')).TrimEnd('\') + '\'
    $manager = Join-Path $Root 'manage.ps1'
    $all = @(Get-CimInstance Win32_Process -Filter "Name = 'node.exe' OR Name = 'powershell.exe'")
    return @($all | Where-Object {
        ($_.ExecutablePath -and $_.ExecutablePath.StartsWith($releasePrefix, [StringComparison]::OrdinalIgnoreCase) -and $_.Name -eq 'node.exe') -or
        ($_.ProcessId -ne $PID -and $_.Name -eq 'powershell.exe' -and $_.CommandLine -and
         $_.CommandLine.Contains(('"' + $manager + '"')) -and $_.CommandLine -match '-Action\s+Run(?:\s|$)')
    })
}

function Stop-PrintSupervisor([string]$Root) {
    [IO.File]::WriteAllText((Join-Path $Root 'stopped'), 'stopped')
    # Apenas processos cujo executavel/linha de comando pertence a esta instalacao.
    foreach ($process in (Get-PrintOwnedProcesses $Root)) {
        Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
    }
    for ($i = 0; $i -lt 20; $i++) {
        if (@(Get-PrintOwnedProcesses $Root).Count -eq 0) { return }
        Start-Sleep -Milliseconds 250
    }
    throw 'Nao foi possivel parar a instalacao anterior. Feche-a e tente novamente.'
}

function Start-PrintSupervisor([string]$Root) {
    $marker = Join-Path $Root 'stopped'
    if (Test-Path -LiteralPath $marker) { Remove-Item -LiteralPath $marker -Force }
    $powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $manager = Join-Path $Root 'manage.ps1'
    Start-Process -FilePath $powershell -WindowStyle Hidden -ArgumentList @(
        '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass',
        '-File', ('"' + $manager + '"'), '-Action', 'Run'
    ) | Out-Null
    $config = Read-PrintJson (Join-Path $Root 'config.json')
    for ($i = 0; $i -lt 20; $i++) {
        $status = Get-PrintStatus
        if (Test-PrintIdentity $status $config.installationId) { return $status }
        if ($null -ne $status) { throw 'A porta 15555 esta ocupada por outro servico. Nenhum processo externo foi encerrado.' }
        Start-Sleep -Milliseconds 500
    }
    throw "O servico nao respondeu. Consulte $Root\logs ou execute DIAGNOSTICO."
}

function Get-PrintStartupPath {
    return Join-Path ([Environment]::GetFolderPath('Startup')) 'DonnaTicy Impressao.lnk'
}

function Register-PrintStartup([string]$Root) {
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut((Get-PrintStartupPath))
    $shortcut.TargetPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $shortcut.Arguments = '-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + (Join-Path $Root 'manage.ps1') + '" -Action Run'
    $shortcut.WorkingDirectory = $Root
    $shortcut.WindowStyle = 7
    $shortcut.Description = 'Donna Ticy - impressao USB ao entrar no Windows'
    $shortcut.Save()
}

function Remove-PrintStartup([string]$Root) {
    $file = Get-PrintStartupPath
    if (Test-Path -LiteralPath $file) {
        $shortcut = (New-Object -ComObject WScript.Shell).CreateShortcut($file)
        if (-not $shortcut.Arguments.Contains(('"' + (Join-Path $Root 'manage.ps1') + '"'))) {
            throw 'O atalho de inicializacao pertence a outra instalacao; nao foi removido.'
        }
        Remove-Item -LiteralPath $file -Force
    }
}

function Test-PrintPackage([string]$Source) {
    $manifest = Read-PrintJson (Join-Path $Source 'manifest.json')
    if ($manifest.product -ne 'donnaticy-print' -or @($manifest.files).Count -lt 10) { throw 'Pacote de instalacao invalido.' }
    foreach ($entry in $manifest.files) {
        $file = Assert-PrintChildPath $Source (Join-Path $Source $entry.path)
        if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "Arquivo ausente: $($entry.path)" }
        if ((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -ne $entry.sha256) { throw "Arquivo alterado ou corrompido: $($entry.path)" }
    }
    return $manifest
}
