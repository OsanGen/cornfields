import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';import{load}from'../scripts/load-glb-cpu.mjs';import{createTexturedPrologueActor}from'../src/prologue-model-actor.js';
const cast=await load(new URL('../assets/intro/cast.glb',import.meta.url));
const points=(actor,mesh)=>{actor.root.updateMatrixWorld(true);mesh.skeleton.update();return Array.from({length:mesh.geometry.attributes.position.count},(_,i)=>mesh.localToWorld(mesh.getVertexPosition(i,new T.Vector3())).toArray());};
test('unrelated jaw, eye, and upper-arm controls cannot deform ears or shirt on either clone',()=>{
 for(const police of [true,false]){const actor=createTexturedPrologueActor({gltf:cast,police});actor.pose({mode:'standing'});
  for(const[meshName,boneName,axis,amount]of[['shirt','mouth','x',.1],['ear','armupL','x',.5],['ear001','armupR','x',.5],['ear','eyeL','y',.18]]){
   const mesh=actor.root.getObjectByName(meshName),bone=actor.root.getObjectByName(boneName),before=points(actor,mesh),q=bone.quaternion.clone();bone.rotation[axis]+=amount;assert.deepEqual(points(actor,mesh),before,`${meshName} must not follow ${boneName}`);bone.quaternion.copy(q);
  }actor.dispose();
 }
});
test('all cast skin weights remain finite normalized non-negative four-weight inputs',()=>{
 cast.scene.traverse(o=>{if(!o.isSkinnedMesh)return;const w=o.geometry.attributes.skinWeight;assert.equal(w.itemSize,4);for(let i=0;i<w.count;i++){let sum=0;for(let c=0;c<4;c++){const v=w.getComponent(i,c);assert(Number.isFinite(v)&&v>=0&&v<=1);sum+=v;}assert(Math.abs(sum-1)<2e-7,`${o.name} ${i}: ${sum}`);}});
});
test('ear UVs use only the matching existing head-atlas ear patch',()=>{
 for(const name of['ear','ear001']){const uv=cast.scene.getObjectByName(name).geometry.attributes.uv;assert.equal(uv.count,52);for(let i=0;i<uv.count;i++){assert(uv.getX(i)>=67/512-1e-7&&uv.getX(i)<=120/512+1e-7);assert(uv.getY(i)>=350/512-1e-7&&uv.getY(i)<=429/512+1e-7);}}
});
test('face material clones retain source map ownership and isolate character tint',()=>{
 const atlas=new T.Texture();let disposed=0;atlas.addEventListener('dispose',()=>disposed++);const source=cast.scene.getObjectByName('ear').material,previous=source.map;source.map=atlas;
 const a=createTexturedPrologueActor({gltf:cast}),b=createTexturedPrologueActor({gltf:cast,police:false});const am=a.root.getObjectByName('ear').material,bm=b.root.getObjectByName('ear').material;
 assert.notEqual(am,bm);assert.notEqual(am,source);assert.equal(am.map,atlas);assert.equal(bm.map,atlas);assert.equal(am.roughness,.67);assert.equal(a.root.getObjectByName('eye0').material.roughness,.30);assert.equal(source.roughness,Math.fround(.78));
 a.pose({corpse:true});b.pose({});assert.notEqual(am.color.getHex(),bm.color.getHex());a.pose({});assert.equal(am.color.getHex(),bm.color.getHex());a.dispose();b.dispose();assert.equal(disposed,0,'actor never disposes shared atlas');atlas.dispose();assert.equal(disposed,1);source.map=previous;
});
test('talking, full blink, eye look, restart and extreme steering retain finite visible vertices',()=>{
 for(const police of[true,false]){const actor=createTexturedPrologueActor({gltf:cast,police});
  for(const pose of[{speaking:true,performance:{lineId:'car_clarence_nervous',lineOffset:.13}},{performance:{blink:1}},{look:-.72,performance:{eyeLook:-.18}},{look:.72,performance:{eyeLook:.18}},{mode:'drive',steer:-.12,time:8},{mode:'drive',steer:.12,time:8},{mode:'standing'}]){actor.pose(pose);actor.root.traverse(o=>{if(o.isSkinnedMesh)assert(points(actor,o).flat().every(Number.isFinite));});}
  actor.pose({performance:{blink:0}});const lids=[];actor.root.traverse(o=>{if(o.name.startsWith('Fitted '))lids.push(o);});assert.equal(lids.length,4);const open=lids.map(o=>Array.from(o.geometry.attributes.position.array));actor.pose({performance:{blink:1}});assert.notDeepEqual(lids.map(o=>Array.from(o.geometry.attributes.position.array)),open);actor.pose({performance:{blink:0}});assert.deepEqual(lids.map(o=>Array.from(o.geometry.attributes.position.array)),open);actor.dispose();
 }
});
// 2026-10-05 v2: preserve the exact inherited cast check separately from
// the explicitly approved added uniform details (covered by identity/budget tests).
test('same-rig repair keeps exact underlying cast triangles, mesh submissions, materials and joints',()=>{
 const actor=createTexturedPrologueActor({gltf:cast,uniformDetails:false});actor.pose({});let triangles=0,meshes=0;const mats=new Set(),bones=new Set();actor.root.traverse(o=>{if(o.isBone)bones.add(o);if(o.isMesh){meshes++;triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;mats.add(o.material);}});assert.equal(triangles,4939);assert.equal(meshes,14);assert.equal(mats.size,11);assert.equal(bones.size,56);actor.dispose();
});

