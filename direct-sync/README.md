# WhatsApp to MEGA Direct Sync

### Built by **Venki** ([@vsmv](https://github.com/vsmv))

Automatically captures media from WhatsApp groups and uploads directly to MEGA cloud — no staging folder, no rclone. Features a real-time dashboard with per-group sync/delete controls, SHA256 cross-group deduplication, and PM2 auto-restart.

---

## Key Features

| Feature | Description |
|---------|-------------|
| **Direct Upload** | WhatsApp Web → memory → MEGA. No local staging folder. |
| **Content Dedup** | SHA256 hash prevents same image uploading twice across ANY group. 86% duplicate rate eliminated. |
| **Group Config** | Master + per-group toggles for Sync (backup) and Delete (auto-clean). Search box to find groups. |
| **Live Dashboard** | Real-time stats at http://localhost:3000 — downloaded, uploaded, queue, failures, uptime. |
| **Thumbnail Generation** | 200px JPEG thumbnails generated for MEGA grid view (no need to open each file). |
| **Auto-Reconnect** | Edge or MEGA disconnects? Auto-retry with backoff. Never dies. |
| **Upload Retry** | Failed uploads retry 3 times before logging as failed. |
| **Graceful Shutdown** | SIGINT/SIGTERM flushes dedup hashes to disk. No data loss. |
| **PM2 Managed** | Auto-restart on crash. Resurrects on boot via Windows Task Scheduler. |
| **Parallel Uploads** | 3 concurrent uploads to MEGA (configurable). |
| **Persistent Logs** | All activity written to logs/sync.log. |

---

## Architecture

```
┌──────────────────────────────────────────────────┐
│              Dashboard (port 3000)                 │
│    Stats · Group Config · Sync/Delete Toggles      │
└────────────────────┬─────────────────────────────┘
                     │
┌────────────────────▼─────────────────────────────┐
│           Node.js Server (app.js)                  │
│                                                    │
│  ┌──────────┐   ┌───────────┐   ┌──────────────┐ │
│  │ WhatsApp  │   │ Upload    │   │ MEGA Uploader│ │
│  │ Download  │──▶│ Queue     │──▶│ (megajs)     │ │
│  │ (puppeteer)│   │ (memory)  │   │              │ │
│  └──────────┘   └───────────┘   └──────┬───────┘ │
│                                         │         │
│  ┌──────────────────────────────────────┐        │
│  │ SHA256 Dedup (hashes.json)           │        │
│  └──────────────────────────────────────┘        │
└───────────────────────────────────────────────────┘
      │                                    │
      ▼                                    ▼
┌───────────┐                      ┌───────────┐
│Edge Browser│                      │MEGA Cloud │
│(WhatsApp   │                      │(backup)   │
│Web :9222)  │                      │           │
└───────────┘                      └───────────┘
```

---

## Project Structure

```
direct-sync/
├── src/
│   └── app.js              # Main app: server + download + upload + API
├── public/
│   └── index.html          # Dashboard UI
├── logs/
│   └── sync.log            # Persistent log file
├── data/
│   └── hashes.json         # SHA256 dedup cache (auto-generated)
├── .env                    # Your config (NOT in git)
├── .env.example            # Config template
├── ecosystem.config.js     # PM2 process config
├── start.bat               # Manual start (shows console)
├── start-silent.vbs        # Silent start (for Task Scheduler)
├── package.json            # Dependencies
└── README.md               # This file
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
| Dedup | SHA256 (Node.js crypto) |

---

## Author

**Venki** ([@vsmv](https://github.com/vsmv))

---

## License

MIT