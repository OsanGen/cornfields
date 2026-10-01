import test from 'node:test';
import assert from 'node:assert/strict';
import {createHarness} from './helpers/browser.mjs';
import {createUI} from '../src/ui.js';
import {createGame} from '../src/game.js';
import {enterOpenField} from '../src/corridor-run.js';
import {groundDetailLayout} from '../src/ground-details.js';
import {strugglePose} from '../src/horror-presentation.js';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

test('corn warnings have one owner, including the reduced-effects readable tail',()=>{
  for(const reducedMotion of [false,true]){
    const h=createHarness({corridors:true}),ui=createUI(h.document,{reducedMotion}),g=createGame(h.maze);
    Object.assign(g,{mode:'playing',elapsed:4,caption:'IT IS COMING INTO THE CORN.'});
    Object.assign(g.player,{hidden:true,cornZoneId:'open-field',cornEnteredAt:0});
    Object.assign(g.threat,{activeMessage:'It found you. Move.',lastMessageAt:4});
    ui.render(g);
    assert.equal(h.node('threat-card').hidden,false);
    assert.equal(h.node('caption').hidden,true);assert.equal(h.node('hide-status').hidden,true);assert.equal(h.node('corn-taunt').hidden,true);
    g.threat.activeMessage=null;g.elapsed+=.1;ui.render(g);
    if(reducedMotion)assert.equal(h.node('caption').hidden,true);
    g.mode='paused';ui.render(g);for(const id of ['caption','threat-card','hide-status','corn-taunt'])assert.equal(h.node(id).hidden,true);
  }
});

test('ground detail stays world-anchored, bounded and outside doorway clearances',()=>{
  const h=createHarness({corridors:true}),g=createGame(h.maze),door=h.maze.cornDoors.find(d=>d.fieldEntrance);
  g.cornDoors[door.index].amount=1;assert(enterOpenField(g,door));Object.assign(g.player,{x:8,z:8});
  const before=JSON.stringify(g),points=groundDetailLayout(g);assert(points.length>20&&points.length<162);
  assert(points.every(p=>Math.hypot(p.x,p.z)>2&&g.maze.cornDoors.every(d=>Math.hypot(d.x-p.x,d.z-p.z)>=1.7)));
  const low=groundDetailLayout(g,{low:true});assert(low.length<points.length);assert(low.every(p=>points.some(q=>JSON.stringify(q)===JSON.stringify(p))));
  assert.equal(JSON.stringify(g),before);g.player.x+=3;
  const moved=groundDetailLayout(g),common=points.filter(p=>Math.hypot(p.x-g.player.x,p.z-g.player.z)<8);
  assert(common.every(p=>moved.some(q=>JSON.stringify(q)===JSON.stringify(p))));
});

test('stab impact is tied to contact and reduced effects remove its camera kick',()=>{
  const q={phase:'stab',phaseStartedAt:1,until:1.2,presses:8,targetPresses:8};
  assert.equal(strugglePose(q,1.05).impact,0);assert(strugglePose(q,1.12).impact>.5);
  assert.equal(strugglePose(q,1.12,true).impact,0);assert.equal(strugglePose(q,1.19).impact,0);
});

test('new creature recordings match their CC0 source manifest and stay small',async()=>{
  const manifest=JSON.parse(await readFile(new URL('../assets/audio/creature-sources.json',import.meta.url)));
  assert.equal(manifest.license,'CC0-1.0');let bytes=0;
  for(const [name,entry]of Object.entries(manifest.runtime)){
    const data=await readFile(new URL('../assets/audio/'+name,import.meta.url));bytes+=data.length;
    assert.equal(createHash('sha256').update(data).digest('hex'),entry.sha256);assert(entry.seconds<2);
  }
  assert(bytes<100000);
});
