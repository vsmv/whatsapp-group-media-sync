$EdgePath = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
$ProfileDir = "C:\Temp\edge-wa"
$Pm2Path = "C:\Users\Admin\AppData\Roaming\npm\node_modules\pm2\bin\pm2"
$NodePath = "C:\Program Files\nodejs\node.exe"
$DebugPort = 9222

function Show-Notify($title, $msg) {
    try { Add-Type -AssemblyName System.Windows.Forms; $n = New-Object System.Windows.Forms.NotifyIcon; $n.Icon = [System.Drawing.SystemIcons]::Information; $n.BalloonTipTitle = $title; $n.BalloonTipText = $msg; $n.Visible = $true; $n.ShowBalloonTip(8000); Start-Sleep 5; $n.Dispose() } catch {}
}
function Test-Port($port) {
    try { Invoke-WebRequest -Uri "http://localhost:$port/json/version" -UseBasicParsing -TimeoutSec 3 | Out-Null; return $true } catch { return $false }
}

# Launch Edge with DEDICATED profile (no space in path, no conflict with user's Edge)
if (-not (Test-Port $DebugPort)) {
    if (-not (Test-Path $ProfileDir)) { New-Item -ItemType Directory -Path $ProfileDir -Force | Out-Null }
    Start-Process -FilePath $EdgePath -ArgumentList "--remote-debugging-port=$DebugPort","--remote-allow-origins=*","--user-data-dir=$ProfileDir","https://web.whatsapp.com"
    for ($i = 1; $i -le 30; $i++) { Start-Sleep 2; if (Test-Port $DebugPort) { break } }
}

# Start PM2
& $NodePath $Pm2Path start "C:\D\Whatsapp Sync\direct-sync\ecosystem.config.js" 2>$null
& $NodePath $Pm2Path save 2>$null

# Wait for health
for ($i = 1; $i -le 40; $i++) {
    Start-Sleep 3
    try { $h = (Invoke-WebRequest -Uri "http://localhost:3000/api/health" -UseBasicParsing -TimeoutSec 3).Content | ConvertFrom-Json; if ($h.ok -and $h.mega -and $h.wa) { Show-Notify "WhatsApp Sync Running" "MEGA + WhatsApp connected"; break } } catch {}
}

# Light monitor
while ($true) {
    Start-Sleep 600
    try { Invoke-WebRequest -Uri "http://localhost:3000/api/health" -UseBasicParsing -TimeoutSec 5 | Out-Null }
    catch { & $NodePath $Pm2Path restart wa-mega-sync 2>$null }
}