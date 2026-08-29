const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const required = [
  'package.json','main.js','preload.js','src/index.html','src/app.js',
  'src/main/nativeHelper.js','src/main/transport.js','src/main/commandRouter.js',
  'native/NexaShareControl.Native/NexaShareControl.Native.csproj',
  'native/NexaShareControl.Native/Program.cs','.github/workflows/nexa-windows-build.yml'
];
let bad = 0;
for (const rel of required) {
  if (!fs.existsSync(path.join(root, rel))) { console.error('MISSING', rel); bad++; }
}
const pkg = JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
if (pkg.build?.executableName !== 'NexaShareControl') { console.error('Bad executableName'); bad++; }
if (!pkg.scripts?.['build:win']) { console.error('Missing build:win'); bad++; }
if (!pkg.scripts?.['validate:delivery']) { console.error('Missing validate:delivery'); bad++; }
if (!pkg.scripts?.['validate:project']) { console.error('Missing validate:project'); bad++; }
if (!pkg.scripts?.['ui:smoke']) { console.error('Missing ui:smoke'); bad++; }
if (process.argv.includes('--delivery')) {
  const nativeProject = path.join(root,'native','NexaShareControl.Native','NexaShareControl.Native.csproj');
  if (!fs.existsSync(nativeProject)) { console.error('Native helper source project missing'); bad++; }
}
if (bad) process.exit(1);
console.log('PROJECT_VALIDATION_OK');
