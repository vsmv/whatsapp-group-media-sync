# SYSTEM DESIGN DOCUMENT
# WhatsApp to MEGA Direct Sync

### Author: Venki (@vsmv)
### Version: 6.0
### Last Updated: 2026-07-18

---

## 1. MANDATORY DESIGN RULE

> **CRITICAL:** The system MUST ALWAYS connect to the user's EXISTING running Edge browser instance that has WhatsApp Web loaded. The system must NEVER create a new browser profile, NEVER launch a separate browser instance, and NEVER require a separate QR scan. The WhatsApp Web session in the user's default Edge profile is the single source of truth.

### Edge Launch Requirements (MANDATORY):
```
Edge MUST be launched with ALL of these flags:
  --remote-debugging-port=9222
  --remote-allow-origins=*
  --user-data-dir=<default Edge profile path>    ← MANDATORY (see below)
  https://web.whatsapp.com                        ← only on first launch

The --user-data-dir flag is MANDATORY because:
1. Edge 150+ silently ignores --remote-debugging-port WITHOUT it
2. It ensures the default profile (with WhatsApp Web session) is used
3. Without it, port 9222 never opens and the app cannot connect

The --user-data-dir path WILL contain a space ("User Data"). This is EXPECTED
and CORRECT. It may cause a cosmetic "data" tab in Edge but this is acceptable.
DO NOT attempt to fix this by removing --user-data-dir — it will break the
debug port entirely.
```

### What NOT to do:
- ❌ Do NOT remove --user-data-dir from Edge launch commands
- ❌ Do NOT use a separate profile directory (breaks WhatsApp session)
- ❌ Do NOT add launchEdge() or auto-relaunch logic inside app.js
- ❌ Do NOT add notifyWin() or any function that spawns cmd.exe/PowerShell from app.js
- ❌ Do NOT set PM2 max_memory_restart below 1GB
- ❌ Do NOT launch Edge without killing ALL existing Edge processes first

---

## 2. SYSTEM ARCHITECTURE

```
┌──────────────────────────────────────────────────────────┐
│                STARTUP LAYER                               │
│                                                            │
│  Windows Task Scheduler (at logon)                         │
│         ↓                                                  │
│  start-silent.vbs                                          │
│         ↓                                                  │
│  start-monitor.ps1 (PowerShell, hidden)                    │
│    1. Kill ALL Edge processes                              │
│    2. Remove SingletonLock files                           │
│    3. Launch Edge with --remote-debugging-port=9222        │
│       --user-data-dir=<DEFAULT PROFILE>                    │
│       https://web.whatsapp.com                             │
│    4. Poll port 9222 (up to 60s)                           │
│    5. Start PM2 → app.js                                   │
│    6. Poll /api/health (up to 90s)                         │
│    7. Windows notification                                 │
│    8. Monitor loop every 10 min (restart PM2 if died)      │
└──────────────────────────────────────────────────────────┘
                     ↓
┌──────────────────────────────────────────────────────────┐
│                APPLICATION LAYER (app.js)                   │
│                                                            │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐   │
│  │  WhatsApp    │  │  Upload      │  │  MEGA Uploader  │   │
│  │  Download    │─▶│  Queue       │─▶│  (megajs)       │   │
│  │  (puppeteer  │  │  (in-memory) │  │                  │   │
│  │   port 9222) │  │              │  │  3 parallel      │   │
│  └─────────────┘  └──────────────┘  └────────┬────────┘   │
│                                                │           │
│  ┌──────────────┐  ┌──────────────────────────┘           │
│  │ SHA256 Dedup │  │ Auto-Delete (if enabled)              │
│  │ (hashes.json)│  │ via WhatsApp Web API                  │
│  └──────────────┘  └──────────────────────────────────────│
│                                                            │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ Express Dashboard (port 3000)                         │ │
│  │  - Stats API (/api/stats)                             │ │
│  │  - Group Config (/api/groups-list)                    │ │
│  │  - Health Check (/api/health)                         │ │
│  │  - Toggles: sync, delete (master + per-group)         │ │
│  └──────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
       │                              │
       ▼                              ▼
┌──────────────┐              ┌──────────────┐
│ Edge Browser  │              │ MEGA Cloud   │
│ (WhatsApp Web │              │ (backup      │
│  port 9222)   │              │  folder)     │
└──────────────┘              └──────────────┘
```

---

## 3. COMPONENT DESIGN

### 3.1 Edge Browser Connection

**Connection method:** puppeteer-core connects to Edge via CDP (Chrome DevTools Protocol) on port 9222.

