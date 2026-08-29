const path = require('path');
const fs = require('fs');
const {
  app,
  BrowserWindow,
  ipcMain,
  Tray,
  Menu,
  globalShortcut,
  desktopCapturer,
  screen
} = require('electron');

// Dedicated data directory. This application remains independent from
// Nexa AI Local Bridge, Nexa Local and Nexa ChatGPT Browser Relay.
try {
  app.setName('NexaShareControl');
  if (process.env.NEXA_UI_SMOKE !== '1') app.setPath('userData', path.join(app.getPath('appData'), 'NexaShareControl'));
  if (process.platform === 'win32') app.setAppUserModelId('com.nexa.sharecontrol');
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
let rendererReady = false;
let startupSmokeWritten = false;
let startupIssues = [];
let selectedShareSources = [];

let ownsSingleInstance = true;
try {
  ownsSingleInstance = app.requestSingleInstanceLock();
  if (!ownsSingleInstance) app.quit();
  app.on('second-instance', () => {
    try {
      if (win) {
        if (win.isMinimized()) win.restore();
        win.show();
        win.focus();
      }
    } catch {}
  });
} catch {}

function noteIssue(area, error) {
  const message = error && error.message ? error.message : String(error || 'Unknown error');
  const record = { area, message, at: new Date().toISOString() };
  startupIssues.push(record);
  if (startupIssues.length > 30) startupIssues = startupIssues.slice(-30);
  try { logger?.error(`${area}: ${message}`); } catch {}
  try { console.error(`[${area}]`, error); } catch {}
}

function publicConfig() {
  try { return config?.publicConfig?.() || {}; } catch { return {}; }
}

function sessionState() {
  try {
    return session?.publicState?.() || {
      active:false, sessionId:'', remoteInputEnabled:false, screenSharing:false
    };
  } catch {
    return { active:false, sessionId:'', remoteInputEnabled:false, screenSharing:false };
  }
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
    helper: helperState(),
    shareSelection: selectedShareSources
  };
}

function pushState() {
  try {
    if (win && !win.isDestroyed()) win.webContents.send('state:update', state());
  } catch {}
}

