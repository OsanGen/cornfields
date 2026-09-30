import test from 'node:test';
import assert from 'node:assert/strict';
import {resolvePublicFile} from '../scripts/server-path.mjs';
import {optionalAsset,stripRootTravel} from '../src/asset-safety.js';
import {createStepper} from '../src/runtime-loop.js';

test('server rejects encoded traversal, hidden files and excluded artifacts',async()=>{
  for(const request of ['/README.md','/src/%2e%2e%2fREADME.md','/src/../README.md','/src/%252e%252e%252fREADME.md','/src/.private','/output/browser/report.json']){
    await assert.rejects(resolvePublicFile(process.cwd(),request));
  }
  assert.ok((await resolvePublicFile(process.cwd(),'/src/game.js?play=1')).endsWith('/src/game.js'));
  assert.ok((await resolvePublicFile(process.cwd(),'/')).endsWith('/index.html'));
  assert.ok((await resolvePublicFile(process.cwd(),'/node_modules/three/build/three.module.js')).endsWith('/three.module.js'));
});
test('optional stalled load times out and disposes a late result once',async()=>{
  let finish,disposed=0;const late=new Promise(resolve=>{finish=resolve;});
  await assert.rejects(optionalAsset(late,5,()=>{disposed++;}),/timed out/);
  finish({});await new Promise(resolve=>setImmediate(resolve));assert.equal(disposed,1);
});
test('root-motion cleanup preserves child position tracks and vertical motion',()=>{
  const root={name:'Bip01.position',values:[1,2,3,4,5,6]},child={name:'Bip01Pelvis.position',values:[4,5,6,7,8,9]};
  stripRootTravel({tracks:[root,child]},['Bip01']);
  assert.deepEqual(root.values,[1,2,3,1,5,3]);assert.deepEqual(child.values,[4,5,6,7,8,9]);
});
test('low FPS catch-up preserves one second; tab stalls remain bounded',()=>{
  let elapsed=0;const clock=createStepper(dt=>{elapsed+=dt;});
  for(let i=0;i<10;i++)clock.frame(.1,()=>({}));
  assert.ok(Math.abs(elapsed-1)<1e-8);
  clock.frame(2,()=>({}));assert.ok(Math.abs(elapsed-1.25)<1e-8);assert.equal(clock.droppedSeconds,1.75);
});
test('real frames and explicit stepping use the same tick and continuous audio path',()=>{
  let ticks=0,audioTicks=0;const clock=createStepper(()=>{ticks++;audioTicks++;});
  clock.frame(.1,()=>({}));clock.advance(.1,()=>({}));
  assert.equal(ticks,12);assert.equal(audioTicks,12);
});
