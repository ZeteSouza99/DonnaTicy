@echo off
echo ========================================
echo   Desinstalar - PDV Print Service
echo ========================================
echo.

:: 1. Parar o servico (matar processo node do server.js)
echo Parando o servico...
taskkill /F /FI "WINDOWTITLE eq PDV Print Service*" >nul 2>nul
powershell -Command "Get-Process node -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*server.js*' } | Stop-Process -Force -ErrorAction SilentlyContinue"
echo [OK] Servico parado.
echo.

:: 2. Remover atalho do Startup
set "STARTUP_FOLDER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "SHORTCUT_PATH=%STARTUP_FOLDER%\PDV Print Service.lnk"

if exist "%SHORTCUT_PATH%" (
    del "%SHORTCUT_PATH%"
    echo [OK] Inicio automatico removido.
) else (
    echo [i] Inicio automatico ja estava desativado.
)
echo.

:: 3. Remover atalho da Area de Trabalho
set "DESKTOP_SHORTCUT=%USERPROFILE%\Desktop\PDV Print Service.lnk"
if exist "%DESKTOP_SHORTCUT%" (
    del "%DESKTOP_SHORTCUT%"
    echo [OK] Atalho da Area de Trabalho removido.
)
echo.

echo ========================================
echo   Desinstalacao concluida!
echo ========================================
echo.
echo   O servico nao vai mais iniciar com o Windows.
echo   Para reinstalar, execute: install.bat
echo.
pause
