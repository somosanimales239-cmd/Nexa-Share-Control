'use strict';
const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const release=path.join(root,'release');
const version=require(path.join(root,'package.json')).version;
function assertPe(file,label,min=1000000){
  if(!fs.existsSync(file))throw new Error(`${label} missing: ${file}`);
  const stat=fs.statSync(file);if(stat.size<min)throw new Error(`${label} too small: ${stat.size}`);
  const fd=fs.openSync(file,'r'),sig=Buffer.alloc(2);fs.readSync(fd,sig,0,2,0);fs.closeSync(fd);
  if(sig[0]!==0x4d||sig[1]!==0x5a)throw new Error(`${label} is not a Windows PE executable`);
}
const app=path.join(release,'win-unpacked','NexaShareControl.exe');
const helper=path.join(release,'win-unpacked','resources','bin','NexaShareControl.Native.exe');
const asar=path.join(release,'win-unpacked','resources','app.asar');
assertPe(app,'Packaged application',10000000);
assertPe(helper,'Packaged Native Helper',500000);
if(!fs.existsSync(asar)||fs.statSync(asar).size<1000)throw new Error('Packaged app.asar is missing or empty');
const expected=[
  [`NexaShareControl-Setup-${version}-x64.exe`,'Installer'],
  [`NexaShareControl-Portable-${version}-x64.exe`,'Portable']
];
for(const [name,label] of expected)assertPe(path.join(release,name),label,1000000);
const zip=path.join(release,`NexaShareControl-${version}-x64.zip`);
if(!fs.existsSync(zip)||fs.statSync(zip).size<1000000)throw new Error('Windows ZIP missing or too small');
console.log('WINDOWS_ARTIFACTS_OK');
