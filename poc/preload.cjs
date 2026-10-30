const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('studyflow', {
  command: (action, value) => ipcRenderer.invoke('studyflow:command', action, value),
  onEvent: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('studyflow:event', handler);
    return () => ipcRenderer.removeListener('studyflow:event', handler);
  },
});
