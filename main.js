const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

const DATA_DIR = app.getPath('userData');
const DATA_FILE = path.join(DATA_DIR, 'data.json');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');

function readData() {
  try {
    if (fs.existsSync(DATA_FILE)) return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (e) {
    // Corrupt file: keep a copy, start clean
    try { fs.copyFileSync(DATA_FILE, DATA_FILE + '.corrupt-' + Date.now()); } catch (_) {}
  }
  return null;
}

function writeData(data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, DATA_FILE); // atomic replace
  return true;
}

// Daily automatic backup, keep last 14
function dailyBackup() {
  if (!fs.existsSync(DATA_FILE)) return;
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  const target = path.join(BACKUP_DIR, `data-${stamp}.json`);
  if (!fs.existsSync(target)) fs.copyFileSync(DATA_FILE, target);
  const files = fs.readdirSync(BACKUP_DIR).filter(f => f.startsWith('data-')).sort();
  while (files.length > 14) fs.unlinkSync(path.join(BACKUP_DIR, files.shift()));
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 880,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: '#0f172a',
    title: 'IT Infra Tracker',
    icon: path.join(__dirname, 'src', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
}

ipcMain.handle('data:load', () => readData());
ipcMain.handle('data:save', (_e, data) => writeData(data));
ipcMain.handle('data:path', () => DATA_FILE);
ipcMain.handle('data:openFolder', () => shell.openPath(DATA_DIR));

ipcMain.handle('file:export', async (_e, { content, defaultName, filters }) => {
  const { canceled, filePath } = await dialog.showSaveDialog({ defaultPath: defaultName, filters });
  if (canceled || !filePath) return false;
  fs.writeFileSync(filePath, content, 'utf8');
  return filePath;
});

ipcMain.handle('file:import', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile'], filters: [{ name: 'JSON Backup', extensions: ['json'] }]
  });
  if (canceled || !filePaths.length) return null;
  return fs.readFileSync(filePaths[0], 'utf8');
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const w = BrowserWindow.getAllWindows()[0];
    if (w) { if (w.isMinimized()) w.restore(); w.focus(); }
  });
  app.whenReady().then(() => {
    try { dailyBackup(); } catch (_) {}
    createWindow();
  });
  app.on('window-all-closed', () => app.quit());
}
