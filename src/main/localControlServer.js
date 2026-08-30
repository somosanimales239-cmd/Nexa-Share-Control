'use strict';

const http = require('http');
const crypto = require('crypto');

const PROTOCOL = 'NEXA-SHARE-LOCAL/1';
const DEFAULT_PORT = 47653;
const MAX_BODY = 128 * 1024;
const TOKEN_HEADER = 'authorization';
const CLIENT_HEADER = 'x-nexa-control-client';
const EXTENSION_ID_HEADER = 'x-nexa-extension-id';

function sleep(ms){ return new Promise(resolve => setTimeout(resolve, ms)); }
function sha256(value){ return crypto.createHash('sha256').update(String(value || '')).digest('hex'); }
function safeOrigin(value){
  const origin = String(value || '').trim();
  return /^chrome-extension:\/\/[a-p]{32}$/i.test(origin) ? origin : '';
}
function sendJson(res, status, body, origin=''){
  const payload = Buffer.from(JSON.stringify(body));
  res.statusCode = status;
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Content-Length',String(payload.length));
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(origin){
    res.setHeader('Access-Control-Allow-Origin',origin);
    res.setHeader('Vary','Origin');
  }
  res.end(payload);
}
function readJson(req){
  return new Promise((resolve,reject)=>{
    let size=0;
    const chunks=[];
    req.on('data',chunk=>{
      size += chunk.length;
      if(size > MAX_BODY){ reject(new Error('request_too_large')); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end',()=>{
      try{
        const raw=Buffer.concat(chunks).toString('utf8').trim();
        resolve(raw ? JSON.parse(raw) : {});
      }catch(error){ reject(new Error('invalid_json')); }
    });
    req.on('error',reject);
  });
}

class LocalControlServer{
  constructor({helper,session,config,logger,approvePair,onStateChanged}){
    this.helper=helper;
    this.session=session;
    this.config=config;
    this.logger=logger;
    this.approvePair=approvePair;
    this.onStateChanged=onStateChanged;
    this.server=null;
    this.port=0;
    this.lastError='';
    this.startedAt='';
    this.lastCommandAt='';
    this.lastCommand='';
    this.recent=new Map();
    this.pairBusy=false;
  }

  publicState(){
    return {
      protocol:PROTOCOL,
      running:!!this.server,
      host:'127.0.0.1',
      port:this.port || Number(this.config?.data?.localControlPort || DEFAULT_PORT),
      paired:!!this.config?.data?.localControlTokenHash,
      pairedOrigin:String(this.config?.data?.localControlOrigin || ''),
      startedAt:this.startedAt,
      lastCommandAt:this.lastCommandAt,
      lastCommand:this.lastCommand,
      lastError:this.lastError
    };
  }

  async start(){
    if(this.server) return this.publicState();
    const requested = Number(process.env.NEXA_SHARE_LOCAL_PORT || this.config?.data?.localControlPort || DEFAULT_PORT);
    const port = Number.isInteger(requested) && requested > 1024 && requested < 65536 ? requested : DEFAULT_PORT;
    this.server=http.createServer((req,res)=>this.handle(req,res).catch(error=>{
      this.lastError=String(error?.message||error);
      this.logger?.error?.(`local control request failed: ${this.lastError}`);
      if(!res.headersSent) sendJson(res,500,{ok:false,protocol:PROTOCOL,error:this.lastError},safeOrigin(req.headers.origin));
      else try{res.end();}catch{}
    }));
    await new Promise((resolve,reject)=>{
      const onError=error=>{this.server?.removeListener('listening',onListening);reject(error)};
      const onListening=()=>{this.server?.removeListener('error',onError);resolve()};
      this.server.once('error',onError);
      this.server.once('listening',onListening);
      this.server.listen(port,'127.0.0.1');
    });
    this.port=port;
    this.startedAt=new Date().toISOString();
    this.lastError='';
    this.logger?.info?.(`Local Vision Control ready on 127.0.0.1:${port}`);
    this.onStateChanged?.();
    return this.publicState();
  }

  async stop(){
    const server=this.server;
    this.server=null;
    if(server) await new Promise(resolve=>server.close(()=>resolve()));
    this.onStateChanged?.();
  }

  originFor(req){
    const explicit=safeOrigin(req.headers.origin);
    if(explicit) return explicit;
    if(String(req.headers.origin||'').trim()) return '';
    const extensionId=String(req.headers[EXTENSION_ID_HEADER]||'').trim();
    return /^[a-p]{32}$/i.test(extensionId) ? `chrome-extension://${extensionId}` : '';
  }
  clientAllowed(req){ return String(req.headers[CLIENT_HEADER] || '') === 'NEXA-VISION-RELAY/1'; }

  cors(req,res,origin){
    if(!origin) return false;
    res.statusCode=204;
    res.setHeader('Access-Control-Allow-Origin',origin);
    res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type, X-Nexa-Control-Client, X-Nexa-Extension-Id');
    res.setHeader('Access-Control-Max-Age','600');
    res.setHeader('Vary','Origin');
    res.end();
    return true;
  }

  auth(req,origin){
    const pairedOrigin=String(this.config?.data?.localControlOrigin || '');
    const expected=String(this.config?.data?.localControlTokenHash || '');
    if(!origin || !expected || origin !== pairedOrigin) return false;
    const auth=String(req.headers[TOKEN_HEADER] || '');
    const match=/^Bearer\s+(.+)$/i.exec(auth);
    if(!match) return false;
    const actual=sha256(match[1]);
    try{
      return crypto.timingSafeEqual(Buffer.from(actual,'hex'),Buffer.from(expected,'hex'));
    }catch{return false;}
  }

  prune(){
    const now=Date.now();
    for(const [id,at] of this.recent) if(now-at>10*60*1000) this.recent.delete(id);
  }

  async pair(req,res,origin){
    if(!origin || !this.clientAllowed(req)) return sendJson(res,403,{ok:false,protocol:PROTOCOL,error:'extension_origin_required'},origin);
    if(this.pairBusy) return sendJson(res,409,{ok:false,protocol:PROTOCOL,error:'pairing_in_progress'},origin);
    this.pairBusy=true;
    try{
      const body=await readJson(req);
      const client=String(body.client || 'Nexa Vision Relay').slice(0,120);
      const approved=await this.approvePair?.({origin,client,version:String(body.version||'')});
      if(!approved) return sendJson(res,403,{ok:false,protocol:PROTOCOL,error:'pairing_denied'},origin);
      const token=crypto.randomBytes(32).toString('base64url');
      this.config.data.localControlTokenHash=sha256(token);
      this.config.data.localControlOrigin=origin;
      this.config.data.localControlPaired=true;
      await this.config.save();
      this.logger?.info?.(`Local Vision Control paired with ${origin}`);
      this.onStateChanged?.();
      return sendJson(res,200,{ok:true,protocol:PROTOCOL,token,port:this.port,paired:true},origin);
    }finally{ this.pairBusy=false; }
  }

  async status(req,res,origin){
    const authenticated=this.auth(req,origin);
    const session=this.session?.publicState?.() || {};
    return sendJson(res,200,{
      ok:true,protocol:PROTOCOL,version:1,
      app:'NexaShareControl',
      helper_ready:!!this.helper?.proc,
      session_active:!!session.active,
      remote_input_enabled:!!session.remoteInputEnabled,
      paired:!!this.config?.data?.localControlTokenHash,
      authenticated,
      port:this.port
    },origin);
  }

  async execute(body){
    const id=String(body.command_id || body.id || '').trim();
    if(!id) throw new Error('missing_command_id');
    this.prune();
    if(this.recent.has(id)) return {ok:false,command_id:id,error:'duplicate_command'};
    this.recent.set(id,Date.now());

    const action=String(body.action || body.type || '').trim().toLowerCase();
    const payload=body.payload && typeof body.payload==='object' ? {...body.payload} : {};
    const sessionState=this.session?.publicState?.() || {};

    if(action==='status') return {ok:true,command_id:id,result:{session:sessionState,local_control:this.publicState()}};
    if(action==='session.stop'){
      const result=await this.session.stop('vision_relay');
      return {ok:true,command_id:id,result};
    }
    if(action==='emergency.stop'){
      const result=await this.session.emergencyStop();
      return {ok:true,command_id:id,result:{...result,emergency:true}};
    }

    if(!sessionState.active || !sessionState.remoteInputEnabled) return {ok:false,command_id:id,error:'desktop_control_not_active'};
    if(!this.helper?.proc) return {ok:false,command_id:id,error:'native_helper_unavailable'};

    const windowId=Number(payload.window_id || 0);
    const activate=payload.activate !== false;
    const inputAction=action.startsWith('mouse.') || action.startsWith('keyboard.');
    if(inputAction && windowId && activate){
      await this.helper.request({cmd:'window.activate',window_id:windowId},3500).catch(()=>{});
      await sleep(50);
    }

    const pointerAt = Number.isFinite(Number(payload.x)) && Number.isFinite(Number(payload.y));
    if(pointerAt && ['mouse.click','mouse.double_click','mouse.down','mouse.up','mouse.wheel'].includes(action)){
      await this.helper.request({cmd:'mouse.move',x:Number(payload.x),y:Number(payload.y),pixels:false,window_id:windowId||undefined,monitor_id:payload.monitor_id||undefined},4000);
      await sleep(35);
    }

    const allowed=new Set([
      'cursor.get','mouse.move','mouse.click','mouse.double_click','mouse.down','mouse.up','mouse.drag','mouse.wheel',
      'keyboard.text','keyboard.key','keyboard.key_down','keyboard.key_up','keyboard.combo',
      'window.list','window.activate','window.get','window.get_active','monitor.list'
    ]);
    if(!allowed.has(action)) return {ok:false,command_id:id,error:'unsupported_control_action'};

    const result=await this.helper.request({cmd:action,...payload},action==='mouse.drag'?10000:6000);
    this.lastCommandAt=new Date().toISOString();
    this.lastCommand=action;
    this.logger?.info?.(`Local Vision Control ${action} command_id=${id}`);
    this.onStateChanged?.();
    return {ok:result?.ok!==false,command_id:id,result,error:result?.ok===false?(result.error||'native_command_failed'):undefined};
  }

  async command(req,res,origin){
    if(!this.clientAllowed(req)) return sendJson(res,403,{ok:false,protocol:PROTOCOL,error:'invalid_client'},origin);
    if(!this.auth(req,origin)) return sendJson(res,401,{ok:false,protocol:PROTOCOL,error:'not_paired_or_invalid_token'},origin);
    const body=await readJson(req);
    const result=await this.execute(body);
    return sendJson(res,result.ok===false?400:200,{protocol:PROTOCOL,...result,executed_at:new Date().toISOString()},origin);
  }

  async handle(req,res){
    const origin=this.originFor(req);
    if(req.method==='OPTIONS'){
      const requested=String(req.headers['access-control-request-headers']||'').toLowerCase();
      if(requested && !requested.includes('x-nexa-control-client')) return sendJson(res,403,{ok:false,protocol:PROTOCOL,error:'invalid_client_preflight'},origin);
      if(!this.cors(req,res,origin)) return sendJson(res,403,{ok:false,protocol:PROTOCOL,error:'extension_origin_required'},origin);
      return;
    }
    const url=new URL(req.url || '/','http://127.0.0.1');
    if(url.pathname==='/v1/status' && req.method==='GET') return this.status(req,res,origin);
    if(url.pathname==='/v1/pair' && req.method==='POST') return this.pair(req,res,origin);
    if(url.pathname==='/v1/command' && req.method==='POST') return this.command(req,res,origin);
    return sendJson(res,404,{ok:false,protocol:PROTOCOL,error:'not_found'},origin);
  }
}

module.exports={LocalControlServer,PROTOCOL,DEFAULT_PORT,sha256,safeOrigin};
