const path = require('path');
const fs = require('fs');
const {
  app,
  BrowserWindow,
  ipcMain,
  Tray,
  Menu,
  globalShortcut,
  desktopCapturer
} = require('electron');

// NexaShareControl owns a dedicated Electron data directory. It does not reuse
// Nexa AI Local Bridge, Nexa Local, Relay, or any other Nexa application's state.
try {
  app.setName('NexaShareControl');
  const dedicatedUserData = path.join(app.getPath('appData'), 'NexaShareControl');
  app.setPath('userData', dedicatedUserData);
} catch {}

let win = null;
let tray = null;
let helper = null;
let config = null;
let logger = null;
let security = null;
let session = null;
let router = null;
let transport = null;
let startupComplete = false;
let startupIssues = [];

function noteIssue(area, error) {
  const message = error && error.message ? error.message : String(error || 'Unknown error');
  const record = { area, message, at: new Date().toISOString() };
  startupIssues.push(record);
  if (startupIssues.length > 20) startupIssues = startupIssues.slice(-20);
  try { logger?.error(`${area}: ${message}`); } catch {}
  try { console.error(`[${area}]`, error); } catch {}
}

function publicConfig() {
  try { return config?.publicConfig?.() || {}; } catch { return {}; }
}

function sessionState() {
  try { return session?.publicState?.() || { active:false, sessionId:'', remoteInputEnabled:false, screenSharing:false }; }
  catch { return { active:false, sessionId:'', remoteInputEnabled:false, screenSharing:false }; }
}

function transportState() {
  try { return transport?.publicState?.() || { connected:false, paired:false, transport:'OFFLINE' }; }
  catch { return { connected:false, paired:false, transport:'OFFLINE' }; }
}

function helperState() {
  try {
    return {
      ...(helper?.publicState?.() || { running:false, pid:0 }),
      available: !!helper?.proc,
      startupError: startupIssues.find(x => x.area === 'Native helper')?.message || ''
    };
  } catch {
    return { running:false, pid:0, available:false };
  }
}

function state() {
  return {
    version: app.getVersion(),
    protocolVersion: 1,
    startupComplete,
    startupIssues,
    config: publicConfig(),
    session: sessionState(),
    transport: transportState(),
    helper: helperState()
  };
}

function pushState() {
  try {
    if (win && !win.isDestroyed()) win.webContents.send('state:update', state());
  } catch {}
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 1000,
    minHeight: 700,
    show: true,
    title: 'NexaShareControl',
    backgroundColor: '#0b0f14',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  win.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      win.hide();
    }
  });

  win.webContents.on('did-fail-load', (_event, code, description) => {
    noteIssue('UI load', new Error(`${code}: ${description}`));
  });

  win.loadFile(path.join(__dirname, 'src', 'index.html')).catch((error) => {
    noteIssue('UI load', error);
    const safe = String(error.message || error).replace(/[<>&]/g, '');
    win.loadURL(`data:text/html;charset=utf-8,<body style="font-family:Segoe UI;background:%230b0f14;color:white;padding:40px"><h1>NexaShareControl</h1><h2>Startup UI error</h2><p>${encodeURIComponent(safe)}</p><p>The application is running. Reinstall the current complete package.</p></body>`).catch(()=>{});
  });
}

