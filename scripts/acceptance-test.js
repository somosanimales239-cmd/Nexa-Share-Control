const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');

const html=fs.readFileSync(path.join(root,'src/index.html'),'utf8');
const capture=fs.readFileSync(path.join(root,'src/renderer/screenCapture.js'),'utf8');
const nativeProgram=fs.readFileSync(path.join(root,'native/NexaShareControl.Native/Program.cs'),'utf8');

const requiredIds=['refreshSourcesBtn','selectScreensBtn','clearSourcesBtn','sourcePicker','selectedSourceCount','previewGrid','startBtn','stopBtn','snapshotBtn'];
for(const id of requiredIds)if(!html.includes(`id="${id}"`))throw new Error(`UI acceptance missing #${id}`);

for(const token of ['chromeMediaSourceId','snapshotAll','groupedWindows','source_bounds','app_process_name']){
  if(!capture.includes(token))throw new Error(`Capture acceptance missing ${token}`);
}

for(const command of ['mouse.move','mouse.click','mouse.drag','mouse.wheel','keyboard.text','window.list','window.activate','monitor.list']){
  if(!nativeProgram.includes(`"${command}"`))throw new Error(`Native command missing ${command}`);
}

console.log('ACCEPTANCE_TEST_OK');
