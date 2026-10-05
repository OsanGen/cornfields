import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {createFoliageMotion} from '../src/foliage-motion.js';
import {createCornGeometry,CORN_ART_VERSION} from '../src/corn-art.js';
import {createPrologueVisuals} from '../src/prologue-visuals.js';
import {attachLiquidMaterial} from '../src/liquid-material.js';
import {cornInstanceEnvelope,PARKED_CRUISER_CLEARANCE,parkedCruiserClearanceBox} from '../src/prologue-clearance.js';
import {sampleWind,rendererStub,cornBatches} from './helpers/foliage-motion-cpu.mjs';
const shader=()=>({uniforms:{},vertexShader:T.ShaderLib.standard.vertexShader,fragmentShader:T.ShaderLib.standard.fragmentShader});
const parts=()=>{const material=new T.MeshStandardMaterial();material.userData.cornArt=CORN_ART_VERSION;return [0,1,2].map(i=>({geometry:createCornGeometry(i),material}));};
const cleanup=items=>{for(const p of items)p.geometry.dispose();for(const m of new Set(items.map(p=>p.material)))m.dispose();};

test('wind-only clones retain PBR maps and compose once with the existing liquid shader hook',()=>{
  const source=new T.MeshStandardMaterial(),map=new T.DataTexture(new Uint8Array([255,255,255,255]),1,1);source.map=source.normalMap=source.roughnessMap=map;source.userData.cornArt=CORN_ART_VERSION;
  const sourceHook=source.onBeforeCompile,wind=createFoliageMotion({playerPush:false}),material=wind.material(source),other=wind.material(source),liquid=attachLiquidMaterial(material),s=shader();
  material.onBeforeCompile(s);const b=shader();other.onBeforeCompile(b);
  for(const key of ['map','normalMap','roughnessMap'])assert.equal(material[key],source[key]);
  assert.equal(s.uniforms.cornTime,b.uniforms.cornTime);assert.equal(s.uniforms.cornPlayerPush.value,0);assert.equal(s.uniforms.prologueLiquid,liquid.amount);
  assert.equal(material.defines.CORN_ART,1);assert.match(material.customProgramCacheKey(),/corn-motion-v4.*cornfield-liquid-v4/);
  for(const pattern of [/mat4 cornTransform/g,/float liquidPhase/g,/attribute float cornFlex/g])assert.equal((s.vertexShader.match(pattern)||[]).length,1);
  assert.match(s.vertexShader,/inverse\(mat3\(cornTransform\)\) \* cornWorldOffset/);
  assert.match(s.vertexShader,/cornBend \* \.18 \* cornPlayerPush/);
  assert.match(s.vertexShader,/cornTip \* cornTip \* cornMotion/);
  wind.update(8,null,true);assert.equal(s.uniforms.cornMotion.value,0);assert.equal(s.uniforms.cornTime.value,8);
  assert.equal(source.onBeforeCompile,sourceHook);assert.equal(source.userData.prologueLiquid,undefined);assert.equal(source.defines.CORN_ART,undefined);
  const live=createFoliageMotion(),liveMaterial=live.material(source),liveShader=shader();liveMaterial.onBeforeCompile(liveShader);assert.equal(liveShader.uniforms.cornPlayerPush.value,1);
  material.dispose();other.dispose();liveMaterial.dispose();source.dispose();map.dispose();
});

test('CPU reference keeps every actual stalk-root vertex fixed and fully disables reduced motion',()=>{
  for(const part of parts()){
    const positions=part.geometry.attributes.position,flex=part.geometry.attributes.cornFlex,matrix=new T.Matrix4().compose(new T.Vector3(9,0,-6),new T.Quaternion().setFromEuler(new T.Euler(0,Math.PI/2,.018)),new T.Vector3(.9,.9,.9));
    let roots=0;
    for(let i=0;i<positions.count;i++){
      const p=new T.Vector3().fromBufferAttribute(positions,i);
      for(const time of [0,3,9,31]){
        const sample=sampleWind(p,flex.getX(i),matrix,{time});
        assert(sample.offset.length()<.078,'actual wind stays inside the pre-existing .38 m horizontal sway guard');
        if(p.y<1e-8){assert.equal(sample.offset.length(),0);roots++;}
        assert.equal(sampleWind(p,flex.getX(i),matrix,{time,reduced:true}).offset.length(),0);
      }
    }
    assert(roots>0);part.geometry.dispose();part.material.dispose();
  }
});

