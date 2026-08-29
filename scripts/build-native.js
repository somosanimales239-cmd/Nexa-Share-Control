const fs=require('fs');
const path=require('path');
const {spawnSync}=require('child_process');

const root=path.resolve(__dirname,'..');
const project=path.join(root,'native','NexaShareControl.Native','NexaShareControl.Native.csproj');
const output=path.join(root,'native','NexaShareControl.Native','bin','publish');
const resources=path.join(root,'resources','bin');

const probe=spawnSync('dotnet',['--version'],{encoding:'utf8',shell:process.platform==='win32'});
if(probe.status!==0){
  console.error('NATIVE_BUILD_FAILED: .NET 8 SDK is required to build NexaShareControl.Native.exe');
  console.error(probe.stderr||probe.error?.message||'dotnet not found');
  process.exit(1);
}
console.log(`DOTNET=${String(probe.stdout).trim()}`);

fs.rmSync(output,{recursive:true,force:true});
fs.mkdirSync(output,{recursive:true});
fs.mkdirSync(resources,{recursive:true});

const result=spawnSync('dotnet',[
  'publish',project,'-c','Release','-r','win-x64',
  '--self-contained','true','-p:PublishSingleFile=true','-o',output
],{stdio:'inherit',shell:process.platform==='win32'});

if(result.status!==0)process.exit(result.status||1);

const source=path.join(output,'NexaShareControl.Native.exe');
const target=path.join(resources,'NexaShareControl.Native.exe');
if(!fs.existsSync(source))throw new Error(`Native helper was not produced: ${source}`);

fs.copyFileSync(source,target);
const size=fs.statSync(target).size;
if(size<500000)throw new Error(`Native helper output is unexpectedly small: ${size} bytes`);

console.log(`NATIVE_BUILD_OK=${target}`);
console.log(`NATIVE_BUILD_BYTES=${size}`);
