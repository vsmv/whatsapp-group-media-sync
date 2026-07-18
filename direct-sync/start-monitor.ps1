$EdgePath = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
$Pm2Path = "C:\Users\Admin\AppData\Roaming\npm\node_modules\pm2\bin\pm2"
$NodePath = "C:\Program Files\nodejs\node.exe"
$DebugPort = 9222

function Show-Notify($title, $msg) { try { Add-Type -AssemblyName System.Windows.Forms; $n = New-Object System.Windows.Forms.NotifyIcon; $n.Icon = [System.Drawing.SystemIcons]::Information; $n.BalloonTipTitle = $title; $n.BalloonTipText = $msg; $n.Visible = $true; $n.ShowBalloonTip(8000); Start-Sleep 5; $n.Dispose() } catch {} }
function Test-Port($port) { try { Invoke-WebRequest -Uri "http://localhost:$port/json/version" -UseBasicParsing -TimeoutSec 3 | Out-Null; return $true } catch { return $false } }

# STEP 1: Kill ALL existing Edge processes (prevent Startup Boost from blocking debug port)
Write-Output "Killing existing Edge..."
Get-Process msedge -EA SilentlyContinue | Stop-Process -Force -EA SilentlyContinue
Start-Sleep 3
Remove-Item "$env:LOCALAPPDATA\Microsoft\Edge\User Data\SingletonLock" -Force -EA SilentlyContinue
Remove-Item "$env:LOCALAPPDATA\Microsoft\Edge\User Data\SingletonSocket" -Force -EA SilentlyContinue

# STEP 2: Launch Edge with debug port + mandatory --user-data-dir
Write-Output "Launching Edge with debug port..."
Start-Process -FilePath $EdgePath -ArgumentList "--remote-debugging-port=$DebugPort","--remote-allow-origins=*","--user-data-dir=$env:LOCALAPPDATA\Microsoft\Edge\User Data","https://web.whatsapp.com"

# STEP 3: Wait for debug port (up to 60s)
for ($i = 1; $i -le 30; $i++) { Start-Sleep 2; if (Test-Port $DebugPort) { Write-Output "Edge ready!"; break } }

# STEP 4: Start PM2
& $NodePath $Pm2Path start "C:\D\Whatsapp Sync\direct-sync\ecosystem.config.js" 2>$null
& $NodePath $Pm2Path save 2>$null

# STEP 5: Wait for app health (up to 120s)
for ($i = 1; $i -le 40; $i++) {
    Start-Sleep 3
    try { $h = (Invoke-WebRequest -Uri "http://localhost:3000/api/health" -UseBasicParsing -TimeoutSec 3).Content | ConvertFrom-Json; if ($h.ok -and $h.mega -and $h.wa) { Show-Notify "WhatsApp Sync Running" "MEGA + WhatsApp connected. Dashboard: localhost:3000"; break } } catch {}
}

# STEP 6: Light monitor (check every 10 min)
while ($true) {
    Start-Sleep 600
    try { Invoke-WebRequest -Uri "http://localhost:3000/api/health" -UseBasicParsing -TimeoutSec 5 | Out-Null }
    catch { & $NodePath $Pm2Path restart wa-mega-sync 2>$null }
}