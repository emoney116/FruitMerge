@echo off
setlocal
cd /d "%~dp0"

echo Installing dependencies if needed...
call npm install
if errorlevel 1 (
  echo npm install failed.
  exit /b 1
)

echo.
echo Starting Fruit Merge for local iPhone/web app testing...
echo Open the local network URL shown by Vite on your iPhone.
echo Make sure both devices are on the same Wi-Fi network.
echo.

call npm run dev -- --host 0.0.0.0
