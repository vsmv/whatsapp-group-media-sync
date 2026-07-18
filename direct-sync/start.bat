@echo off
title WhatsApp-MEGA Sync
echo Starting Edge (restores last session)...
start "" "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --remote-debugging-port=9222 --remote-allow-origins=*
timeout /t 10 /nobreak >nul
echo Starting sync app...
cd /d "C:\D\Whatsapp Sync\direct-sync"
node "C:\Users\Admin\AppData\Roaming\npm\node_modules\pm2\bin\pm2" start ecosystem.config.js
echo Dashboard: http://localhost:3000
pause