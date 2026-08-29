const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const delivery=process.argv.includes('--delivery');
const required=[
  'package.json','nexa.project.json','main.js','preload.js',
  'src/index.html','src/app.css','src/app.js','src/renderer/screenCapture.js',
  'src/main/nativeHelper.js','src/main/transport.js',
  'native/NexaShareControl.Native/NexaShareControl.Native.csproj',
  'native/NexaShareControl.Native/Program.cs',
  'scripts/build-native.js','scripts/ui-smoke.js',
  '.github/workflows/nexa-windows-build.yml'
];
for(const file of required){
  if(!fs.existsSync(path.join(root,file)))throw new Error(`Missing required project file: ${file}`);
}

const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
const project=JSON.parse(fs.readFileSync(path.join(root,'nexa.project.json'),'utf8'));
if(pkg.version!==project.application_version)throw new Error(`Version mismatch package=${pkg.version} project=${project.application_version}`);

const scripts=pkg.scripts||{};
for(const name of ['build:win','validate','validate:delivery','validate:project','test','ui:smoke']){
  if(!scripts[name])throw new Error(`package.json missing required script: ${name}`);
}
if(!String(scripts['build:win']).includes('build:native'))throw new Error('build:win must compile the Native Helper before packaging');

const main=fs.readFileSync(path.join(root,'main.js'),'utf8');
const capture=fs.readFileSync(path.join(root,'src/renderer/screenCapture.js'),'utf8');
if(!main.includes("types:['screen','window']"))throw new Error('main.js must discover screen and window sources');
if(!capture.includes('source_count')||!capture.includes('selectedSources'))throw new Error('multi-source capture implementation is missing');

const workflow=fs.readFileSync(path.join(root,'.github/workflows/nexa-windows-build.yml'),'utf8');
for(const token of ['Resolve application version','Build installer and portable app','NEXA_APPLICATION_VERSION_METADATA_V1','NEXA_WINDOWS_ARTIFACT_DELIVERY_V3']){
  if(!workflow.includes(token))throw new Error(`Workflow marker/step missing: ${token}`);
}

if(delivery){
  for(const banned of ['node_modules','release']){
    if(fs.existsSync(path.join(root,banned)))throw new Error(`Manual Delivery ZIP must not contain ${banned}`);
  }
}

console.log(delivery?'DELIVERY_VALIDATION_OK':'PROJECT_VALIDATION_OK');