test('world-space wind direction survives 90 degree parent rotation, spawn rotation and planted lean',()=>{
  const worldOffset=new T.Vector3(.062,0,-.013);
  for(const parentYaw of [0,Math.PI/2,-Math.PI/2,.8])for(const plantYaw of [0,.67,2.1])for(const lean of [0,.018]){
    const parent=new T.Matrix4().makeRotationY(parentYaw),instance=new T.Matrix4().compose(new T.Vector3(-3,0,2),new T.Quaternion().setFromEuler(new T.Euler(0,plantYaw,lean)),new T.Vector3(.81,.94,1.01));
    const matrix=parent.clone().multiply(instance),basis=new T.Matrix3().setFromMatrix4(matrix),local=worldOffset.clone().applyMatrix3(basis.clone().invert());
    assert(local.clone().applyMatrix3(basis).distanceTo(worldOffset)<1e-14);
    if(parentYaw===Math.PI/2&&plantYaw===0&&lean===0){const old=worldOffset.clone().applyMatrix3(new T.Matrix3().setFromMatrix4(instance).invert()).applyMatrix3(basis);assert(old.distanceTo(worldOffset)>.08,'old instance-only mapping demonstrably points wrong under this parent');}
  }
});

test('live-field yaw/scale inputs have unchanged offset versus the prior instance-only conversion',()=>{
  for(const yaw of [0,.72,Math.PI,5.2])for(const scale of [.9,1,1.2]){
    const instance=new T.Matrix4().compose(new T.Vector3(2,0,3),new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),yaw),new T.Vector3(scale,scale,scale));
    const matrix=new T.Matrix4().makeTranslation(0,-1.4,0).multiply(instance),x=new T.Vector3().setFromMatrixColumn(instance,0),z=new T.Vector3().setFromMatrixColumn(instance,2);
    for(const time of [0,2,9])for(const playerPush of [false,true]){
      const actual=sampleWind(new T.Vector3(.2,2.1,.3),.8,matrix,{time,playerPush,player:{x:2,z:3}}),old=actual.worldOffset.clone();
      const expected=new T.Vector3(old.dot(x)/x.lengthSq(),actual.localOffset.y,old.dot(z)/z.lengthSq());
      assert(actual.localOffset.distanceTo(expected)<1e-14);
    }
  }
});

test('staged desktop and touch refined corn retain placement and cleared door envelopes under wind',()=>{
  for(const touch of [false,true]){
    const sources=parts();let scene;const view=createPrologueVisuals(rendererStub(s=>{scene=s;}),{getCorn:()=>sources,touch,spawn:{x:23,z:-7,yaw:.8}});
    view.render({chapter:'walk',chapterProgress:.5,time:3});const batches=cornBatches(scene),location=scene.getObjectByName('Cruiser interior, passenger on right').parent,inverse=location.matrixWorld.clone().invert(),guard=parkedCruiserClearanceBox();
    let count=0,checks=0,max=0;
    for(const batch of batches){
      const plain=new T.InstancedMesh(batch.geometry,batch.material,batch.count);plain.instanceMatrix=batch.instanceMatrix;plain.computeBoundingSphere();assert(Math.abs(batch.boundingSphere.radius-plain.boundingSphere.radius-PARKED_CRUISER_CLEARANCE.sway)<1e-10);plain.dispose();
      const s=shader();batch.material.onBeforeCompile(s);assert.equal(s.uniforms.cornPlayerPush.value,0);assert.equal(s.uniforms.cornTime.value,3);
      for(let i=0;i<batch.count;i++){
        const instance=new T.Matrix4();batch.getMatrixAt(i,instance);const localMatrix=inverse.clone().multiply(batch.matrixWorld).multiply(instance),worldMatrix=batch.matrixWorld.clone().multiply(instance),envelope=cornInstanceEnvelope(batch.geometry,instance,inverse.clone().multiply(batch.matrixWorld));
        assert(!envelope.intersectsBox(guard));count++;
        // Enclose every base vertex, then use the analytical horizontal/vertical
        // bound (.078/.013 m) under this exact stage transform for all times.
        const raw=batch.geometry.boundingBox.clone().applyMatrix4(localMatrix),windBound=raw.clone().expandByVector(new T.Vector3(.078,.013,.078));assert(!windBound.intersectsBox(guard));
        // Independently sample representative rendered vertex locations.
        for(let v=0;v<batch.geometry.attributes.position.count;v+=73)for(const time of [0,4,9]){
          const p=new T.Vector3().fromBufferAttribute(batch.geometry.attributes.position,v),sample=sampleWind(p,batch.geometry.attributes.cornFlex.getX(v),worldMatrix,{time});
          const local=sample.world.clone().applyMatrix4(inverse);assert(!guard.containsPoint(local));assert(windBound.containsPoint(local));max=Math.max(max,sample.offset.length());checks++;
        }
      }
    }
    assert(count>(touch?480:850));assert(checks>15000,`${checks} representative vertex/time checks`);assert(max<.078);view.dispose();cleanup(sources);
  }
});

