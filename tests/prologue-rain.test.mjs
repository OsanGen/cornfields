import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {load} from '../scripts/load-glb-cpu.mjs';
import {prepareCruiser} from '../src/prologue-assets.js';
import {createPrologueRain,createWindshieldRainGeometry,PROLOGUE_RAIN_LIMITS} from '../src/prologue-rain.js';

function set(touch=false){
  const location=new THREE.Group(),car=new THREE.Group(),windshield=new THREE.Mesh(new THREE.PlaneGeometry(1.62,.67),new THREE.MeshBasicMaterial());
  location.add(car);windshield.position.set(0,1.11,-.84);windshield.rotation.x=-.40;windshield.name='Test windshield';car.add(windshield);
  const rain=createPrologueRain(location,car,{touch});assert.equal(rain.attachWindshield(windshield),true);
  return {location,car,windshield,rain,dispose(){rain.dispose();windshield.geometry.dispose();windshield.material.dispose();}};
}

test('rain remains a two-draw fixed pool with stable buffers across drive, turn, stop and reduced mode',()=>{
  for(const touch of [false,true]){
    const state=set(touch),{rain,car}=state,anchor=new THREE.Vector3(.5,1.13,.16),drive={yaw:0,speed:6};
    const geometry=rain.rain.geometry,attribute=geometry.attributes.position,array=attribute.array,overlay=rain.glass,uv=overlay.geometry.attributes.uv.array,uniforms=overlay.material.uniforms;
    const full=touch?PROLOGUE_RAIN_LIMITS.touch:PROLOGUE_RAIN_LIMITS.desktop;
    assert.equal(array.length,full*6);assert.equal(rain.stats.maxDrawCalls,2);assert.equal(overlay.material.forceSinglePass,true);
    for(let i=0;i<600;i++){
      drive.yaw=Math.sin(i*.05)*.3;drive.speed=Math.max(0,6-i*.02);car.rotation.y=drive.yaw;
      const reduced=i>=300;rain.update(i/60,anchor,drive,reduced);
      assert.equal(rain.rain.geometry,geometry);assert.equal(geometry.attributes.position,attribute);assert.equal(attribute.array,array);assert.equal(rain.glass,overlay);assert.equal(overlay.geometry.attributes.uv.array,uv);assert.equal(overlay.material.uniforms,uniforms);
      assert.equal(geometry.drawRange.count,rain.stats.exteriorCount*2);assert.ok(array.every(Number.isFinite));
    }
    assert.equal(rain.stats.exteriorCount,touch?54:90);assert.ok(rain.stats.exteriorCount<full);assert.equal(uniforms.density.value,.30);assert.equal(uniforms.amount.value,.22);assert.equal(rain.rain.material.opacity,.14);
    rain.update(10,anchor,drive,false);assert.equal(rain.stats.exteriorCount,full);assert.equal(uniforms.density.value,1);assert.equal(uniforms.amount.value,.38);state.dispose();
  }
});

test('exterior fall and streak direction respond to car velocity while exact clock samples are repeatable',()=>{
  const state=set(),{rain}=state,anchor=new THREE.Vector3(.5,1.13,0),drive={yaw:0,speed:6};
  rain.update(3,anchor,drive);assert.equal(rain.stats.relativeZ,6.18);assert.equal(rain.stats.relativeX,.65);
  const straight=Array.from(rain.rain.geometry.attributes.position.array);rain.update(3,anchor,drive);assert.deepEqual(Array.from(rain.rain.geometry.attributes.position.array),straight);
  drive.yaw=Math.PI/2;rain.update(3,anchor,drive);assert.ok(Math.abs(rain.stats.relativeZ-.18)<1e-10);assert.equal(rain.stats.relativeX,6.65);assert.notDeepEqual(Array.from(rain.rain.geometry.attributes.position.array),straight);
  drive.speed=0;rain.update(3,anchor,drive);assert.equal(rain.stats.relativeX,.65);assert.equal(rain.stats.relativeZ,.18);
  state.dispose();
});

