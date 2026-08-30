const path = require('path');
const fs = require('fs');
const {
  app,
  BrowserWindow,
  ipcMain,
  Tray,
  Menu,
  globalShortcut,
  dialog,
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
let localControl = null;
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

function localControlState() {
  try { return localControl?.publicState?.() || { protocol:'NEXA-SHARE-LOCAL/1', running:false, host:'127.0.0.1', port:Number(config?.data?.localControlPort||47653), paired:!!config?.data?.localControlTokenHash }; }
  catch { return { protocol:'NEXA-SHARE-LOCAL/1', running:false, host:'127.0.0.1', port:47653, paired:false }; }
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
    localControl: localControlState(),
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

function normalizeWindowTitle(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ');
}

function sourceImageData(source, field) {
  try {
    const image = source?.[field];
    if (image && !image.isEmpty()) return image.toDataURL();
  } catch {}
  return '';
}

async function discoverShareSources() {
  // IMPORTANT: the native Windows enumerator is the source of truth for open
  // applications/windows. desktopCapturer is only the capture backend. This
  // means apps such as Unity remain visible in the picker even when Chromium
  // does not expose a direct window capture source for them.
  let nativeWindows = [];
  if (helper?.proc) {
    try {
      const result = await helper.request({ cmd:'window.list' }, 3000);
      nativeWindows = Array.isArray(result.windows) ? result.windows : [];
    } catch (error) {
      noteIssue('Window metadata discovery', error);
    }
  }

  let displays = [];
  try { displays = screen.getAllDisplays(); } catch {}

  const electronSources = await desktopCapturer.getSources({
    types:['screen','window'],
    thumbnailSize:{ width:360, height:220 },
    fetchWindowIcons:true
  });

  const electronScreens = electronSources.filter(source => String(source.id).startsWith('screen:'));
  const electronWindows = electronSources.filter(source => String(source.id).startsWith('window:'));

  const screenByDisplayId = new Map();
  electronScreens.forEach((source, index) => {
    const displayId = String(source.display_id || '');
    if (displayId) screenByDisplayId.set(displayId, source);
    // Some Electron/Windows combinations omit display_id. Preserve a safe
    // index fallback so monitor and region capture still work.
    const display = displays[index];
    if (display && !screenByDisplayId.has(String(display.id))) {
      screenByDisplayId.set(String(display.id), source);
    }
  });

  const directByWindowId = new Map();
  for (const source of electronWindows) {
    const id = parseWindowId(source.id);
    if (id) directByWindowId.set(id, source);
  }

  const windowsByTitle = new Map();
  for (const source of electronWindows) {
    const key = normalizeWindowTitle(source.name);
    if (!key) continue;
    if (!windowsByTitle.has(key)) windowsByTitle.set(key, []);
    windowsByTitle.get(key).push(source);
  }

  const usedElectronWindows = new Set();
  const output = [];

  // Always expose physical monitors.
  electronScreens.forEach((source, index) => {
    const displayId = String(source.display_id || displays[index]?.id || '');
    const display = displays.find(item => String(item.id) === displayId) || displays[index] || null;
    output.push({
      id:`monitor:${displayId || source.id}`,
      captureSourceId:source.id,
      captureMode:'monitor-direct',
      capturable:true,
      name:source.name || `Monitor ${index + 1}`,
      type:'screen',
      displayId,
      thumbnail:sourceImageData(source, 'thumbnail'),
      appIcon:'',
      nativeWindowId:'',
      processId:0,
      processName:'',
      isMinimized:false,
      bounds:display ? {
        x:display.bounds.x, y:display.bounds.y,
        width:display.bounds.width, height:display.bounds.height
      } : null,
      captureDisplayBounds:display ? { ...display.bounds } : null,
      scaleFactor:display?.scaleFactor || 1,
      captureWarning:''
    });
  });

  function findDirectWindow(nativeWindow) {
    const nativeId = String(nativeWindow.window_id || '');
    const byId = directByWindowId.get(nativeId);
    if (byId && !usedElectronWindows.has(byId.id)) return byId;

    const titleKey = normalizeWindowTitle(nativeWindow.title);
    const exact = windowsByTitle.get(titleKey) || [];
    const exactFree = exact.find(source => !usedElectronWindows.has(source.id));
    if (exactFree) return exactFree;

    // Last-resort title matching handles decorations added by Electron/Windows
    // around the same native HWND title.
    if (titleKey.length >= 5) {
      return electronWindows.find(source => {
        if (usedElectronWindows.has(source.id)) return false;
        const candidate = normalizeWindowTitle(source.name);
        return candidate.length >= 5 && (candidate.includes(titleKey) || titleKey.includes(candidate));
      }) || null;
    }
    return null;
  }

  function displayForBounds(bounds) {
    try {
      if (bounds && bounds.width > 0 && bounds.height > 0) return screen.getDisplayMatching(bounds);
    } catch {}
    try { return screen.getPrimaryDisplay(); } catch { return displays[0] || null; }
  }

  // Native visible windows are authoritative. Every one is listed, even when
  // direct Chromium window capture is unavailable. In that case we fall back
  // to capturing/cropping the monitor region occupied by that window.
  for (const nativeWindow of nativeWindows) {
    const nativeWindowId = String(nativeWindow.window_id || '');
    if (!nativeWindowId) continue;

    const bounds = {
      x:Number(nativeWindow.x || 0),
      y:Number(nativeWindow.y || 0),
      width:Math.max(0, Number(nativeWindow.width || 0)),
      height:Math.max(0, Number(nativeWindow.height || 0))
    };
    if (bounds.width <= 0 || bounds.height <= 0) continue;

    const direct = findDirectWindow(nativeWindow);
    if (direct) usedElectronWindows.add(direct.id);

    const display = displayForBounds(bounds);
    const fallbackScreen = display ? screenByDisplayId.get(String(display.id)) : null;
    const minimized = !!nativeWindow.is_minimized;
    const captureSourceId = direct?.id || fallbackScreen?.id || '';
    const captureMode = direct ? 'window-direct' : fallbackScreen ? 'window-region' : 'unavailable';
    const capturable = !!captureSourceId && (!minimized || !!direct);

    let warning = '';
    if (minimized) warning = 'Window is minimized. NexaShareControl can restore it before sharing.';
    else if (captureMode === 'window-region') warning = 'Direct window capture unavailable; using the visible window region on its monitor.';
    else if (!capturable) warning = 'No Windows capture backend is currently available for this window.';

    output.push({
      id:`window:${nativeWindowId}`,
      captureSourceId,
      captureMode,
      capturable,
      name:String(nativeWindow.title || direct?.name || '(untitled)'),
      type:'window',
      displayId:display ? String(display.id) : '',
      thumbnail:sourceImageData(direct, 'thumbnail'),
      appIcon:sourceImageData(direct, 'appIcon'),
      nativeWindowId,
      processId:Number(nativeWindow.process_id || 0),
      processName:String(nativeWindow.process_name || 'Windows Application'),
      isMinimized:minimized,
      bounds,
      captureDisplayBounds:display ? {
        x:display.bounds.x, y:display.bounds.y,
        width:display.bounds.width, height:display.bounds.height
      } : null,
      scaleFactor:display?.scaleFactor || 1,
      captureWarning:warning
    });
  }

  // Keep Electron-only windows too. This covers unusual app/window types that
  // Chromium can capture but EnumWindows did not expose through our filters.
  for (const source of electronWindows) {
    if (usedElectronWindows.has(source.id)) continue;
    const rawId = parseWindowId(source.id);
    output.push({
      id:`electron-window:${rawId || source.id}`,
      captureSourceId:source.id,
      captureMode:'window-direct',
      capturable:true,
      name:source.name || '(untitled)',
      type:'window',
      displayId:'',
      thumbnail:sourceImageData(source, 'thumbnail'),
      appIcon:sourceImageData(source, 'appIcon'),
      nativeWindowId:rawId,
      processId:0,
      processName:'Windows Application',
      isMinimized:false,
      bounds:null,
      captureDisplayBounds:null,
      scaleFactor:1,
      captureWarning:''
    });
  }

  const monitors = output.filter(source => source.type === 'screen');
  const windows = output.filter(source => source.type === 'window').sort((a,b) => {
    const p = String(a.processName || '').localeCompare(String(b.processName || ''));
    return p || String(a.name || '').localeCompare(String(b.name || ''));
  });
  return [...monitors, ...windows];
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

  // v1.4.0: monitors and open application/windows are selectable at the same time.
  ipcMain.handle('screen:list-sources', async () => {
    try { return await discoverShareSources(); }
    catch (error) {
      noteIssue('Share source discovery', error);
      return [];
    }
  });

  ipcMain.handle('screen:resolve-sources', async (_event, ids) => {
    try {
      const wanted = new Set((Array.isArray(ids) ? ids : []).map(id => String(id || '')).filter(Boolean));
      if (!wanted.size) return [];
      const sources = await discoverShareSources();
      return sources.filter(source => wanted.has(source.id));
    } catch (error) {
      noteIssue('Share source refresh', error);
      return [];
    }
  });

  ipcMain.handle('screen:set-selection', (_event, sources) => {
    const clean = Array.isArray(sources) ? sources.slice(0, 16).map(source => ({
      id:String(source?.id || ''),
      name:String(source?.name || ''),
      type:source?.type === 'screen' ? 'screen' : 'window',
      processName:String(source?.processName || ''),
      processId:Number(source?.processId || 0),
      nativeWindowId:String(source?.nativeWindowId || ''),
      captureMode:String(source?.captureMode || '')
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
      localControl:localControlState(),
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
    localControl:localControlState(),
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
    logger.info('NexaShareControl 1.4.0 startup begun');
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
    if (config && helper?.proc && session) {
      const { LocalControlServer } = require('./src/main/localControlServer');
      localControl = new LocalControlServer({
        helper, session, config, logger:logger || { info(){}, warn(){}, error(){} },
        onStateChanged:()=>pushState(),
        approvePair:async ({origin,client,version}) => {
          try {
            const result = await dialog.showMessageBox(win || undefined, {
              type:'question',
              title:'NexaShareControl · Local Vision Control',
              message:'Allow Nexa Vision Relay to control this computer while Desktop Control is ACTIVE?',
              detail:`Client: ${client}${version ? ` ${version}` : ''}\nOrigin: ${origin}\n\nThis grants mouse/keyboard/window control only through the local 127.0.0.1 bridge. CTRL+SHIFT+F12 remains the emergency stop.`,
              buttons:['Allow','Deny'],
              defaultId:1,
              cancelId:1,
              noLink:true
            });
            return result.response===0;
          } catch (error) { noteIssue('Local control pairing dialog', error); return false; }
        }
      });
      await localControl.start();
    }
  } catch (error) { noteIssue('Local Vision Control', error); }

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
  try { await localControl?.stop?.(); } catch {}
  try { await helper?.stop?.(); } catch {}
});

app.on('window-all-closed', () => {});
