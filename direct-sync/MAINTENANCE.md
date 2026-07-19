# MAINTENANCE GUIDE
# WhatsApp to MEGA Direct Sync

### Author: Venki (@vsmv)
### Version: 1.0
### Date: 2026-07-19

---

## 1. Current Versions (as of 2026-07-19)

| Component | Version | Upgrade Priority |
|-----------|---------|-----------------|
| Node.js | v22.14.0 (LTS) | Low — update when v24 LTS released |
| puppeteer-core | 25.3.0 | Medium — keep within 2 major of browser |
| megajs | 1.3.10 | Low — MEGA API is stable |
| dotenv | 17.4.2 | Very Low |
| express | 5.2.1 | Very Low |
| Edge Browser | 150.0.4078.83 | Auto-updates (see below) |
| PM2 | latest | Low |

---

## 2. API Upgrade Risks — Priority Order

### 🔴 HIGH RISK: WhatsApp Web Internal API

**This is the #1 maintenance concern.** The app uses WhatsApp Web's INTERNAL (undocumented) JavaScript modules:

```
window.require("WAWebCollections")     — Chat, Msg collections
window.require("WAWebCmd")             — Cmd.openChatBottom()
window.require("WAWebDownloadManager") — downloadAndDecrypt()
window.require("WAWebSendMsgUtils")    — sendDeleteMsgs()
```

**When WhatsApp updates their web client (every few weeks):**
- Module names may change (e.g., WAWebCollections → WAWebCollectionsV2)
- Method signatures may change
- Internal structure may change
- The app will stop working

**Symptoms of WhatsApp API breakage:**
```
Error: Cannot read property 'Chat' of undefined
Error: window.require is not a function  
Error: downloadAndMaybeDecrypt is not a function
Error: sendDeleteMsgs is not a function
```

**How to fix:**
1. Open WhatsApp Web in Edge browser manually
2. Press F12 → Console
3. Type: `window.require("WAWebCollections")` — check if it exists
4. If renamed, search for new module name:
   ```javascript
   Object.keys(window).filter(k => k.startsWith("webpackChunk"))[0]
   ```
5. Update module names in `src/app.js`
6. Test each function individually in console

**Prevention:** Check app health weekly:
```bash
curl http://localhost:3000/api/health
# If wa=false consistently → WhatsApp API may have changed
```

---

### 🟡 MEDIUM RISK: Edge Browser Auto-Updates

Edge updates automatically. Each update may:
- Change Chromium version → puppeteer-core CDP protocol changes
- Change `--user-data-dir` behavior
- Change `--remote-debugging-port` behavior

**The `--user-data-dir` flag is CRITICAL.** If a future Edge update removes or changes this flag's behavior, the debug port won't open.

**Monitoring:**
```bash
# Check Edge version periodically
(Get-Item "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe").VersionInfo.ProductVersion

# If debug port stops working after Edge update:
# 1. Kill Edge
# 2. Relaunch with --user-data-dir flag
# 3. Check DevToolsActivePort file exists
```

---

### 🟢 LOW RISK: npm Packages

#### puppeteer-core
- Check: `npm outdated puppeteer-core`
- Update: `npm update puppeteer-core`
- Risk: CDP protocol changes. Test after update.
- Frequency: Every 3-6 months

#### megajs
- Check: `npm outdated megajs`
- Update: `npm update megajs`
- Risk: Very low. MEGA API is stable.
- Frequency: Every 6-12 months

#### express
- Check: `npm outdated express`
- Update: `npm update express`
- Risk: Very low. v5 is stable.
- Frequency: Yearly

#### dotenv
- Check: `npm outdated dotenv`
- Update: `npm update dotenv`
- Risk: Negligible.
- Frequency: Yearly

---

## 3. Upgrade Procedure

### How to update all packages:
```bash
cd C:\D\Whatsapp Sync\direct-sync

# Check what's outdated
npm outdated

# Update all to latest compatible
npm update

# Test the app
pm2 restart wa-mega-sync
# Wait 60s, check health:
curl http://localhost:3000/api/health
```

### How to update Node.js:
```bash
# Download LTS from https://nodejs.org
# Install (overwrites existing)
# Verify:
node --version

# Reinstall PM2 globally
npm install -g pm2

# Reinstall project deps
cd C:\D\Whatsapp Sync\direct-sync
rm -rf node_modules
npm install

# Restart
pm2 restart wa-mega-sync
```