test('exterior seeds do not rain inside the cabin or the immediate eye region',()=>{
  const state=set(),{rain,car}=state,anchor=new THREE.Vector3(.5,1.13,.1),drive={yaw:0,speed:6};
  for(let i=0;i<45;i++){
    drive.yaw=Math.sin(i)*.35;car.rotation.y=drive.yaw;rain.update(i*.13,anchor,drive);
    const p=rain.rain.geometry.attributes.position.array,c=Math.cos(drive.yaw),s=Math.sin(drive.yaw);
    for(let at=0;at<p.length;at+=6){
      const [x,y,z]=p.subarray(at,at+3);if(y<0){assert.equal(p[at+3],x);assert.equal(p[at+4],y);assert.equal(p[at+5],z);continue;}
      const localX=c*x-s*z,localZ=s*x+c*z;
      assert.ok(y>=1.75||Math.abs(localX)>=1.18||localZ<=-2.7||localZ>=1.55);
      assert.ok((x-anchor.x)**2+(y-anchor.y)**2+(z-anchor.z)**2>=.49-1e-6);
      assert.ok(p[at+4]>y,'tail extends upward');
    }
  }
  assert.equal(rain.rain.material.depthTest,true);assert.equal(rain.rain.material.depthWrite,false);state.dispose();
});

test('actual shipped windshield gets owned finite UVs without modifying imported geometry',async()=>{
  const source=await load(new URL('../assets/intro/cruiser.glb',import.meta.url)),prepared=prepareCruiser(source.scene),location=new THREE.Group(),car=new THREE.Group();
  location.add(car);car.add(prepared.model);car.position.set(4,0,30);car.rotation.set(.01,-.24,.02,'YXZ');
  const windshield=source.scene.getObjectByName('BodyWindshield'),original=windshield.geometry;
  assert.equal(original.attributes.uv,undefined);assert.equal(original.attributes.position.count,731);
  const positions=Array.from(original.attributes.position.array),rain=createPrologueRain(location,car);
  assert.equal(rain.attachWindshield(windshield),true);const overlay=rain.glass,uv=overlay.geometry.attributes.uv;
  assert.equal(overlay.parent,windshield);assert.notEqual(overlay.geometry,original);assert.equal(overlay.geometry.index.count,original.index.count);assert.deepEqual(Array.from(overlay.geometry.attributes.position.array),positions);
  assert.equal(uv.count,731);assert.ok(uv.array.every(n=>Number.isFinite(n)&&n>=0&&n<=1));
  assert.equal(rain.stats.glassSource,'BodyWindshield');assert.equal(rain.stats.glassVertices,731);
  assert.equal(original.attributes.uv,undefined);assert.deepEqual(Array.from(original.attributes.position.array),positions);
  const before=Array.from(uv.array),anchor=new THREE.Vector3(.5,1.13,.1),drive={yaw:.3,speed:6};
  const camera=new THREE.PerspectiveCamera();location.add(camera);
  for(const yaw of [-2,-.5,0,.7,2]){
    camera.rotation.set(.12,yaw,0);rain.update(4,anchor,drive);location.updateMatrixWorld(true);
    assert.deepEqual(Array.from(uv.array),before);assert.ok(overlay.matrixWorld.equals(windshield.matrixWorld));
  }
  car.rotation.y=-1.1;car.position.set(-4,0,10);rain.update(4,anchor,drive);location.updateMatrixWorld(true);assert.deepEqual(Array.from(uv.array),before);assert.ok(overlay.matrixWorld.equals(windshield.matrixWorld));
  let originalDisposed=0;original.addEventListener('dispose',()=>originalDisposed++);rain.dispose();assert.equal(originalDisposed,0);
  const owned=new Set();source.scene.traverse(o=>{if(o.geometry)owned.add(o.geometry);for(const m of [].concat(o.material||[]))owned.add(m);});for(const resource of owned)resource.dispose();
});

