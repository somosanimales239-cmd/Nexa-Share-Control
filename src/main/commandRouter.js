class CommandRouter{
  constructor(helper,session,transport,logger,forceFrame){this.helper=helper;this.session=session;this.transport=transport;this.logger=logger;this.forceFrame=forceFrame;this.recent=new Map()}
  dup(id){const now=Date.now();for(const[k,v]of this.recent)if(now-v>600000)this.recent.delete(k);if(this.recent.has(id))return true;this.recent.set(id,now);return false}
  async handle(c){
    if(!c?.command_id)return this.ack(c,false,null,'missing_command_id');
    if(this.dup(c.command_id))return this.ack(c,false,null,'duplicate_command');
    if(!this.session.isActive())return this.ack(c,false,null,'session_inactive');
    if(c.session_id!==this.session.sessionId())return this.ack(c,false,null,'session_mismatch');
    const age=Math.abs(Date.now()-Date.parse(c.timestamp||''));
    if(!Number.isFinite(age)||age>120000)return this.ack(c,false,null,'expired_command');
    try{
      if(c.type==='ping')return this.ack(c,true,{pong:true});
      if(c.type==='session.status')return this.ack(c,true,this.session.publicState());
      if(c.type==='session.stop'){await this.session.stop('remote');return this.ack(c,true,{stopped:true})}
      if(c.type==='screen.snapshot'){this.forceFrame();return this.ack(c,true,{requested:true})}
      const native=new Set(['mouse.move','mouse.click','mouse.double_click','mouse.down','mouse.up','mouse.drag','mouse.wheel','keyboard.text','keyboard.key','keyboard.key_down','keyboard.key_up','keyboard.combo','window.list','window.activate','window.get','window.get_active','monitor.list']);
      if(native.has(c.type)){
        const r=await this.helper.request({cmd:c.type,...(c.payload||{})},c.type==='mouse.drag'?10000:5000);
        this.logger.info(`${c.type} executed${c.type==='keyboard.text'?` length=${String(c.payload?.text||'').length}`:''}`);
        if(!c.type.startsWith('window.list'))this.forceFrame();
        return this.ack(c,true,r);
      }
      return this.ack(c,false,null,'unsupported_command');
    }catch(e){this.logger.error(`${c.type} failed ${e.message}`);return this.ack(c,false,null,e.message)}
  }
  ack(c,ok,result=null,error=null){const p={command_id:c?.command_id||'',ok,result,error,executed_at:new Date().toISOString()};this.transport.ackCommand(p).catch(()=>{});return p}
}
module.exports={CommandRouter};
