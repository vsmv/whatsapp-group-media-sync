Set WshShell = CreateObject("WScript.Shell")
' Start Edge
WshShell.Run """C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"" --remote-debugging-port=9222 --remote-allow-origins=* --user-data-dir=""%LOCALAPPDATA%\Microsoft\Edge\User Data"" https://web.whatsapp.com", 0, False
' Wait 10s for Edge to load
WScript.Sleep 10000
' Resurrect PM2 processes (auto-restarts wa-mega-sync)
WshShell.Run "cmd /c node ""C:\Users\Admin\AppData\Roaming\npm\node_modules\pm2\bin\pm2"" resurrect", 0, False