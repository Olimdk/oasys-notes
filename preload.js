const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('oasys', {
  list:    () => ipcRenderer.invoke('notes:list'),
  tree:    () => ipcRenderer.invoke('notes:tree'),
  index:   () => ipcRenderer.invoke('notes:index'),
  graph:   () => ipcRenderer.invoke('notes:graph'),
  schemas: () => ipcRenderer.invoke('notes:schemas'),
  read:    (rel) => ipcRenderer.invoke('notes:read', rel),
  write:   (rel, note) => ipcRenderer.invoke('notes:write', rel, note),
  patch:   (rel, props) => ipcRenderer.invoke('notes:patch', rel, props),
  mkdir:   (rel) => ipcRenderer.invoke('notes:mkdir', rel),
  create:  (rel, note) => ipcRenderer.invoke('notes:create', rel, note),
  remove:  (rel) => ipcRenderer.invoke('notes:delete', rel),
  rename:  (from, to) => ipcRenderer.invoke('notes:rename', from, to),
});
