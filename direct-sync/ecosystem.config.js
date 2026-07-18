module.exports = {
  apps: [{
    name: "wa-mega-sync",
    script: "src/app.js",
    cwd: "C:\\D\\Whatsapp Sync\\direct-sync",
    autorestart: true,
    max_restarts: 10,
    restart_delay: 10000,
    max_memory_restart: "1G",
    error_file: "C:\\D\\Whatsapp Sync\\direct-sync\\logs\\error.log",
    out_file: "C:\\D\\Whatsapp Sync\\direct-sync\\logs\\output.log",
    time: true
  }]
};