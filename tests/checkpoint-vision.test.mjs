import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createMaze} from '../src/maze.js';
import {createGame,startGame,updateGame,pauseGame,resumeGame} from '../src/game.js';
import {attachSurvivalEnding} from '../src/survival-ending.js';
import {checkpointVisionState,CHECKPOINT_VISION_SECONDS} from '../src/checkpoint-vision.js';
import {attachLiquidMaterial} from '../src/liquid-material.js';
import {prepareScarecrow,createScarecrowView} from '../src/scarecrow-view.js';

function game(){const g=createGame(createMaze({corridors:true}));attachSurvivalEnding(g,{briefing:false});startGame(g);g.entered=true;g.corridorRun.started=true;g.enemies.forEach(e=>e.active=false);return g;}
function heal(g,index){Object.assign(g.player,g.maze.checkpoints[index]);g.player.health=12;updateGame(g,1/60);}

test('healing triggers one liquid vision, while movement and the existing trial clock continue',()=>{
  const g=game();heal(g,0);assert.equal(g.player.health,100);assert.equal(g.player.ammo,4);
  const at=g.metrics.checkpointTimes[0],remaining=g.survivalEnding.remaining,{x,z}=g.player;
  updateGame(g,.22,{forward:1});assert.ok(Math.hypot(g.player.x-x,g.player.z-z)>.01);assert.ok(g.survivalEnding.remaining<remaining);
  assert.equal(checkpointVisionState(g).caption,'WE ARE ONE');assert.equal(g.mode,'playing');
  Object.assign(g.player,g.maze.checkpoints[0]);updateGame(g,.05);
  assert.equal(g.metrics.checkpointTimes.length,1);assert.equal(g.metrics.checkpointTimes[0],at);
  assert.equal(g.events.filter(e=>e.type==='checkpoint').length,1);assert.equal(g.player.ammo,4);
});
test('the next scarecrow produces a stronger and redder vision, without farming on revisits',()=>{
  const g=game();heal(g,0);updateGame(g,.3);const first=checkpointVisionState(g);
  updateGame(g,CHECKPOINT_VISION_SECONDS);heal(g,1);updateGame(g,.3);const second=checkpointVisionState(g);
  assert.ok(second.amount>first.amount);assert.ok(second.red>first.red);assert.equal(g.player.ammo,6);
  updateGame(g,2);Object.assign(g.player,g.maze.checkpoints[1]);g.player.health=60;updateGame(g,.1);
  assert.equal(checkpointVisionState(g).active,false);assert.equal(g.player.health,60);assert.equal(g.metrics.checkpointTimes.length,2);
});
test('pause freezes a vision; restart clears it; QTE and ending take priority',()=>{
  const g=game();heal(g,0);updateGame(g,.3);pauseGame(g);const held=checkpointVisionState(g);updateGame(g,9);assert.deepEqual(checkpointVisionState(g),held);
  resumeGame(g);g.interaction={phase:'qte'};assert.equal(checkpointVisionState(g).active,false);g.interaction=null;
  g.survivalEnding.phase='transform';assert.equal(checkpointVisionState(g).active,false);
  assert.equal(checkpointVisionState(game()).active,false);
});
test('reduced effects keep the same phrase and tier while lowering liquid displacement',()=>{
  const g=game();heal(g,0);updateGame(g,.3);const normal=checkpointVisionState(g),reduced=checkpointVisionState(g,true);
  assert.equal(normal.caption,reduced.caption);assert.equal(normal.red,reduced.red);assert.ok(reduced.amount<normal.amount/4);
});
test('liquid materials preserve previous shader hooks and cloned materials have independent uniforms',()=>{
  const material=new THREE.MeshStandardMaterial();let calls=0;material.onBeforeCompile=()=>calls++;
  const a=attachLiquidMaterial(material),b=attachLiquidMaterial(material.clone());assert.equal(attachLiquidMaterial(material),a);assert.notEqual(a,b);
  a.red.value=.9;assert.equal(b.red.value,0);
  const shader={uniforms:{},vertexShader:'#include <begin_vertex>',fragmentShader:'#include <color_fragment>\n#include <roughnessmap_fragment>'};
  material.onBeforeCompile(shader);assert.equal(calls,1);assert.equal(shader.uniforms.liquidRed,a.red);assert.match(shader.fragmentShader,/liquidColor/);
});
test('model fit retains ground alignment and shared geometry but independent emissive materials',()=>{
  const source=new THREE.Group(),mesh=new THREE.Mesh(new THREE.BoxGeometry(1,2,.4),new THREE.MeshStandardMaterial());mesh.position.y=1;source.position.set(4,2,3);source.add(mesh);
  const a=prepareScarecrow(source),b=prepareScarecrow(source),bounds=new THREE.Box3().setFromObject(a.root);
  assert.ok(Math.abs(bounds.min.y)<1e-6);assert.ok(Math.abs(bounds.getSize(new THREE.Vector3()).y-2.55)<1e-6);
  assert.equal(a.root.children[0].geometry,b.root.children[0].geometry);assert.notEqual(a.materials[0],b.materials[0]);
});
test('unmapped clothing gets reusable surface UVs rather than sampling one fabric pixel',()=>{
  const source=new THREE.Group(),geometry=new THREE.BoxGeometry(1,2,.4);geometry.deleteAttribute('uv');source.add(new THREE.Mesh(geometry,new THREE.MeshStandardMaterial()));
  prepareScarecrow(source);const uv=geometry.attributes.uv;
  assert.equal(uv.count,geometry.attributes.position.count);assert.ok(new Set(uv.array).size>2);
  prepareScarecrow(source);assert.equal(geometry.attributes.uv,uv);
});
test('an unavailable model keeps two glowing checkpoint targets and independent spent state',async()=>{
  const g=game(),scene=new THREE.Scene(),anchors=g.maze.checkpoints.map(checkpoint=>{const group=new THREE.Group(),fallback=new THREE.Group();group.add(fallback);scene.add(group);return {group,fallback,checkpoint};});
  const view=createScarecrowView(scene,anchors,{loader:{loadAsync:()=>Promise.reject(Error('Unavailable'))}});await view.ready;
  assert.equal(view.stats.status,'fallback');assert.ok(anchors.every(a=>a.fallback.visible));
  g.progress.activatedCheckpoints=['cross'];view.update(g,.4,false,new THREE.PerspectiveCamera());assert.equal(view.stats.spent,1);assert.equal(view.stats.active,1);
  view.dispose();
});
