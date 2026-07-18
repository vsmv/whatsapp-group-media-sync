# USER MANUAL — WhatsApp to MEGA Direct Sync

### By Venki (@vsmv)

---

## ⚠️ MANDATORY: Edge Browser Rule\n\n> The system MUST ALWAYS use the user's EXISTING Edge browser instance with WhatsApp Web.\n> Edge launch MUST include --user-data-dir flag (pointing to default profile).\n> Without this flag, Edge 150+ silently refuses to open the debug port.\n> NEVER use a separate browser profile — WhatsApp Web session must persist.\n\n---\n\n## 1. Auto-Start (On Laptop Boot)

### How it works:
```
Windows starts
  → Task Scheduler runs start-silent.vbs (hidden)
  → VBS calls start-monitor.ps1 (PowerShell)
  → Monitor launches Edge browser
  → Monitor waits for Edge debug port (up to 60s)
  → Monitor starts PM2 app
  → Monitor waits for app health check (up to 90s)
  → Windows notification: "WhatsApp Sync Running"
  → Monitor loops every 5 min (relaunches Edge if crashed)
```

### To verify:
1. Turn on laptop, wait 2 minutes
2. Look for Windows notification balloon: "WhatsApp Sync Running"
3. Open http://localhost:3000 — dashboard should show green MEGA + WhatsApp badges

### If no notification:
- Task Scheduler → find "WhatsApp-MEGA-Sync" → right-click → Run
- Or use Manual Start (below)

---

## 2. Manual Start

### Option A: Console window (live logs)
```
Double-click: C:\D\Whatsapp Sync\direct-sync\start.bat
```

### Option B: Silent (hidden background)
```
Double-click: C:\D\Whatsapp Sync\direct-sync\start-silent.vbs
```

### Option C: Full monitor (recommended)
```
powershell -ExecutionPolicy Bypass -File "C:\D\Whatsapp Sync\direct-sync\start-monitor.ps1"
```
This launches Edge, waits, starts app, shows notification, and monitors.

### Option D: PM2 directly
```
cd C:\D\Whatsapp Sync\direct-sync
node "C:\Users\Admin\AppData\Roaming\npm\node_modules\pm2\bin\pm2" start ecosystem.config.js
```

---

## 3. Dashboard Guide

Open **http://localhost:3000**

### Stat Cards:
| Card | Meaning |
|------|---------|
| Downloaded | Media files found in WhatsApp groups |
| Uploaded | Files on MEGA |
| Dup Prevented | Same-content files skipped (SHA256) |
| Deleted WA | Files auto-deleted from WhatsApp |
| Failed | Upload failures |
| Queue | Files waiting to upload |
| Uptime | Running time |

### Activity Log icons:
- ↑ green = uploaded | ↓ blue = downloaded | ⊖ purple = dup skipped | ✗ orange = deleted | ✗ red = failed

---

## 4. Group Config

Click **"Group Config"** button:

### Master Toggles:
- **Sync Master** (green): ON = backup all groups. OFF = stop all.
- **Delete Master** (red): ON = delete from WhatsApp after upload. OFF = keep all.
  - Turning ON → all per-group delete toggles turn ON
  - Turning OFF → all per-group delete toggles turn OFF

### Per-Group Toggles:
- **Green Sync**: override master per group
- **Red Del**: override master per group (only active when master is ON)

### Search:
Type group name to filter. New groups auto-detected each pass (~13 min).

---

## 5. Deduplication

- **SHA256 content hash** checked before every upload
- Same image in 5 groups → uploaded ONCE, skipped 4 times
- Hashes persist in data/hashes.json across restarts
- Typical duplicate rate: 86%

---

## 6. Windows Notifications

| Event | Notification |
|-------|-------------|
| App starts OK | "WhatsApp Sync Running" |
| App partial | "WhatsApp Sync Warning" |
| Edge fails | "WhatsApp Sync ERROR" |
| Edge crashes | "Edge disconnected, relaunching" |

---

## 7. Troubleshooting

### Dashboard not loading:
```
pm2 restart wa-mega-sync
```
Wait 60s, then refresh http://localhost:3000

### Edge connection error (port 9222 closed):\n**Most common cause:** Edge launched without --user-data-dir flag.\n**Fix:** Kill all Edge, relaunch with:\n`\ntaskkill /F /IM msedge.exe /T\nStart-Process -FilePath "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" -ArgumentList "--remote-debugging-port=9222","--remote-allow-origins=*","--user-data-dir=$env:LOCALAPPDATA\Microsoft\Edge\User Data","https://web.whatsapp.com"\n`\nWait 15s, then restart app: pm2 restart wa-mega-sync\n\n### Other Edge connection error:
App auto-relaunches Edge after 3 retries. If still failing:
```
"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --remote-debugging-port=9222 --remote-allow-origins=* https://web.whatsapp.com
```

### MEGA not uploading:
- Check MEGA badge is green on dashboard
- App auto-retries every 60s
- Check .env password

### Log file:
```
C:\D\Whatsapp Sync\direct-sync\logs\sync.log
```

---

## 8. Configuration (.env)

```env
BROWSER_PORT=9222
SERVER_PORT=3000
MEGA_EMAIL=your@email.com
MEGA_PASS="your-password"
MEGA_FOLDER=whatsapp-backup
GROUP_NAMES=vysya,vasavi,arya,marriage,matrimony,...
PARALLEL_UPLOADS=3
MAX_RETRIES=3
DASHBOARD_PASS=
```

---

## 9. PM2 Commands

```
pm2 start ecosystem.config.js     # Start
pm2 stop wa-mega-sync             # Stop
pm2 restart wa-mega-sync          # Restart
pm2 logs wa-mega-sync             # Live logs
pm2 list                          # Status
pm2 save                          # Save for auto-resurrect
```

---

## 10. Task Scheduler

```
schtasks /query /tn "WhatsApp-MEGA-Sync"   # Check
schtasks /run /tn "WhatsApp-MEGA-Sync"     # Run now
schtasks /delete /tn "WhatsApp-MEGA-Sync" /f  # Remove
```

---

*Built by Venki (@vsmv) — MIT License*