function registerIpc() {
  ipcMain.handle('app:get-state', () => state());

  ipcMain.handle('settings:save', async (_event, values) => {
    if (!config) return { ok:false, error:'configuration_not_ready' };
    try {
      config.update(values || {});
      await config.save();
      try { transport?.applyConfig?.(); } catch (error) { noteIssue('Transport reconfigure', error); }
      pushState();
      return { ok:true, config:publicConfig() };
    } catch (error) {
      noteIssue('Settings save', error);
      return { ok:false, error:error.message };
    }
  });

  ipcMain.handle('device:pair', async (_event, code) => {
    if (!transport) return { ok:false, error:'remote_transport_not_ready' };
    try { return await transport.pairDevice(code); }
    catch (error) { noteIssue('Pairing', error); return { ok:false, error:error.message }; }
  });

  ipcMain.handle('session:start-local', async () => {
    if (!session) return { ok:false, error:'session_manager_not_ready' };
    try {
      const result = await session.startLocalSession();
      pushState();
      return result;
    } catch (error) {
      noteIssue('Session start', error);
      return { ok:false, error:error.message };
    }
  });

  ipcMain.handle('session:stop', async () => {
    if (!session) return { ok:true };
    try {
      const result = await session.stop('local');
      pushState();
      return result;
    } catch (error) {
      noteIssue('Session stop', error);
      return { ok:false, error:error.message };
    }
  });

  ipcMain.handle('screen:list-sources', async () => {
    try {
      const sources = await desktopCapturer.getSources({ types:['screen'], thumbnailSize:{ width:320, height:180 } });
      return sources.map(source => ({
        id: source.id,
        name: source.name,
        displayId: source.display_id || '',
        thumbnail: source.thumbnail.toDataURL()
      }));
    } catch (error) {
      noteIssue('Screen source discovery', error);
      return [];
    }
  });

  ipcMain.handle('screen:frame', async (_event, packet) => {
    if (!session?.isActive?.()) return { ok:false, error:'session_inactive' };
    if (!transport) return { ok:false, error:'remote_transport_not_configured' };
    try { return await transport.sendFrame(packet); }
    catch (error) { noteIssue('Frame upload', error); return { ok:false, error:error.message }; }
  });

  ipcMain.handle('native:command', async (_event, command) => {
    if (!helper?.proc) return { ok:false, error:'native_helper_unavailable', startupIssues };
    try { return await helper.request(command); }
    catch (error) { noteIssue('Native command', error); return { ok:false, error:error.message }; }
  });

  ipcMain.handle('window:list', async () => {
    if (!helper?.proc) return { ok:false, error:'native_helper_unavailable', windows:[] };
    try { return await helper.request({ cmd:'window.list' }); }
    catch (error) { return { ok:false, error:error.message, windows:[] }; }
  });

  ipcMain.handle('window:activate', async (_event, id) => {
    if (!helper?.proc) return { ok:false, error:'native_helper_unavailable' };
    try { return await helper.request({ cmd:'window.activate', window_id:id }); }
    catch (error) { return { ok:false, error:error.message }; }
  });

  ipcMain.handle('diagnostics:run', async () => {
    const result = {
      appVersion: app.getVersion(),
      protocolVersion: 1,
      electron: process.versions.electron,
      node: process.versions.node,
      windows: process.getSystemVersion(),
      userData: app.getPath('userData'),
      startupComplete,
      startupIssues,
      helper: helperState(),
      transport: transportState(),
      session: sessionState(),
      monitors: [],
      cursor: null
    };
    if (helper?.proc) {
      try { result.helperHealth = await helper.healthCheck(); } catch (error) { result.helperHealth = { ok:false, error:error.message }; }
      try { result.monitors = (await helper.request({ cmd:'monitor.list' })).monitors || []; } catch {}
      try { result.cursor = await helper.request({ cmd:'cursor.get' }); } catch {}
    }
    try { if (transport) result.transportDiagnostics = await transport.diagnostics(); } catch {}
    return result;
  });
}

function createTraySafely() {
  try {
    const iconPath = path.join(__dirname, 'src', 'assets', 'tray.png');
    tray = new Tray(iconPath);
    const rebuild = () => {
      const active = !!session?.isActive?.();
      tray.setToolTip(active ? 'NexaShareControl - ACTIVE' : 'NexaShareControl - OFF');
      tray.setContextMenu(Menu.buildFromTemplate([
        { label:'Open NexaShareControl', click:()=>{ win?.show(); win?.focus(); } },
        { label:`Status: ${active ? 'ACTIVE' : 'OFF'}`, enabled:false },
        { type:'separator' },
        { label:'Start Sharing', enabled:!active, click:()=>session?.startLocalSession?.() },
        { label:'Stop Sharing', enabled:active, click:()=>session?.stop?.('tray') },
        { type:'separator' },
        { label:'Exit', click:()=>{ app.isQuitting=true; app.quit(); } }
      ]));
    };
    if (session) session.onStateChanged = () => { rebuild(); pushState(); };
    rebuild();
    tray.on('double-click', () => { win?.show(); win?.focus(); });
  } catch (error) {
    noteIssue('System tray', error);
    // Tray failure must never prevent the main window from opening.
  }
}

