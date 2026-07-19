$LogFile = "C:\D\Whatsapp Sync\direct-sync\logs\health-check.log"
$NodePath = "C:\Program Files\nodejs\node.exe"
$Pm2Path = "C:\Users\Admin\AppData\Roaming\npm\node_modules\pm2\bin\pm2"

function Log($msg) { Add-Content -Path $LogFile -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $msg" -EA SilentlyContinue }
function ShowN($t, $m) { try { Add-Type -AssemblyName System.Windows.Forms; $n = New-Object System.Windows.Forms.NotifyIcon; $n.Icon = [System.Drawing.SystemIcons]::Information; $n.BalloonTipTitle = $t; $n.BalloonTipText = $m; $n.Visible = $true; $n.ShowBalloonTip(10000); Start-Sleep 6; $n.Dispose() } catch {} }

Log "Weekly Health Check Started"
$ok = $true
$r = ""

# Check app
try {
    $h = (Invoke-WebRequest -Uri "http://localhost:3000/api/health" -UseBasicParsing -TimeoutSec 5).Content | ConvertFrom-Json
    $r = "App=$($h.ok) MEGA=$($h.mega) WA=$($h.wa) uptime=$($h.uptime)s"
    if (-not $h.ok -or -not $h.mega -or -not $h.wa) { $ok = $false }
} catch { $r = "App NOT RESPONDING"; $ok = $false }

# Check Edge port
try { Invoke-WebRequest -Uri "http://127.0.0.1:9222/json/version" -UseBasicParsing -TimeoutSec 3 | Out-Null; $r += " Edge=OPEN" } catch { $r += " Edge=CLOSED"; $ok = $false }

# Disk space
$freeGB = [math]::Round((Get-PSDrive C).Free / 1GB, 1)
$r += " Disk=$($freeGB)GB"
if ($freeGB -lt 5) { $ok = $false }

# Auto-fix
if (-not $ok) {
    Log "Issues found, restarting app..."
    & $NodePath $Pm2Path restart wa-mega-sync 2>&1 | Out-Null
    Start-Sleep 30
    try {
        $h2 = (Invoke-WebRequest -Uri "http://localhost:3000/api/health" -UseBasicParsing -TimeoutSec 5).Content | ConvertFrom-Json
        if ($h2.ok -and $h2.mega -and $h2.wa) { $ok = $true; $r += " AutoFix=SUCCESS" }
        else { $r += " AutoFix=PARTIAL" }
    } catch { $r += " AutoFix=FAILED" }
}

# Result
Log "Result: $ok | $r"
if ($ok) { ShowN "WhatsApp Sync OK" $r }
else { ShowN "WhatsApp Sync Issues" "Check localhost:3000 dashboard" }
Log "Health Check Complete"