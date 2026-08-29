(()=>{
class Settings{
  async init(c={}){
    serverUrl.value=c.serverUrl||'';
    fpsSelect.value=String(c.captureFps||5);
    resolutionSelect.value=String(c.captureResolution||1280);
    qualityRange.value=String(c.jpegQuality||65);
    qualityValue.textContent=qualityRange.value;
    transportSelect.value=c.transport||'AUTO';
    qualityRange.oninput=e=>qualityValue.textContent=e.target.value;
    saveSettingsBtn.onclick=()=>window.nexa.saveSettings({
      serverUrl:serverUrl.value.trim(),
      captureFps:Number(fpsSelect.value),
      captureResolution:resolutionSelect.value,
      jpegQuality:Number(qualityRange.value),
      transport:transportSelect.value
    });
  }
}
window.nexaSettings=new Settings();
})();
