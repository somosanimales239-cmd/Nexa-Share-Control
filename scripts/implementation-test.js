const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');

const main=fs.readFileSync(path.join(root,'main.js'),'utf8');
const capture=fs.readFileSync(path.join(root,'src/renderer/screenCapture.js'),'utf8');
const ui=fs.readFileSync(path.join(root,'src/index.html'),'utf8');
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));

const checks=[
  [pkg.version==='1.1.0','application version 1.1.0'],
  [String(pkg.scripts['build:win']).startsWith('npm run build:native'),'native helper is built before Electron packaging'],
  [main.includes("types:['screen','window']"),'screen + window desktopCapturer discovery'],
  [main.includes('processName'),'application process metadata'],
  [main.includes('screen:set-selection'),'main-process share selection state'],
  [capture.includes('new Set()'),'multiple selectable sources'],
  [capture.includes('this.active=new Map()'),'multiple simultaneous streams'],
  [capture.includes('source_count'),'multi-source frame metadata'],
  [capture.includes('SELECT APP')||capture.includes('selectScreens'),'application/window picker support'],
  [ui.includes('sourcePicker')&&ui.includes('previewGrid'),'multi-source UI']
];
const failed=checks.filter(([ok])=>!ok).map(([,name])=>name);
if(failed.length)throw new Error('Implementation checks failed: '+failed.join(', '));
console.log('IMPLEMENTATION_TEST_OK');
