import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {prologueBlocking,prologueWorldTransition,withPrologueWorld} from '../src/prologue-visuals.js';
import {GAME_CONFIG} from '../src/game-config.js';

test('prologue starts with Mike in the passenger seat and exits at standing height',()=>{
  const car=prologueBlocking({chapter:'car',chapterProgress:0,time:0});
  assert.ok(car.camera[0]>0);assert.equal(car.inCar,true);assert.equal(car.camera[1],1.13);
  const exit=prologueBlocking({chapter:'emergence',chapterProgress:1});
  assert.equal(exit.inCar,false);assert.equal(exit.camera[1],GAME_CONFIG.player.eyeHeight);
});

test('guided chapters join at identical camera positions',()=>{
  const chapters=['emergence','walk','history','disappearance','arrival','rupture'];
  for(let i=0;i<chapters.length-1;i++){
    const end=prologueBlocking({chapter:chapters[i],chapterProgress:1});
    const next=prologueBlocking({chapter:chapters[i+1],chapterProgress:0});
    assert.deepEqual(end.camera,next.camera,`${chapters[i]} to ${chapters[i+1]}`);
  }
});

test('return holds the exact threshold pose and never restores the men',()=>{
  const end=prologueBlocking({chapter:'arrival',chapterProgress:1});
  const returned=prologueBlocking({chapter:'rupture',chapterProgress:.2,returning:true,returnTime:3});
  assert.deepEqual(returned.camera,end.camera);assert.deepEqual(returned.camera,[0,GAME_CONFIG.player.eyeHeight,-48]);
  assert.deepEqual(returned.look,[0,GAME_CONFIG.player.eyeHeight,-56]);assert.equal(returned.menVisible,false);
});

test('disappearance is concealed by dense mist and reduced mode removes the head turn',()=>{
  assert.equal(prologueBlocking({chapter:'rupture',chapterProgress:.4,mist:.25}).menVisible,true);
  assert.equal(prologueBlocking({chapter:'rupture',chapterProgress:.9,mist:.95}).menVisible,false);
  const reduced=prologueBlocking({chapter:'rupture',chapterProgress:.25,reduced:true});
  assert.deepEqual(reduced.look,[0,GAME_CONFIG.player.eyeHeight,-56]);
});

test('live maze transfer happens only while fully covered and persists through return',()=>{
  assert.deepEqual(prologueWorldTransition({chapter:'arrival',chapterProgress:.01},false),{world:false,cover:0});
  assert.equal(prologueWorldTransition({chapter:'arrival',chapterProgress:.15},true).world,false);
  for(const p of [.15,.16,.18,.22])assert.equal(prologueWorldTransition({chapter:'arrival',chapterProgress:p},true).cover,1);
  assert.equal(prologueWorldTransition({chapter:'arrival',chapterProgress:.16},true).world,true);
  assert.deepEqual(prologueWorldTransition({chapter:'arrival',chapterProgress:1},true),{world:true,cover:0});
  assert.equal(prologueWorldTransition({chapter:'rupture',returning:true},true).world,true);
});

test('borrowed scene, camera and membership restore when world rendering throws',()=>{
  const scene=new THREE.Scene(),gameCamera=new THREE.PerspectiveCamera(),cinematic=new THREE.PerspectiveCamera(),ownScene=new THREE.Scene(),location=new THREE.Group(),stage=new THREE.Group();
  const first=new THREE.Group(),actor=new THREE.Group(),last=new THREE.Group(),haze=new THREE.Group();
  ownScene.add(location,stage,haze);location.add(first,actor,last);stage.visible=false;
  scene.add(gameCamera);gameCamera.position.set(5,1.58,7);gameCamera.rotation.y=.8;
  const photograph=new THREE.Mesh(new THREE.SphereGeometry(1),new THREE.MeshBasicMaterial({color:0xaabbcc}));photograph.name='Photographic night sky';scene.add(photograph);
  scene.fog=new THREE.FogExp2(0x202020,.075);scene.background=new THREE.Color(0x131920);
  const fog=scene.fog,background=scene.background,color=photograph.material.color.clone(),children=[...scene.children],ownedChildren=[...ownScene.children],pose=gameCamera.matrix.clone();
  assert.throws(()=>withPrologueWorld({scene,camera:gameCamera},{camera:cinematic,stage,actors:[actor,haze],fog:new THREE.FogExp2(0xaa0000,.4),background:new THREE.Color(0x220000),red:1},(active,view)=>{
    assert.equal(active,scene);assert.equal(view,cinematic);assert.equal(gameCamera.visible,false);assert.equal(actor.parent,stage);throw new Error('render failed');
  }),/render failed/);
  assert.equal(scene.fog,fog);assert.equal(scene.background,background);assert.equal(gameCamera.visible,true);assert.deepEqual(gameCamera.matrix,pose);
  assert.deepEqual(scene.children,children);assert.deepEqual(ownScene.children,ownedChildren);assert.deepEqual(location.children,[first,actor,last]);assert.equal(stage.visible,false);assert.ok(photograph.material.color.equals(color));
  photograph.geometry.dispose();photograph.material.dispose();
});
