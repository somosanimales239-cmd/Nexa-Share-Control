'use strict';
const fs=require('fs');
const path=require('path');
const {spawnSync}=require('child_process');
const root=path.resolve(__dirname,'..');
const project=path.join(root,'native','NexaShareControl.Native','NexaShareControl.Native.csproj');
const output=path.join(root,'native','NexaShareControl.Native','bin','publish');
const resources=path.join(root,'resources','bin');
const run=(cmd,args,opts={})=>spawnSync(cmd,args,{encoding:'utf8',shell:process.platform==='win32',...opts});
const probe=run('dotnet',['--version']);
if(probe.status!==0){
  console.error('NATIVE_BUILD_FAILED: .NET 8 SDK is required to build NexaShareControl.Native.exe');
  console.error(probe.stderr||probe.error?.message||'dotnet not found');
  process.exit(1);
}
const version=String(probe.stdout||'').trim();
const major=Number(version.split('.')[0]||0);
if(major<8)throw new Error(`.NET 8+ SDK required; found ${version}`);
console.log(`DOTNET=${version}`);
fs.rmSync(output,{recursive:true,force:true});
fs.rmSync(resources,{recursive:true,force:true});
fs.mkdirSync(output,{recursive:true});
fs.mkdirSync(resources,{recursive:true});
const result=spawnSync('dotnet',[
  'publish',project,'-c','Release','-r','win-x64','--self-contained','true',
  '-p:PublishSingleFile=true','-p:DebugType=None','-p:DebugSymbols=false','-o',output
],{stdio:'inherit',shell:process.platform==='win32'});
if(result.status!==0)process.exit(result.status||1);
const source=path.join(output,'NexaShareControl.Native.exe');
const target=path.join(resources,'NexaShareControl.Native.exe');
if(!fs.existsSync(source))throw new Error(`Native helper was not produced: ${source}`);
fs.copyFileSync(source,target);
const stat=fs.statSync(target);
if(stat.size<500000)throw new Error(`Native helper output is unexpectedly small: ${stat.size} bytes`);
const fd=fs.openSync(target,'r');
const sig=Buffer.alloc(2);fs.readSync(fd,sig,0,2,0);fs.closeSync(fd);
if(sig[0]!==0x4d||sig[1]!==0x5a)throw new Error('Native helper is not a Windows PE executable');
console.log(`NATIVE_BUILD_OK=${target}`);
console.log(`NATIVE_BUILD_BYTES=${stat.size}`);