test('repeated start, release and final disposal own only cloned wind materials and instance buffers',()=>{
  const sources=parts(),sourceHook=sources[0].material.onBeforeCompile;let scene,borrowedDisposals=0;
  for(const p of sources)p.geometry.addEventListener('dispose',()=>borrowedDisposals++);sources[0].material.addEventListener('dispose',()=>borrowedDisposals++);
  const view=createPrologueVisuals(rendererStub(s=>{scene=s;}),{getCorn:()=>sources});
  let priorClock=null;
  for(let cycle=0;cycle<4;cycle++){
    view.start();view.render({chapter:'walk',chapterProgress:.4,time:cycle+1});const batches=cornBatches(scene),materials=new Set(batches.map(b=>b.material));let clonesDisposed=0,instancesDisposed=0;
    for(const m of materials)m.addEventListener('dispose',()=>clonesDisposed++);for(const b of batches)b.addEventListener('dispose',()=>instancesDisposed++);
    const s=shader();batches[0].material.onBeforeCompile(s);assert.notEqual(s.uniforms.cornTime,priorClock);priorClock=s.uniforms.cornTime;assert.equal(priorClock.value,cycle+1);
    view.render({chapter:'walk',chapterProgress:.4,time:cycle+2,reduced:true});assert.equal(s.uniforms.cornMotion.value,0);
    view.render({chapter:'walk',chapterProgress:.4,time:cycle+3});assert.equal(s.uniforms.cornMotion.value,1);
    view.release();view.release();assert.equal(clonesDisposed,materials.size);assert.equal(instancesDisposed,batches.length);assert.equal(borrowedDisposals,0);
  }
  assert.equal(sources[0].material.onBeforeCompile,sourceHook);assert.equal(sources[0].material.userData.prologueLiquid,undefined);view.dispose();view.start();assert.equal(view.diagnostics().live,false);cleanup(sources);assert.equal(borrowedDisposals,4);
});

test('procedural fallback also receives wind/liquid without requiring the cornFlex attribute',()=>{
  let scene;const view=createPrologueVisuals(rendererStub(s=>{scene=s;}));
  view.render({chapter:'walk',chapterProgress:.5,time:2});const batches=cornBatches(scene);assert.equal(batches.length,2);
  for(const batch of batches){const s=shader();batch.material.onBeforeCompile(s);assert.equal(batch.material.defines.CORN_ART,undefined);assert.equal(batch.geometry.attributes.cornFlex,undefined);assert.equal(s.uniforms.cornPlayerPush.value,0);assert.equal(s.uniforms.cornTime.value,2);assert(s.uniforms.prologueLiquid);}
  view.release();view.render({chapter:'walk',chapterProgress:.5,time:1,reduced:true});const s=shader();cornBatches(scene)[0].material.onBeforeCompile(s);assert.equal(s.uniforms.cornMotion.value,0);view.dispose();
});
