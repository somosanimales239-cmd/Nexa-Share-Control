const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');

test('project is NexaShareControl 1.1.0',()=>{
  const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
  assert.equal(pkg.name,'nexa-share-control');
  assert.equal(pkg.version,'1.1.0');
  assert.match(pkg.scripts['build:win'],/build:native/);
});

test('multi-source sharing exists',()=>{
  const main=fs.readFileSync(path.join(root,'main.js'),'utf8');
  const capture=fs.readFileSync(path.join(root,'src/renderer/screenCapture.js'),'utf8');
  assert.match(main,/screen','window/);
  assert.match(capture,/source_count/);
  assert.match(capture,/groupedWindows/);
});
