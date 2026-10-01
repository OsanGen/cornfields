import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {clone as cloneSkeleton} from 'three/addons/utils/SkeletonUtils.js';
import {optionalAsset} from './asset-safety.js';
import {createZombiePoses} from './zombie-poses.js';
import {createZombieAnimation} from './zombie-animation.js';

function disposeModel(model) {
  model.traverse(object => {
    if (!object.isMesh) return;
    object.geometry.dispose();
    for (const material of [].concat(object.material)) {
      for (const value of Object.values(material)) if (value?.isTexture) value.dispose();
      material.dispose();
    }
  });
}

/** Reusable adapter also exercised with the real rig by the headless pose tests. */
export function attachZombieModel(enemy, gltf) {
  const model = gltf.scene;
  model.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model);
  const size = bounds.getSize(new THREE.Vector3());
  const centered = new THREE.Group();
  centered.name = 'Pixelhouse creature presentation';
  centered.add(model);
  centered.scale.setScalar(2.32 / size.y);
  // Source faces -X. Only this permanent coordinate conversion rotates the model.
  centered.rotation.y = Math.PI / 2;
  model.position.x -= (bounds.min.x + bounds.max.x) / 2;
  model.position.y -= bounds.min.y;
  model.position.z -= (bounds.min.z + bounds.max.z) / 2;
  model.traverse(object => {
    if (object.isMesh) {
      object.frustumCulled = false;
      object.castShadow = false;
      object.receiveShadow = false;
    }
  });
  enemy.add(centered);
  const poses = createZombiePoses(model, enemy);
  const head = poses.bone('Head');
  const eyeGeometry = new THREE.SphereGeometry(1, 10, 6);
  const eyeMaterial = new THREE.MeshBasicMaterial({color:0xe2eee1, toneMapped:false, depthTest:true, depthWrite:true});
  const eyes = [-1, 1].map((side, index) => {
    const eye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    eye.name = index ? 'Creature right eye' : 'Creature left eye';
    // Bip01 head axes: +X crown, +Y face, +/-Z left/right.
    // Face-surface sampling places these just outside the eyelid geometry.
    eye.position.set(1.35, 1.48, side * .43 - .055);
    eye.scale.set(.085, .08, .13);
    head.add(eye);
    return eye;
  });
  const animation=createZombieAnimation(model,gltf.animations);
  let trial=null;
  for (const child of enemy.children) if (child !== centered) child.visible = false;
  let previousTime = null, previousState = '', previousPosition = null, clipTime = 0,previousOwner=null;

  return {
    model,
    trial(name){trial=name;previousTime=null;animation.reset();},
    update(subject, time, suppliedGame) {
      const game = suppliedGame || (subject?.enemy ? subject : {enemy:subject});
      const state = game.enemy;
      const owner=`${game.runId??0}:${state.id??'enemy'}`;
      if(previousOwner!==owner){previousTime=null;previousPosition=null;clipTime=0;poses.resetCycle();animation.reset();previousOwner=owner;}
      const signature = `${state.state}:${state.stateStartedAt}:${game.interaction?.phase}:${game.interaction?.presses}`;
      if (!Number.isFinite(time) || (time === previousTime && signature === previousState)) return;
      if (previousTime !== null && time < previousTime) {
        clipTime = 0;
        previousPosition = null;
        poses.resetCycle();
        animation.reset();
      }
      const dt = previousTime === null ? 0 : Math.max(0, time - previousTime);
      const travelled = previousPosition && dt > 0
        ? Math.min(2, Math.hypot(state.x - previousPosition.x, state.z - previousPosition.z)) : 0;
      previousPosition = {x:state.x, z:state.z};
      previousTime = time;
      previousState = signature;
      // In-place clip follows distance, preventing walk-in-place during listening.
      clipTime += travelled * (state.state === 'chase' ? .8 : 1.1);
      poses.reset();
      animation.update({state,game,time,walkTime:clipTime,travelled,dt,trial});
      model.updateWorldMatrix(false, true);
      const presentation = trial?{name:'trial',eyes:'white',age:0}:poses.update(state, time, game, travelled);
      const colors = {white:0xdfedda, dim:0x243025, red:0xff170c, burst:0xff4130, off:0x000000};
      eyeMaterial.color.setHex(colors[presentation.eyes]);
      for (const [index, eye] of eyes.entries()) eye.visible = presentation.eyes !== 'off' &&
        !(index === 0 && presentation.name === 'stab' && presentation.age > .08);
    },
    getEyeWorld(side = 'left', target = new THREE.Vector3()) {
      return eyes[side === 'right' ? 1 : 0].getWorldPosition(target);
    },
    diagnostics() {
      return {...poses.diagnostics(), eyeWorldLeft:eyes[0].getWorldPosition(new THREE.Vector3()).toArray(),
        eyeWorldRight:eyes[1].getWorldPosition(new THREE.Vector3()).toArray(),
        sourceClips:gltf.animations.map(clip=>clip.name), externalClipsIntegrated:gltf.animations.length>1,animation:animation.snapshot(),trial};
    },
    dispose() {
      centered.removeFromParent();
      disposeModel(model);
    },
  };
}

export async function installZombie(enemy,additional=[]) {
  const clips=loadClips();
  const gltf = await optionalAsset(new GLTFLoader().loadAsync(
    new URL('../assets/field/zombie.glb', import.meta.url).href), 8000,
  late => disposeModel(late.scene));
  gltf.animations.push(...await clips);
  const copies=additional.map(group=>attachZombieModel(group,{...gltf,scene:cloneSkeleton(gltf.scene)}));
  return {...attachZombieModel(enemy,gltf),copies};
}

async function loadClips(){
  const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),3000);
  try{
    const response=await fetch(new URL('../assets/field/zombie-clips.json',import.meta.url),{signal:abort.signal});
    if(!response.ok)throw new Error('Optional animation bank unavailable');
    const bank=await response.json();
    if(bank.schema!==1||bank.clips.length>4)throw new Error('Unsupported animation bank');
    return bank.clips.map(data=>{const clip=THREE.AnimationClip.parse(data);if(!clip.validate())throw new Error('Invalid animation');return clip;});
  }catch{return [];}
  finally{clearTimeout(timer);}
}
