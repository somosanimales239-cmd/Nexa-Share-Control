const crypto=require('crypto');const{safeStorage}=require('electron');
class SecurityManager{
  constructor(config,logger){this.config=config;this.logger=logger}
  async initialize(){
    if(!this.config.data.deviceId){
      this.config.data.deviceId=crypto.randomUUID();
      this.config.data.encryptedDeviceSecret=this.encrypt(crypto.randomBytes(32).toString('base64url'));
      await this.config.save();
    }
  }
  encrypt(text){return safeStorage.isEncryptionAvailable()?safeStorage.encryptString(text).toString('base64'):Buffer.from(text).toString('base64')}
  decrypt(value){if(!value)return'';try{const b=Buffer.from(value,'base64');return safeStorage.isEncryptionAvailable()?safeStorage.decryptString(b):b.toString()}catch{return''}}
  deviceId(){return this.config.data.deviceId}
  deviceSecret(){return this.decrypt(this.config.data.encryptedDeviceSecret)}
  deviceToken(){return this.decrypt(this.config.data.encryptedDeviceToken)}
  async storeDeviceToken(token){this.config.data.encryptedDeviceToken=this.encrypt(token);this.config.data.paired=!!token;await this.config.save()}
}
module.exports={SecurityManager};
