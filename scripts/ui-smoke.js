const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');

const html=fs.readFileSync(path.join(root,'src/index.html'),'utf8');
const js=fs.readFileSync(path.join(root,'src/app.js'),'utf8');
const capture=fs.readFileSync(path.join(root,'src/renderer/screenCapture.js'),'utf8');

const ids=['globalStatus','startupIssueBanner','sourcePicker','selectedSourceCount','previewGrid','startBtn','stopBtn','serverUrl','fpsSelect','diagBtn','activityLog'];
for(const id of ids)if(!html.includes(`id="${id}"`))throw new Error(`UI_SMOKE missing #${id}`);
if(!js.includes('window.nexaScreen.init'))throw new Error('UI_SMOKE app bootstrap missing');
if(!capture.includes('MultiSourceCapture'))throw new Error('UI_SMOKE multi-source capture missing');

console.log('UI_SMOKE_OK');
