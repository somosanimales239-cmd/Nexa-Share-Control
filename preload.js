const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('nexa', {
  getState:()=>ipcRenderer.invoke('app:get-state'), saveSettings:v=>ipcRenderer.invoke('settings:save',v), pairDevice:c=>ipcRenderer.invoke('device:pair',c),
  startSharing:()=>ipcRenderer.invoke('session:start-local'), stopSharing:()=>ipcRenderer.invoke('session:stop'), listScreenSources:()=>ipcRenderer.invoke('screen:list-sources'),
  sendFrame:p=>ipcRenderer.invoke('screen:frame',p), nativeCommand:c=>ipcRenderer.invoke('native:command',c), listWindows:()=>ipcRenderer.invoke('window:list'),
  activateWindow:id=>ipcRenderer.invoke('window:activate',id), runDiagnostics:()=>ipcRenderer.invoke('diagnostics:run'),
  onState:cb=>ipcRenderer.on('state:update',(_e,s)=>cb(s)), onForceFrame:cb=>ipcRenderer.on('screen:force-frame',cb),
  onEmergencyStopped:cb=>ipcRenderer.on('session:emergency-stopped',cb)
});
