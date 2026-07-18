# Raspberry Pi Deployment Guide
# WhatsApp to MEGA Direct Sync — 24/7 Headless Server

### Author: Venki (@vsmv)
### Version: 1.0
### Date: 2026-07-18

---

## Table of Contents

1. [Why Raspberry Pi?](#1-why-raspberry-pi)
2. [Hardware Shopping List](#2-hardware-shopping-list)
3. [Physical Assembly](#3-physical-assembly)
4. [OS Installation](#4-os-installation)
5. [Network Configuration](#5-network-configuration)
6. [Software Installation](#6-software-installation)
7. [Chromium + WhatsApp Setup](#7-chromium--whatsapp-setup)
8. [App Deployment](#8-app-deployment)
9. [Auto-Start on Boot (systemd)](#9-auto-start-on-boot-systemd)
10. [Remote Access (VNC/SSH)](#10-remote-access-vncssh)
11. [Maintenance & Monitoring](#11-maintenance--monitoring)
12. [Troubleshooting](#12-troubleshooting)
13. [Cost Breakdown](#13-cost-breakdown)

---

## 1. Why Raspberry Pi?

| Factor | Laptop (Current) | Raspberry Pi |
|--------|------------------|--------------|
| Power consumption | 30-65W | **3-5W** (90% less) |
| Designed for 24/7 | No (sleep, updates) | **Yes** |
| Windows updates | Force reboots | **N/A** (Linux) |
| Browser interference | User browsing breaks debug port | **None** (dedicated) |
| Noise | Fan noise | **Silent** (passive case) |
| Footprint | Large | **Credit card size** |
| Monthly power cost | ~$15-30 | **~$1-2** |
| Setup complexity | Low | Medium (one-time) |

**Conclusion:** Raspberry Pi is purpose-built for always-on, low-power tasks exactly like this.

---

## 2. Hardware Shopping List

### Required (Core Kit)

| Item | Specification | Est. Price | Notes |
|------|--------------|------------|-------|
| **Raspberry Pi 5** | 8GB RAM | $80 | Best option. 4GB ($60) also works. |
| **Power Supply** | Official 27W USB-C PD | $10 | Must be 5V/5A for Pi 5 |
| **MicroSD Card** | 64GB SanDisk Extreme A2 | $12 | A2 rating = faster I/O. Or use USB SSD (below) |
| **Case** | Flirc Case (aluminum, passive) | $20 | Acts as heatsink, no fan needed |
| **Ethernet Cable** | Cat6, 1ft-3ft | $5 | Wired is more reliable than WiFi |

**Core Total: ~$127**

### Recommended (Reliability Upgrades)

| Item | Specification | Est. Price | Why |
|------|--------------|------------|-----|
| **USB SSD** | 128GB Samsung FIT Plus | $15 | microSD wears out from logging. USB SSD = 10x lifespan |
| **micro HDMI Cable** | Standard, 3ft | $5 | For initial QR scan setup |
| **USB Keyboard** | Any cheap USB keyboard | $8 | For initial setup only |
| **Heatsink Set** | Copper/aluminum stick-on | $5 | Extra cooling (Flirc case + heatsinks = optimal) |

**Recommended Total: ~$33**

### Optional

| Item | Price | Why |
|------|-------|-----|
| Pi 5 Active Cooler (fan) | $5 | If running in hot environment (>35C) |
| UPS (any small USB UPS) | $25 | Survives power cuts |
| 7" Touchscreen Display | $60 | Monitor dashboard permanently |

### Complete Setup: **~$160** (one-time cost)

---

## 3. Physical Assembly

### Step-by-step:

```
Time: 10 minutes
Tools: None required
```

1. **Unbox Pi 5** — inspect board, check for bent pins

2. **Attach Heatsinks** (if using stick-on set):
   - Peel backing from heatsinks
   - Place small heatsink on CPU (large chip, center)
   - Place small heatsink on RAM (next to CPU)
   - Place small heatsink on USB controller (near USB ports)
   - Press firmly for 10 seconds each

3. **Install into Flirc Case**:
   - Open case (bottom half)
   - Insert Pi 5 board, align ports with case openings
   - Thermal pad goes between CPU and case lid (pre-installed in Flirc)
   - Close case lid — press until it clicks
   - The aluminum case lid contacts the thermal pad = passive cooling

4. **Insert Storage**:
   - Option A (microSD): Insert microSD into slot (underside of Pi)
   - Option B (USB SSD): Plug USB SSD into any USB 3.0 port (blue)

5. **Connect Network**:
   - Plug Ethernet cable into Pi Ethernet port
   - Connect other end to router/switch

6. **Connect Power LAST**:
   - Plug USB-C power supply into Pi
   - Plug into wall outlet
   - Pi boots automatically (green LED blinks)

### Assembly Diagram:
```
        ┌─────────────────────────┐
        │     Flirc Case (Alum)   │
        │   ┌─────────────────┐   │
        │   │  Raspberry Pi 5  │   │
        │   │  ┌───────────┐  │   │
        │   │  │ Heatsinks │  │   │
        │   │  │ CPU RAM USB│  │   │
        │   │  └───────────┘  │   │
        │   │                 │   │
        │   │ [USB] [USB] [ETH]│  │
        │   │ [USB-C Power]    │  │
        │   └─────────────────┘   │
        └─────────────────────────┘
              │         │
         USB SSD    Ethernet to router
```

---

## 4. OS Installation

### Option A: Raspberry Pi Imager (Recommended, from another PC)

1. Download Raspberry Pi Imager: https://www.raspberrypi.com/software/
2. Insert microSD into your laptop/PC
3. Run Imager:
   - Choose OS: **Raspberry Pi OS (64-bit) — Lite** (no desktop, saves RAM)
   - Choose Storage: your microSD
   - Click gear icon (advanced settings):
     - Set hostname: `wa-sync`
     - Enable SSH: **Yes** (use password authentication)
     - Set username: `pi`, password: `<your-password>`
     - Configure WiFi: your SSID + password (if not using Ethernet)
     - Set locale: your timezone
4. Click **Write** → wait ~5 minutes
5. Eject microSD, insert into Pi

### Option B: Command Line (Linux/Mac)
```bash
# Download Pi OS Lite 64-bit
wget https://downloads.raspberrypi.org/raspios_lite_arm64_latest

# Flash to microSD (replace /dev/sdX with your device)
sudo dd if=raspios_lite_arm64_latest of=/dev/sdX bs=4M status=progress

# Enable SSH
touch /boot/firmware/ssh
```

### First Boot
1. Connect power to Pi
2. Wait 2-3 minutes for first boot (green LED activity)
3. Find Pi IP address: check router DHCP table, or use `ping wa-sync.local`
4. SSH into Pi:
   ```bash
   ssh pi@<pi-ip-address>
   ```
5. Update system:
   ```bash
   sudo apt update && sudo apt upgrade -y
   ```

---

## 5. Network Configuration

### Static IP (Recommended)

```bash
# Find your network interface
ip route | grep default
# Example: eth0

# Set static IP via dhcpcd
sudo nano /etc/dhcpcd.conf
```

Add at end:
```
interface eth0
static ip_address=192.168.1.100/24
static routers=192.168.1.1
static domain_name_servers=192.168.1.1 8.8.8.8
```

```bash
sudo reboot
```

After reboot, Pi is always at `192.168.1.100`.

### Port Forwarding (for remote dashboard access)
- Router → Port Forwarding → Forward TCP 3000 → Pi IP (192.168.1.100:3000)
- Access dashboard remotely: `http://<your-public-ip>:3000`

---

## 6. Software Installation

```bash
# All commands run via SSH on the Pi

# 1. Install Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node --version  # Should show v20.x

# 2. Install Chromium
sudo apt install -y chromium-browser

# 3. Install Xvfb (virtual display for headless Chromium)
sudo apt install -y xvfb

# 4. Install PM2
sudo npm install -g pm2

# 5. Install Git
sudo apt install -y git

# 6. Create app directory
mkdir -p /home/pi/whatsapp-sync
cd /home/pi/whatsapp-sync

# 7. Clone repository
git clone https://github.com/vsmv/whatsapp-group-media-sync.git .
cd direct-sync
npm install
```

### Configure
```bash
cp .env.example .env
nano .env
```
Set:
```env
BROWSER_PORT=9222
SERVER_PORT=3000
MEGA_EMAIL=your-email@gmail.com
MEGA_PASS="your-password"
MEGA_FOLDER=whatsapp-backup
GROUP_NAMES=vysya,vasavi,arya,marriage,matrimony,kalyana,...
PARALLEL_UPLOADS=3
MAX_RETRIES=3
```

### Update ecosystem.config.js for Pi paths
```bash
nano ecosystem.config.js
```
```javascript
module.exports = {
  apps: [{
    name: "wa-mega-sync",
    script: "src/app.js",
    cwd: "/home/pi/whatsapp-sync/direct-sync",
    autorestart: true,
    max_restarts: 10,
    restart_delay: 10000,
    max_memory_restart: "1G",
    error_file: "/home/pi/whatsapp-sync/direct-sync/logs/error.log",
    out_file: "/home/pi/whatsapp-sync/direct-sync/logs/output.log",
    time: true
  }]
};
```

---

## 7. Chromium + WhatsApp Setup

### First-time WhatsApp Web Login (requires monitor or VNC)

**Method A: Temporary Monitor (Easiest)**
1. Connect HDMI cable from Pi to a monitor/TV
2. Connect USB keyboard
3. Boot Pi with desktop (install full OS, or use `startx`)
4. Launch Chromium, go to web.whatsapp.com
5. Scan QR code with phone
6. Once logged in, session persists

**Method B: VNC Remote Desktop (No monitor needed)**
```bash
# Install VNC on Pi
sudo apt install -y realvnc-vnc-server
sudo systemctl enable vncserver-x11-serviced
sudo systemctl start vncserver-x11-serviced

# Install VNC Viewer on your laptop
# Download from: https://www.realvnc.com/en/connect/download/viewer/
# Connect to: <pi-ip-address>:5900
```
Then via VNC:
1. Open Chromium
2. Go to web.whatsapp.com
3. Scan QR code

### Launch Chromium with Debug Port (Headless)

After WhatsApp is logged in, create a persistent Chromium launcher:

```bash
sudo nano /etc/systemd/system/chromium-wa.service
```

```ini
[Unit]
Description=Chromium WhatsApp Web (Debug Port 9222)
After=network.target

[Service]
Type=simple
User=pi
Environment=DISPLAY=:99
ExecStart=/usr/bin/xvfb-run -a --server-args="-screen 0 1280x720x24" /usr/bin/chromium-browser --remote-debugging-port=9222 --remote-allow-origins=* --user-data-dir=/home/pi/.config/chromium-wa --no-first-run --disable-gpu --disable-software-rasterizer
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable chromium-wa.service
sudo systemctl start chromium-wa.service
```

### Verify Chromium debug port:
```bash
curl http://localhost:9222/json/version
# Should return JSON with browser version
```

### Check WhatsApp Web tab exists:
```bash
curl http://localhost:9222/json | grep -o '"url":"[^"]*"' | head -5
# Should show web.whatsapp.com
```

---

## 8. App Deployment

```bash
cd /home/pi/whatsapp-sync/direct-sync

# Create required directories
mkdir -p logs data

# Start with PM2
pm2 start ecosystem.config.js
pm2 save

# Verify
pm2 list
pm2 logs wa-mega-sync --lines 10
```

### Check dashboard:
```bash
# From Pi:
curl http://localhost:3000/api/health

# From your laptop (same network):
# Open browser: http://<pi-ip>:3000
```

---

## 9. Auto-Start on Boot (systemd)

### PM2 Auto-Start
```bash
pm2 startup systemd
# PM2 outputs a command to run — copy and run it:
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u pi --hp /home/pi
pm2 save
```

### Verify both services start on boot:
```bash
sudo systemctl enable chromium-wa.service
sudo reboot

# After reboot (wait 2 min), check:
systemctl status chromium-wa.service  # Chromium running?
pm2 list                               # App running?
curl http://localhost:3000/api/health  # Healthy?
```

### Boot sequence on Pi:
```
Pi powers on
  → systemd starts chromium-wa.service
    → Xvfb creates virtual display :99
    → Chromium launches with debug port 9222
    → WhatsApp Web loads (session restored from profile)
  → systemd starts PM2
    → PM2 resurrects wa-mega-sync
    → App connects to Chromium port 9222
    → App connects to MEGA
    → Dashboard live at http://<pi-ip>:3000
    → Media flows to MEGA
```

---

## 10. Remote Access (VNC/SSH)

### SSH (command line access):
```bash
# From your laptop:
ssh pi@192.168.1.100

# Useful commands:
pm2 logs wa-mega-sync          # Live logs
pm2 restart wa-mega-sync       # Restart app
sudo systemctl restart chromium-wa.service  # Restart Chromium
tail -f /home/pi/whatsapp-sync/direct-sync/logs/sync.log  # App log
```

### Dashboard (web access):
```
http://192.168.1.100:3000
```
Open from any device on your network — phone, tablet, laptop.

### VNC (graphical access — if needed):
```
VNC Viewer → 192.168.1.100:5900
```
Useful for:
- Scanning WhatsApp QR code (one-time)
- Manually scrolling groups to load history
- Debugging Chromium issues

---

## 11. Maintenance & Monitoring

### Daily (automatic, no action needed):
```
App scans 71 groups every 13 minutes → downloads new media → uploads to MEGA
Dashboard auto-refreshes every 3 seconds
```

### Weekly check:
```bash
# Check disk space
df -h

# Check memory
free -h

# Check PM2 status
pm2 list

# Check log for errors
grep -i "error\|fail\|fatal" /home/pi/whatsapp-sync/direct-sync/logs/sync.log | tail -20

# Check Pi temperature
vcgencmd measure_temp
# Should be under 70°C. If over 75°C, add active cooling.
```

### Monthly:
```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Restart services (clears memory leaks)
pm2 restart wa-mega-sync
sudo systemctl restart chromium-wa.service

# Backup hashes.json (dedup database)
cp /home/pi/whatsapp-sync/direct-sync/data/hashes.json /home/pi/hashes-backup.json
```

### SSD/microSD health:
```bash
# Check for filesystem errors
sudo dmesg | grep -i "error\|ext4\|i/o"

# If using USB SSD, check SMART:
sudo apt install smartmontools
sudo smartctl -a /dev/sda | grep -i "health\|error"
```

---

## 12. Troubleshooting

### App not connecting to Chromium:
```bash
# Check Chromium service
sudo systemctl status chromium-wa.service

# Check debug port
curl http://localhost:9222/json/version

# If port not responding, restart Chromium
sudo systemctl restart chromium-wa.service
sleep 10
curl http://localhost:9222/json/version

# Restart app
pm2 restart wa-mega-sync
```

### WhatsApp showing QR code again:
```bash
# Session expired — need to rescan
# Option 1: Via VNC
# Connect VNC → open Chromium → scan QR

# Option 2: Via temporary monitor
# Connect HDMI + keyboard → scan QR

# After scanning, restart services
sudo systemctl restart chromium-wa.service
sleep 15
pm2 restart wa-mega-sync
```

### Pi overheating:
```bash
vcgencmd measure_temp
# If >75°C:
# 1. Add active cooler fan
# 2. Improve ventilation
# 3. Underclock: sudo nano /boot/firmware/config.txt
#    Add: arm_freq=1800 (default 2400 for Pi 5)
```

### MEGA quota exceeded:
- Free MEGA account: 20GB transfer limit (resets every few hours)
- If uploading large batches, may hit limit
- Solution: Reduce PARALLEL_UPLOADS to 1 in .env
- Or upgrade to MEGA Pro (500GB+ transfer)

### OOM (Out of Memory):
```bash
# Check memory
free -h

# If Pi 4 (4GB) runs low:
# 1. Reduce PARALLEL_UPLOADS to 2
# 2. Add swap space:
sudo nano /etc/dphys-swapfile
# Set CONF_SWAPSIZE=2048
sudo systemctl restart dphys-swapfile
```

### Log file growing too large:
```bash
# Check log size
du -sh /home/pi/whatsapp-sync/direct-sync/logs/

# Truncate if needed
truncate -s 0 /home/pi/whatsapp-sync/direct-sync/logs/sync.log

# Set up log rotation
sudo nano /etc/logrotate.d/wa-sync
```
```
/home/pi/whatsapp-sync/direct-sync/logs/*.log {
    daily
    rotate 7
    compress
    missingok
    notifempty
}
```

---

## 13. Cost Breakdown

### One-time Hardware:
| Item | Price |
|------|-------|
| Raspberry Pi 5 (8GB) | $80 |
| Official 27W Power Supply | $10 |
| 64GB SanDisk Extreme A2 microSD | $12 |
| Flirc Case (passive heatsink) | $20 |
| Ethernet Cable (Cat6, 3ft) | $5 |
| USB SSD 128GB (Samsung FIT) | $15 |
| micro HDMI Cable (for setup) | $5 |
| **Total** | **$147** |

### Ongoing:
| Item | Monthly Cost |
|------|-------------|
| Electricity (5W × 24h × 30d) | ~$1-2 |
| MEGA (free 20GB account) | $0 |
| Internet (existing) | $0 |
| **Total** | **~$2/month** |

### vs Laptop 24/7:
| Item | Laptop | Raspberry Pi |
|------|--------|-------------|
| Power (30W avg) | ~$15/month | ~$2/month |
| Hardware wear | Laptop degrades | Pi designed for this |
| **Annual savings** | — | **~$156/year** |

**Payback period: ~11 months** (Pi pays for itself in saved electricity)

---

## Architecture Comparison

```
CURRENT (Laptop):
┌─────────────────────────────────────┐
│ Windows Laptop (30-65W)              │
│  ├── Edge Browser (WhatsApp Web)     │
│  ├── Node.js App                     │
│  ├── PM2                             │
│  └── Task Scheduler                  │
│  Problem: user browsing, updates,    │
│  sleep mode, power cost              │
└─────────────────────────────────────┘

PROPOSED (Raspberry Pi):
┌─────────────────────────────────────┐
│ Raspberry Pi 5 (3-5W)                │
│  ├── Chromium (WhatsApp Web)         │
│  ├── Xvfb (virtual display)          │
│  ├── Node.js App                     │
│  ├── PM2 + systemd                   │
│  └── Always on, no interference      │
│  Advantage: 24/7, silent, $2/month   │
└─────────────────────────────────────┘
```

---

## Quick Reference Card

```bash
# START EVERYTHING
sudo systemctl start chromium-wa.service && sleep 10 && pm2 start wa-mega-sync

# STOP EVERYTHING
pm2 stop wa-mega-sync && sudo systemctl stop chromium-wa.service

# RESTART EVERYTHING
pm2 restart wa-mega-sync && sudo systemctl restart chromium-wa.service

# CHECK HEALTH
curl http://localhost:3000/api/health

# VIEW LOGS
pm2 logs wa-mega-sync

# CHECK TEMPERATURE
vcgencmd measure_temp

# DASHBOARD (from any device)
http://<pi-ip>:3000
```

---

*Built by Venki (@vsmv) — MIT License*
*Document Version: 1.0 | 2026-07-18*