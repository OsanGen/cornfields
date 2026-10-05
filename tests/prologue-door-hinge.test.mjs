import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {load} from '../scripts/load-glb-cpu.mjs';
import {prepareCruiser} from '../src/prologue-assets.js';
import {parkedCruiserClearanceBox} from '../src/prologue-clearance.js';
import {samplePrologueExit} from '../src/prologue-performance.js';

const parked={steer:0,wheelRoll:0};
const makeCar=async()=>prepareCruiser((await load(new URL('../assets/intro/cruiser.glb',import.meta.url))).scene);
function points(object,frame=new T.Matrix4()){
  const result=[];
  object.traverse(mesh=>{
    if(!mesh.isMesh)return;
    for(let i=0;i<mesh.geometry.attributes.position.count;i++)result.push(mesh.localToWorld(mesh.getVertexPosition(i,new T.Vector3())).applyMatrix4(frame));
  });
  return result;
}
const bounds=vertices=>new T.Box3().setFromPoints(vertices);
const near=(a,b,message)=>assert(a.distanceTo(b)<1e-10,message);
const sides=car=>[{door:car.door,side:1,name:'passenger'},{door:car.driverDoor,side:-1,name:'driver'}];

// These checks measure the actual shipped vertices; checking an expected angle
// alone would merely repeat the sign mistake this test is meant to prevent.
test('actual cruiser doors open outward through closed, partial and full geometry samples',async()=>{
  const car=await makeCar();car.update(parked,0);car.model.updateMatrixWorld(true);
  const previous=new Map();
  for(const {door,side,name} of sides(car)){
    assert.equal(door.children.length,14,`${name}: all exterior/interior door parts follow the hinge`);
    const verts=points(door);assert(verts.length>1000,'test real mesh surfaces');
    previous.set(door,side*bounds(verts).getCenter(new T.Vector3()).x);
  }
  for(let i=0;i<=40;i++){
    car.update(parked,i/40);car.model.updateMatrixWorld(true);
    for(const {door,side,name} of sides(car)){
      const verts=points(door),outward=side*bounds(verts).getCenter(new T.Vector3()).x;
      assert(outward>=previous.get(door)-1e-10,`${name} door moves inward at ${i/40}`);
      assert(verts.every(p=>side*p.x>.73),`${name} intrudes into cabin/body centerline at ${i/40}`);
      if(i===40){assert(outward>1.98,`${name} fully-open center is outside body`);assert(verts.every(p=>side*p.x>1.25),`${name} fully-open door clears the lateral cabin exit`);}
      previous.set(door,outward);
    }
  }
});

test('actual door sweep stays inside the unchanged corn clearance guard',async()=>{
  const car=await makeCar(),guard=parkedCruiserClearanceBox(),sweep=new T.Box3();
  for(let i=0;i<=80;i++){
    car.update(parked,i/80);car.model.updateMatrixWorld(true);
    for(const {door,name} of sides(car))for(const p of points(door)){assert(guard.containsPoint(p),`${name} outside existing corn guard: ${p.toArray()}`);sweep.expandByPoint(p);}
  }
  assert(guard.max.x-sweep.max.x>.08,'passenger retains at least 8cm additional guard margin');
  assert(sweep.min.x-guard.min.x>.08,'driver retains at least 8cm additional guard margin');
});

test('unchanged passenger eye path clears the actual moving door surfaces throughout the exit',async()=>{
  const car=await makeCar(),triangle=new T.Triangle(),eye=new T.Vector3(),nearest=new T.Vector3();
  for(let i=0;i<=160;i++){
    const exit=samplePrologueExit(i/100);car.update(parked,exit.door);car.model.updateMatrixWorld(true);eye.fromArray(exit.position);
    car.door.traverse(mesh=>{
      if(!mesh.isMesh)return;const g=mesh.geometry;
      for(let j=0;j<(g.index?.count||g.attributes.position.count);j+=3){
        [triangle.a,triangle.b,triangle.c].forEach((p,k)=>mesh.localToWorld(mesh.getVertexPosition(g.index?g.index.getX(j+k):j+k,p)));
        assert(eye.distanceTo(triangle.closestPointToPoint(eye,nearest))>.14,`passenger eye clips ${mesh.name} at ${i/100}s`);
      }
    });
  }
});

