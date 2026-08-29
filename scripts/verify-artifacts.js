const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const release = path.join(root, 'release');
if (!fs.existsSync(release)) throw new Error('release directory is missing');
function walk(dir){
  return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{
    const p=path.join(dir,e.name); return e.isDirectory()?walk(p):[p];
  });
}
const files=walk(release);
const installer=files.find(p=>/NexaShareControl-Setup-1\.0\.0-x64\.exe$/i.test(p));
const portable=files.find(p=>/NexaShareControl-Portable-1\.0\.0-x64\.exe$/i.test(p));
const asar=files.find(p=>/[\\/]win-unpacked[\\/]resources[\\/]app\.asar$/i.test(p));
if(!installer) throw new Error('Installer EXE not found');
if(!portable) throw new Error('Portable EXE not found');
if(!asar) throw new Error('win-unpacked/resources/app.asar not found');
console.log('ARTIFACT_VERIFICATION_OK');
