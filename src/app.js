const logEl=document.getElementById('activityLog');
function log(message){
  logEl.textContent=`[${new Date().toLocaleTimeString()}] ${message}\n`+logEl.textContent.slice(0,12000);
}

function render(state){
  if(!state)return;
  const issues=state.startupIssues||[];
  startupIssueBanner.classList.toggle('hidden',issues.length===0);
  startupIssueBanner.textContent=issues.length
    ?`NexaShareControl opened, but a background component needs attention: ${issues[issues.length-1].area} — ${issues[issues.length-1].message}`:'';

  const active=!!state.session?.active;
  globalStatus.textContent=active?'SCREEN SHARING ACTIVE · REMOTE INPUT ACTIVE':'DESKTOP CONTROL OFF';
  globalStatus.className=`pill ${active?'active':'off'}`;
  warningBanner.classList.toggle('hidden',!active);
  serverStatus.textContent=state.transport?.connected?'Connected':'Disconnected';
  deviceStatus.textContent=state.transport?.paired?'Paired':'Unpaired';
  screenStatus.textContent=active?`${state.shareSelection?.length||0} source(s)`:'Off';
  inputStatus.textContent=active?'Enabled':'Disabled';
  sessionStatus.textContent=active?'Active':'No session';
  startBtn.disabled=active;
  stopBtn.disabled=!active;
}

(async()=>{
  const initial=await window.nexa.getState();
  render(initial);
  window.nexa.onState(render);
  window.nexa.onEmergencyStopped(()=>{
    window.nexaScreen.stop();
    log('EMERGENCY STOP: screen sharing and remote control stopped.');
  });
  window.addEventListener('nexa:share-limit',event=>{
    log(`Source limit reached. NexaShareControl can share up to ${event.detail?.max||16} sources simultaneously.`);
  });

  await window.nexaSettings.init(initial.config);
  await window.nexaScreen.init(initial.config);
  await window.nexaDiagnostics.init();

  startBtn.onclick=async()=>{
    if(!window.nexaScreen.hasSelection()){
      log('Select at least one monitor, application, or window before sharing.');
      return;
    }
    const sessionResult=await window.nexa.startSharing();
    if(!sessionResult.ok){
      log(`Start failed: ${sessionResult.error}`);
      return;
    }
    const captureResult=await window.nexaScreen.start();
    if(!captureResult.ok){
      await window.nexa.stopSharing();
      log(`Capture failed: ${captureResult.error}`);
      return;
    }
    log(`Sharing started with ${captureResult.started} source(s) at the same time.`);
  };

  stopBtn.onclick=async()=>{
    await window.nexa.stopSharing();
    window.nexaScreen.stop();
    log('Sharing stopped.');
  };

  snapshotBtn.onclick=async()=>{
    const result=await window.nexaScreen.snapshotAll(true);
    log(result.ok?`High-quality snapshot captured for ${result.count} source(s).`:'Snapshot unavailable.');
  };

  pairBtn.onclick=async()=>{
    const result=await window.nexa.pairDevice(pairingCode.value.trim());
    log(result.ok?'Device paired.':`Pairing failed: ${result.error}`);
  };

  moveCenterBtn.onclick=async()=>{
    const result=await window.nexa.nativeCommand({cmd:'monitor.list'});
    const monitor=result.monitors?.find(x=>x.primary)||result.monitors?.[0];
    if(!monitor)return log('No monitor detected or Native Helper is unavailable.');
    await window.nexa.nativeCommand({cmd:'mouse.move',x:monitor.x+Math.floor(monitor.width/2),y:monitor.y+Math.floor(monitor.height/2),pixels:true});
    log('Cursor moved to monitor center.');
  };

  leftClickBtn.onclick=async()=>{
    const result=await window.nexa.nativeCommand({cmd:'mouse.click',button:'left'});
    log(result.ok?'Left click test executed.':`Left click unavailable: ${result.error}`);
  };

  scrollBtn.onclick=async()=>{
    const result=await window.nexa.nativeCommand({cmd:'mouse.wheel',delta:-120});
    log(result.ok?'Scroll test executed.':`Scroll unavailable: ${result.error}`);
  };

  typeBtn.onclick=async()=>{
    const result=await window.nexa.nativeCommand({cmd:'keyboard.text',text:'NexaShareControl test'});
    log(result.ok?'Type test executed.':`Keyboard unavailable: ${result.error}`);
  };

  listWindowsBtn.onclick=async()=>{
    const result=await window.nexa.listWindows();
    windowsList.innerHTML='';
    (result.windows||[]).slice(0,60).forEach(item=>{
      const row=document.createElement('div');row.className='window-item';
      const text=document.createElement('span');
      text.textContent=`${item.process_name||''} — ${item.title||'(untitled)'}`;
      const button=document.createElement('button');button.textContent='ACTIVATE';
      button.onclick=()=>window.nexa.activateWindow(item.window_id);
      row.append(text,button);windowsList.appendChild(row);
    });
    log(`Listed ${(result.windows||[]).length} windows.`);
  };

  stopAllBtn.onclick=async()=>{
    await window.nexa.stopSharing();
    window.nexaScreen.stop();
    log('All screen sharing and control stopped.');
  };
})().catch(error=>log(`UI startup error: ${error.message}`));