test('repeated open, partial, close and replay samples have no accumulated drift or shell change',async()=>{
  const car=await makeCar();car.update(parked,0);car.model.updateMatrixWorld(true);
  const initial=sides(car).map(({door})=>points(door)),hinges=sides(car).map(({door})=>door.position.clone());
  const rigid=[];car.model.traverse(o=>{
    if(!o.isMesh)return;for(let parent=o;parent;parent=parent.parent)if(parent===car.door||parent===car.driverDoor)return;
    rigid.push([o,o.matrixWorld.toArray(),Array.from(o.geometry.attributes.position.array)]);
  });
  car.update(parked,.5);car.model.updateMatrixWorld(true);const halfway=sides(car).map(({door})=>points(door));
  for(let cycle=0;cycle<5;cycle++)for(const progress of [1,1,.75,.5,.25,0,0,.5,1,0]){
    car.update(parked,progress);car.model.updateMatrixWorld(true);
    for(const [i,{door}]of sides(car).entries()){
      near(door.position,hinges[i],'hinge placement remains unchanged');
      if(progress===0||progress===.5){const expected=progress===0?initial[i]:halfway[i];points(door).forEach((p,j)=>near(p,expected[j],`repeat ${progress} must restore exact mesh position`));}
    }
  }
  for(const [o,matrix,geometry] of rigid){assert.deepEqual(o.matrixWorld.toArray(),matrix,`${o.name} shell transform unchanged`);assert.deepEqual(Array.from(o.geometry.attributes.position.array),geometry,`${o.name} shell geometry unchanged`);}
});

test('door geometry remains outward in car-local space under arbitrary stage position and yaw',async()=>{
  const car=await makeCar(),stage=new T.Group();stage.add(car.model);stage.position.set(7,2,-9);stage.rotation.y=.72;stage.updateMatrixWorld(true);
  const inverse=stage.matrixWorld.clone().invert();
  for(const open of [0,.5,1,.5,0]){
    car.update(parked,open);stage.updateMatrixWorld(true);
    for(const {door,side,name}of sides(car))assert(points(door,inverse).every(p=>side*p.x>.73),`${name} local clearance is independent of parent transform`);
  }
});

test('missing optional cruiser keeps the fallback passenger door opening outward within the same guard',async()=>{
  const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
  const {createPrologueVisuals}=await import('../src/prologue-visuals.js');
  const {samplePrologueExit}=await import('../src/prologue-performance.js');
  const {rendererStub}=await import('./helpers/foliage-motion-cpu.mjs');
  const oldGLB=GLTFLoader.prototype.loadAsync,oldTexture=T.TextureLoader.prototype.loadAsync,oldDocument=globalThis.document;
  globalThis.document={createElement:()=>({width:128,height:128,getContext:()=>({fillRect(){}})})};
  GLTFLoader.prototype.loadAsync=async()=>{throw Error('deliberate optional asset failure');};
  T.TextureLoader.prototype.loadAsync=async()=>{throw Error('deliberate optional texture failure');};
  let scene;const view=createPrologueVisuals(rendererStub(s=>{scene=s;})),guard=parkedCruiserClearanceBox();
  try{
    const render=door=>view.render({chapter:'walk',chapterProgress:.5,time:3,exitPose:{...samplePrologueExit(1.6),door}});
    render(0);await new Promise(resolve=>setImmediate(resolve));render(0);
    assert.equal(view.diagnostics().assets.car,'fallback');
    const car=scene.getObjectByName('Cruiser interior, passenger on right');
    const door=car.children.find(o=>o.isGroup&&o.position.distanceTo(new T.Vector3(.86,.45,-.52))<1e-12);
    assert(door&&door.visible&&door.children.length===3,'use the real built fallback, not a test substitute');
    const frame=car.matrixWorld.clone().invert(),closed=points(door,frame);let last=bounds(closed).getCenter(new T.Vector3()).x;
    for(let i=0;i<=40;i++){
      render(i/40);const verts=points(door,frame),center=bounds(verts).getCenter(new T.Vector3()).x;
      assert(center>=last-1e-10,`fallback door moves inward at ${i/40}`);assert(verts.every(p=>p.x>.72),'fallback never crosses cabin interior');
      assert(verts.every(p=>guard.containsPoint(p)),'fallback stays inside the existing corn guard');last=center;
    }
    assert(last>1.30,'fully-open fallback moves visibly outward');
    for(const progress of [0,.5,1,1,.5,0])render(progress);
    points(door,frame).forEach((p,i)=>near(p,closed[i],'fallback closes exactly after replay'));
  }finally{view.dispose();GLTFLoader.prototype.loadAsync=oldGLB;T.TextureLoader.prototype.loadAsync=oldTexture;if(oldDocument===undefined)delete globalThis.document;else globalThis.document=oldDocument;}
});
