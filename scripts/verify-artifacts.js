const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const release=path.join(root,'release');
const version=require(path.join(root,'package.json')).version;

const helper=path.join(release,'win-unpacked','resources','bin','NexaShareControl.Native.exe');
if(!fs.existsSync(helper))throw new Error(`Packaged Native Helper missing: ${helper}`);
if(fs.statSync(helper).size<500000)throw new Error('Packaged Native Helper is unexpectedly small');

const expected=[
  `NexaShareControl-Setup-${version}-x64.exe`,
  `NexaShareControl-Portable-${version}-x64.exe`,
  `NexaShareControl-${version}-x64.zip`
];
for(const name of expected){
  const file=path.join(release,name);
  if(!fs.existsSync(file))throw new Error(`Missing Windows artifact: ${name}`);
  if(fs.statSync(file).size<1000000)throw new Error(`Artifact too small: ${name}`);
}
console.log('WINDOWS_ARTIFACTS_OK');
