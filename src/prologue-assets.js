import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

/** Owned optional assets. A released set rejects late arrivals without leaking. */
export function createPrologueAssets({onCar,onCast,onRoad,onMist,deadlineMs=8000,gltfLoader=new GLTFLoader(),textureLoader=new THREE.TextureLoader()}={}){
  const resources=new Set(),timers=new Set();let closed=false;
  const stats={car:'loading',cast:'loading',road:'loading',roadComponents:{map:'loading',normalMap:'loading',roughnessMap:'loading'},mist:'loading',errors:[]};
  function status(name,value){
    if(!name.startsWith('road:')){stats[name]=value;return;}
    stats.roadComponents[name.slice(5)]=value;
    const states=Object.values(stats.roadComponents);
    stats.road=states.includes('fallback')?'fallback':states.every(s=>s==='ready')?'ready':'loading';
  }
  function own(asset){
    if(asset?.isTexture)resources.add(asset);
    asset?.scene?.traverse(o=>{
      if(o.geometry)resources.add(o.geometry);if(o.isSkinnedMesh)resources.add(o.skeleton);
      for(const m of [o.material].flat().filter(Boolean)){resources.add(m);for(const v of Object.values(m))if(v?.isTexture)resources.add(v);}
    });
  }
  function discard(asset){
    const set=new Set();if(asset?.isTexture)set.add(asset);
    asset?.scene?.traverse(o=>{if(o.geometry)set.add(o.geometry);if(o.isSkinnedMesh)set.add(o.skeleton);for(const m of [o.material].flat().filter(Boolean)){set.add(m);for(const v of Object.values(m))if(v?.isTexture)set.add(v);}});
    for(const r of set)r.dispose();
  }
  function load(name,job,accept){
    let expired=false;
    const timer=setTimeout(()=>{expired=true;status(name,'fallback');timers.delete(timer);},deadlineMs);timers.add(timer);
    return job.then(asset=>{
      if(closed||expired){discard(asset);return;}
      own(asset);accept?.(asset);status(name,'ready');
    }).catch(error=>{if(!closed){status(name,'fallback');stats.errors.push(`${name}: ${error.message}`);}})
      .finally(()=>{clearTimeout(timer);timers.delete(timer);});
  }
  const gltf=gltfLoader,texture=textureLoader,url=name=>new URL(`../assets/intro/${name}`,import.meta.url).href;
  // Cast fetch serves both escorts. No network dependency at runtime outside this build.
  load('car',gltf.loadAsync(url('cruiser.glb')),onCar);
  load('cast',gltf.loadAsync(url('cast.glb')),onCast);
  let mapsReady=0;
  for(const [file,key]of [['diff','map'],['nor_gl','normalMap'],['rough','roughnessMap']]){
    load(`road:${key}`,texture.loadAsync(url(`asphalt_${file}.jpg`)),map=>{
      map.colorSpace=key==='map'?THREE.SRGBColorSpace:THREE.NoColorSpace;
      map.wrapS=map.wrapT=THREE.RepeatWrapping;map.repeat.set(3.35,300);map.anisotropy=2;
      onRoad?.(key,map);mapsReady++;stats.roadMaps=mapsReady;
    });
  }
  load('mist',texture.loadAsync(new URL('../assets/field/beacon-mist.png',import.meta.url).href),onMist);
  return {stats,owns:resource=>resources.has(resource),dispose(){if(closed)return;closed=true;for(const timer of timers)clearTimeout(timer);timers.clear();for(const r of resources)r.dispose();resources.clear();}};
}

/** Keep body surfaces rigid; only spin wheel hubs and steer the front assemblies. */
export function prepareCruiser(model){
  model.name='Textured cruiser with complete interior';
  // Source bucket seats sit 80 cm ahead of the game's authored seating origin.
  // Shift the whole shell together before fitting moving parts and the door.
  model.position.z=.8;model.updateMatrixWorld(true);
  const steering=new THREE.Group();steering.name='Driver steering wheel';model.add(steering);
  const parts=[];model.traverse(o=>{if(o.isMesh&&o.name.startsWith('InteriorSteering'))parts.push(o);});
  const wheelParts=parts.filter(o=>o.name.startsWith('InteriorSteeringWheel'));
  const bounds=new THREE.Box3();for(const part of wheelParts)bounds.expandByObject(part);
  const center=bounds.isEmpty()?new THREE.Vector3(0,.8,-.9):bounds.getCenter(new THREE.Vector3());
  steering.position.copy(model.worldToLocal(center.clone()));model.updateMatrixWorld(true);
  for(const part of wheelParts)steering.attach(part);
  // Fit the authored passenger/driver seat coordinates, not the camera to a prop.
  steering.position.set(-.45,.87,-1.41);steering.rotation.x=-.30;
  for(const part of parts.filter(o=>!o.name.startsWith('InteriorSteeringWheel')))part.visible=false;
  const tires=[],all=[];model.traverse(o=>all.push(o));for(const o of all){
    if(o.isMesh&&/Wheel|Tire|Brake/.test(o.name)&&!o.name.startsWith('Interior')){
      const hub=new THREE.Group();const box=new THREE.Box3().setFromObject(o),center=box.getCenter(new THREE.Vector3());
      model.add(hub);hub.position.copy(model.worldToLocal(center.clone()));model.updateMatrixWorld(true);hub.attach(o);
      tires.push({hub,front:center.z<0});
    }
    for(const mat of [o.material].flat().filter(Boolean)){
      if(mat.opacity<1){mat.transparent=true;mat.depthWrite=false;}
      if(mat.name.startsWith('Interior')&&mat.color.r>mat.color.g*1.8)mat.color.setHex(0x303839);
      if(mat.name.startsWith('Paint'))mat.color.setHex(0x555f66);
    }
  }
  // Group the real passenger door around its front hinge. Choose by position
  // because the source L/R names refer to the opposite modelling orientation.
  const passenger=all.filter(o=>o.isMesh&&/^(BodyDoor|InteriorDoor)/.test(o.name)&&new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3()).x>0);
  const door=new THREE.Group();door.name='Passenger door hinge';model.add(door);door.position.set(.86,.45,-1.32);model.updateMatrixWorld(true);
  for(const part of passenger)door.attach(part);
  return {model,steering,tires,door,update(drive,exit=0){door.rotation.y=-exit*1.05;steering.rotation.z=drive.steer*12;for(const {hub,front}of tires){hub.rotation.set(0,front?drive.steer:0,0);hub.rotateX(drive.wheelRoll);}}};
}
