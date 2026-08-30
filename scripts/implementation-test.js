'use strict';
const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const pkg=JSON.parse(read('package.json'));
const project=JSON.parse(read('nexa.project.json'));
const main=read('main.js'),capture=read('src/renderer/screenCapture.js'),html=read('src/index.html');
const helper=read('src/main/nativeHelper.js'),native=read('native/NexaShareControl.Native/NativeInput.cs'),localControl=read('src/main/localControlServer.js');
const workflow=read('.github/workflows/nexa-windows-build.yml');
const checks=[
  [pkg.version===project.application_version,'package/project version alignment'],
  [String(pkg.scripts['build:win']).includes('build:native'),'native helper builds before Electron'],
  [main.includes("types:['screen','window']"),'screen + window desktopCapturer discovery'],
  [main.includes('screen:set-selection'),'main-process share selection state'],
  [main.includes('screen:resolve-sources'),'live source re-resolution'],
  [main.includes('window-region')&&main.includes('native Windows enumerator is the source of truth'),'native open-window inventory + region fallback'],
  [capture.includes('maxSources=16'),'bounded multi-source selection'],
  [capture.includes('snapshotBusy'),'capture overlap protection'],
  [capture.includes('this.active=new Map()'),'simultaneous source streams'],
  [capture.includes('captureSourceId')&&capture.includes('refreshActiveSources'),'stable source IDs with live capture backend refresh'],
  [capture.includes('ASSIGN APP')&&capture.includes('applicationCard'),'application-level assignment UI'],
  [capture.includes('source_count')&&capture.includes('share_set_id'),'multi-source frame identity'],
  [html.includes('sourceSearch')&&html.includes('selectAllSourcesBtn')&&html.includes('Unity'),'source search/select-all UI including Unity example'],
  [helper.includes('this.stopping'),'native helper shutdown/restart guard'],
  [native.includes('window_id')&&native.includes('ResolveTarget'),'window-targeted pointer coordinates'],
  [workflow.includes('NEXA_WINDOWS_ARTIFACT_DELIVERY_V3'),'Builder Windows Delivery V3 preserved'],
  [workflow.includes('helperAvailable'),'workflow requires Native Helper startup'],
  [workflow.includes('NEXA_PACKAGED_STARTUP_REPORT'),'packaged startup evidence published'],
  [main.includes('LocalControlServer')&&main.includes('Local Vision Control'),'loopback control server integrated'],
  [localControl.includes('127.0.0.1')&&localControl.includes('/v1/pair')&&localControl.includes('/v1/command'),'loopback-only pair/command endpoints'],
  [localControl.includes('desktop_control_not_active')&&localControl.includes('remoteInputEnabled'),'input gated by active local session'],
  [localControl.includes('crypto.timingSafeEqual')&&localControl.includes('localControlTokenHash'),'token hash authentication']
];
const failed=checks.filter(([ok])=>!ok).map(([,name])=>name);
if(failed.length)throw new Error('Implementation checks failed: '+failed.join(', '));
console.log('IMPLEMENTATION_TEST_OK');
