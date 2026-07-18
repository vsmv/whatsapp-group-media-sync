@echo off
title WhatsApp-MEGA Sync (PM2)
echo === Starting Edge + PM2 ===
echo.
echo [1/3] Starting Edge...
start "" "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --remote-debugging-port=9222 --remote-allow-origins=* --user-data-dir="%LOCALAPPDATA%\Microsoft\Edge\User Data" https://web.whatsapp.com
timeout /t 10 /nobreak >nul
echo [2/3] Starting PM2...
cd /d "C:\D\Whatsapp Sync\direct-sync"
node "C:\Users\Admin\AppData\Roaming\npm\node_modules\pm2\bin\pm2" start ecosystem.config.js
echo.
echo [3/3] Dashboard: http://localhost:3000
echo Press Ctrl+C to stop. PM2 will keep running.
pause