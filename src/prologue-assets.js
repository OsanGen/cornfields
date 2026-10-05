import * as THREE from 'three';
import {createCabinWheel,steeringAngle} from './prologue-cabin.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

/** Owned optional assets. A released set rejects late arrivals without leaking. */
export function createPrologueAssets({onCar,onCast,onRoad,onMist,onWood,onGround,onSky,deadlineMs=8000,gltfLoader=new GLTFLoader(),textureLoader=new THREE.TextureLoader()}={}){
  const resources=new Set(),timers=new Set();let closed=false;
  const stats={car:'loading',cast:'loading',castRoles:{clarence:'loading',stanley:'loading'},road:'loading',roadComponents:{map:'loading',normalMap:'loading',roughnessMap:'loading'},mist:'loading',errors:[]};
  function status(name,value){
    if(name.startsWith('cast:')){
      stats.castRoles[name.slice(5)]=value;
      const roles=Object.values(stats.castRoles);
      stats.cast=roles.includes('fallback')?'fallback':roles.every(state=>state==='ready')?'ready':'loading';
      return;
    }
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
  // Each role owns an independently authored face. A failed role keeps only its
  // own fallback; neither late arrival nor timeout may replace the other actor.
  load('car',gltf.loadAsync(url('cruiser.glb')),onCar);
  for(const role of ['clarence','stanley'])
    load(`cast:${role}`,gltf.loadAsync(url(`cast-${role}.glb`)),gltf=>onCast?.(role,gltf));
  let mapsReady=0;
  for(const [file,key]of [['diff','map'],['nor_gl','normalMap'],['rough','roughnessMap']]){
    load(`road:${key}`,texture.loadAsync(url(`asphalt_${file}.jpg`)),map=>{
      map.colorSpace=key==='map'?THREE.SRGBColorSpace:THREE.NoColorSpace;
      map.wrapS=map.wrapT=THREE.RepeatWrapping;map.repeat.set(3.35,180);map.anisotropy=2;
      onRoad?.(key,map);mapsReady++;stats.roadMaps=mapsReady;
    });
  }
  // Reuse the already-shipped maze timber rather than importing a new pack.
  // Optional: callers without a threshold do not allocate these three maps.
  if(onWood)for(const [file,key]of [['diff','map'],['nor_gl','normalMap'],['rough','roughnessMap']]){
    load(`wood:${key}`,texture.loadAsync(new URL(`../assets/field/wood_planks_dirt_${file}_1k.jpg`,import.meta.url).href),map=>{
      map.colorSpace=key==='map'?THREE.SRGBColorSpace:THREE.NoColorSpace;
      map.wrapS=map.wrapT=THREE.RepeatWrapping;map.repeat.set(5,1.325);map.anisotropy=2;
      onWood(key,map);
    });
  }
  if(onGround)for(const [file,key]of [['diff','map'],['nor_gl','normalMap'],['rough','roughnessMap']])load(`ground:${key}`,texture.loadAsync(new URL(`../assets/field/brown_mud_${file}_1k.jpg`,import.meta.url).href),map=>{
    map.colorSpace=key==='map'?THREE.SRGBColorSpace:THREE.NoColorSpace;map.wrapS=map.wrapT=THREE.RepeatWrapping;map.repeat.set(52,240);map.anisotropy=2;onGround(key,map);
  });
  if(onSky)load('sky',texture.loadAsync(new URL('../assets/field/night-sky.jpg',import.meta.url).href),map=>{map.colorSpace=THREE.SRGBColorSpace;map.wrapS=THREE.RepeatWrapping;map.wrapT=THREE.ClampToEdgeWrapping;onSky(map);});
  load('mist',texture.loadAsync(new URL('../assets/field/beacon-mist.png',import.meta.url).href),onMist);
  return {stats,owns:resource=>resources.has(resource),dispose(){if(closed)return;closed=true;for(const timer of timers)clearTimeout(timer);timers.clear();for(const r of resources)r.dispose();resources.clear();}};
}

/** Keep body surfaces rigid; only spin wheel hubs and steer the front assemblies. */
export function prepareCruiser(model){
  model.name='Textured cruiser with complete interior';
  // Source bucket seats sit 80 cm ahead of the game's authored seating origin.
  // Shift the whole shell together before fitting moving parts and the door.
  model.position.z=.8;model.updateMatrixWorld(true);
  // The source wheel was almost fully embedded in the tall sports-car dash.
  // Retire its mismatched steering parts and fit one complete, shared assembly.
  model.traverse(o=>{if(o.isMesh&&o.name.startsWith('InteriorSteering'))o.visible=false;});
  const {assembly,steering}=createCabinWheel();
  assembly.position.z-=model.position.z;model.add(assembly);
  const tires=[],all=[];model.traverse(o=>all.push(o));for(const o of all){
    if(o.isMesh&&/Wheel|Tire|Brake/.test(o.name)&&!o.name.startsWith('Interior')){
      const hub=new THREE.Group();const box=new THREE.Box3().setFromObject(o),center=box.getCenter(new THREE.Vector3());
      model.add(hub);hub.position.copy(model.worldToLocal(center.clone()));model.updateMatrixWorld(true);hub.attach(o);
      tires.push({hub,front:center.z<0});
    }
    // The source sports-car roll cage crosses the passenger eye/window line.
    // Keep the structural body pillars; omit only this interior racing insert.
    if(o.name==='InteriorCage')o.visible=false;
    if(/^InteriorDash(Mid|Sides)$/.test(o.name)){
      // Compress the tall dashboard around its floorward base; moving just the
      // wheel leaves the passenger sightline blocked by the imported dash.
      o.geometry=o.geometry.clone();const positions=o.geometry.attributes.position;
      const inverse=o.matrixWorld.clone().invert(),p=new THREE.Vector3();
      for(let i=0;i<positions.count;i++){
        p.fromBufferAttribute(positions,i).applyMatrix4(o.matrixWorld);
        p.y=.18+(p.y-.18)*.79;p.z-=.07;p.applyMatrix4(inverse);positions.setXYZ(i,p.x,p.y,p.z);
      }
      positions.needsUpdate=true;o.geometry.computeVertexNormals();o.geometry.computeBoundingBox();o.geometry.computeBoundingSphere();
    }
    if(o.isMesh&&o.name.startsWith('Body')&&!/Door|Wheel|Tire|Brake|Windshield/.test(o.name)){
      // Reshape only exterior bonnet/rear-deck vertices in world coordinates.
      // Cabin apertures, wheel centres and both door hinge meshes stay intact.
      o.geometry=o.geometry.clone();const attr=o.geometry.attributes.position,inv=o.matrixWorld.clone().invert(),v=new THREE.Vector3();
      for(let n=0;n<attr.count;n++){
        v.fromBufferAttribute(attr,n).applyMatrix4(o.matrixWorld);
        if(o.name==='BodyHood'&&v.z<-.75){const front=Math.min(1,(-v.z-.75)/.85);v.z-=front*.16;if(v.y>.78)v.y=Math.min(v.y,.97-front*.075);}
        if(v.z>1.7&&v.y>.82)v.y=Math.min(v.y,1.35-(v.z-1.65)*.48);
        v.applyMatrix4(inv);attr.setXYZ(n,v.x,v.y,v.z);
      }attr.needsUpdate=true;o.geometry.computeVertexNormals();o.geometry.computeBoundingBox();o.geometry.computeBoundingSphere();
    }
    if(o.isMesh){const list=[o.material].flat().map(m=>m.name.startsWith('Paint')?m.clone():m);o.material=Array.isArray(o.material)?list:list[0];}
    for(const mat of [o.material].flat().filter(Boolean)){
      if(mat.opacity<1){mat.transparent=true;mat.depthWrite=false;}
      if(mat.name.startsWith('Interior')&&mat.color.r>mat.color.g*1.8)mat.color.setHex(0x303839);
      if(mat.name.startsWith('Paint'))mat.color.setHex(/Door/.test(o.name)?0xd9ddd6:0x151d20);
    }
  }
  // Group the real passenger door around its front hinge. Choose by position
  // because the source L/R names refer to the opposite modelling orientation.
  const passenger=all.filter(o=>o.isMesh&&/^(BodyDoor|InteriorDoor)/.test(o.name)&&new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3()).x>0);
  const door=new THREE.Group();door.name='Passenger door hinge';model.add(door);door.position.set(.86,.45,-1.32);model.updateMatrixWorld(true);
  for(const part of passenger)door.attach(part);
  const driverParts=all.filter(o=>o.isMesh&&/^(BodyDoor|InteriorDoor)/.test(o.name)&&new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3()).x<0);
  const driverDoor=new THREE.Group();driverDoor.name='Driver door hinge';model.add(driverDoor);driverDoor.position.set(-.86,.45,-1.32);model.updateMatrixWorld(true);
  for(const part of driverParts)driverDoor.attach(part);
  // Original restrained police details, fitted outside the retained cabin anchors.
  const black=new THREE.MeshStandardMaterial({name:'Municipal sedan charcoal',color:0x11191d,roughness:.44,metalness:.36});
  const addBox=(name,w,h,d,x,y,z,material=black)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);m.name=name;m.position.set(x,y,z-model.position.z);model.add(m);return m;};
  addBox('Sedan restrained front bumper',1.73,.085,.10,0,.52,-1.72);
  addBox('Sedan rear trunk deck',1.65,.045,.52,0,.96,2.30);
  for(const side of [-1,1])for(const axle of [-.70,2.10]){
    addBox('Squared municipal wheel arch top',.036,.038,.70,side*1.10,.925,axle);
    for(const end of [-1,1])addBox('Squared municipal wheel arch upright',.036,.26,.038,side*1.10,.79,axle+end*.35);
  }
  const bar=addBox('Unlit police lightbar mount',1.27,.055,.26,0,1.50,.85);
  for(const side of [-1,1])addBox('Unlit police lightbar lens',.47,.085,.20,side*.34,1.565,.85,new THREE.MeshStandardMaterial({color:side<0?0x5b1920:0x183b5c,roughness:.25,metalness:.1}));
  if(typeof document!=='undefined'){
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;const ctx=canvas.getContext('2d');ctx.fillStyle='#d9ddd6';ctx.fillRect(0,0,512,128);ctx.fillStyle='#111b24';ctx.font='bold 84px sans-serif';ctx.textAlign='center';ctx.fillText?.('POLICE',256,94);
    const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;
    for(const [panel,sign]of [[door,1],[driverDoor,-1]]){const marking=new THREE.Mesh(new THREE.PlaneGeometry(.81,.20),new THREE.MeshStandardMaterial({map,roughness:.62}));marking.name='Original unbranded POLICE door marking';marking.rotation.y=sign*Math.PI/2;marking.position.set(sign*.275,.30,.73);panel.add(marking);}
  }
  // Both panels extend rearward (+Z) from their front hinges: opposite Y signs
  // move them outward on their own side, rather than through the cabin.
  return {model,steering,tires,door,driverDoor,update(drive,exit=0){door.rotation.y=exit*1.05;driverDoor.rotation.y=-exit*1.05;steering.rotation.z=steeringAngle(drive.steer);for(const {hub,front}of tires){hub.rotation.set(0,front?drive.steer:0,0);hub.rotateX(drive.wheelRoll);}}};
}
