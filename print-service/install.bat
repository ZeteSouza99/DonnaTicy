@echo off
echo ========================================
echo   Instalador - PDV Print Service
echo ========================================
echo.
cd /d "%~dp0"

:: 1. Verificar/instalar Node.js
set "NODE_CMD=node"
if exist "%~dp0node.exe" (
    set "NODE_CMD=%~dp0node.exe"
    goto :node_ok
)
where node >nul 2>nul
if not errorlevel 1 goto :node_ok

echo [!] Node.js nao encontrado. Baixando versao portatil...
set "NODE_VERSION=22.16.0"
set "NODE_ZIP=node-v%NODE_VERSION%-win-x64.zip"
set "NODE_URL=https://nodejs.org/dist/v%NODE_VERSION%/%NODE_ZIP%"
set "NODE_DIR=node-v%NODE_VERSION%-win-x64"

powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '%NODE_URL%' -OutFile '%NODE_ZIP%'"
if not exist "%NODE_ZIP%" (
    echo [ERRO] Falha ao baixar. Verifique sua conexao.
    pause
    exit /b 1
)

echo Extraindo...
powershell -Command "Expand-Archive -Path '%NODE_ZIP%' -DestinationPath '.' -Force"
copy "%NODE_DIR%\node.exe" "." >nul
xcopy "%NODE_DIR%\node_modules" "node_npm\node_modules\" /E /I /Q >nul
copy "%NODE_DIR%\npm.cmd" "." >nul
copy "%NODE_DIR%\npx.cmd" "." >nul
rd /s /q "%NODE_DIR%" >nul 2>nul
del "%NODE_ZIP%" >nul 2>nul
set "NODE_CMD=%~dp0node.exe"
echo [OK] Node.js portatil instalado!
echo.

:node_ok

:: 2. Instalar dependencias
if not exist "node_modules\express" (
    echo Instalando dependencias...
    if exist "%~dp0npm.cmd" (
        "%~dp0npm.cmd" install --production
    ) else (
        npm install --production
    )
    echo [OK] Dependencias instaladas!
    echo.
)

:: 3. Configurar a origem do ERP autorizada a imprimir
if exist "config.json" goto :config_ok
echo Informe o endereco do ERP que vai usar esta impressora.
set /p "ERP_URL=URL do ERP (ex: https://erp.suaempresa.com.br): "
powershell -NoProfile -Command "$u = $env:ERP_URL.Trim().TrimEnd('/'); ConvertTo-Json @{ allowedOrigins = @($u) } | Set-Content -Encoding UTF8 'config.json'"
echo [OK] config.json criado. Edite o arquivo para autorizar outros enderecos.
echo.
:config_ok

:: 4. Criar atalho no Startup do Windows
set "STARTUP_FOLDER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "SHORTCUT_PATH=%STARTUP_FOLDER%\PDV Print Service.lnk"

echo Registrando inicio automatico com o Windows...
powershell -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%SHORTCUT_PATH%'); $s.TargetPath = '%~dp0start-hidden.vbs'; $s.WorkingDirectory = '%~dp0'; $s.Description = 'PDV Print Service - Iniciar com Windows'; $s.Save()"
echo [OK] Atalho criado em: %STARTUP_FOLDER%
echo.

:: 5. Criar atalho na Area de Trabalho
set "DESKTOP=%USERPROFILE%\Desktop"
set "DESKTOP_SHORTCUT=%DESKTOP%\PDV Print Service.lnk"

if not exist "%DESKTOP_SHORTCUT%" (
    echo Criando atalho na Area de Trabalho...
    powershell -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%DESKTOP_SHORTCUT%'); $s.TargetPath = '%~dp0start-hidden.vbs'; $s.WorkingDirectory = '%~dp0'; $s.Description = 'Iniciar PDV Print Service'; $s.Save()"
    echo [OK] Atalho criado na Area de Trabalho!
    echo.
)

:: 6. Iniciar o servico agora
echo ========================================
echo   Instalacao concluida!
echo ========================================
echo.
echo   O servico de impressao vai:
echo   - Iniciar automaticamente com o Windows
echo   - Rodar em segundo plano (sem janela)
echo   - Escutar na porta 5555
echo.
echo   Para desinstalar, execute: uninstall.bat
echo.
echo Iniciando o servico agora...
start "" "%~dp0start-hidden.vbs"
echo [OK] Servico iniciado em segundo plano!
echo.
timeout /t 3 >nul
