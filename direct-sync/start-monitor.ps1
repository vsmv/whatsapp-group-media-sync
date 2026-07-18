# WhatsApp-MEGA Sync Startup Monitor
# Launches Edge, waits for debug port, starts PM2, shows notifications

$EdgePath = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
$Pm2Path = "C:\Users\Admin\AppData\Roaming\npm\node_modules\pm2\bin\pm2"
$NodePath = "C:\Program Files\nodejs\node.exe"
$DebugPort = 9222
$AppDir = "C:\D\Whatsapp Sync\direct-sync"

function Show-Notify($title, $msg, $type="Info") {
    try {
        Add-Type -AssemblyName System.Windows.Forms
        $n = New-Object System.Windows.Forms.NotifyIcon
        $n.Icon = [System.Drawing.SystemIcons]::Information
        $n.BalloonTipTitle = $title
        $n.BalloonTipText = $msg
        $n.Visible = $true
        $n.ShowBalloonTip(8000)
        Start-Sleep -Seconds 5
        $n.Dispose()
    } catch {}
}

function Test-Port($port) {
    try { $r = Invoke-WebRequest -Uri "http://localhost:$port/json/version" -UseBasicParsing -TimeoutSec 3; return $true }
    catch { return $false }
}

# Step 1: Launch Edge
$edgeRunning = Test-Port $DebugPort
if (-not $edgeRunning) {
    Write-Output "Launching Edge..."
    Start-Process -FilePath $EdgePath -ArgumentList "--remote-debugging-port=$DebugPort","--remote-allow-origins=*","--user-data-dir=$env:LOCALAPPDATA\Microsoft\Edge\User Data","https://web.whatsapp.com"
    
    # Wait for Edge debug port (up to 60 seconds)
    for ($i = 1; $i -le 30; $i++) {
        Start-Sleep -Seconds 2
        if (Test-Port $DebugPort) { $edgeRunning = $true; break }
        Write-Output "Waiting for Edge... ($($i*2)s)"
    }
}

if (-not $edgeRunning) {
    Show-Notify "WhatsApp Sync ERROR" "Edge browser failed to start. Please launch Edge manually."
    exit 1
}

# Step 2: Start PM2 app
Write-Output "Starting PM2..."
& $NodePath $Pm2Path start "$AppDir\ecosystem.config.js" 2>$null
& $NodePath $Pm2Path save 2>$null

# Step 3: Wait for app to be healthy (up to 90 seconds)
Write-Output "Waiting for app to initialize..."
$appOk = $false
for ($i = 1; $i -le 30; $i++) {
    Start-Sleep -Seconds 3
    try {
        $h = (Invoke-WebRequest -Uri "http://localhost:3000/api/health" -UseBasicParsing -TimeoutSec 3).Content | ConvertFrom-Json
        if ($h.ok -and $h.mega -and $h.wa) { $appOk = $true; break }
        Write-Output "App initializing... ($($i*3)s) mega=$($h.mega) wa=$($h.wa)"
    } catch {
        Write-Output "App not responding yet... ($($i*3)s)"
    }
}

# Step 4: Notification
if ($appOk) {
    Show-Notify "WhatsApp Sync Running" "Connected to MEGA + WhatsApp. Dashboard: http://localhost:3000"
} else {
    Show-Notify "WhatsApp Sync Warning" "App started but connections may not be ready. Check http://localhost:3000"
}

# Step 5: Monitor loop (every 5 min, relaunch Edge if needed)
while ($true) {
    Start-Sleep -Seconds 300
    if (-not (Test-Port $DebugPort)) {
        Write-Output "Edge died! Relaunching..."
        Show-Notify "WhatsApp Sync" "Edge disconnected. Relaunching..."
        Start-Process -FilePath $EdgePath -ArgumentList "--remote-debugging-port=$DebugPort","--remote-allow-origins=*","--user-data-dir=$env:LOCALAPPDATA\Microsoft\Edge\User Data","https://web.whatsapp.com"
        Start-Sleep 15
        & $NodePath $Pm2Path restart wa-mega-sync 2>$null
    }
}