@echo off
title WarLAN server
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js is not installed yet.
  echo Download the LTS version from https://nodejs.org , install it,
  echo then CLOSE this window and double-click start.bat again.
  echo.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installing dependencies ^(first run only^)...
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo.
    echo npm install failed. Check your internet connection and try again.
    pause
    exit /b 1
  )
)

echo.
echo Starting the game server. Keep this window open while you play.
echo Share the LAN address below with your friend.
echo.
node server.js
pause
