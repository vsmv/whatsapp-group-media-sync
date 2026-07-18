$EdgePath = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
$Pm2Path = "C:\Users\Admin\AppData\Roaming\npm\node_modules\pm2\bin\pm2"
$NodePath = "C:\Program Files\nodejs\node.exe"
$DebugPort = 9222

function Show-Notify($title, $msg) {
    try { Add-Type -AssemblyName System.Windows.Forms; $n = New-Object System.Windows.Forms.NotifyIcon; $n.Icon = [System.Drawing.SystemIcons]::Information; $n.BalloonTipTitle = $title; $n.BalloonTipText = $msg; $n.Visible = $true; $n.ShowBalloonTip(8000); Start-Sleep 5; $n.Dispose() } catch {}
}
function Test-Port($port) {
    try { Invoke-WebRequest -Uri "http://localhost:$port/json/version" -UseBasicParsing -TimeoutSec 3 | Out-Null; return $true } catch { return $false }
}

# Step 1: Only launch Edge if debug port is NOT already open
if (-not (Test-Port $DebugPort)) {
    Write-Output "Launching Edge..."
    Start-Process -FilePath $EdgePath -ArgumentList "--remote-debugging-port=$DebugPort","--remote-allow-origins=*","--user-data-dir=$env:LOCALAPPDATA\Microsoft\Edge\User Data","https://web.whatsapp.com"
    for ($i = 1; $i -le 30; $i++) { Start-Sleep 2; if (Test-Port $DebugPort) { break }; Write-Output "Waiting Edge... ($($i*2)s)" }
}

# Step 2: Start PM2
& $NodePath $Pm2Path start "C:\D\Whatsapp Sync\direct-sync\ecosystem.config.js" 2>$null
& $NodePath $Pm2Path save 2>$null

# Step 3: Wait for health
for ($i = 1; $i -le 30; $i++) {
    Start-Sleep 3
    try { $h = (Invoke-WebRequest -Uri "http://localhost:3000/api/health" -UseBasicParsing -TimeoutSec 3).Content | ConvertFrom-Json; if ($h.ok -and $h.mega -and $h.wa) { Show-Notify "WhatsApp Sync Running" "MEGA + WhatsApp connected. Dashboard: localhost:3000"; break } } catch {}
}

# Step 4: Light monitor (check every 10 min, only restart PM2 if app died)
while ($true) {
    Start-Sleep 600
    try { Invoke-WebRequest -Uri "http://localhost:3000/api/health" -UseBasicParsing -TimeoutSec 5 | Out-Null }
    catch { Write-Output "App not responding, restarting PM2..."; & $NodePath $Pm2Path restart wa-mega-sync 2>$null }
}