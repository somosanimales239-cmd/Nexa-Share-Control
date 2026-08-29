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
    this.snapshotBusy=false;
    this.maxSources=16;
    this.shareSetId='';
  }

  async init(){
    refreshSourcesBtn.onclick=()=>this.refreshSources();
    selectScreensBtn.onclick=()=>this.selectScreens();
    selectAllSourcesBtn.onclick=()=>this.selectAll();
    clearSourcesBtn.onclick=()=>this.clearSelection();
    sourceSearch.oninput=()=>this.renderPicker();
    window.nexa.onForceFrame(()=>{this.force=true;if(this.running)this.snapshotAll(false)});
    await this.refreshSources();
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

  async refreshSources(){
    if(this.running)return this.sources;
    const previous=new Set(this.selected);
    const list=await window.nexa.listShareSources();
    this.sources=Array.isArray(list)?list:[];
    this.selected=new Set([...previous].filter(id=>this.sources.some(source=>source.id===id)));
    this.renderPicker();
    await this.updateSelectionSummary();
    return this.sources;
  }

  filteredSources(){
    const q=String(sourceSearch.value||'').trim().toLowerCase();
    if(!q)return this.sources;
    return this.sources.filter(source=>[
      source.name,source.processName,source.type,source.displayId
    ].some(value=>String(value||'').toLowerCase().includes(q)));
  }

  groupedWindows(list=this.filteredSources()){
    const windows=list.filter(source=>source.type==='window');
    const groups=new Map();
    for(const source of windows){
      const key=source.processName||'Windows';
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
      if(source.bounds)pieces.push(`${source.bounds.width}×${source.bounds.height}`);
      sub.textContent=pieces.join(' · ');
    }

    const checkWrap=document.createElement('div');checkWrap.className='source-check';
    const check=document.createElement('input');check.type='checkbox';check.checked=this.selected.has(source.id);check.disabled=this.running;
    const text=document.createElement('span');text.textContent='Share this source';
    check.onchange=async()=>{
      if(!this.toggleSource(source.id,check.checked)){
        check.checked=false;
        window.dispatchEvent(new CustomEvent('nexa:share-limit',{detail:{max:this.maxSources}}));
      }
      label.classList.toggle('selected',check.checked);
      await this.updateSelectionSummary();
    };
    checkWrap.append(check,text);info.append(title,sub,checkWrap);label.append(thumb,info);
    return label;
  }

  renderPicker(){
    sourcePicker.innerHTML='';
    const filtered=this.filteredSources();
    const screens=filtered.filter(source=>source.type==='screen');

    const screenGroup=document.createElement('div');screenGroup.className='source-group';
    const screenHead=document.createElement('div');screenHead.className='source-group-head';
    const screenTitle=document.createElement('h3');screenTitle.textContent=`MONITORS (${screens.length})`;
    screenHead.appendChild(screenTitle);screenGroup.appendChild(screenHead);
    const screenGrid=document.createElement('div');screenGrid.className='source-grid';
    screens.forEach(source=>screenGrid.appendChild(this.card(source)));
    if(!screens.length){const e=document.createElement('div');e.className='empty-source';e.textContent='No monitor matches this view.';screenGrid.appendChild(e)}
    screenGroup.appendChild(screenGrid);sourcePicker.appendChild(screenGroup);

    for(const [processName,windows] of this.groupedWindows(filtered)){
      const group=document.createElement('div');group.className='source-group';
      const head=document.createElement('div');head.className='source-group-head';
      const title=document.createElement('h3');title.textContent=`APP · ${processName} (${windows.length} window${windows.length===1?'':'s'})`;
      const allSelected=windows.every(source=>this.selected.has(source.id));
      const button=document.createElement('button');button.textContent=allSelected?'UNSELECT APP':'SELECT APP';button.disabled=this.running;
      button.onclick=async()=>{
        if(allSelected){windows.forEach(source=>this.selected.delete(source.id));}
        else{
          for(const source of windows){
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
      sourcePicker.innerHTML='<div class="empty-source">No shareable monitor or application window matches the filter.</div>';
    }
  }

  async selectScreens(){
    if(this.running)return;
    for(const source of this.sources.filter(source=>source.type==='screen')){
      if(this.selected.size>=this.maxSources&&!this.selected.has(source.id))break;
      this.selected.add(source.id);
    }
    this.renderPicker();await this.updateSelectionSummary();
  }

  async selectAll(){
    if(this.running)return;
    for(const source of this.filteredSources()){
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
    selectedSourceCount.textContent=`${selected.length} selected · max ${this.maxSources}`;
    selectedSourceNames.textContent=selected.length
      ?selected.map(source=>source.processName?`${source.processName}: ${source.name}`:source.name).join(' · ')
      :'Nothing will be shared until you select a source.';
    try{await window.nexa.setShareSelection(selected)}catch{}
  }

  mediaConstraints(sourceId){
    return{audio:false,video:{mandatory:{chromeMediaSource:'desktop',chromeMediaSourceId:sourceId}}};
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
    if(selected.length>this.maxSources)return{ok:false,error:`too_many_sources_max_${this.maxSources}`,started:0};

    previewGrid.innerHTML='';
    let started=0;
    this.shareSetId=(globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random()}`);

    for(const source of selected){
      const {tile,video}=this.createPreviewTile(source);previewGrid.appendChild(tile);
      try{
        const stream=await navigator.mediaDevices.getUserMedia(this.mediaConstraints(source.id));
        video.srcObject=stream;await video.play();
        const canvas=document.createElement('canvas');
        const ctx=canvas.getContext('2d',{alpha:false});
        const item={source,stream,video,canvas,ctx,lastSig:null,staticSkips:0,tile};
        this.active.set(source.id,item);
        for(const track of stream.getTracks())track.addEventListener('ended',()=>this.sourceEnded(source.id));
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
    this.setControlsLocked(true);
    const ms=Math.max(66,Math.floor(1000/this.settings().fps));
    this.timer=setInterval(()=>this.snapshotAll(false).catch(console.error),ms);
    await this.snapshotAll(true);
    this.updatePreviewMeta();
    return{ok:true,started,selected:selected.length};
  }

  sourceEnded(sourceId){
    const item=this.active.get(sourceId);
    if(!item)return;
    this.active.delete(sourceId);
    try{item.tile?.remove()}catch{}
    this.updatePreviewMeta();
    if(this.active.size===0&&this.running){
      this.running=false;
      if(this.timer)clearInterval(this.timer);
      this.timer=null;
      this.setControlsLocked(false);
      previewGrid.innerHTML='<div class="preview-placeholder">All selected capture sources have closed or stopped.</div>';
    }
  }

  stop(resetPreview=true){
    if(this.timer)clearInterval(this.timer);this.timer=null;
    for(const item of this.active.values()){
      try{item.stream.getTracks().forEach(track=>track.stop())}catch{}
      try{item.video.srcObject=null}catch{}
    }
    this.active.clear();this.running=false;this.snapshotBusy=false;this.force=false;
    this.setControlsLocked(false);
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