test('mapping is independent of world placement and refuses missing or degenerate glass safely',()=>{
  const state=set(),{car,windshield}=state;
  const before=createWindshieldRainGeometry(windshield,car);state.location.position.set(200,3,-60);state.location.rotation.y=.8;car.rotation.set(.1,.3,.02);
  const after=createWindshieldRainGeometry(windshield,car);
  assert.equal(before.attributes.uv.count,after.attributes.uv.count);for(let i=0;i<before.attributes.uv.array.length;i++)assert.ok(Math.abs(before.attributes.uv.array[i]-after.attributes.uv.array[i])<1e-6);
  assert.equal(createWindshieldRainGeometry(null,car),null);const overlay=state.rain.glass;assert.equal(state.rain.attachWindshield(null),false);assert.equal(state.rain.glass,overlay);
  before.dispose();after.dispose();state.dispose();
});

test('glass swap, release, disabled chapters and repeated disposal retain exact resource ownership',()=>{
  const state=set(),{rain,windshield,car}=state,anchor=new THREE.Vector3(),drive={yaw:0,speed:0};
  const counts={old:0,new:0,lines:0,lineMaterial:0,glassMaterial:0,borrowed:0};
  rain.glass.geometry.addEventListener('dispose',()=>counts.old++);rain.rain.geometry.addEventListener('dispose',()=>counts.lines++);rain.rain.material.addEventListener('dispose',()=>counts.lineMaterial++);rain.glass.material.addEventListener('dispose',()=>counts.glassMaterial++);windshield.geometry.addEventListener('dispose',()=>counts.borrowed++);
  const replacement=new THREE.Mesh(new THREE.PlaneGeometry(1.8,.7),new THREE.MeshBasicMaterial());replacement.name='Replacement windshield';replacement.position.y=1;car.add(replacement);
  assert.equal(rain.attachWindshield(replacement),true);assert.equal(counts.old,1);assert.equal(windshield.children.length,0);rain.glass.geometry.addEventListener('dispose',()=>counts.new++);
  rain.update(1,anchor,drive);const version=rain.rain.geometry.attributes.position.version;
  rain.update(2,anchor,drive,false,false);assert.equal(rain.rain.visible,false);assert.equal(rain.glass.visible,false);assert.equal(rain.stats.exteriorCount,0);assert.equal(rain.rain.geometry.attributes.position.version,version);
  rain.update(2,anchor,drive,false,true,false);assert.equal(rain.rain.visible,true);assert.equal(rain.glass.visible,false);
  rain.dispose();rain.dispose();rain.update(3,anchor,drive);assert.equal(rain.attachWindshield(windshield),false);assert.equal(rain.rain.parent,null);assert.equal(rain.glass,null);assert.equal(rain.stats.active,false);assert.equal(rain.stats.exteriorCount,0);
  assert.deepEqual(counts,{old:1,new:1,lines:1,lineMaterial:1,glassMaterial:1,borrowed:0});state.dispose();replacement.geometry.dispose();replacement.material.dispose();
});

test('rain update has no allocation constructors or collection transforms; shader stays glass-local and readable',async()=>{
  const source=await readFile(new URL('../src/prologue-rain.js',import.meta.url),'utf8'),update=source.slice(source.indexOf('  function update('),source.indexOf('  function dispose('));
  assert.doesNotMatch(update,/\bnew\s|\.map\(|\.filter\(|\.slice\(|\.toArray\(|\.clone\(|\.set\(\[/);
  const state=set(),shader=state.rain.glass.material.fragmentShader;
  for(const feature of ['wetCell','float impact=','float bead=','float trail=','mix(1.0,.38,center)'])assert.ok(shader.includes(feature));
  assert.doesNotMatch(shader,/gl_FragCoord|cameraPosition|texture2D|sampler2D/);assert.equal(state.rain.glass.material.depthTest,true);assert.equal(state.rain.glass.material.depthWrite,false);state.dispose();
});