async function initializeBackgroundSystems() {
  // Every component below is isolated. A failure is reported in Diagnostics,
  // but it must never close NexaShareControl's main window.
  try {
    const { ConfigStore } = require('./src/main/config');
    config = new ConfigStore(app.getPath('userData'));
    await config.load();
  } catch (error) { noteIssue('Configuration', error); }

  try {
    const { AppLogger } = require('./src/main/logger');
    logger = new AppLogger(app.getPath('userData'));
    logger.info('NexaShareControl 1.0.1 startup begun');
  } catch (error) { noteIssue('Logger', error); }

  try {
    const { SessionManager } = require('./src/main/sessionManager');
    session = new SessionManager(config || { data:{} }, logger || { info(){}, warn(){}, error(){} });
  } catch (error) { noteIssue('Session manager', error); }

  try {
    const { SecurityManager } = require('./src/main/security');
    security = new SecurityManager(config, logger || { info(){}, warn(){}, error(){} });
    await security.initialize();
  } catch (error) { noteIssue('Security', error); }

  try {
    const { NativeHelper } = require('./src/main/nativeHelper');
    helper = new NativeHelper(logger || { info(){}, warn(){}, error(){} });
    await helper.start();
  } catch (error) {
    helper = helper || null;
    noteIssue('Native helper', error);
  }

  try {
    if (config && security && session) {
      const { TransportManager } = require('./src/main/transport');
      transport = new TransportManager(config, security, session, logger || { info(){}, warn(){}, error(){} });
    }
  } catch (error) { noteIssue('Remote transport', error); }

  try {
    if (helper?.proc && transport && session) {
      const { CommandRouter } = require('./src/main/commandRouter');
      router = new CommandRouter(helper, session, transport, logger || { info(){}, warn(){}, error(){} }, () => {
        try { win?.webContents.send('screen:force-frame'); } catch {}
      });
      transport.setCommandHandler(command => router.handle(command));
    }
  } catch (error) { noteIssue('Command router', error); }

  createTraySafely();

  try {
    const registered = globalShortcut.register('CommandOrControl+Shift+F12', async () => {
      try { await session?.emergencyStop?.(); } catch {}
      try { transport?.clearPendingCommands?.(); } catch {}
      try { win?.webContents.send('session:emergency-stopped'); } catch {}
      pushState();
    });
    if (!registered) noteIssue('Emergency hotkey', new Error('CTRL+SHIFT+F12 is already registered by another application'));
  } catch (error) { noteIssue('Emergency hotkey', error); }

  try { transport?.start?.(); } catch (error) { noteIssue('Remote transport start', error); }

  startupComplete = true;
  try { logger?.info(`NexaShareControl startup complete; issues=${startupIssues.length}`); } catch {}
  pushState();
}

async function boot() {
  registerIpc();
  createWindow();
  pushState();
  // Do not block opening the UI on native helper, networking, or any other module.
  setTimeout(() => initializeBackgroundSystems().catch(error => noteIssue('Background initialization', error)), 100);
  setInterval(pushState, 1500).unref?.();
}

app.whenReady().then(boot).catch(error => {
  noteIssue('Electron ready', error);
  // Last-resort visible window instead of silently quitting.
  try {
    createWindow();
  } catch {}
});

app.on('activate', () => {
  try {
    if (!win || win.isDestroyed()) createWindow();
    else { win.show(); win.focus(); }
  } catch {}
});

app.on('before-quit', async () => {
  app.isQuitting = true;
  try { globalShortcut.unregisterAll(); } catch {}
  try { await transport?.stop?.(); } catch {}
  try { await helper?.stop?.(); } catch {}
});

app.on('window-all-closed', () => {
  // Keep running only if the user closed the window to tray. If tray creation
  // failed, the process may remain available through the taskbar until Exit.
});