**Critical requirement:** Edge MUST be launched with `--user-data-dir` pointing to the default profile. Without this flag, Edge 150+ silently refuses to open the debug port.

**Connection flow:**
```
app.js → puppeteer.connect({ browserURL: "http://localhost:9222" })
  → finds WhatsApp Web tab
  → injects queueUpload() via page.exposeFunction()
  → evaluates downloadAndDecrypt() in browser context
  → media buffer returned to Node.js via bridge function
```

**Reconnection:** If connection drops, app retries every 15 seconds. After 3 failures, waits 60 seconds (does NOT relaunch Edge — that's the monitor's job).

### 3.2 Download Pipeline

**In-browser (page.evaluate):**
1. Open chat via Cmd.openChatBottom()
2. Filter messages with mediaKey !== undefined
3. Download via WAWebDownloadManager.downloadAndMaybeDecrypt()
4. Convert to base64 via FileReader
5. Generate 200px thumbnail via canvas (for JPEG/PNG/WebP only)
6. Call window.queueUpload(groupName, date, filename, base64, thumbBase64, msgId)

**In Node.js (queueUpload → enqueue):**
1. Check path dedup (uploadedSet)
2. Check content dedup (SHA256 hash in dedupHashes)
3. If new → add to upload queue with buffer, hash, msgId
4. Return status: "uploaded" | "dup" | "skip"

### 3.3 Upload Pipeline

**Queue processing (drain function):**
1. Up to PARALLEL_UPLOADS (3) concurrent uploads
2. Navigate MEGA folder tree (cached via fCache Map)
3. Upload buffer via megajs folder.upload()
4. 60s timeout per upload
5. On success: add hash to dedupHashes, save hashes.json (atomic write)
6. On failure: retry up to MAX_RETRIES (3), then log as failed
7. If autoDelete enabled + group has delete ON: delete message from WhatsApp

### 3.4 Deduplication (Two-Layer)

**Layer 1 — Path Dedup (uploadedSet):**
- Set of "group/date/filename" paths from MEGA
- Populated on startup by traversing MEGA folder tree
- Prevents re-uploading same file to same path

**Layer 2 — Content Dedup (dedupHashes):**
- Set of SHA256 hashes (first 32 chars) of file buffers
- Persisted in data/hashes.json (atomic write: temp + rename)
- Prevents uploading same image from different groups
- Typical hit rate: 86% (same horoscopes/biodatas forwarded across groups)

### 3.5 Group Management

**Filtering:**
- GROUP_NAMES from .env (comma-separated keywords)
- Case-insensitive substring match against group names
- Multi-language: English, Telugu, Tamil, Kannada
- New matching groups auto-detected each scan pass
- Removed groups auto-dropped

**Toggles:**
- masterSync (boolean): global on/off for all backup
- masterDelete (boolean): global on/off for auto-delete
- activeGroups (Set): per-group sync on/off
- deleteGroups (Set): per-group delete on/off
- Delete only fires when: masterDelete=true AND deleteGroups.has(group) AND upload confirmed

### 3.6 Auto-Delete from WhatsApp

**When enabled (masterDelete ON + per-group delete ON):**
1. After MEGA upload confirms success
2. App calls WhatsApp Web API: WAWebSendMsgUtils.sendDeleteMsgs()
3. Message is deleted from the linked device
4. Counter incremented, logged in activity feed

**Safety:**
- Delete happens ONLY after upload success
- Failed uploads → message kept for retry
- Default: OFF (manual mode)

### 3.7 Dashboard

**Express server on port 3000:**
- `/` — Dashboard HTML (auto-refresh every 3s)
- `/api/stats` — All counters + group stats + activity log
- `/api/health` — Simple health check (ok/uptime/mega/wa/queue)
- `/api/groups-list` — All matched groups with active/delete flags
- `/api/toggle-master-sync` — Toggle all groups sync
- `/api/toggle-master-delete` — Toggle all groups delete
- `/api/toggle-group` — Toggle individual group sync
- `/api/toggle-delete-group` — Toggle individual group delete

---

## 4. DATA FLOW

```
WhatsApp Group Message (with media)
  ↓
Edge Browser (WhatsApp Web, port 9222)
  ↓ page.evaluate: downloadAndDecrypt()
Decrypted ArrayBuffer (in browser memory)
  ↓ FileReader → base64
window.queueUpload(group, date, filename, base64, thumb, msgId)
  ↓ exposeFunction bridge
Node.js enqueue()
  ↓ SHA256 check
Upload Queue (in-memory)
  ↓ drain() every 3s
megajs folder.upload()
  ↓
MEGA Cloud Storage
  ↓ (if auto-delete enabled)
WhatsApp Web API sendDeleteMsgs()
  ↓
Message deleted from WhatsApp
```

