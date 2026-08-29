const path=require('path');
const {app,BrowserWindow,ipcMain,Tray,Menu,globalShortcut,desktopCapturer,screen}=require('electron');
const {NativeHelper}=require('./src/main/nativeHelper');
const {ConfigStore}=require('./src/main/config');
const {AppLogger}=require('./src/main/logger');
const {SecurityManager}=require('./src/main/security');
const {SessionManager}=require('./src/main/sessionManager');
const {CommandRouter}=require('./src/main/commandRouter');
const {TransportManager}=require('./src/main/transport');
let win,tray,helper,config,logger,security,session,router,transport;
function state(){return {version:app.getVersion(),protocolVersion:1,config:config.publicConfig(),session:session.publicState(),transport:transport.publicState(),helper:helper.publicState()}}
function pushState(){if(win&&!win.isDestroyed())win.webContents.send('state:update',state())}
function createWindow(){win=new BrowserWindow({width:1280,height:860,minWidth:1000,minHeight:700,title:'NexaShareControl',webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false}});win.loadFile(path.join(__dirname,'src','index.html'));win.on('close',e=>{if(!app.isQuitting){e.preventDefault();win.hide()}})}
function createTray(){try{tray=new Tray(path.join(__dirname,'src','assets','tray.png'))}catch{tray=new Tray(process.execPath)};const rebuild=()=>{const a=session.isActive();tray.setToolTip(a?'NexaShareControl - ACTIVE':'NexaShareControl - OFF');tray.setContextMenu(Menu.buildFromTemplate([{label:'Open NexaShareControl',click:()=>win.show()},{label:`Status: ${a?'ACTIVE':'OFF'}`,enabled:false},{type:'separator'},{label:'Start Sharing',enabled:!a,click:()=>session.startLocalSession()},{label:'Stop Sharing',enabled:a,click:()=>session.stop('tray')},{type:'separator'},{label:'Exit',click:()=>{app.isQuitting=true;app.quit()}}]))};session.onStateChanged=()=>{rebuild();pushState()};rebuild()}
async function setupIpc(){
 ipcMain.handle('app:get-state',()=>state());
 ipcMain.handle('settings:save',async(_e,v)=>{config.update(v);await config.save();transport.applyConfig();return{ok:true,config:config.publicConfig()}});
 ipcMain.handle('device:pair',async(_e,c)=>transport.pairDevice(c)); ipcMain.handle('session:start-local',()=>session.startLocalSession()); ipcMain.handle('session:stop',()=>session.stop('local'));
 ipcMain.handle('screen:list-sources',async()=>{const src=await desktopCapturer.getSources({types:['screen'],thumbnailSize:{width:320,height:180}});return src.map(s=>({id:s.id,name:s.name,displayId:s.display_id||'',thumbnail:s.thumbnail.toDataURL()}))});
 ipcMain.handle('screen:frame',async(_e,p)=>session.isActive()?transport.sendFrame(p):{ok:false,error:'session_inactive'});
 ipcMain.handle('native:command',(_e,c)=>helper.request(c)); ipcMain.handle('window:list',()=>helper.request({cmd:'window.list'})); ipcMain.handle('window:activate',(_e,id)=>helper.request({cmd:'window.activate',window_id:id}));
 ipcMain.handle('diagnostics:run',async()=>({appVersion:app.getVersion(),protocolVersion:1,electron:process.versions.electron,node:process.versions.node,windows:process.getSystemVersion(),helper:await helper.healthCheck(),monitors:(await helper.request({cmd:'monitor.list'})).monitors||[],cursor:await helper.request({cmd:'cursor.get'}),transport:await transport.diagnostics(),session:session.publicState()}));
}
async function boot(){config=new ConfigStore(app.getPath('userData'));await config.load();logger=new AppLogger(app.getPath('userData'));security=new SecurityManager(config,logger);await security.initialize();helper=new NativeHelper(logger);await helper.start();session=new SessionManager(config,logger);transport=new TransportManager(config,security,session,logger);router=new CommandRouter(helper,session,transport,logger,()=>win?.webContents.send('screen:force-frame'));transport.setCommandHandler(c=>router.handle(c));createWindow();await setupIpc();createTray();globalShortcut.register('CommandOrControl+Shift+F12',async()=>{await session.emergencyStop();transport.clearPendingCommands();win?.webContents.send('session:emergency-stopped');pushState()});transport.start();setInterval(pushState,1500).unref?.();logger.info('NexaShareControl started')}
app.whenReady().then(boot).catch(e=>{console.error(e);app.quit()});app.on('before-quit',async()=>{app.isQuitting=true;try{globalShortcut.unregisterAll()}catch{};try{await transport?.stop()}catch{};try{await helper?.stop()}catch{}});app.on('window-all-closed',()=>{});
