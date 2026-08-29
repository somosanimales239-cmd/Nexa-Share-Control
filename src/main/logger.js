const fs=require('fs'),path=require('path');
class AppLogger{
  constructor(userData){this.logDir=path.join(userData,'logs');fs.mkdirSync(this.logDir,{recursive:true});this.file=path.join(this.logDir,'NexaShareControl.log')}
  write(level,message){fs.appendFileSync(this.file,`${new Date().toISOString()} [${level}] ${String(message).replace(/[\r\n]+/g,' ')}\n`)}
  info(m){this.write('INFO',m)} warn(m){this.write('WARN',m)} error(m){this.write('ERROR',m)}
}
module.exports={AppLogger};
