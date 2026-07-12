// Exposes a safe, narrow API to the renderer. No raw Node, no HTTP.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('oasys', {
  list:    () => ipcRenderer.invoke('notes:list'),
  index:   () => ipcRenderer.invoke('notes:index'),
  graph:   () => ipcRenderer.invoke('notes:graph'),
  schemas: () => ipcRenderer.invoke('notes:schemas'),
  read:    (rel) => ipcRenderer.invoke('notes:read', rel),
  write:   (rel, note) => ipcRenderer.invoke('notes:write', rel, note),
  patch:   (rel, props) => ipcRenderer.invoke('notes:patch', rel, props),
  ai:      (opts) => ipcRenderer.invoke('ai:complete', opts),
});
