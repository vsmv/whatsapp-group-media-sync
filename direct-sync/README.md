# WhatsApp to MEGA Direct Sync

### Built by **Venki** ([@vsmv](https://github.com/vsmv))

Automatically captures media from WhatsApp groups and uploads directly to MEGA cloud — no staging folder, no rclone. Features a real-time dashboard with per-group sync/delete controls, SHA256 cross-group deduplication, PM2 auto-restart, Windows notifications, and self-healing Edge auto-relaunch.

---

## Key Features

| Feature | Description |
|---------|-------------|
| **Direct Upload** | WhatsApp Web to memory to MEGA. No local staging folder. |
| **Content Dedup** | SHA256 hash prevents same image uploading twice across ANY group. ~86% duplicate rate eliminated. |
| **Group Config** | Master + per-group toggles for Sync (backup) and Delete (auto-clean). Search box to find groups. |
| **Live Dashboard** | Real-time stats at http://localhost:3000 with per-group breakdown and activity log. |
| **Thumbnail Generation** | 200px JPEG thumbnails generated in-browser for MEGA grid view. |
| **Self-Healing Startup** | PowerShell monitor launches Edge, waits for debug port, starts PM2, verifies health. Auto-relaunches Edge if it crashes. |
| **Windows Notifications** | Toast/balloon notifications on successful startup, errors, and Edge crashes. |
| **Auto-Reconnect** | Edge or MEGA disconnects? Auto-retry with backoff. App never dies. |
| **Upload Retry** | Failed uploads retry 3 times before logging as failed. |
| **Graceful Shutdown** | SIGINT/SIGTERM flushes dedup hashes to disk. No data loss. |
| **PM2 Managed** | Auto-restart on crash. Resurrects on boot via Windows Task Scheduler. |
| **Parallel Uploads** | 3 concurrent uploads to MEGA (configurable). |
| **Persistent Logs** | All activity written to logs/sync.log. |
| **Atomic File Writes** | hashes.json written via temp+rename. Crash-proof. |

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│        Windows Task Scheduler (at logon)             │
│              ↓ triggers                               │
│        start-silent.vbs → start-monitor.ps1           │
│  (Launches Edge → waits → starts PM2 → notifies)      │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│              Dashboard (port 3000)                    │
│    Stats · Group Config · Sync/Delete Toggles         │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│           Node.js Server (app.js)                     │
│                                                       │
│  ┌──────────┐   ┌───────────┐   ┌──────────────┐    │
│  │ WhatsApp  │   │ Upload    │   │ MEGA Uploader│    │
│  │ Download  │──▶│ Queue     │──▶│ (megajs)     │    │
│  │ (puppeteer)│   │ (memory)  │   │              │    │
│  └──────────┘   └───────────┘   └──────┬───────┘    │
│                                         │            │
│  ┌──────────────┐  ┌──────────────────┐│            │
│  │SHA256 Dedup  │  │Win Notifications ││            │
│  │(hashes.json) │  │(toast/balloon)   ││            │
│  └──────────────┘  └──────────────────┘│            │
│                                       │             │
│  ┌────────────────────────────────────┘             │
│  │ Auto-Edge-Relaunch (if crashed)                   │
│  └───────────────────────────────────────────────────│
└──────────────────────────────────────────────────────┘
      │                                    │
      ▼                                    ▼
┌───────────┐                      ┌───────────┐
│Edge Browser│                      │MEGA Cloud │
│(WhatsApp   │                      │(backup)   │
│Web :9222)  │                      │           │
└───────────┘                      └───────────┘
```

---

## Startup Sequence (Self-Healing)

```
1. Windows boots → Task Scheduler runs start-silent.vbs
2. VBS calls start-monitor.ps1 (PowerShell, hidden)
3. Monitor launches Edge with --remote-debugging-port=9222
4. Monitor polls port 9222 every 2s (up to 60s) — WAITS for Edge
5. Monitor starts PM2 → app launches
6. Monitor polls http://localhost:3000/api/health (up to 90s)
7. Windows notification: "WhatsApp Sync Running"
8. Monitor loops every 5 min — relaunches Edge if crashed
```

If Edge crashes mid-run, the app itself also auto-relaunches Edge after 3 failed connection retries.

---

## Project Structure

```
direct-sync/
├── src/
│   └── app.js              # Main app: server + download + upload + API + notifications
├── public/
│   └── index.html          # Dashboard UI with Group Config
├── logs/
│   └── sync.log            # Persistent log file
├── data/
│   └── hashes.json         # SHA256 dedup cache (auto-generated, atomic writes)
├── .env                    # Your config (NOT in git)
├── .env.example            # Config template
├── ecosystem.config.js     # PM2 process config
├── start.bat               # Manual start (shows console)
├── start-silent.vbs        # Silent start (calls PowerShell monitor)
├── start-monitor.ps1       # Robust startup monitor (Edge wait + health check + notify)
├── package.json            # Dependencies
├── README.md               # This file
└── USER_MANUAL.md          # Complete user guide
```

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Runtime | Node.js 18+ |
| Browser automation | puppeteer-core (connects to Edge) |
| MEGA upload | megajs (official MEGA SDK) |
| Dashboard | Express + vanilla HTML/CSS/JS |
| Process manager | PM2 |
| Startup monitor | PowerShell + Windows Task Scheduler |
| Dedup | SHA256 (Node.js crypto) |
| Notifications | Windows Forms balloon (via PowerShell) |

---

## Author

**Venki** ([@vsmv](https://github.com/vsmv))

---

## License

MIT