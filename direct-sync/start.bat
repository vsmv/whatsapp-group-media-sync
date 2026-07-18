@echo off
title WhatsApp-MEGA Sync
start "" "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --remote-debugging-port=9222 --remote-allow-origins=* --user-data-dir="%LOCALAPPDATA%\Microsoft\Edge\User Data" https://web.whatsapp.com
timeout /t 12 /nobreak >nul
cd /d "C:\D\Whatsapp Sync\direct-sync"
node "C:\Users\Admin\AppData\Roaming\npm\node_modules\pm2\bin\pm2" start ecosystem.config.js
echo Dashboard: http://localhost:3000
pause