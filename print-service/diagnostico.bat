@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul 2>nul
title Diagnostico - PDV Print Service

echo ==========================================
echo   Diagnostico - PDV Print Service
echo ==========================================
echo.

set "ERROS=0"
set "AVISOS=0"

:: -------------------------------------------
:: 1. Verificar Node.js
:: -------------------------------------------
echo [1/6] Verificando Node.js...

set "NODE_CMD="
if exist "%~dp0node-portable\node.exe" (
    set "NODE_CMD=%~dp0node-portable\node.exe"
    echo       [OK] Node.js portatil encontrado.
    goto :node_version
)

where node >nul 2>nul
if !errorlevel!==0 (
    set "NODE_CMD=node"
    echo       [OK] Node.js do sistema encontrado.
    goto :node_version
)

echo       [ERRO] Node.js NAO encontrado!
echo              Execute install.bat para instalar.
set /a ERROS+=1

:node_version
if defined NODE_CMD (
    for /f "tokens=*" %%v in ('!NODE_CMD! -v 2^>nul') do echo       Versao: %%v
)
echo.

:: -------------------------------------------
:: 2. Verificar dependencias (node_modules)
:: -------------------------------------------
echo [2/6] Verificando dependencias...

if exist "%~dp0node_modules\express" (
    echo       [OK] express instalado.
) else (
    echo       [ERRO] express NAO instalado!
    echo              Execute: npm install
    set /a ERROS+=1
)

if exist "%~dp0node_modules\cors" (
    echo       [OK] cors instalado.
) else (
    echo       [ERRO] cors NAO instalado!
    set /a ERROS+=1
)

if exist "%~dp0node_modules\iconv-lite" (
    echo       [OK] iconv-lite instalado.
) else (
    echo       [ERRO] iconv-lite NAO instalado!
    set /a ERROS+=1
)
echo.

:: -------------------------------------------
:: 3. Verificar arquivos essenciais
:: -------------------------------------------
echo [3/6] Verificando arquivos do servico...

for %%f in (server.js receipt-builder.js win-print.js package.json start-hidden.vbs) do (
    if exist "%~dp0%%f" (
        echo       [OK] %%f
    ) else (
        echo       [ERRO] %%f NAO encontrado!
        set /a ERROS+=1
    )
)
echo.

:: -------------------------------------------
:: 4. Verificar se o servico esta rodando
:: -------------------------------------------
echo [4/6] Verificando se o servico esta rodando...

powershell -NoProfile -Command "try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:5555/status' -UseBasicParsing -TimeoutSec 3; $j = $r.Content | ConvertFrom-Json; Write-Host '      [OK] Servico ONLINE'; Write-Host \"      Impressora: $($j.printer)\"; Write-Host \"      Status: $($j.status)\" } catch { Write-Host '      [ERRO] Servico NAO esta rodando na porta 5555!'; Write-Host '             Inicie com: start.bat ou install.bat'; exit 1 }"
if !errorlevel! neq 0 set /a ERROS+=1
echo.

:: -------------------------------------------
:: 5. Verificar porta 5555
:: -------------------------------------------
echo [5/6] Verificando porta 5555...

powershell -NoProfile -Command "$c = Get-NetTCPConnection -LocalPort 5555 -State Listen -ErrorAction SilentlyContinue; if ($c) { $p = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue; Write-Host \"      [OK] Porta 5555 em uso por: $($p.ProcessName) (PID: $($c.OwningProcess))\" } else { Write-Host '      [AVISO] Porta 5555 nao esta em uso (servico parado)' }"
echo.

:: -------------------------------------------
:: 6. Verificar inicio automatico
:: -------------------------------------------
echo [6/6] Verificando inicio automatico...

set "SHORTCUT=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\PDV Print Service.lnk"
if exist "!SHORTCUT!" (
    echo       [OK] Atalho na pasta Inicializar encontrado.
    echo       O servico inicia automaticamente com o Windows.
) else (
    echo       [AVISO] Inicio automatico NAO configurado.
    echo              Execute install.bat para configurar.
    set /a AVISOS+=1
)

set "DESKTOP_SHORTCUT=%USERPROFILE%\Desktop\PDV Print Service.lnk"
if exist "!DESKTOP_SHORTCUT!" (
    echo       [OK] Atalho na Area de Trabalho encontrado.
) else (
    echo       [i] Sem atalho na Area de Trabalho.
)
echo.

:: -------------------------------------------
:: Resultado Final
:: -------------------------------------------
echo ==========================================
if !ERROS!==0 (
    if !AVISOS!==0 (
        echo   RESULTADO: Tudo OK! Servico funcionando.
    ) else (
        echo   RESULTADO: Funcionando com !AVISOS! aviso[s].
    )
) else (
    echo   RESULTADO: !ERROS! erro[s] encontrado[s]!
)
echo ==========================================
echo.
echo Pressione qualquer tecla para fechar...
pause >nul
