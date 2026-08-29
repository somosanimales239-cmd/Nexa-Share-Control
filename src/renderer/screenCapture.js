(()=>{
class MultiSourceCapture{
  constructor(){
    this.sources=[];
    this.selected=new Set();
    this.active=new Map();
    this.timer=null;
    this.discoveryTimer=null;
    this.activeRefreshTimer=null;
    this.frameId=0;
    this.force=false;
    this.running=false;
    this.snapshotBusy=false;
    this.refreshBusy=false;
    this.activeRefreshBusy=false;
    this.maxSources=16;
    this.shareSetId='';
  }

  async init(){
    refreshSourcesBtn.onclick=()=>this.refreshSources(false);
    selectScreensBtn.onclick=()=>this.selectScreens();
    selectAllSourcesBtn.onclick=()=>this.selectAll();
    clearSourcesBtn.onclick=()=>this.clearSelection();
    sourceSearch.oninput=()=>this.renderPicker();
    window.nexa.onForceFrame(()=>{this.force=true;if(this.running)this.snapshotAll(false)});

    await this.refreshSources(false);

    // The Windows Native Helper starts after the Electron UI. Refresh again
    // automatically so programs such as Unity appear without requiring the user
    // to close/reopen NexaShareControl or press Refresh at exactly the right time.
    setTimeout(()=>this.refreshSources(true).catch(()=>{}),1200);
    this.discoveryTimer=setInterval(()=>{
      if(!this.running)this.refreshSources(true).catch(()=>{});
    },4000);
  }

  settings(){
    return{
      fps:Number(fpsSelect.value||5),
      maxWidth:resolutionSelect.value,
      quality:Number(qualityRange.value||65)
    };
  }

  setControlsLocked(locked){
    refreshSourcesBtn.disabled=locked;
    selectScreensBtn.disabled=locked;
    selectAllSourcesBtn.disabled=locked;
    clearSourcesBtn.disabled=locked;
    sourceSearch.disabled=locked;
    for(const input of sourcePicker.querySelectorAll('input[type="checkbox"]'))input.disabled=locked;
    for(const button of sourcePicker.querySelectorAll('button'))button.disabled=locked;
  }

  async refreshSources(silent=false){
    if(this.running||this.refreshBusy)return this.sources;
    this.refreshBusy=true;
    try{
      const previous=new Set(this.selected);
      const list=await window.nexa.listShareSources();
      this.sources=Array.isArray(list)?list:[];
      this.selected=new Set([...previous].filter(id=>this.sources.some(source=>source.id===id)));
      this.renderPicker();
      await this.updateSelectionSummary();
      if(!silent)this.updateInventoryMeta();
      return this.sources;
    }finally{
      this.refreshBusy=false;
    }
  }

  updateInventoryMeta(){
    const screens=this.sources.filter(source=>source.type==='screen').length;
    const windows=this.sources.filter(source=>source.type==='window').length;
    const apps=new Set(this.sources.filter(source=>source.type==='window').map(source=>source.processName||'Windows Application')).size;
    const meta=document.getElementById('sourceInventoryMeta');
    if(meta)meta.textContent=`Detected ${apps} open application${apps===1?'':'s'} · ${windows} window${windows===1?'':'s'} · ${screens} monitor${screens===1?'':'s'}`;
  }

  filteredSources(){
    const q=String(sourceSearch.value||'').trim().toLowerCase();
    if(!q)return this.sources;
    return this.sources.filter(source=>[
      source.name,source.processName,source.processId,source.type,source.displayId,source.captureMode
    ].some(value=>String(value||'').toLowerCase().includes(q)));
  }

  groupedWindows(list=this.filteredSources()){
    const windows=list.filter(source=>source.type==='window');
    const groups=new Map();
    for(const source of windows){
      const key=source.processName||'Windows Application';
      if(!groups.has(key))groups.set(key,[]);
      groups.get(key).push(source);
    }
    return [...groups.entries()].sort((a,b)=>a[0].localeCompare(b[0]));
  }

  toggleSource(id,checked){
    if(checked){
      if(this.selected.size>=this.maxSources&&!this.selected.has(id))return false;
      this.selected.add(id);
    }else this.selected.delete(id);
    return true;
  }

  captureLabel(source){
    if(source.captureMode==='window-direct')return'DIRECT WINDOW';
    if(source.captureMode==='window-region')return'VISIBLE REGION';
    if(source.captureMode==='monitor-direct')return'MONITOR';
    return'UNAVAILABLE';
  }

  async restoreWindow(source){
    if(!source.nativeWindowId)return;
    await window.nexa.activateWindow(source.nativeWindowId);
    await new Promise(resolve=>setTimeout(resolve,350));
    await this.refreshSources(false);
  }

  card(source){
    const label=document.createElement('div');
    label.className='source-card'+(this.selected.has(source.id)?' selected':'')+(source.capturable===false?' unavailable':'');
    label.dataset.sourceId=source.id;

    const thumb=document.createElement('div');
    thumb.className='source-thumb';
    const imageData=source.thumbnail||source.appIcon;
    if(imageData){
      const img=document.createElement('img');img.src=imageData;img.alt='';thumb.appendChild(img);
    }else{
      const fallback=document.createElement('div');fallback.className='source-thumb-fallback';
      fallback.textContent=source.type==='screen'?'DISPLAY':String(source.processName||'APP').slice(0,18).toUpperCase();
      thumb.appendChild(fallback);
    }
    const badge=document.createElement('span');
    badge.className='source-type';
    badge.textContent=source.type==='screen'?'MONITOR':'WINDOW';
    thumb.appendChild(badge);

    const mode=document.createElement('span');
    mode.className='capture-mode '+(source.captureMode==='window-region'?'fallback':'');
    mode.textContent=this.captureLabel(source);
    thumb.appendChild(mode);

    const info=document.createElement('div');info.className='source-info';
    const title=document.createElement('div');title.className='source-title';title.textContent=source.name||'(untitled)';
    const sub=document.createElement('div');sub.className='source-sub';
    if(source.type==='screen'){
      const b=source.bounds;
      sub.textContent=b?`${b.width}×${b.height} · display ${source.displayId||''}`:'Entire monitor';
    }else{
      const pieces=[source.processName||'Windows Application'];
      if(source.processId)pieces.push(`PID ${source.processId}`);
      if(source.isMinimized)pieces.push('Minimized');
      if(source.bounds)pieces.push(`${source.bounds.width}×${source.bounds.height}`);
      sub.textContent=pieces.join(' · ');
    }

    if(source.captureWarning){
      const warning=document.createElement('div');warning.className='source-warning';warning.textContent=source.captureWarning;info.append(title,sub,warning);
    }else info.append(title,sub);

    const actions=document.createElement('div');actions.className='source-actions';
    const check=document.createElement('input');check.type='checkbox';check.checked=this.selected.has(source.id);check.disabled=this.running||source.capturable===false;
    const assign=document.createElement('button');assign.type='button';assign.className='assign-source';
    assign.textContent=check.checked?'ASSIGNED':'ASSIGN TO SHARE';assign.disabled=check.disabled;
    const change=async checked=>{
      if(!this.toggleSource(source.id,checked)){
        window.dispatchEvent(new CustomEvent('nexa:share-limit',{detail:{max:this.maxSources}}));
        return;
      }
      check.checked=this.selected.has(source.id);
      assign.textContent=check.checked?'ASSIGNED':'ASSIGN TO SHARE';
      label.classList.toggle('selected',check.checked);
      await this.updateSelectionSummary();
    };
    check.onchange=()=>change(check.checked);
    assign.onclick=()=>change(!this.selected.has(source.id));
    actions.append(check,assign);

    if(source.type==='window'&&source.nativeWindowId){
      const activate=document.createElement('button');activate.type='button';activate.className='activate-source';
      activate.textContent=source.isMinimized?'RESTORE WINDOW':'ACTIVATE';activate.disabled=this.running;
      activate.onclick=()=>this.restoreWindow(source);
      actions.appendChild(activate);
    }

    info.appendChild(actions);label.append(thumb,info);
    return label;
  }

  applicationCard(processName,windows){
    const card=document.createElement('div');card.className='app-card';
    const icon=document.createElement('div');icon.className='app-icon';
    const image=windows.find(source=>source.appIcon)?.appIcon||windows.find(source=>source.thumbnail)?.thumbnail||'';
    if(image){const img=document.createElement('img');img.src=image;img.alt='';icon.appendChild(img)}
    else icon.textContent=String(processName||'APP').slice(0,2).toUpperCase();

    const body=document.createElement('div');body.className='app-card-body';
    const name=document.createElement('strong');name.textContent=processName;
    const count=document.createElement('span');count.textContent=`${windows.length} open window${windows.length===1?'':'s'}`;
    body.append(name,count);

    const allSelected=windows.every(source=>this.selected.has(source.id));
    const button=document.createElement('button');button.type='button';button.className='app-assign';
    button.textContent=allSelected?'UNASSIGN APP':'ASSIGN APP';button.disabled=this.running;
    button.onclick=async()=>{
      if(allSelected){windows.forEach(source=>this.selected.delete(source.id));}
      else{
        for(const source of windows.filter(source=>source.capturable!==false)){
          if(this.selected.size>=this.maxSources&&!this.selected.has(source.id))break;
          this.selected.add(source.id);
        }
      }
      this.renderPicker();await this.updateSelectionSummary();
    };
    card.append(icon,body,button);return card;
  }

  renderPicker(){
    sourcePicker.innerHTML='';
    const filtered=this.filteredSources();
    const screens=filtered.filter(source=>source.type==='screen');
    const groups=this.groupedWindows(filtered);

    const appOverview=document.createElement('div');appOverview.className='source-group applications-overview';
    const appHead=document.createElement('div');appHead.className='source-group-head';
    const appTitle=document.createElement('h3');appTitle.textContent=`OPEN APPLICATIONS (${groups.length})`;
    const hint=document.createElement('span');hint.className='muted';hint.textContent='Assign an app to share all of its open windows.';
    appHead.append(appTitle,hint);appOverview.appendChild(appHead);
    const appGrid=document.createElement('div');appGrid.className='app-grid';
    groups.forEach(([processName,windows])=>appGrid.appendChild(this.applicationCard(processName,windows)));
    if(!groups.length){const e=document.createElement('div');e.className='empty-source';e.textContent='No open application matches this filter yet.';appGrid.appendChild(e)}
    appOverview.appendChild(appGrid);sourcePicker.appendChild(appOverview);

    const screenGroup=document.createElement('div');screenGroup.className='source-group';
    const screenHead=document.createElement('div');screenHead.className='source-group-head';
    const screenTitle=document.createElement('h3');screenTitle.textContent=`MONITORS (${screens.length})`;
    screenHead.appendChild(screenTitle);screenGroup.appendChild(screenHead);
    const screenGrid=document.createElement('div');screenGrid.className='source-grid';
    screens.forEach(source=>screenGrid.appendChild(this.card(source)));
    if(!screens.length){const e=document.createElement('div');e.className='empty-source';e.textContent='No monitor matches this view.';screenGrid.appendChild(e)}
    screenGroup.appendChild(screenGrid);sourcePicker.appendChild(screenGroup);

    for(const [processName,windows] of groups){
      const group=document.createElement('div');group.className='source-group';
      const head=document.createElement('div');head.className='source-group-head';
      const title=document.createElement('h3');title.textContent=`WINDOWS · ${processName} (${windows.length})`;
      const allSelected=windows.every(source=>this.selected.has(source.id));
      const button=document.createElement('button');button.textContent=allSelected?'UNASSIGN APP':'ASSIGN APP';button.disabled=this.running;
      button.onclick=async()=>{
        if(allSelected){windows.forEach(source=>this.selected.delete(source.id));}
        else{
          for(const source of windows.filter(source=>source.capturable!==false)){
            if(this.selected.size>=this.maxSources&&!this.selected.has(source.id))break;
            this.selected.add(source.id);
          }
        }
        this.renderPicker();await this.updateSelectionSummary();
      };
      head.append(title,button);group.appendChild(head);
      const grid=document.createElement('div');grid.className='source-grid';
      windows.forEach(source=>grid.appendChild(this.card(source)));
      group.appendChild(grid);sourcePicker.appendChild(group);
    }

    if(!filtered.length){
      sourcePicker.innerHTML='<div class="empty-source">No open Windows application, window, or monitor matches the filter. Keep the program open and NexaShareControl will detect it automatically.</div>';
    }
    this.updateInventoryMeta();
  }

  async selectScreens(){
    if(this.running)return;
    for(const source of this.sources.filter(source=>source.type==='screen'&&source.capturable!==false)){
      if(this.selected.size>=this.maxSources&&!this.selected.has(source.id))break;
      this.selected.add(source.id);
    }
    this.renderPicker();await this.updateSelectionSummary();
  }

  async selectAll(){
    if(this.running)return;
    for(const source of this.filteredSources().filter(source=>source.capturable!==false)){
      if(this.selected.size>=this.maxSources&&!this.selected.has(source.id))break;
      this.selected.add(source.id);
    }
    this.renderPicker();await this.updateSelectionSummary();
  }

  async clearSelection(){
    if(this.running)return;
    this.selected.clear();this.renderPicker();await this.updateSelectionSummary();
  }

  selectedSources(){return this.sources.filter(source=>this.selected.has(source.id));}
  hasSelection(){return this.selected.size>0}

  async updateSelectionSummary(){
    const selected=this.selectedSources();
    selectedSourceCount.textContent=`${selected.length} assigned · max ${this.maxSources}`;
    selectedSourceNames.textContent=selected.length
      ?selected.map(source=>source.processName?`${source.processName}: ${source.name}`:source.name).join(' · ')
      :'Nothing is assigned to Share yet.';
    try{await window.nexa.setShareSelection(selected)}catch{}
  }

  mediaConstraints(source){
    return{audio:false,video:{mandatory:{chromeMediaSource:'desktop',chromeMediaSourceId:source.captureSourceId}}};
  }

  createPreviewTile(source){
    const tile=document.createElement('div');tile.className='preview-tile';tile.dataset.sourceId=source.id;
    const video=document.createElement('video');video.autoplay=true;video.muted=true;video.playsInline=true;video.className='capture-video-hidden';
    const canvas=document.createElement('canvas');canvas.className='preview-canvas';
    const label=document.createElement('div');label.className='preview-label';
    label.textContent=source.processName?`${source.processName} — ${source.name}`:source.name;
    tile.append(video,canvas,label);return{tile,video,canvas};
  }

  async prepareSelectedSources(){
    const before=this.selectedSources();
    let restored=false;
    for(const source of before){
      if(source.type==='window'&&source.isMinimized&&source.nativeWindowId){
        try{await window.nexa.activateWindow(source.nativeWindowId);restored=true}catch{}
      }
    }
    if(restored){
      await new Promise(resolve=>setTimeout(resolve,450));
      await this.refreshSources(true);
    }
    return this.selectedSources();
  }

  async openStream(source){
    if(!source.captureSourceId)throw new Error(source.captureWarning||'No capture backend is available for this window');
    const stream=await navigator.mediaDevices.getUserMedia(this.mediaConstraints(source));
    return stream;
  }

  async start(){
    this.stop(false);
    if(!this.sources.length)await this.refreshSources(false);
    let selected=await this.prepareSelectedSources();
    if(!selected.length)return{ok:false,error:'select_at_least_one_source',started:0};
    if(selected.length>this.maxSources)return{ok:false,error:`too_many_sources_max_${this.maxSources}`,started:0};

    previewGrid.innerHTML='';
    let started=0;
    this.shareSetId=(globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random()}`);

    for(const source of selected){
      const {tile,video,canvas}=this.createPreviewTile(source);previewGrid.appendChild(tile);
      try{
        if(source.capturable===false)throw new Error(source.captureWarning||'Source is not currently capturable');
        const stream=await this.openStream(source);
        video.srcObject=stream;await video.play();
        const ctx=canvas.getContext('2d',{alpha:false});
        const item={source,stream,video,canvas,ctx,lastSig:null,staticSkips:0,tile};
        this.active.set(source.id,item);
        for(const track of stream.getTracks())track.addEventListener('ended',()=>this.recoverEndedSource(source.id));
        started++;
      }catch(error){
        tile.innerHTML='';
        const e=document.createElement('div');e.className='preview-error';
        e.textContent=`Cannot capture ${source.name}: ${error.message}`;
        tile.appendChild(e);
      }
    }

    if(!started){
      previewGrid.innerHTML='<div class="preview-placeholder">None of the assigned sources could be opened.</div>';
      return{ok:false,error:'all_selected_sources_failed',started:0};
    }

    this.running=true;
    this.setControlsLocked(true);
    const ms=Math.max(66,Math.floor(1000/this.settings().fps));
    this.timer=setInterval(()=>this.snapshotAll(false).catch(console.error),ms);
    this.activeRefreshTimer=setInterval(()=>this.refreshActiveSources().catch(()=>{}),2000);
    await this.snapshotAll(true);
    this.updatePreviewMeta();
    return{ok:true,started,selected:selected.length};
  }

  async recoverEndedSource(sourceId){
    if(!this.running)return;
    const item=this.active.get(sourceId);if(!item)return;
    try{
      const freshList=await window.nexa.resolveShareSources([sourceId]);
      const fresh=(freshList||[])[0];
      if(fresh&&fresh.captureSourceId){await this.rebindItem(item,fresh);return;}
    }catch{}
    this.sourceEnded(sourceId);
  }

  async rebindItem(item,fresh){
    const oldStream=item.stream;
    const newStream=await this.openStream(fresh);
    item.video.srcObject=newStream;
    await item.video.play();
    item.stream=newStream;
    item.source=fresh;
    for(const track of newStream.getTracks())track.addEventListener('ended',()=>this.recoverEndedSource(fresh.id));
    try{oldStream?.getTracks().forEach(track=>track.stop())}catch{}
  }

  async refreshActiveSources(onlyIds=null){
    if(!this.running||this.activeRefreshBusy)return;
    this.activeRefreshBusy=true;
    try{
      const ids=onlyIds||[...this.active.keys()].filter(id=>this.active.get(id)?.source?.type==='window');
      if(!ids.length)return;
      const freshList=await window.nexa.resolveShareSources(ids);
      const freshMap=new Map((freshList||[]).map(source=>[source.id,source]));
      for(const id of ids){
        const item=this.active.get(id);if(!item)continue;
        const fresh=freshMap.get(id);
        if(!fresh){this.sourceEnded(id);continue;}
        const backendChanged=fresh.captureSourceId!==item.source.captureSourceId||fresh.captureMode!==item.source.captureMode;
        if(backendChanged&&fresh.captureSourceId){
          try{await this.rebindItem(item,fresh)}catch{item.source=fresh}
        }else item.source=fresh;
      }
    }finally{
      this.activeRefreshBusy=false;
    }
  }

  sourceEnded(sourceId){
    const item=this.active.get(sourceId);
    if(!item)return;
    this.active.delete(sourceId);
    try{item.stream?.getTracks().forEach(track=>track.stop())}catch{}
    try{item.tile?.remove()}catch{}
    this.updatePreviewMeta();
    if(this.active.size===0&&this.running){
      this.running=false;
      if(this.timer)clearInterval(this.timer);this.timer=null;
      if(this.activeRefreshTimer)clearInterval(this.activeRefreshTimer);this.activeRefreshTimer=null;
      this.setControlsLocked(false);
      previewGrid.innerHTML='<div class="preview-placeholder">All assigned capture sources have closed or stopped.</div>';
      window.nexa.stopSharing().catch(()=>{});
    }
  }

  stop(resetPreview=true){
    if(this.timer)clearInterval(this.timer);this.timer=null;
    if(this.activeRefreshTimer)clearInterval(this.activeRefreshTimer);this.activeRefreshTimer=null;
    for(const item of this.active.values()){
      try{item.stream.getTracks().forEach(track=>track.stop())}catch{}
      try{item.video.srcObject=null}catch{}
    }
    this.active.clear();this.running=false;this.snapshotBusy=false;this.activeRefreshBusy=false;this.force=false;
    this.setControlsLocked(false);
    if(resetPreview){
      previewGrid.innerHTML='<div class="preview-placeholder">Assigned screens and windows will appear here.</div>';
      previewMeta.textContent='Not sharing';
    }
  }

  size(width,height,maxWidth){
    if(maxWidth==='native')return[width,height];
    const mw=Number(maxWidth||1280);
    return width<=mw?[width,height]:[mw,Math.max(1,Math.round(height*mw/width))];
  }

  cropForSource(item){
    const source=item.source;
    if(source.captureMode!=='window-region'||!source.bounds||!source.captureDisplayBounds){
      return{sx:0,sy:0,sw:item.video.videoWidth,sh:item.video.videoHeight,sourceWidth:item.video.videoWidth,sourceHeight:item.video.videoHeight};
    }
    const display=source.captureDisplayBounds;
    const win=source.bounds;
    const scaleX=item.video.videoWidth/Math.max(1,display.width);
    const scaleY=item.video.videoHeight/Math.max(1,display.height);
    const left=Math.max(0,Math.min(display.width,win.x-display.x));
    const top=Math.max(0,Math.min(display.height,win.y-display.y));
    const right=Math.max(left+1,Math.min(display.width,win.x+win.width-display.x));
    const bottom=Math.max(top+1,Math.min(display.height,win.y+win.height-display.y));
    return{
      sx:Math.round(left*scaleX),sy:Math.round(top*scaleY),
      sw:Math.max(1,Math.round((right-left)*scaleX)),sh:Math.max(1,Math.round((bottom-top)*scaleY)),
      sourceWidth:Math.max(1,Math.round(right-left)),sourceHeight:Math.max(1,Math.round(bottom-top))
    };
  }

  signature(item){
    const width=Math.min(64,item.canvas.width),height=Math.min(36,item.canvas.height);
    const sample=document.createElement('canvas');sample.width=width;sample.height=height;
    const ctx=sample.getContext('2d',{willReadFrequently:true});
    ctx.drawImage(item.canvas,0,0,width,height);
    const data=ctx.getImageData(0,0,width,height).data;
    let hash=2166136261;
    for(let i=0;i<data.length;i+=32){
      hash^=(data[i]||0)+(data[i+1]||0)+(data[i+2]||0);
      hash=Math.imul(hash,16777619);
    }
    return hash>>>0;
  }

  async nativeContext(){
    const context={cursor:{},active:{}};
    try{context.cursor=await window.nexa.nativeCommand({cmd:'cursor.get'})||{}}catch{}
    try{context.active=await window.nexa.nativeCommand({cmd:'window.get_active'})||{}}catch{}
    return context;
  }

  async snapshotOne(item,index,total,highQuality,context){
    if(!item.stream||item.video.readyState<2)return false;
    const cfg=this.settings();
    const crop=this.cropForSource(item);
    const [width,height]=this.size(crop.sourceWidth,crop.sourceHeight,highQuality?'native':cfg.maxWidth);
    item.canvas.width=width;item.canvas.height=height;
    item.ctx.drawImage(item.video,crop.sx,crop.sy,crop.sw,crop.sh,0,0,width,height);

    const sig=this.signature(item),same=sig===item.lastSig;
    item.lastSig=sig;
    if(!highQuality&&!this.force&&same){
      item.staticSkips++;
      if(item.staticSkips<4)return true;
    }
    item.staticSkips=0;

    this.frameId++;
    const quality=highQuality?0.90:Math.max(0.40,Math.min(0.90,cfg.quality/100));
    const jpegBase64=item.canvas.toDataURL('image/jpeg',quality).split(',')[1];
    const source=item.source;
    const cursor=context.cursor||{},active=context.active||{};

    const metadata={
      protocol_version:1,
      frame_id:this.frameId,
      timestamp_utc:new Date().toISOString(),
      multi_source:true,
      share_set_id:this.shareSetId,
      source_index:index,
      source_count:total,
      source_id:source.id,
      source_type:source.type,
      source_name:source.name,
      capture_mode:source.captureMode||'',
      app_process_name:source.processName||'',
      app_process_id:source.processId||0,
      native_window_id:source.nativeWindowId||'',
      display_id:source.displayId||'',
      source_bounds:source.bounds||null,
      capture_width:width,
      capture_height:height,
      source_width:crop.sourceWidth,
      source_height:crop.sourceHeight,
      dpi_scale:cursor.dpi_scale||source.scaleFactor||1,
      cursor_x:cursor.x,
      cursor_y:cursor.y,
      active_window_title:active.title||''
    };

    const result=await window.nexa.sendFrame({metadata,jpegBase64});
    return result?.ok!==false;
  }

  async snapshotAll(highQuality=false){
    if(!this.running&&this.active.size===0)return{ok:false,count:0};
    if(this.snapshotBusy)return{ok:false,count:0,busy:true};
    this.snapshotBusy=true;
    try{
      const items=[...this.active.values()];
      const context=await this.nativeContext();
      let sent=0;
      for(let index=0;index<items.length;index++){
        try{if(await this.snapshotOne(items[index],index,items.length,highQuality,context))sent++;}
        catch(error){console.error(error)}
      }
      this.force=false;this.updatePreviewMeta();
      return{ok:sent>0,count:sent};
    }finally{
      this.snapshotBusy=false;
    }
  }

  updatePreviewMeta(){
    const cfg=this.settings();
    previewMeta.textContent=this.running
      ?`${this.active.size} source${this.active.size===1?'':'s'} · ${cfg.fps} FPS · ${cfg.maxWidth==='native'?'Native':cfg.maxWidth+'px max'}`
      :'Not sharing';
  }
}
window.nexaScreen=new MultiSourceCapture();
})();
