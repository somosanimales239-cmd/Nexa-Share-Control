'use strict';
const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const pkg=JSON.parse(read('package.json'));
const project=JSON.parse(read('nexa.project.json'));
const main=read('main.js'),capture=read('src/renderer/screenCapture.js'),html=read('src/index.html');
const helper=read('src/main/nativeHelper.js'),native=read('native/NexaShareControl.Native/NativeInput.cs');
const workflow=read('.github/workflows/nexa-windows-build.yml');
const checks=[
  [pkg.version===project.application_version,'package/project version alignment'],
  [String(pkg.scripts['build:win']).includes('build:native'),'native helper builds before Electron'],
  [main.includes("types:['screen','window']"),'screen + window desktopCapturer discovery'],
  [main.includes('screen:set-selection'),'main-process share selection state'],
  [capture.includes('maxSources=16'),'bounded multi-source selection'],
  [capture.includes('snapshotBusy'),'capture overlap protection'],
  [capture.includes('this.active=new Map()'),'simultaneous source streams'],
  [capture.includes('source_count')&&capture.includes('share_set_id'),'multi-source frame identity'],
  [html.includes('sourceSearch')&&html.includes('selectAllSourcesBtn'),'source search/select-all UI'],
  [helper.includes('this.stopping'),'native helper shutdown/restart guard'],
  [native.includes('window_id')&&native.includes('ResolveTarget'),'window-targeted pointer coordinates'],
  [workflow.includes('NEXA_WINDOWS_ARTIFACT_DELIVERY_V3'),'Builder Windows Delivery V3 preserved'],
  [workflow.includes('helperAvailable'),'workflow requires Native Helper startup'],
  [workflow.includes('NEXA_PACKAGED_STARTUP_REPORT'),'packaged startup evidence published']
];
const failed=checks.filter(([ok])=>!ok).map(([,name])=>name);
if(failed.length)throw new Error('Implementation checks failed: '+failed.join(', '));
console.log('IMPLEMENTATION_TEST_OK');
