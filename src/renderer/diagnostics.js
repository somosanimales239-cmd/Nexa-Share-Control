(()=>{
class Diagnostics{
  async init(){
    diagBtn.onclick=async()=>{
      diagOutput.textContent='Running...';
      try{
        const d=await window.nexa.runDiagnostics();
        window.__diag=JSON.stringify(d,null,2);
        diagOutput.textContent=window.__diag;
      }catch(e){diagOutput.textContent=`Diagnostics failed: ${e.message}`}
    };
    copyDiagBtn.onclick=()=>navigator.clipboard.writeText(window.__diag||diagOutput.textContent);
  }
}
window.nexaDiagnostics=new Diagnostics();
})();
