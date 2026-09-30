import test from 'node:test';
import assert from 'node:assert/strict';
import {strugglePose,nightmareState,normalizeAlias,corruptionFrame} from '../src/horror-presentation.js';
const game=()=>({mode:'playing',elapsed:1,interaction:{id:1,phase:'qte',phaseStartedAt:.3,readyAt:.3,presses:0,targetPresses:8},player:{},threat:{}});
test('each accepted press advances the straight base pose; tremor is bounded and reduced',()=>{
  const g=game();let previous=-1;
  for(let p=0;p<8;p++){g.interaction.presses=p;const pose=strugglePose(g.interaction,1);assert.ok(pose.progress>previous);assert.ok(Math.abs(pose.tremorX)<.003);previous=pose.progress;}
  assert.ok(Math.abs(strugglePose(g.interaction,1,true).roll)<Math.abs(strugglePose(g.interaction,1).roll));
});
test('finish approaches the eye, contacts, immediately recoils and preserves input state',()=>{
  const q={phase:'stab',phaseStartedAt:1,until:1.2,presses:8,targetPresses:8},before=structuredClone(q);
  assert.equal(strugglePose(q,1.11).progress,1);assert.ok(strugglePose(q,1.18).progress<1);assert.deepEqual(q,before);
});
test('nightmare and recovery sky expire independently without an old owner clearing a new one',()=>{
  const g=game();g.skyRedStartedAt=0;g.skyRedUntil=3;g.elapsed=4;assert.equal(nightmareState(g).sky,1);
  g.interaction=null;assert.equal(nightmareState(g).sky,0);g.skyRedUntil=7;g.skyRedStartedAt=4;g.elapsed=5;assert.equal(nightmareState(g).sky,1);
  assert.equal(nightmareState(g).rain,0);g.mode='dead';g.skyRedUntil=0;assert.equal(nightmareState(g).sky,0);
});
test('bounded fragments and corn taunts respect priorities and terminal cancellation',()=>{
  const g=game();assert.ok(corruptionFrame(g).fragments.length<=4);assert.ok(corruptionFrame(g,{touch:true}).fragments.length<=2);
  g.interaction=null;g.player={cornZoneId:'corn',cornEnteredAt:0};g.elapsed=4;assert.ok(corruptionFrame(g).taunt);
  g.interaction={phase:'recovery'};assert.equal(corruptionFrame(g).taunt,null);g.mode='dead';assert.deepEqual(corruptionFrame(g),{fragments:[],taunt:null});
});
test('aliases are literal, bounded graphemes, Unicode preserving and session neutral',()=>{
  assert.equal(normalizeAlias('   '),'STRANGER');assert.equal(normalizeAlias('  José  '),'José');
  assert.equal(normalizeAlias('<img src=x onerror=1>'),'<img src=x onerror=1>');
  assert.equal(normalizeAlias('A\nB'),'AB');assert.equal(normalizeAlias('אורי'),'אורי');
  assert.equal([...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(normalizeAlias('👩‍🌾'.repeat(30)))].length,24);
});
