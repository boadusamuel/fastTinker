const { app, BrowserWindow, ipcMain, dialog, protocol } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const { spawn } = require('child_process');

let mainWindow;

const userDataPath = app.getPath('userData');

// Ensure directories exist
async function ensureDirectories() {
  const snippetsDir = path.join(userDataPath, 'snippets');
  const packagesDir = path.join(userDataPath, 'node_modules');
  try {
    await fs.mkdir(snippetsDir, { recursive: true });
    await fs.mkdir(packagesDir, { recursive: true });
  } catch (err) {
    console.error('Error creating directories:', err);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#1e1e1e',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      preload: path.join(__dirname, 'preload.js'),
      sandbox: false
      // Removed webSecurity: false and allowRunningInsecureContent for better security
      // We'll load Monaco from local files instead
    },
    titleBarStyle: 'default',
    show: false
  });

  mainWindow.loadFile(path.join(__dirname, '../index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // DevTools can be opened manually with Ctrl+Shift+I (or Cmd+Option+I on Mac)
  // mainWindow.webContents.openDevTools();
  
  // Listen for console messages
  mainWindow.webContents.on('console-message', (event, level, message) => {
    console.log(`[${level}] ${message}`);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  await ensureDirectories();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handlers
ipcMain.handle('get-user-data-path', () => userDataPath);

