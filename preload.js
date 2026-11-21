const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  load: () => ipcRenderer.invoke('data:load'),
  save: (data) => ipcRenderer.invoke('data:save', data),
  dataPath: () => ipcRenderer.invoke('data:path'),
  openDataFolder: () => ipcRenderer.invoke('data:openFolder'),
  exportFile: (content, defaultName, filters) => ipcRenderer.invoke('file:export', { content, defaultName, filters }),
  importFile: () => ipcRenderer.invoke('file:import')
});