---

## 5. SCAN CYCLE

```
Every ~13 minutes:
  1. Query all groups from WhatsApp Web
  2. Filter by GROUP_NAMES keywords
  3. For each active group:
     a. Open chat (Cmd.openChatBottom)
     b. Wait 3s for messages to load
     c. For each media message:
        - Download + decrypt
        - Generate thumbnail
        - Queue for upload
     d. Wait 150ms between messages
  4. Drain upload queue
  5. Wait 30s
  6. Repeat
```

---

## 6. CRITICAL CONFIGURATION

### .env (MANDATORY values):
```env
BROWSER_PORT=9222                    # Edge debug port (DO NOT CHANGE)
SERVER_PORT=3000                     # Dashboard port
MEGA_EMAIL=<email>                   # MEGA credentials
MEGA_PASS="<password>"               # Quote if contains $
MEGA_FOLDER=whatsapp-backup          # MEGA destination
GROUP_NAMES=<keywords>               # Comma-separated filter
PARALLEL_UPLOADS=3                   # Concurrent uploads
MAX_RETRIES=3                        # Upload retry count
```

### PM2 ecosystem.config.js:
```javascript
max_memory_restart: "1G"            // DO NOT set below 1G
restart_delay: 10000                 // 10s between restarts
```

### Edge launch (MANDATORY flags):
```
--remote-debugging-port=9222
--remote-allow-origins=*
--user-data-dir=%LOCALAPPDATA%\Microsoft\Edge\User Data
```

---

## 7. LESSONS LEARNED (DO NOT REPEAT)

| Issue | Cause | Fix |
|-------|-------|-----|
| Port 9222 never opens | Missing --user-data-dir flag | ALWAYS include --user-data-dir |
| Infinite Edge windows | launchEdge() in app.js | NEVER add Edge launch logic in app.js |
| cmd.exe spam | notifyWin() spawning PowerShell | NEVER spawn processes from app.js |
| Restart loop every 60s | 500MB memory limit too low | Use 1GB minimum |
| "data\" phantom tab | Space in "User Data" path | Accept it (cosmetic, port works) |
| Edge won't die | Startup Boost + auto-restart | Disable via registry + Task Scheduler |
| Dedup not loading | Password $ in .env unquoted | Quote password: "pass$" |
| Group filter not matching | Wrong .env loaded | Use explicit path in dotenv.config() |

---

## 8. FILE STRUCTURE

```
direct-sync/
├── src/
│   └── app.js                    # Single file: server + download + upload + API
├── public/
│   └── index.html                # Dashboard UI (Group Config + stats)
├── logs/
│   ├── sync.log                  # Application log
│   ├── output.log                # PM2 stdout
│   └── error.log                 # PM2 stderr
├── data/
│   └── hashes.json               # SHA256 dedup cache (atomic writes)
├── .env                          # Config (NOT in git)
├── .env.example                  # Config template
├── ecosystem.config.js           # PM2 process config
├── start.bat                     # Manual start (console)
├── start-silent.vbs              # Silent start (Task Scheduler)
├── start-monitor.ps1             # Robust startup monitor
├── package.json                  # Dependencies
├── README.md                     Project overview
├── USER_MANUAL.md                End-user guide
└── SYSTEM_DESIGN.md              This document
```

---

## 9. HISTORY LOADING — NOT SUPPORTED\n\nProgrammatic loading of older WhatsApp message history was investigated and dropped.\n\n**Why:** WhatsApp Web's linked device protocol does not expose any API for loading\nmessages beyond the initial ~50 recent messages per chat.\n\n**Tested methods (ALL FAILED):**\n- DOM scroll (element.scrollTop = 0)\n- CDP Input.dispatchMouseEvent (mouseWheel)\n- Keyboard PageUp/Home\n- Internal API: chat.msgs.fetch() — does not exist\n- Internal API: chat.loadEarlierMsgs() — does not exist\n- Module: WAWebHistorySync — not found\n- Module: WAWebBackendJobs — not found\n\n**Current capability:**\n- Captures all currently loaded messages (~50 per group)\n- Captures new messages in real-time (every 13 min scan)\n- If user manually scrolls up in Edge, app captures on next pass\n\n---\n\n*Built by Venki (@vsmv) — MIT License*