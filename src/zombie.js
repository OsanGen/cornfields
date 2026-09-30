import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {optionalAsset,stripRootTravel} from './asset-safety.js';

export async function installZombie(enemy){
  const gltf=await optionalAsset(new GLTFLoader().loadAsync(new URL('../assets/field/zombie.glb',import.meta.url).href),8000,late=>{
    late.scene.traverse(o=>{if(o.isMesh){o.geometry.dispose();for(const m of [].concat(o.material)){for(const v of Object.values(m))if(v?.isTexture)v.dispose();m.dispose();}}});
  });
  const model=gltf.scene;
  model.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(new THREE.Vector3());
  const scale=2.32/size.y;
  const centered=new THREE.Group();centered.add(model);centered.scale.setScalar(scale);
  // The source faces -X; the game's enemy heading expects forward to be +Z.
  centered.rotation.y=Math.PI/2;
  model.position.x-=(bounds.min.x+bounds.max.x)/2;
  model.position.y-=bounds.min.y;
  model.position.z-=(bounds.min.z+bounds.max.z)/2;
  model.traverse(object=>{
    if(object.isMesh){object.frustumCulled=false;object.castShadow=false;object.receiveShadow=false;}
  });
  const mixer=new THREE.AnimationMixer(model);
  const clip=gltf.animations[0];
  if(clip){
    // Keep navigation authoritative: discard horizontal root travel, retain the lurch.
    stripRootTravel(clip,['Bip01']);
    mixer.clipAction(clip).play();
  }
  for(const child of enemy.children)child.visible=false;
  enemy.add(centered);
  let previous=0;
  return {update(game,time){
    const dt=Math.max(0,Math.min(.05,time-previous));previous=time;
    if(!enemy.visible)return;
    const state=game.enemy.state;
    mixer.timeScale=state==='staggered'?.1:['rage_chase','corn_rush'].includes(state)?2.05:state==='chase'?1.65:.72;
    centered.rotation.z=state==='staggered'?-1.2:state==='flashlight_recoil'?.3:0;
    centered.position.y=state==='staggered'?.18:0;
    mixer.update(dt);
  }};
}
