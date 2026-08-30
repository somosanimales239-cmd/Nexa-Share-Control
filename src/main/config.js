const fs=require('fs'),path=require('path'),os=require('os');
class ConfigStore{
  constructor(userData){
    this.file=path.join(userData,'config.json');
    this.data={
      serverUrl:'',wssUrl:'',transport:'AUTO',deviceName:os.hostname(),
      captureFps:5,captureResolution:'1280',jpegQuality:65,
      allowTrustedController:false,idleTimeoutMinutes:15,showCursor:true,
      sendActiveWindowTitle:true,paired:false,deviceId:'',
      encryptedDeviceSecret:'',encryptedDeviceToken:'',
      localControlPort:47653,localControlPaired:false,localControlOrigin:'',localControlTokenHash:''
    };
  }
  async load(){try{this.data={...this.data,...JSON.parse(fs.readFileSync(this.file,'utf8'))}}catch{}}
  update(v){for(const k of Object.keys(this.data))if(Object.prototype.hasOwnProperty.call(v,k))this.data[k]=v[k]}
  async save(){fs.mkdirSync(path.dirname(this.file),{recursive:true});fs.writeFileSync(this.file,JSON.stringify(this.data,null,2),'utf8')}
  publicConfig(){const{encryptedDeviceSecret,encryptedDeviceToken,localControlTokenHash,...x}=this.data;return x}
}
module.exports={ConfigStore};
