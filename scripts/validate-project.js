'use strict';
const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const required=[
  'package.json','nexa.project.json','main.js','preload.js',
  'src/index.html','src/app.css','src/app.js','src/renderer/screenCapture.js',
  'src/main/nativeHelper.js','src/main/transport.js','src/main/commandRouter.js','src/main/localControlServer.js',
  'native/NexaShareControl.Native/NexaShareControl.Native.csproj',
  'native/NexaShareControl.Native/Program.cs','native/NexaShareControl.Native/NativeInput.cs','native/NexaShareControl.Native/WindowControl.cs',
  'scripts/build-native.js','scripts/ui-smoke.js','scripts/validate-delivery.js','scripts/verify-artifacts.js',
  '.github/workflows/nexa-windows-build.yml'
];
for(const file of required)if(!fs.existsSync(path.join(root,file)))throw new Error(`Missing required project file: ${file}`);
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
const project=JSON.parse(fs.readFileSync(path.join(root,'nexa.project.json'),'utf8'));
if(pkg.version!==project.application_version||pkg.version!==project.version)throw new Error(`Version mismatch package=${pkg.version} project=${project.application_version}/${project.version}`);
const scripts=pkg.scripts||{};
for(const name of ['build:win','build:native','validate','validate:delivery','validate:project','test','ui:smoke'])if(!String(scripts[name]||'').trim())throw new Error(`package.json missing required script: ${name}`);
const buildWin=String(scripts['build:win']);
for(const token of ['build:native','electron-builder','nsis','portable','zip'])if(!buildWin.toLowerCase().includes(token.toLowerCase()))throw new Error(`build:win missing ${token}`);
const build=pkg.build||{};
if(build.appId!=='com.nexa.sharecontrol')throw new Error('Unexpected appId; NexaShareControl must remain isolated');
if(build.productName!=='NexaShareControl'||build.executableName!=='NexaShareControl')throw new Error('Product/executable name mismatch');
const extra=Array.isArray(build.extraResources)?build.extraResources:[];
if(!extra.some(x=>x.from==='resources/bin'&&x.to==='bin'))throw new Error('Native Helper extraResources mapping is missing');
const workflow=fs.readFileSync(path.join(root,'.github/workflows/nexa-windows-build.yml'),'utf8');
for(const token of [
  'NEXA_NODE_RUNTIME_RESOLUTION_V1','NEXA_APPLICATION_VERSION_METADATA_V1','NEXA_DEPENDENCY_LOCK_PORTABILITY_V1',
  'NEXA_VALIDATION_MATRIX_V2','NEXA_WINDOWS_ARTIFACT_DELIVERY_V3','Configure .NET 8 for NexaShareControl Native Helper',
  'Verify NexaShareControl Native Helper packaging','Test packaged NexaShareControl startup and Native Helper',
  'Test Installer, Apps and Features, and uninstaller'
])if(!workflow.includes(token))throw new Error(`Workflow contract missing: ${token}`);
const main=fs.readFileSync(path.join(root,'main.js'),'utf8');
for(const token of ["types:['screen','window']",'screen:set-selection','screen:resolve-sources','window-region','NEXA_STARTUP_SMOKE_FILE','helperAvailable','rendererReady','LocalControlServer','localControlState'])if(!main.includes(token))throw new Error(`main.js contract missing: ${token}`);
const capture=fs.readFileSync(path.join(root,'src/renderer/screenCapture.js'),'utf8');
for(const token of ['MultiSourceCapture','maxSources=16','this.active=new Map()','snapshotBusy','source_count','share_set_id','ASSIGN APP','captureSourceId','refreshActiveSources'])if(!capture.includes(token))throw new Error(`Multi-source capture contract missing: ${token}`);
console.log('PROJECT_VALIDATION_OK');
