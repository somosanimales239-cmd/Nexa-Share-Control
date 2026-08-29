const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('nexa', {
  getState: () => ipcRenderer.invoke('app:get-state'),
  saveSettings: values => ipcRenderer.invoke('settings:save', values),
  pairDevice: code => ipcRenderer.invoke('device:pair', code),
  startSharing: () => ipcRenderer.invoke('session:start-local'),
  stopSharing: () => ipcRenderer.invoke('session:stop'),

  // v1.3.0: native open-window inventory + Electron/monitor capture backends.
  listShareSources: () => ipcRenderer.invoke('screen:list-sources'),
  listScreenSources: () => ipcRenderer.invoke('screen:list-sources'),
  setShareSelection: sources => ipcRenderer.invoke('screen:set-selection', sources),
  resolveShareSources: ids => ipcRenderer.invoke('screen:resolve-sources', ids),
  sendFrame: packet => ipcRenderer.invoke('screen:frame', packet),

  nativeCommand: command => ipcRenderer.invoke('native:command', command),
  listWindows: () => ipcRenderer.invoke('window:list'),
  activateWindow: id => ipcRenderer.invoke('window:activate', id),
  runDiagnostics: () => ipcRenderer.invoke('diagnostics:run'),

  onState: callback => ipcRenderer.on('state:update', (_event, state) => callback(state)),
  onForceFrame: callback => ipcRenderer.on('screen:force-frame', callback),
  onEmergencyStopped: callback => ipcRenderer.on('session:emergency-stopped', callback)
});
