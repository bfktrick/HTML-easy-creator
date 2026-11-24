@echo off
rem HTML Creator: doble clic para abrir la app en su propia ventana.
rem HTML Creator: double-click to open the app in its own window.
setlocal
chcp 65001 >nul
cd /d "%~dp0"
title HTML Creator

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Falta Node.js 22.18 o posterior. Descárgalo de https://nodejs.org y vuelve a abrir este archivo.
  echo  Node.js 22.18 or newer is missing. Get it from https://nodejs.org and open this file again.
  echo.
  pause
  exit /b 1
)

where pnpm >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Falta pnpm. Instálalo siguiendo https://pnpm.io/installation y vuelve a abrir este archivo.
  echo  pnpm is missing. Install it from https://pnpm.io/installation and open this file again.
  echo.
  pause
  exit /b 1
)

echo  Preparando HTML Creator... / Getting HTML Creator ready...
call pnpm install --frozen-lockfile --reporter=silent
if errorlevel 1 (
  echo.
  echo  No se pudieron instalar las dependencias. / Could not install the dependencies.
  pause
  exit /b 1
)
call pnpm build >nul
if errorlevel 1 (
  echo.
  echo  No se pudo preparar la app. / Could not build the app.
  pause
  exit /b 1
)

rem The server runs in a minimised window and stops when the app window is closed.
start "HTML Creator" /min cmd /c "node server/index.ts --window || pause"
exit /b 0
