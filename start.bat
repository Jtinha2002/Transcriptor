@echo off
echo Iniciando Transcritor de Reels...
cd /d "%~dp0"

where node >nul 2>&1
if %errorlevel% neq 0 (
  echo ERRO: Node.js nao encontrado. Instale em https://nodejs.org
  pause
  exit /b 1
)

if not exist node_modules (
  echo Instalando dependencias pela primeira vez...
  npm install
)

echo.
echo Acesse: http://localhost:5050
echo Pressione Ctrl+C para encerrar.
echo.
node server.js
pause