function createWindow() {
  win = new BrowserWindow({
    width: 1380,
    height: 920,
    minWidth: 1040,
    minHeight: 720,
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

  win.on('close', event => {
    if (!app.isQuitting) {
      event.preventDefault();
      win.hide();
    }
  });

  win.webContents.on('did-finish-load', () => {
    rendererReady = true;
    pushState();
    maybeWriteStartupSmoke();
  });

  win.webContents.on('did-fail-load', (_event, code, description) => {
    rendererReady = false;
    noteIssue('UI load', new Error(`${code}: ${description}`));
  });

  win.webContents.on('render-process-gone', (_event, details) => {
    rendererReady = false;
    noteIssue('Renderer process', new Error(`Renderer exited: ${details?.reason || 'unknown'} code=${details?.exitCode ?? ''}`));
  });

  win.on('unresponsive', () => noteIssue('UI responsiveness', new Error('Main window became unresponsive')));

  win.loadFile(path.join(__dirname, 'src', 'index.html')).catch(error => {
    noteIssue('UI load', error);
    const safe = String(error.message || error).replace(/[<>&]/g, '');
    const body = `<body style="font-family:Segoe UI;background:#0b0f14;color:white;padding:40px">
      <h1>NexaShareControl</h1><h2>Startup UI error</h2><p>${safe}</p>
      <p>The application is running. Reinstall the current complete package.</p></body>`;
    win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(body)).catch(()=>{});
  });
}

function parseWindowId(sourceId) {
  const match = /^window:([^:]+):/i.exec(String(sourceId || ''));
  if (!match) return '';
  const raw = match[1];
  try {
    if (/^0x/i.test(raw)) return BigInt(raw).toString();
    if (/^\d+$/.test(raw)) return BigInt(raw).toString();
  } catch {}
  return raw;
}

async function discoverShareSources() {
  let nativeWindows = [];
  if (helper?.proc) {
    try {
      const result = await helper.request({ cmd:'window.list' }, 2500);
      nativeWindows = result.windows || [];
    } catch (error) {
      noteIssue('Window metadata discovery', error);
    }
  }

  const nativeMap = new Map(nativeWindows.map(item => [String(item.window_id), item]));
  const displays = new Map();
  try {
    for (const display of screen.getAllDisplays()) displays.set(String(display.id), display);
  } catch {}

  const sources = await desktopCapturer.getSources({
    types:['screen','window'],
    thumbnailSize:{ width:360, height:220 },
    fetchWindowIcons:true
  });

  return sources.map(source => {
    const type = String(source.id).startsWith('screen:') ? 'screen' : 'window';
    const nativeWindowId = type === 'window' ? parseWindowId(source.id) : '';
    const nativeWindow = nativeMap.get(nativeWindowId) || null;
    const display = type === 'screen' ? displays.get(String(source.display_id || '')) : null;

    let thumbnail = '';
    let appIcon = '';
    try { if (source.thumbnail && !source.thumbnail.isEmpty()) thumbnail = source.thumbnail.toDataURL(); } catch {}
    try { if (source.appIcon && !source.appIcon.isEmpty()) appIcon = source.appIcon.toDataURL(); } catch {}

    const bounds = type === 'screen' && display ? {
      x:display.bounds.x, y:display.bounds.y,
      width:display.bounds.width, height:display.bounds.height
    } : nativeWindow ? {
      x:nativeWindow.x, y:nativeWindow.y,
      width:nativeWindow.width, height:nativeWindow.height
    } : null;

    return {
      id:source.id,
      name:source.name,
      type,
      displayId:source.display_id || '',
      thumbnail,
      appIcon,
      nativeWindowId,
      processName:nativeWindow?.process_name || '',
      isMinimized:!!nativeWindow?.is_minimized,
      bounds,
      scaleFactor:display?.scaleFactor || 1
    };
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

  // v1.2.0: monitors and open application/windows are selectable at the same time.
  ipcMain.handle('screen:list-sources', async () => {
    try { return await discoverShareSources(); }
    catch (error) {
      noteIssue('Share source discovery', error);
      return [];
    }
  });

  ipcMain.handle('screen:set-selection', (_event, sources) => {
    const clean = Array.isArray(sources) ? sources.slice(0, 16).map(source => ({
      id:String(source?.id || ''),
      name:String(source?.name || ''),
      type:source?.type === 'screen' ? 'screen' : 'window',
      processName:String(source?.processName || ''),
      nativeWindowId:String(source?.nativeWindowId || '')
    })).filter(source => source.id) : [];
    selectedShareSources = clean;
    pushState();
    return { ok:true, selected:clean.length };
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
      appVersion:app.getVersion(),
      protocolVersion:1,
      electron:process.versions.electron,
      node:process.versions.node,
      windows:process.getSystemVersion(),
      userData:app.getPath('userData'),
      startupComplete,
      startupIssues,
      helper:helperState(),
      transport:transportState(),
      session:sessionState(),
      shareSelection:selectedShareSources,
      monitors:[],
      windows:[],
      cursor:null
    };
    if (helper?.proc) {
      try { result.helperHealth = await helper.healthCheck(); } catch (error) { result.helperHealth = { ok:false, error:error.message }; }
      try { result.monitors = (await helper.request({ cmd:'monitor.list' })).monitors || []; } catch {}
      try { result.windows = (await helper.request({ cmd:'window.list' })).windows || []; } catch {}
      try { result.cursor = await helper.request({ cmd:'cursor.get' }); } catch {}
    }
    try { result.shareSources = await discoverShareSources(); } catch {}
    try { if (transport) result.transportDiagnostics = await transport.diagnostics(); } catch {}
    return result;
  });
}

function createTraySafely() {
  try {
    tray = new Tray(path.join(__dirname, 'src', 'assets', 'tray.png'));
    const rebuild = () => {
      const active = !!session?.isActive?.();
      tray.setToolTip(active ? 'NexaShareControl - ACTIVE' : 'NexaShareControl - OFF');
      tray.setContextMenu(Menu.buildFromTemplate([
        { label:'Open NexaShareControl', click:()=>{ win?.show(); win?.focus(); } },
        { label:`Status: ${active ? 'ACTIVE' : 'OFF'}`, enabled:false },
        { label:`Selected sources: ${selectedShareSources.length}`, enabled:false },
        { type:'separator' },
        { label:'Open to Start Sharing', enabled:!active, click:()=>{ win?.show(); win?.focus(); } },
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
  }
}

function maybeWriteStartupSmoke() {
  const target = process.env.NEXA_STARTUP_SMOKE_FILE;
  if (!target || startupSmokeWritten || !startupComplete || !rendererReady) return;
  startupSmokeWritten = true;
  const helperStatus = helperState();
  const report = {
    ok:true,
    version:app.getVersion(),
    rendererReady,
    startupComplete,
    startupIssues,
    helper:helperStatus,
    helperAvailable:!!helperStatus.available,
    userData:app.getPath('userData'),
    selectedSources:selectedShareSources.length,
    generatedAt:new Date().toISOString()
  };
  try {
    fs.mkdirSync(path.dirname(target), { recursive:true });
    fs.writeFileSync(target, JSON.stringify(report, null, 2), 'utf8');
  } catch (error) {
    startupSmokeWritten = false;
    noteIssue('Startup smoke report', error);
    return;
  }
  setTimeout(() => {
    app.isQuitting = true;
    app.quit();
  }, 900);
}

async function initializeBackgroundSystems() {
  try {
    const { ConfigStore } = require('./src/main/config');
    config = new ConfigStore(app.getPath('userData'));
    await config.load();
  } catch (error) { noteIssue('Configuration', error); }

  try {
    const { AppLogger } = require('./src/main/logger');
    logger = new AppLogger(app.getPath('userData'));
    logger.info('NexaShareControl 1.2.0 startup begun');
    for (const issue of startupIssues) logger.warn(`pre-logger ${issue.area}: ${issue.message}`);
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
      router = new CommandRouter(
        helper, session, transport,
        logger || { info(){}, warn(){}, error(){} },
        () => { try { win?.webContents.send('screen:force-frame'); } catch {} }
      );
      transport.setCommandHandler(command => router.handle(command));
    }
  } catch (error) { noteIssue('Command router', error); }

  const smokeMode = process.env.NEXA_UI_SMOKE === '1' || !!process.env.NEXA_STARTUP_SMOKE_FILE;
  if (!smokeMode) createTraySafely();

  if (!smokeMode) try {
    const registered = globalShortcut.register('CommandOrControl+Shift+F12', async () => {
      try { await session?.emergencyStop?.(); } catch {}
      try { transport?.clearPendingCommands?.(); } catch {}
      try { win?.webContents.send('session:emergency-stopped'); } catch {}
      pushState();
    });
    if (!registered) noteIssue('Emergency hotkey', new Error('CTRL+SHIFT+F12 is already registered by another application'));
  } catch (error) { noteIssue('Emergency hotkey', error); }

  if (!smokeMode) {
    try { transport?.start?.(); } catch (error) { noteIssue('Remote transport start', error); }
  }

  startupComplete = true;
  try { logger?.info(`NexaShareControl startup complete; issues=${startupIssues.length}`); } catch {}
  pushState();
  maybeWriteStartupSmoke();
}

async function boot() {
  if (!ownsSingleInstance) return;
  registerIpc();
  createWindow();
  pushState();
  setTimeout(() => initializeBackgroundSystems().catch(error => noteIssue('Background initialization', error)), 100);
  setInterval(pushState, 1500).unref?.();
}

app.whenReady().then(boot).catch(error => {
  noteIssue('Electron ready', error);
  try { createWindow(); } catch {}
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

app.on('window-all-closed', () => {});
