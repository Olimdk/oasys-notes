// OASys Notes — native desktop app entry (Electron main process).
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const notes = require('./lib/notes');

function createWindow() {
  const win = new BrowserWindow({
    width: 1200, height: 800,
    backgroundColor: '#0c0c0c',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  win.loadFile(path.join(__dirname, 'public', 'index.html'));
}

ipcMain.handle('notes:list', () => notes.listNotes());
ipcMain.handle('notes:tree', () => notes.tree());
ipcMain.handle('notes:index', () => notes.getIndex());
ipcMain.handle('notes:graph', () => notes.getGraph());
ipcMain.handle('notes:schemas', () => notes.loadSchemas());
ipcMain.handle('notes:read', (e, rel) => notes.readNote(rel));
ipcMain.handle('notes:write', (e, rel, note) => notes.writeNote(rel, note));
ipcMain.handle('notes:patch', (e, rel, props) => notes.patchNote(rel, props));
ipcMain.handle('notes:mkdir', (e, rel) => notes.createFolder(rel));
ipcMain.handle('notes:create', (e, rel, note) => notes.createNotePath(rel, note));
ipcMain.handle('notes:delete', (e, rel) => notes.deletePath(rel));
ipcMain.handle('notes:rename', (e, from, to) => notes.renamePath(from, to));

app.whenReady().then(() => {
  if (!fs.existsSync(notes.VAULT) || fs.readdirSync(notes.VAULT).length === 0) {
    fs.mkdirSync(notes.VAULT, { recursive: true });
    notes.seedDemoVault();
  }
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