// Repeat the same deformation, normalization, UV, ownership and expression
// safeguards on the actual role exports, not two clones of the baseline face.
for(const file of ['cast-clarence.glb','cast-stanley.glb']){
 const cast=await load(new URL('../assets/intro/'+file,import.meta.url));
test(file+': unrelated jaw, eye, and upper-arm controls cannot deform ears or shirt on either clone',()=>{
 for(const police of [true,false]){const actor=createTexturedPrologueActor({gltf:cast,police});actor.pose({mode:'standing'});
  for(const[meshName,boneName,axis,amount]of[['shirt','mouth','x',.1],['ear','armupL','x',.5],['ear001','armupR','x',.5],['ear','eyeL','y',.18]]){
   const mesh=actor.root.getObjectByName(meshName),bone=actor.root.getObjectByName(boneName),before=points(actor,mesh),q=bone.quaternion.clone();bone.rotation[axis]+=amount;assert.deepEqual(points(actor,mesh),before,`${meshName} must not follow ${boneName}`);bone.quaternion.copy(q);
  }actor.dispose();
 }
});
test(file+': all cast skin weights remain finite normalized non-negative four-weight inputs',()=>{
 cast.scene.traverse(o=>{if(!o.isSkinnedMesh)return;const w=o.geometry.attributes.skinWeight;assert.equal(w.itemSize,4);for(let i=0;i<w.count;i++){let sum=0;for(let c=0;c<4;c++){const v=w.getComponent(i,c);assert(Number.isFinite(v)&&v>=0&&v<=1);sum+=v;}assert(Math.abs(sum-1)<2e-7,`${o.name} ${i}: ${sum}`);}});
});
test(file+': retopologized ears retain bounded topology and separate matching atlas islands',()=>{
 for(const[name,u0]of[['ear',.805],['ear001',.905]]){const g=cast.scene.getObjectByName(name).geometry,uv=g.attributes.uv;assert.equal(uv.count,540);assert.equal(uv.count,g.attributes.position.count);assert.equal(g.index.count,540);for(let i=0;i<uv.count;i++){assert(Number.isFinite(uv.getX(i))&&Number.isFinite(uv.getY(i)));assert(uv.getX(i)>=u0-1e-7&&uv.getX(i)<=u0+.075+1e-7);assert(uv.getY(i)>=.03-1e-7&&uv.getY(i)<=.49+1e-7);}}
});
test(file+': face material clones retain source map ownership and isolate character tint',()=>{
 const atlas=new T.Texture();let disposed=0;atlas.addEventListener('dispose',()=>disposed++);const source=cast.scene.getObjectByName('ear').material,previous=source.map,sourceRoughness=source.roughness;assert.equal(sourceRoughness,1,'packed PBR surface uses its authored unit factor');source.map=atlas;
 const a=createTexturedPrologueActor({gltf:cast}),b=createTexturedPrologueActor({gltf:cast,police:false});const am=a.root.getObjectByName('ear').material,bm=b.root.getObjectByName('ear').material;
 assert.notEqual(am,bm);assert.notEqual(am,source);assert.equal(am.map,atlas);assert.equal(bm.map,atlas);assert.equal(am.roughness,.67);assert.equal(a.root.getObjectByName('eye0').material.roughness,.30);assert.equal(source.roughness,sourceRoughness,'cloning preserves the authored source factor');
 a.pose({corpse:true});b.pose({});assert.notEqual(am.color.getHex(),bm.color.getHex());a.pose({});assert.equal(am.color.getHex(),bm.color.getHex());a.dispose();b.dispose();assert.equal(disposed,0,'actor never disposes shared atlas');atlas.dispose();assert.equal(disposed,1);source.map=previous;
});
test(file+': talking, full blink, eye look, restart and extreme steering retain finite visible vertices',()=>{
 for(const police of[true,false]){const actor=createTexturedPrologueActor({gltf:cast,police});
  for(const pose of[{speaking:true,performance:{lineId:'car_clarence_nervous',lineOffset:.13}},{performance:{blink:1}},{look:-.72,performance:{eyeLook:-.18}},{look:.72,performance:{eyeLook:.18}},{mode:'drive',steer:-.12,time:8},{mode:'drive',steer:.12,time:8},{mode:'standing'}]){actor.pose(pose);actor.root.traverse(o=>{if(o.isSkinnedMesh)assert(points(actor,o).flat().every(Number.isFinite));});}
  actor.pose({performance:{blink:0}});const lids=[];actor.root.traverse(o=>{if(o.name.startsWith('Fitted '))lids.push(o);});assert.equal(lids.length,4);const open=lids.map(o=>Array.from(o.geometry.attributes.position.array));actor.pose({performance:{blink:1}});assert.notDeepEqual(lids.map(o=>Array.from(o.geometry.attributes.position.array)),open);actor.pose({performance:{blink:0}});assert.deepEqual(lids.map(o=>Array.from(o.geometry.attributes.position.array)),open);actor.dispose();
 }
});

}
