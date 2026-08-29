'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const pkg=require(path.join(root,'package.json'));
test('NexaShareControl delivery identity is stable',()=>{
  assert.equal(pkg.build.appId,'com.nexa.sharecontrol');
  assert.equal(pkg.build.productName,'NexaShareControl');
  assert.match(pkg.version,/^\d+\.\d+\.\d+$/);
});
test('Native Helper is built into Windows delivery',()=>{
  assert.match(pkg.scripts['build:win'],/build:native/);
  assert.ok(pkg.build.extraResources.some(x=>x.from==='resources/bin'&&x.to==='bin'));
});
test('multi-source sharing files exist',()=>{
  const capture=fs.readFileSync(path.join(root,'src/renderer/screenCapture.js'),'utf8');
  assert.match(capture,/MultiSourceCapture/);
  assert.match(capture,/source_count/);
  assert.match(capture,/share_set_id/);
});
