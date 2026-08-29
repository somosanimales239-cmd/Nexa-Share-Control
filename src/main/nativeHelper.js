'use strict';
const path=require('path');
const fs=require('fs');
const crypto=require('crypto');
const {spawn}=require('child_process');

class NativeHelper{
  constructor(logger){
    this.logger=logger;
    this.proc=null;
    this.pending=new Map();
    this.buffer='';
    this.restarts=0;
    this.lastError='';
    this.stopping=false;
  }

  candidates(){
    const list=[];
    if(process.resourcesPath){
      list.push(path.join(process.resourcesPath,'bin','NexaShareControl.Native.exe'));
      list.push(path.join(process.resourcesPath,'app.asar.unpacked','resources','bin','NexaShareControl.Native.exe'));
    }
    list.push(path.join(__dirname,'..','..','resources','bin','NexaShareControl.Native.exe'));
    return [...new Set(list)];
  }

  exe(){return this.candidates().find(file=>fs.existsSync(file))||''}

  async start(){
    this.stopping=false;
    const exe=this.exe();
    if(!exe)throw new Error(`Native helper not found. Checked: ${this.candidates().join(' | ')}`);
    this.proc=spawn(exe,[],{
      stdio:['pipe','pipe','pipe'],windowsHide:true,cwd:path.dirname(exe),
      env:{...process.env,NEXA_SHARE_CONTROL_PARENT_PID:String(process.pid)}
    });
    this.proc.stdout.setEncoding('utf8');
    this.proc.stdout.on('data',data=>this.onData(data));
    this.proc.stderr.on('data',data=>{const text=String(data).trim();if(text)this.logger?.warn?.(`native stderr: ${text}`)});
    this.proc.on('error',error=>{this.lastError=error.message;this.logger?.error?.(`native process error: ${error.message}`)});
    this.proc.on('exit',code=>this.onExit(code));
    const ping=await this.request({cmd:'ping'},7000);
    if(!ping?.ok)throw new Error(ping?.error||'Native helper ping failed');
    this.restarts=0;
    this.logger?.info?.(`Native helper started: ${exe}`);
    return ping;
  }

  onData(data){
    this.buffer+=data;
    while(this.buffer.includes('\n')){
      const index=this.buffer.indexOf('\n');
      const line=this.buffer.slice(0,index).trim();
      this.buffer=this.buffer.slice(index+1);
      if(!line)continue;
      try{
        const message=JSON.parse(line);
        const pending=this.pending.get(message.id);
        if(pending){clearTimeout(pending.timer);this.pending.delete(message.id);pending.resolve(message)}
      }catch(error){this.logger?.warn?.(`native invalid json: ${error.message}`)}
    }
  }

  async onExit(code){
    const wasStopping=this.stopping;
    this.lastError=`Native helper exited with code ${code}`;
    if(!wasStopping)this.logger?.error?.(this.lastError);
    for(const pending of this.pending.values())pending.reject(new Error(wasStopping?'native helper stopping':this.lastError));
    this.pending.clear();
    this.proc=null;
    if(wasStopping)return;
    if(this.restarts<1){
      this.restarts++;
      try{await new Promise(resolve=>setTimeout(resolve,350));await this.start()}
      catch(error){this.lastError=error.message;this.logger?.error?.(`native restart failed: ${error.message}`)}
    }
  }

  request(command,timeout=5000){
    return new Promise((resolve,reject)=>{
      if(this.stopping)return reject(new Error('native helper stopping'));
      if(!this.proc?.stdin?.writable)return reject(new Error(this.lastError||'native helper unavailable'));
      const id=command.id||crypto.randomUUID();
      const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error(`native request timeout: ${command.cmd}`))},timeout);
      this.pending.set(id,{resolve,reject,timer});
      try{this.proc.stdin.write(JSON.stringify({...command,id})+'\n')}
      catch(error){clearTimeout(timer);this.pending.delete(id);reject(error)}
    });
  }

  async healthCheck(){
    try{return{
      ok:true,executable:this.exe(),ping:await this.request({cmd:'ping'}),
      cursor:await this.request({cmd:'cursor.get'}),monitors:await this.request({cmd:'monitor.list'})
    }}catch(error){return{ok:false,executable:this.exe(),error:error.message,candidates:this.candidates()}}
  }

  publicState(){return{
    running:!!this.proc,pid:this.proc?.pid||0,executable:this.exe(),lastError:this.lastError,stopping:this.stopping
  }}

  async stop(){
    this.stopping=true;
    this.restarts=1;
    const proc=this.proc;
    this.proc=null;
    for(const pending of this.pending.values())pending.reject(new Error('native helper stopping'));
    this.pending.clear();
    try{proc?.stdin?.end()}catch{}
    try{proc?.kill()}catch{}
  }
}

module.exports={NativeHelper};
