# USER MANUAL — WhatsApp to MEGA Direct Sync

### By Venki (@vsmv)

---

## Table of Contents

1. [Quick Start (Auto-Start)](#1-quick-start-auto-start)
2. [Manual Start](#2-manual-start)
3. [Dashboard Guide](#3-dashboard-guide)
4. [Group Config — Sync & Delete Controls](#4-group-config--sync--delete-controls)
5. [How Deduplication Works](#5-how-deduplication-works)
6. [Troubleshooting](#6-troubleshooting)
7. [Configuration (.env)](#7-configuration-env)
8. [PM2 Commands](#8-pm2-commands)

---

## 1. Quick Start (Auto-Start)

The system is configured to start automatically when you log into Windows.

### What happens on boot:
```
Windows starts → Task Scheduler runs start-silent.vbs
  → Edge browser opens with WhatsApp Web
  → PM2 resurrects the sync app (hidden, no window)
  → App connects to MEGA + WhatsApp
  → Dashboard goes live at http://localhost:3000
  → Media flows to MEGA automatically
```

### To verify auto-start is working:
1. Turn on your laptop
2. Wait 1-2 minutes for Edge + app to initialize
3. Open browser → go to http://localhost:3000
4. You should see the dashboard with MEGA + WhatsApp badges green

### If auto-start doesn't work:
- Open Task Scheduler → look for "WhatsApp-MEGA-Sync"
- Right-click → Run
- Or use Manual Start (below)

---

## 2. Manual Start

### Option A: Console Window (shows live output)

Double-click: `C:\D\Whatsapp Sync\direct-sync\start.bat`

Or from Command Prompt:
```
cd C:\D\Whatsapp Sync\direct-sync
start.bat
```

This opens a window showing live logs. Close the window to stop.

### Option B: Silent Background (no window)

Double-click: `C:\D\Whatsapp Sync\start-silent.vbs`

Runs hidden in background. No window, no console.

### Option C: PM2 (recommended for production)

```
cd C:\D\Whatsapp Sync\direct-sync
node "C:\Users\Admin\AppData\Roaming\npm\node_modules\pm2\bin\pm2" start ecosystem.config.js
```

PM2 auto-restarts on crash. To stop:
```
node "C:\Users\Admin\AppData\Roaming\npm\node_modules\pm2\bin\pm2" stop wa-mega-sync
```

### Prerequisites for all methods:
- Edge browser must be running with WhatsApp Web logged in
- If Edge is not running, launch it first:
  ```
  "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --remote-debugging-port=9222 --remote-allow-origins=* https://web.whatsapp.com
  ```

---

## 3. Dashboard Guide

Open **http://localhost:3000** in any browser.

### Stat Cards (top row):

| Card | Meaning |
|------|---------|
| **Downloaded** | Total media files found in WhatsApp groups |
| **Uploaded** | Files successfully uploaded to MEGA |
| **Dup Prevented** | Duplicate files skipped (same content, different group) |
| **Deleted WA** | Files deleted from WhatsApp after MEGA upload |
| **Failed** | Upload failures (retries exhausted) |
| **Queue** | Files waiting to upload (should be near 0) |
| **Uptime** | How long the app has been running |

### Progress Bar:
Shows percentage of downloaded files that have been processed (uploaded + failed + skipped).

### Groups Table:
Per-group breakdown — Downloaded / Uploaded / Deleted / Failed counts.

### Activity Log:
Real-time feed of every action:
- ↑ green = uploaded to MEGA
- ↓ blue = downloaded from WhatsApp
- ⊖ purple = duplicate skipped
- ✗ orange = deleted from WhatsApp
- ✗ red = failed

---

## 4. Group Config — Sync & Delete Controls

Click the **"Group Config"** button on the dashboard.

### Master Toggles (top of modal):

**Sync (Backup) — Master:**
- **ON** (default): All filtered groups are backed up to MEGA
- **OFF**: Stops ALL backup immediately. Existing MEGA files are safe.

**Auto-Delete — Master:**
- **OFF** (default): Files stay in WhatsApp after upload
- **ON**: Files are deleted from WhatsApp after MEGA confirms upload
  - When ON → all per-group delete toggles turn ON
  - When OFF → all per-group delete toggles turn OFF

### Search Box:
Type any text to filter groups. Example: type "vysya" to see only Vysya groups.

### Per-Group Toggles (each group row):

**Green "Sync" toggle:**
- ON = this group's media is backed up
- OFF = this group is skipped (no download, no upload)
- Overrides the master toggle for this specific group

**Red "Del" toggle:**
- ON = files from this group are deleted from WhatsApp after upload
- OFF = files from this group stay in WhatsApp
- Only works when Master Delete is ON
- Overrides the master toggle for this specific group

### Typical Workflow:

**I want to backup everything but only delete from specific groups:**
1. Click "Group Config"
2. Master Delete → ON (all groups get delete)
3. Search for groups you DON'T want deleted
4. Toggle their red "Del" switch OFF
5. Those groups keep files in WhatsApp; all others auto-delete

**I want to stop backup for a specific group:**
1. Click "Group Config"
2. Search for the group name
3. Toggle green "Sync" switch OFF
4. That group is no longer backed up

### Auto-Pick New Groups:
- New WhatsApp groups matching keywords are automatically detected and added
- Groups that no longer exist are automatically removed
- No manual configuration needed — just wait for the next scan pass (~13 min)

---

## 5. How Deduplication Works

### Two-Layer Dedup:

**Layer 1: Path Dedup**
- Checks if the exact file (same group/date/filename) already exists on MEGA
- Prevents re-uploading the same file from the same group

**Layer 2: Content Dedup (SHA256)**
- Computes SHA256 hash of every file before upload
- If the same image was already uploaded from ANY group → skipped
- Example: Same horoscope forwarded to 5 groups → uploaded ONCE, skipped 4 times
- Hashes persist in `data/hashes.json` across restarts

### Dedup Stats:
- "Dup Prevented" card shows how many duplicates were caught
- "hashes tracked" shows total unique files in the dedup database
- Typical duplicate rate: 86% (same biodatas/horoscopes shared across groups)

---

## 6. Troubleshooting

### Dashboard not loading (http://localhost:3000):
1. Check if app is running: `pm2 list` (look for "online" status)
2. If stopped: `pm2 restart wa-mega-sync`
3. Wait 30-60 seconds for initialization
4. Check logs: `pm2 logs wa-mega-sync --lines 20`

### WhatsApp not connecting:
1. Check Edge is running: look for Edge in taskbar
2. Check WhatsApp Web is logged in (not showing QR code)
3. Restart Edge with debug port:
   ```
   "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --remote-debugging-port=9222 --remote-allow-origins=* https://web.whatsapp.com
   ```
4. Restart app: `pm2 restart wa-mega-sync`

### MEGA not uploading:
1. Check MEGA badge is green on dashboard
2. If red: MEGA connection dropped. App auto-retries every 60 seconds.
3. Check MEGA password in .env file
4. Verify MEGA account isn't locked or over quota

### Files not being captured:
1. WhatsApp Web only loads ~50 recent messages per group
2. Open the group in Edge browser → scroll up → app captures on next pass
3. New messages are captured within ~13 minutes (one scan pass)
4. Check group is active in Group Config (green Sync toggle ON)

### Log file location:
```
C:\D\Whatsapp Sync\direct-sync\logs\sync.log
```

---

## 7. Configuration (.env)

File: `C:\D\Whatsapp Sync\direct-sync\.env`

```env
BROWSER_PORT=9222              # Edge remote debug port
SERVER_PORT=3000               # Dashboard port
MEGA_EMAIL=your@email.com      # MEGA account email
MEGA_PASS="your-password"      # MEGA password (quote if has $)
MEGA_FOLDER=whatsapp-backup    # MEGA destination folder
GROUP_NAMES=vysya,vasavi,arya,marriage,matrimony,kalyana,...
PARALLEL_UPLOADS=3             # Concurrent MEGA uploads
MAX_RETRIES=3                  # Upload retry attempts
DASHBOARD_PASS=                # Optional dashboard password
```

### Group Filter Keywords:
Case-insensitive substring match. Supports multi-language:
- English: vysya, vasavi, arya, marriage, matrimony, kalyana, horoscope
- Telugu: వాసవి, వైశ్య, కళ్యాణ, వివాహ
- Tamil: விவாகம், வைசிய
- Kannada: ವಿವಾಹ

---

## 8. PM2 Commands

```bash
# Start app
pm2 start ecosystem.config.js

# Stop app
pm2 stop wa-mega-sync

# Restart app
pm2 restart wa-mega-sync

# View live logs
pm2 logs wa-mega-sync

# View last 20 log lines
pm2 logs wa-mega-sync --lines 20 --nostream

# Check status
pm2 list

# Save process list (for auto-resurrect)
pm2 save

# Delete from PM2
pm2 delete wa-mega-sync
```

PM2 path on this system:
```
C:\Users\Admin\AppData\Roaming\npm\node_modules\pm2\bin\pm2
```

---

## Windows Task Scheduler

The app auto-starts via Windows Task Scheduler:

**Task name:** WhatsApp-MEGA-Sync
**Trigger:** At logon
**Action:** Runs start-silent.vbs (hidden)

### Manage the task:
```
# Check status
schtasks /query /tn "WhatsApp-MEGA-Sync"

# Run manually
schtasks /run /tn "WhatsApp-MEGA-Sync"

# Delete
schtasks /delete /tn "WhatsApp-MEGA-Sync" /f
```

---

*Built by Venki (@vsmv) — MIT License*