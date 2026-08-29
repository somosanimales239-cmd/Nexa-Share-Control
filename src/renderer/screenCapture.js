(()=>{
class MultiSourceCapture{
  constructor(){
    this.sources=[];
    this.selected=new Set();
    this.active=new Map();
    this.timer=null;
    this.frameId=0;
    this.force=false;
    this.running=false;
  }

  async init(){
    await this.refreshSources();
    refreshSourcesBtn.onclick=()=>this.refreshSources();
    selectScreensBtn.onclick=()=>this.selectScreens();
    clearSourcesBtn.onclick=()=>this.clearSelection();
    window.nexa.onForceFrame(()=>{this.force=true;if(this.running)this.snapshotAll(false)});
  }

  settings(){
    return{
      fps:Number(fpsSelect.value||5),
      maxWidth:resolutionSelect.value,
      quality:Number(qualityRange.value||65)
    };
  }

  async refreshSources(){
    const previous=new Set(this.selected);
    const list=await window.nexa.listShareSources();
    this.sources=Array.isArray(list)?list:[];
    this.selected=new Set([...previous].filter(id=>this.sources.some(source=>source.id===id)));
    this.renderPicker();
    this.updateSelectionSummary();
    return this.sources;
  }

  groupedWindows(){
    const windows=this.sources.filter(source=>source.type==='window');
    const groups=new Map();
    for(const source of windows){
      const key=source.processName||'Windows';
      if(!groups.has(key))groups.set(key,[]);
      groups.get(key).push(source);
    }
    return [...groups.entries()].sort((a,b)=>a[0].localeCompare(b[0]));
  }

  card(source){
    const label=document.createElement('label');
    label.className='source-card'+(this.selected.has(source.id)?' selected':'');
    label.dataset.sourceId=source.id;

    const thumb=document.createElement('div');
    thumb.className='source-thumb';
    if(source.thumbnail){
      const img=document.createElement('img');img.src=source.thumbnail;img.alt='';thumb.appendChild(img);
    }
    const badge=document.createElement('span');
    badge.className='source-type';
    badge.textContent=source.type==='screen'?'MONITOR':'WINDOW';
    thumb.appendChild(badge);

    const info=document.createElement('div');info.className='source-info';
    const title=document.createElement('div');title.className='source-title';title.textContent=source.name||'(untitled)';
    const sub=document.createElement('div');sub.className='source-sub';
    if(source.type==='screen'){
      const b=source.bounds;
      sub.textContent=b?`${b.width}×${b.height} · display ${source.displayId||''}`:'Entire monitor';
    }else{
      const pieces=[source.processName||'Application'];
      if(source.isMinimized)pieces.push('Minimized');
      sub.textContent=pieces.join(' · ');
    }

    const checkWrap=document.createElement('div');checkWrap.className='source-check';
    const check=document.createElement('input');check.type='checkbox';check.checked=this.selected.has(source.id);
    const text=document.createElement('span');text.textContent='Share this source';
    check.onchange=()=>{
      if(check.checked)this.selected.add(source.id);else this.selected.delete(source.id);
      label.classList.toggle('selected',check.checked);
      this.updateSelectionSummary();
    };
    checkWrap.append(check,text);info.append(title,sub,checkWrap);label.append(thumb,info);
    return label;
  }

  renderPicker(){
    sourcePicker.innerHTML='';
    const screens=this.sources.filter(source=>source.type==='screen');

    const screenGroup=document.createElement('div');screenGroup.className='source-group';
    const screenHead=document.createElement('div');screenHead.className='source-group-head';
    const screenTitle=document.createElement('h3');screenTitle.textContent=`MONITORS (${screens.length})`;
    screenHead.appendChild(screenTitle);screenGroup.appendChild(screenHead);
    const screenGrid=document.createElement('div');screenGrid.className='source-grid';
    screens.forEach(source=>screenGrid.appendChild(this.card(source)));
    if(!screens.length){const e=document.createElement('div');e.className='empty-source';e.textContent='No monitor source detected.';screenGrid.appendChild(e)}
    screenGroup.appendChild(screenGrid);sourcePicker.appendChild(screenGroup);

    for(const [processName,windows] of this.groupedWindows()){
      const group=document.createElement('div');group.className='source-group';
      const head=document.createElement('div');head.className='source-group-head';
      const title=document.createElement('h3');title.textContent=`APP · ${processName} (${windows.length} window${windows.length===1?'':'s'})`;
      const button=document.createElement('button');button.textContent='SELECT APP';
      button.onclick=()=>{
        windows.forEach(source=>this.selected.add(source.id));
        this.renderPicker();this.updateSelectionSummary();
      };
      head.append(title,button);group.appendChild(head);
      const grid=document.createElement('div');grid.className='source-grid';
      windows.forEach(source=>grid.appendChild(this.card(source)));
      group.appendChild(grid);sourcePicker.appendChild(group);
    }

    if(!this.sources.length){
      sourcePicker.innerHTML='<div class="empty-source">No shareable monitor or application window was found.</div>';
    }
  }

  selectScreens(){
    this.sources.filter(source=>source.type==='screen').forEach(source=>this.selected.add(source.id));
    this.renderPicker();this.updateSelectionSummary();
  }

  clearSelection(){
    this.selected.clear();this.renderPicker();this.updateSelectionSummary();
  }

  selectedSources(){
    return this.sources.filter(source=>this.selected.has(source.id));
  }

  hasSelection(){return this.selected.size>0}

  async updateSelectionSummary(){
    const selected=this.selectedSources();
    selectedSourceCount.textContent=`${selected.length} selected`;
    selectedSourceNames.textContent=selected.length
      ?selected.map(source=>source.processName?`${source.processName}: ${source.name}`:source.name).join(' · ')
      :'Nothing will be shared until you select a source.';
    try{await window.nexa.setShareSelection(selected)}catch{}
  }

  mediaConstraints(sourceId){
    return{
      audio:false,
      video:{mandatory:{
        chromeMediaSource:'desktop',
        chromeMediaSourceId:sourceId
      }}
    };
  }

  createPreviewTile(source){
    const tile=document.createElement('div');tile.className='preview-tile';tile.dataset.sourceId=source.id;
    const video=document.createElement('video');video.autoplay=true;video.muted=true;video.playsInline=true;
    const label=document.createElement('div');label.className='preview-label';
    label.textContent=source.processName?`${source.processName} — ${source.name}`:source.name;
    tile.append(video,label);return{tile,video};
  }

  async start(){
    this.stop(false);
    if(!this.sources.length)await this.refreshSources();
    const selected=this.selectedSources();
    if(!selected.length)return{ok:false,error:'select_at_least_one_source',started:0};

    previewGrid.innerHTML='';
    let started=0;

    for(const source of selected){
      const {tile,video}=this.createPreviewTile(source);previewGrid.appendChild(tile);
      try{
        const stream=await navigator.mediaDevices.getUserMedia(this.mediaConstraints(source.id));
        video.srcObject=stream;await video.play();
        const canvas=document.createElement('canvas');
        const ctx=canvas.getContext('2d',{alpha:false});
        this.active.set(source.id,{source,stream,video,canvas,ctx,lastSig:null,staticSkips:0});
        started++;
      }catch(error){
        tile.innerHTML='';
        const e=document.createElement('div');e.className='preview-error';
        e.textContent=`Cannot capture ${source.name}: ${error.message}`;
        tile.appendChild(e);
      }
    }

    if(!started){
      previewGrid.innerHTML='<div class="preview-placeholder">None of the selected sources could be opened.</div>';
      return{ok:false,error:'all_selected_sources_failed',started:0};
    }

    this.running=true;
    const ms=Math.max(66,Math.floor(1000/this.settings().fps));
    this.timer=setInterval(()=>this.snapshotAll(false).catch(console.error),ms);
    await this.snapshotAll(true);
    this.updatePreviewMeta();
    return{ok:true,started,selected:selected.length};
  }

  stop(resetPreview=true){
    if(this.timer)clearInterval(this.timer);this.timer=null;
    for(const item of this.active.values()){
      try{item.stream.getTracks().forEach(track=>track.stop())}catch{}
      try{item.video.srcObject=null}catch{}
    }
    this.active.clear();this.running=false;
    if(resetPreview){
      previewGrid.innerHTML='<div class="preview-placeholder">Selected screens and windows will appear here.</div>';
      previewMeta.textContent='Not sharing';
    }
  }

  size(width,height,maxWidth){
    if(maxWidth==='native')return[width,height];
    const mw=Number(maxWidth||1280);
    return width<=mw?[width,height]:[mw,Math.max(1,Math.round(height*mw/width))];
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
    const [width,height]=this.size(item.video.videoWidth,item.video.videoHeight,highQuality?'native':cfg.maxWidth);
    item.canvas.width=width;item.canvas.height=height;
    item.ctx.drawImage(item.video,0,0,width,height);

    const sig=this.signature(item),same=sig===item.lastSig;
    item.lastSig=sig;
    if(!highQuality&&!this.force&&same){
      item.staticSkips++;
      if(item.staticSkips<4)return true;
    }
    item.staticSkips=0;

    this.frameId++;
    const quality=highQuality?.90:Math.max(.40,Math.min(.90,cfg.quality/100));
    const jpegBase64=item.canvas.toDataURL('image/jpeg',quality).split(',')[1];
    const source=item.source;
    const cursor=context.cursor||{},active=context.active||{};

    const metadata={
      protocol_version:1,
      frame_id:this.frameId,
      timestamp_utc:new Date().toISOString(),
      multi_source:true,
      source_index:index,
      source_count:total,
      source_id:source.id,
      source_type:source.type,
      source_name:source.name,
      app_process_name:source.processName||'',
      native_window_id:source.nativeWindowId||'',
      display_id:source.displayId||'',
      source_bounds:source.bounds||null,
      capture_width:width,
      capture_height:height,
      source_width:item.video.videoWidth,
      source_height:item.video.videoHeight,
      dpi_scale:cursor.dpi_scale||source.scaleFactor||1,
      cursor_x:cursor.x,
      cursor_y:cursor.y,
      active_window_title:active.title||''
    };

    await window.nexa.sendFrame({metadata,jpegBase64});
    return true;
  }

  async snapshotAll(highQuality=false){
    if(!this.running&&this.active.size===0)return{ok:false,count:0};
    const items=[...this.active.values()];
    const context=await this.nativeContext();
    let sent=0;
    for(let index=0;index<items.length;index++){
      try{
        if(await this.snapshotOne(items[index],index,items.length,highQuality,context))sent++;
      }catch(error){console.error(error)}
    }
    this.force=false;this.updatePreviewMeta();
    return{ok:sent>0,count:sent};
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
