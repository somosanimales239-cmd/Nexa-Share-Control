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
test('universal open-window inventory has direct and visible-region capture paths',()=>{
  const main=fs.readFileSync(path.join(root,'main.js'),'utf8');
  const capture=fs.readFileSync(path.join(root,'src/renderer/screenCapture.js'),'utf8');
  assert.match(main,/native Windows enumerator is the source of truth/i);
  assert.match(main,/window-region/);
  assert.match(main,/screen:resolve-sources/);
  assert.match(capture,/captureSourceId/);
  assert.match(capture,/ASSIGN APP/);
});

const {safeOrigin,sha256}=require(path.join(root,'src/main/localControlServer.js'));
test('local Vision Control accepts only extension origins',()=>{
  assert.equal(safeOrigin('chrome-extension://abcdefghijklmnopqrstuvwxzyabcdef'),'');
  assert.equal(safeOrigin('https://chatgpt.com'),'');
  assert.equal(safeOrigin('chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
});
test('local Vision Control token hashing is deterministic and non-plaintext',()=>{
  assert.equal(sha256('abc'),sha256('abc'));
  assert.notEqual(sha256('abc'),'abc');
  assert.equal(sha256('abc').length,64);
});
