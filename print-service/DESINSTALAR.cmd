@echo off
echo Isto para a impressao Donna Ticy e remove seu inicio automatico nesta conta.
echo Configuracao, logs, driver e outras impressoras serao preservados.
choice /C SN /N /M "Desativar a instalacao? [S/N]: "
if errorlevel 2 exit /b 0
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0manage.ps1" -Action Uninstall -Interactive
