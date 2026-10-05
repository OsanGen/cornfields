import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {clone as cloneSkeleton} from 'three/addons/utils/SkeletonUtils.js';
import {attachZombieModel} from './zombie.js';
import {attachLiquidMaterial} from './liquid-material.js';
import {ease} from './prologue-performance.js';
/** Render-only states; never enter the combat actor registry. */
export function sampleHallucination(frame={}){
 const active=frame.chapter==='undead',t=Math.max(0,frame.chapterTime||0),reduced=!!frame.reduced;
 if(!active)return {active:false,bridge:0,zombie:0,blink:0,restored:true};
 const blink=ease(t,3.5,3.75)*(1-ease(t,3.95,4.25)),restored=t>=3.85;
 const zombie=restored?0:ease(t,.3,1.5),bridge=restored?0:ease(t,.1,.8)*(1-ease(t,1.5,2));
 return {active:true,bridge:bridge*(reduced?.22:1),zombie,blink,restored};
}
export function createPrologueHallucination(parent,{loader=new GLTFLoader(),enabled=true}={}){
 const roots=[new THREE.Group(),new THREE.Group()],actors=[],uniforms=[];
 roots.forEach((r,i)=>{r.name=`Render-only hallucination zombie ${i+1}`;r.visible=false;parent.add(r);});
 let disposed=false,expired=false;const stats={status:enabled?'loading':'unloaded',count:2,combatActors:0};
 const disposeSource=g=>g.scene.traverse(o=>{o.geometry?.dispose();for(const m of [o.material].flat().filter(Boolean)){for(const v of Object.values(m))if(v?.isTexture)v.dispose();m.dispose();}});
 const timer=enabled?setTimeout(()=>{expired=true;stats.status='unavailable';},8000):null;
 const ready=enabled?loader.loadAsync(new URL('../assets/field/zombie.glb',import.meta.url).href).then(gltf=>{
  if(disposed||expired){disposeSource(gltf);return;}clearTimeout(timer);
  for(let i=0;i<2;i++){
   const model=cloneSkeleton(gltf.scene);model.traverse(o=>{if(!o.isMesh)return;o.geometry=o.geometry.clone();o.material=[o.material].flat().map(m=>m.clone());if(o.material.length===1)o.material=o.material[0];});
   const actor=attachZombieModel(roots[i],{...gltf,scene:model},{primary:false,cinematic:true});actors.push(actor);
   // Match the familiar escort height while retaining the established enemy rig.
   roots[i].scale.setScalar(1.80/2.32);
   const row=[];model.traverse(o=>{for(const m of [o.material].flat().filter(Boolean))if(m.isMeshStandardMaterial){const u=attachLiquidMaterial(m);u.incoming.value=1;row.push(u);}});uniforms.push(row);
  }
  // Clones own geometry/materials; textures are retained until both are released.
  gltf.scene.traverse(o=>{o.geometry?.dispose();for(const m of [o.material].flat().filter(Boolean))m.dispose();});stats.status='ready';
 }).catch(error=>{clearTimeout(timer);if(!disposed){stats.status='unavailable';stats.error=String(error.message);}}):Promise.resolve();
 return {roots,ready,stats,update(frame,humans){
  const s=sampleHallucination(frame);
  roots.forEach((root,i)=>{const human=humans[i];root.position.copy(human.root.position);root.quaternion.copy(human.root.quaternion);root.visible=s.zombie>0&&!!actors[i];
   actors[i]?.update({id:`vision-${i}`,state:'detection_tell',stateStartedAt:0,x:0,z:0},Math.max(.2,frame.chapterTime||0),{reduced:frame.reduced});
   for(const u of uniforms[i]||[]){u.time.value=frame.chapterTime||0;u.amount.value=s.bridge;u.handover.value=s.zombie;}
  });return s;
 },dispose(){disposed=true;clearTimeout(timer);for(const a of actors)a.dispose();for(const root of roots)root.removeFromParent();stats.status='disposed';}};
}
