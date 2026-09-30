import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {optionalAsset, stripRootTravel} from './asset-safety.js';
import {createZombiePoses} from './zombie-poses.js';

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
    eye.position.set(1.90, 1.41, side * .43 - .055);
    eye.scale.set(.10, .09, .16);
    head.add(eye);
    return eye;
  });
  const clip = gltf.animations[0]?.clone();
  if (clip) stripRootTravel(clip, ['Bip01']);
  // Explicit sampling avoids mixer caches skipping writes after procedural poses.
  const channels = (clip?.tracks || []).map(track => {
    const split = track.name.lastIndexOf('.');
    return {target:model.getObjectByName(track.name.slice(0, split)),
      property:track.name.slice(split + 1), sample:track.createInterpolant()};
  }).filter(channel => channel.target && ['position', 'quaternion', 'scale'].includes(channel.property));
  for (const child of enemy.children) if (child !== centered) child.visible = false;
  let previousTime = null, previousState = '', previousPosition = null, clipTime = 0;

  return {
    model,
    update(subject, time, suppliedGame) {
      const game = suppliedGame || (subject?.enemy ? subject : {enemy:subject});
      const state = game.enemy;
      const signature = `${state.state}:${state.stateStartedAt}:${game.interaction?.phase}:${game.interaction?.presses}`;
      if (!Number.isFinite(time) || (time === previousTime && signature === previousState)) return;
      if (previousTime !== null && time < previousTime) {
        clipTime = 0;
        previousPosition = null;
        poses.resetCycle();
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
      for (const channel of channels) channel.target[channel.property].fromArray(channel.sample.evaluate(clipTime % (clip.duration || 1)));
      model.updateWorldMatrix(false, true);
      const presentation = poses.update(state, time, game, travelled);
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
        sourceClips:clip ? [clip.name] : [], externalClipsIntegrated:false};
    },
    dispose() {
      centered.removeFromParent();
      disposeModel(model);
    },
  };
}

export async function installZombie(enemy) {
  const gltf = await optionalAsset(new GLTFLoader().loadAsync(
    new URL('../assets/field/zombie.glb', import.meta.url).href), 8000,
  late => disposeModel(late.scene));
  return attachZombieModel(enemy, gltf);
}
