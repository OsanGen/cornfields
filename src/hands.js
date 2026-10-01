import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {clone as cloneSkeleton} from 'three/addons/utils/SkeletonUtils.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {PLAYER_VIEWMODEL as POSE} from './viewmodel-pose.js';
import {applyHandGrip,fitKnifeForearm} from './hand-grip.js';

function disposeAssets(roots,ownedMaterials=[]){
  const resources=new Set(ownedMaterials);
  for(const root of roots)root.traverse(object=>{
    if(object.geometry)resources.add(object.geometry);
    if(object.isSkinnedMesh)resources.add(object.skeleton);
    for(const material of [object.material].flat().filter(Boolean)){
      resources.add(material);for(const value of Object.values(material))if(value?.isTexture)resources.add(value);
    }
  });
  for(const resource of resources)resource.dispose();
}

/** One optional viewmodel, with independent weapon and skin material treatment. */
export function installHands({gun,knife,placeholders,weaponPlaceholders=[],muzzle,renderer,loader=new GLTFLoader(),deadlineMs=8000}){
  const stats={status:'loading',error:null,wear:0,meshes:0,rigged:false,weapon:'Service Pistol',arms:'para / MakeHuman'};
  const roots=[],groups=[],skinMaterials=[],knifeMaterials=[];
  let expired=false,disposed=false,timer,rejectDeadline,previousTime=0,runId=null,slide=null,slideHome=null,environment=null;
  let cleaned=false;
  const cleanup=()=>{
    if(cleaned)return;cleaned=true;
    disposeAssets([...roots,...groups],knifeMaterials);for(const group of groups)group.removeFromParent();environment?.dispose();
  };
  const load=name=>loader.loadAsync(new URL(`../assets/field/${name}`,import.meta.url).href).then(asset=>{
    if(expired){disposeAssets([asset.scene]);return asset;}
    roots.push(asset.scene);return asset;
  });
  const ready=Promise.race([
    Promise.all([load('player-arms.glb'),load('service-pistol.glb')]),
    new Promise((_,reject)=>{rejectDeadline=reject;timer=setTimeout(()=>reject(new Error('Player asset deadline')),deadlineMs);}),
  ]).then(([arms,pistol])=>{
    if(expired)return;
    const right=arms.scene.getObjectByName('RightArm'),left=arms.scene.getObjectByName('LeftArm');
    if(!right||!left||!pistol.scene.getObjectByName('PistolBody'))throw new Error('Player asset missing required nodes');
    if(renderer){
      const pmrem=new THREE.PMREMGenerator(renderer),room=new RoomEnvironment();
      try{environment=pmrem.fromScene(room,.04);}finally{room.dispose();pmrem.dispose();}
    }
    const prepare=(root,skin)=>root.traverse(object=>{
      object.layers.set(1);
      if(!object.isMesh)return;
      object.frustumCulled=false;stats.meshes++;if(object.isSkinnedMesh)stats.rigged=true;
      object.material=object.material.clone();
      object.material.envMap=environment?.texture||null;object.material.envMapIntensity=skin?.22:.4;
      if(skin){object.material.roughness=.68;skinMaterials.push({material:object.material,base:object.material.color.clone()});}
    });
    const attachArm=(source,parent,position,rotation,grasp,side='R')=>{
      const arm=cloneSkeleton(source);applyHandGrip(arm,grasp,side);prepare(arm,true);
      if(grasp==='knife'&&side==='R')fitKnifeForearm(arm);
      const pivot=new THREE.Group();pivot.add(arm);pivot.position.set(...position);pivot.rotation.set(...rotation);parent.add(pivot);groups.push(pivot);return pivot;
    };
    const grip=new THREE.Group();grip.position.set(...POSE.grip);gun.add(grip);groups.push(grip);
    attachArm(right,grip,[0,0,0],[0,0,0],'pistol');
    const weapon=pistol.scene;prepare(weapon,false);weapon.position.set(...POSE.pistol);grip.add(weapon);
    slide=weapon.getObjectByName('PistolSlide');slideHome=slide?.position.clone();
    attachArm(right,knife,POSE.knifeRight.position,POSE.knifeRight.rotation,'knife');
    attachArm(left,knife,POSE.knifeLeft.position,POSE.knifeLeft.rotation,'knife','L');
    for(const object of knife.children)if(object.isMesh&&!placeholders.includes(object)){
      object.material=object.material.clone();object.material.envMap=environment?.texture||null;object.material.envMapIntensity=.4;
      knifeMaterials.push(object.material);
    }
    if(muzzle)muzzle.position.set(...POSE.muzzle);
    [...placeholders,...weaponPlaceholders].forEach(object=>object.visible=false);
    stats.status='ready';
  }).catch(error=>{
    expired=true;cleanup();
    if(!disposed){stats.status='fallback';stats.error=error.message;stats.rigged=false;stats.meshes=0;}
  }).finally(()=>clearTimeout(timer));
  return {ready,stats,update(game,{recoil=0,reduced=false}={}){
    if(disposed)return;
    const target=Math.min(2,game.progress.checkpointIndex)/2;
    if(runId!==game.runId){runId=game.runId;stats.wear=0;previousTime=game.elapsed;}
    const dt=Math.max(0,game.elapsed-previousTime);previousTime=game.elapsed;
    stats.wear+=(target-stats.wear)*(1-Math.exp(-dt*1.5));
    for(const {material,base} of skinMaterials)material.color.copy(base).multiplyScalar(1-stats.wear*.17);
    if(slide){slide.position.copy(slideHome);if(!reduced)slide.position.x-=.028*Math.sin(Math.min(1,recoil/.16)*Math.PI);}
  },dispose(){
    disposed=expired=true;stats.status='disposed';clearTimeout(timer);rejectDeadline(new Error('Player view disposed'));
    cleanup();
  }};
}
