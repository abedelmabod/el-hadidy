const { app, BrowserWindow } = require('electron');
const { spawn } = require('child_process');

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    autoHideMenuBar: true,
  });

  // 🔥 شغل static server
  const server = spawn('npx', ['serve', 'dist', '-l', '3000']);

  win.loadURL('http://localhost:3000');
}

app.whenReady().then(createWindow);