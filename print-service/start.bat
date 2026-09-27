@echo off
echo ========================================
echo   Print Service - PDV
echo ========================================
echo.
cd /d "%~dp0"

set "NODE_CMD=node"
set "NPM_CMD=npm"

:: Verificar node local (portatil) primeiro
if exist "%~dp0node.exe" (
    set "NODE_CMD=%~dp0node.exe"
    set "NPM_CMD=%~dp0npm.cmd"
    goto :node_ok
)

:: Verificar node do sistema
where node >nul 2>nul
if not errorlevel 1 goto :node_ok

:: Nenhum node encontrado - baixar portatil
echo [!] Node.js nao encontrado. Baixando versao portatil...
echo    Nenhuma instalacao necessaria!
echo.

set "NODE_VERSION=22.16.0"
set "NODE_ZIP=node-v%NODE_VERSION%-win-x64.zip"
set "NODE_URL=https://nodejs.org/dist/v%NODE_VERSION%/%NODE_ZIP%"
set "NODE_DIR=node-v%NODE_VERSION%-win-x64"

echo Baixando Node.js v%NODE_VERSION% portatil...
powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '%NODE_URL%' -OutFile '%NODE_ZIP%'"

if not exist "%NODE_ZIP%" (
    echo [ERRO] Falha ao baixar. Verifique sua conexao com a internet.
    pause
    exit /b 1
)

echo Extraindo...
powershell -Command "Expand-Archive -Path '%NODE_ZIP%' -DestinationPath '.' -Force"

:: Copiar node.exe e npm para a pasta atual
copy "%NODE_DIR%\node.exe" "." >nul
xcopy "%NODE_DIR%\node_modules" "node_npm\node_modules\" /E /I /Q >nul
copy "%NODE_DIR%\npm.cmd" "." >nul
copy "%NODE_DIR%\npx.cmd" "." >nul

:: Corrigir npm.cmd para usar node local
powershell -Command "(Get-Content 'npm.cmd') -replace '\"%%~dp0\\node.exe\"', '\"%~dp0node.exe\"' | Set-Content 'npm.cmd'"

:: Limpar zip e pasta extraida
rd /s /q "%NODE_DIR%" >nul 2>nul
del "%NODE_ZIP%" >nul 2>nul

set "NODE_CMD=%~dp0node.exe"
set "NPM_CMD=%~dp0npm.cmd"

if not exist "%~dp0node.exe" (
    echo [ERRO] Falha na extracao.
    pause
    exit /b 1
)

echo [OK] Node.js portatil pronto!
echo.

:node_ok

if not exist "node_modules\express" (
    echo Instalando dependencias...
    "%NPM_CMD%" install --production
    echo.
)

:: Registrar inicio automatico com o Windows (via pasta Startup)
set "STARTUP_FOLDER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "SHORTCUT_PATH=%STARTUP_FOLDER%\PDV Print Service.lnk"

if not exist "%SHORTCUT_PATH%" (
    echo Configurando inicio automatico com o Windows...
    powershell -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%SHORTCUT_PATH%'); $s.TargetPath = '%~dp0start-hidden.vbs'; $s.WorkingDirectory = '%~dp0'; $s.Description = 'PDV Print Service'; $s.Save()"
    echo [OK] Servico vai iniciar automaticamente com o Windows!
    echo.
)

echo Iniciando servidor de impressao...
echo.
"%NODE_CMD%" server.js
pause
