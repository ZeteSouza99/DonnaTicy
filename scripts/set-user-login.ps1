$ErrorActionPreference = 'Stop'
Push-Location (Split-Path -Parent $PSScriptRoot)
try {
    $rows = & node --import tsx scripts/set-user-login.ts --list
    if ($LASTEXITCODE -ne 0) { throw 'Nao foi possivel consultar as contas.' }
    $users = @($rows | ConvertFrom-Json)
    if ($users.Count -eq 0) { throw 'Nenhuma conta ativa encontrada.' }
    for ($i = 0; $i -lt $users.Count; $i++) {
        Write-Host ('{0}. {1} ({2}) - {3}' -f ($i + 1), $users[$i].name, $users[$i].email, $users[$i].role)
    }
    $choice = 0
    if (-not [int]::TryParse((Read-Host 'Numero da conta que recebera o novo login'), [ref]$choice) -or $choice -lt 1 -or $choice -gt $users.Count) {
        throw 'Conta invalida. Nada foi alterado.'
    }
    $username = Read-Host 'Novo usuario (exemplo: Ticiane)'
    $secret = Read-Host 'Nova senha' -AsSecureString
    $confirmation = Read-Host 'Repita a nova senha' -AsSecureString
    $first = [System.Net.NetworkCredential]::new('', $secret).Password
    $second = [System.Net.NetworkCredential]::new('', $confirmation).Password
    if ($first -cne $second) { throw 'As senhas sao diferentes. Nada foi alterado.' }
    $payload = @{ userId = $users[$choice - 1].id; username = $username; password = $first } | ConvertTo-Json -Compress
    $payload | & node --import tsx scripts/set-user-login.ts
    if ($LASTEXITCODE -ne 0) { throw 'O login nao foi alterado.' }
} finally {
    $payload = $null
    $first = $null
    $second = $null
    if ($secret) { $secret.Dispose() }
    if ($confirmation) { $confirmation.Dispose() }
    Pop-Location
}