---

## 4. WhatsApp Web Module Reference

If WhatsApp updates and breaks the app, these are the modules to check:

| Module | Purpose | How to test in F12 Console |
|--------|---------|---------------------------|
| `WAWebCollections` | Chat & Msg collections | `window.require("WAWebCollections").Chat.getModelsArray().length` |
| `WAWebCmd` | Chat commands | `typeof window.require("WAWebCmd").Cmd.openChatBottom` |
| `WAWebDownloadManager` | Media download | `typeof window.require("WAWebDownloadManager").downloadManager.downloadAndMaybeDecrypt` |
| `WAWebSendMsgUtils` | Delete messages | `typeof window.require("WAWebSendMsgUtils").sendDeleteMsgs` |

**If a module is not found:**
```javascript
// Find the new module name by searching webpack chunks
const chunkName = Object.keys(window).find(k => k.startsWith("webpackChunk"));
window[chunkName].push([[Math.random()], {}, function(require) {
  const mods = require.c;
  for (const id in mods) {
    const exp = mods[id].exports;
    if (exp && exp.Chat) console.log("Found Chat in module:", id);
  }
}]);
```

---

## 5. Weekly Maintenance Checklist

```
□ Check app health: curl http://localhost:3000/api/health
□ Check dashboard: http://localhost:3000 (all badges green?)
□ Check logs for errors: pm2 logs wa-mega-sync --lines 20
□ Check MEGA storage: rclone size mega:whatsapp-backup --json
□ Check dedup hashes: curl http://localhost:3000/api/stats (dedupHashes growing?)
□ Check excluded groups still correct
□ Check Edge is running with debug port (port 9222 open)
□ Check PM2 status: pm2 list (app online, restarts < 10)
```

---

## 6. Monthly Maintenance

```
□ Update npm packages: npm update
□ Check npm audit: npm audit
□ Clear old logs: truncate -s 0 logs/sync.log
□ Backup hashes.json: cp data/hashes.json data/hashes-backup.json
□ Backup excluded.json: cp data/excluded.json data/excluded-backup.json
□ Restart services: pm2 restart wa-mega-sync
□ Check Edge version (note if major version changed)
```

---

## 7. Emergency Recovery

### App completely broken (WhatsApp API changed):

**Step 1:** Check which module broke
```bash
# SSH or open PowerShell
# Check logs for specific error
pm2 logs wa-mega-sync --lines 50
```

**Step 2:** Open WhatsApp Web F12 Console, test modules
```
Open Edge → web.whatsapp.com → F12 → Console
Type each module test from Section 4 above
```

**Step 3:** Update module names in app.js
```bash
cd C:\D\Whatsapp Sync\direct-sync
notepad src\app.js
# Search for the old module name, replace with new
```

**Step 4:** Restart and test
```bash
pm2 restart wa-mega-sync
# Wait 60s
curl http://localhost:3000/api/health
```

### MEGA credentials changed:
```bash
cd C:\D\Whatsapp Sync\direct-sync
notepad .env
# Update MEGA_EMAIL and MEGA_PASS
pm2 restart wa-mega-sync
```

### Edge debug port won't open:
```bash
# Kill ALL Edge
taskkill /F /IM msedge.exe /T
# Wait 10s
# Relaunch with mandatory flags
Start-Process -FilePath "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" -ArgumentList "--remote-debugging-port=9222","--remote-allow-origins=*","--user-data-dir=$env:LOCALAPPDATA\Microsoft\Edge\User Data","https://web.whatsapp.com"
# Wait 15s
# Restart app
pm2 restart wa-mega-sync
```

---

## 8. Data Files (Backup These)

| File | Location | Purpose | Backup Frequency |
|------|----------|---------|-----------------|
| `hashes.json` | `data/hashes.json` | SHA256 dedup cache (2000+ hashes) | Monthly |
| `excluded.json` | `data/excluded.json` | Permanently excluded groups | After changes |
| `.env` | `.env` | MEGA credentials + config | After changes |
| `sync.log` | `logs/sync.log` | Activity history | Optional |

**Without hashes.json:** Dedup starts fresh — all files would be re-uploaded to MEGA (no duplicates caught). Rebuilding from scratch takes days.

**Without excluded.json:** All keyword-matched groups re-included (excluded groups come back).

---

*Built by Venki (@vsmv) — MIT License*