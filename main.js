// OASys Notes — native desktop app entry (Electron main process).
// No HTTP server: the renderer talks to this process via IPC.
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const notes = require('./lib/notes');

function createWindow() {
  const win = new BrowserWindow({
    width: 1200, height: 800,
    backgroundColor: '#1e1e1e',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  win.loadFile(path.join(__dirname, 'public', 'index.html'));
}

// --- IPC: frontend -> file engine (in this process, no network) ---
ipcMain.handle('notes:list', () => notes.listNotes());
ipcMain.handle('notes:index', () => notes.getIndex());
ipcMain.handle('notes:graph', () => notes.getGraph());
ipcMain.handle('notes:schemas', () => notes.loadSchemas());
ipcMain.handle('notes:read', (e, rel) => notes.readNote(rel));
ipcMain.handle('notes:write', (e, rel, note) => notes.writeNote(rel, note));
ipcMain.handle('notes:patch', (e, rel, props) => notes.patchNote(rel, props));

// Optional local AI: if Ollama is running locally, call it directly via child_process.
// This is the ONLY network use, and it's to a *local* model — the app itself is not a server.
ipcMain.handle('ai:complete', async (e, { model, prompt, system }) => {
  const { execFileSync } = require('child_process');
  try {
    const out = execFileSync('ollama', ['run', model || 'llama3.1', (system ? system + '\n\n' : '') + prompt], { encoding: 'utf8', timeout: 60000 });
    return { ok: true, text: out };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

app.whenReady().then(() => {
  if (!fs.existsSync(notes.VAULT) || fs.readdirSync(notes.VAULT).length === 0) {
    fs.mkdirSync(notes.VAULT, { recursive: true });
    notes.seedDemoVault();
  }
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
