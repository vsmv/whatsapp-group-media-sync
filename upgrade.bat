@echo off
title WhatsApp Sync - Upgrade
echo ============================================
echo   WhatsApp to MEGA Sync - Upgrade
echo ============================================
echo.

cd /d "C:\D\Whatsapp Sync"

echo [1/5] Downloading latest version...
git pull origin master
if %errorlevel% neq 0 (
    echo.
    echo ERROR: git pull failed. Check your internet connection.
    pause
    exit /b 1
)

echo.
echo [2/5] Installing dependencies...
cd direct-sync
call npm install --silent

echo.
echo [3/5] Restarting app...
call node "C:\Users\Admin\AppData\Roaming\npm\node_modules\pm2\bin\pm2" restart wa-mega-sync

echo.
echo [4/5] Waiting for app to initialize (30s)...
timeout /t 30 /nobreak >nul

echo.
echo [5/5] Checking health...
powershell -Command "try { $h = (Invoke-WebRequest -Uri 'http://localhost:3000/api/health' -UseBasicParsing -TimeoutSec 5).Content | ConvertFrom-Json; Write-Host 'Result: OK=' $h.ok 'MEGA=' $h.mega 'WhatsApp=' $h.wa } catch { Write-Host 'App still starting... Check http://localhost:3000' }"

echo.
echo ============================================
echo   Upgrade complete!
echo   Dashboard: http://localhost:3000
echo ============================================
pause