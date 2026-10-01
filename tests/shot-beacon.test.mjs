import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {createShotPulse} from '../src/shot-effects.js';
import {createReturnBeacon,returnBeaconPose} from '../src/return-beacon.js';

test('a slow first frame still displays the muzzle burst, which then expires and resets',()=>{
  const pulse=createShotPulse();assert.equal(pulse.sample(.1),0);
  pulse.trigger();assert.equal(pulse.sample(.25),1);assert(pulse.sample(.04)>0);
  assert.equal(pulse.sample(.06),0);pulse.trigger();assert.equal(pulse.sample(0,false),0);
  assert.equal(pulse.sample(0),0);pulse.trigger();pulse.reset();assert.equal(pulse.sample(0),0);
});

test('return beacon preserves doorway bearing across near, deep and very distant field positions',()=>{
  const door={x:3,z:-4};
  for(const player of [{x:3,z:-4},{x:3,z:-3},{x:14,z:45},{x:-50,z:-50},{x:5000,z:2000}]){
    const p=returnBeaconPose(player,door,90),dx=door.x-player.x,dz=door.z-player.z;
    assert(Object.values(p).every(Number.isFinite));assert(p.range<=40.5);
    assert(Math.abs((p.x-player.x)*dz-(p.z-player.z)*dx)<1e-6);
    assert((p.x-player.x)*dx+(p.z-player.z)*dz>=0);
    if(p.distance<=40.5){assert.equal(p.x,door.x);assert.equal(p.z,door.z);}
    assert(p.width>=1.3);assert(p.height>=34);
  }
});

test('new effects keep a small runtime footprint with matching licensed-source hashes',async()=>{
  let bytes=0;
  for(const [folder,name]of [['audio','weapon'],['field','beacon']]){
    const meta=JSON.parse(await readFile(new URL(`../assets/${folder}/${name}-source.json`,import.meta.url)));
    const data=await readFile(new URL(`../assets/${folder}/${meta.runtime.file}`,import.meta.url));
    assert.equal(createHash('sha256').update(data).digest('hex'),meta.runtime.sha256);
    assert(meta.source.licenseURL.startsWith('https://creativecommons.org/'));bytes+=data.length;
  }
  assert(bytes<500000);
});

test('beacon keeps reduced effects steady, clears on return and disposes a late optional texture',()=>{
  const scene=new THREE.Scene(),field=new THREE.Group(),light=new THREE.PointLight();
  const lantern=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial());
  scene.add(field);field.add(lantern,light);let loaded;
  const beacon=createReturnBeacon(scene,field,lantern,light,{loader:{load(url,onLoad){loaded=onLoad;}}});
  const game={elapsed:1,player:{zone:'field',x:12,z:15},fieldTrip:{active:true,doorId:4},maze:{cornWorld:{activeDoor:0,doors:[{x:0,z:0}]}}};
  beacon.update(game,true);const first=scene.getObjectByName('Return mist 0').position.clone();
  assert.equal(beacon.stats.doorId,4);assert.equal(light.intensity,32);
  game.elapsed=10;beacon.update(game,true);assert.deepEqual(scene.getObjectByName('Return mist 0').position,first);
  game.player.zone='corridor';beacon.update(game);assert.equal(beacon.stats.active,false);assert.equal(beacon.stats.doorId,null);
  assert.equal(scene.getObjectByName('Red return sky beacon').visible,false);
  beacon.dispose();const texture=new THREE.Texture();let disposed=0;texture.addEventListener('dispose',()=>disposed++);loaded(texture);assert.equal(disposed,1);
});
