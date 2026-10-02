import * as THREE from 'three';
import {clone as cloneSkeleton} from 'three/addons/utils/SkeletonUtils.js';
import {createPrologueActor} from './prologue-actors.js';

export const TEXTURED_CAST_PROVENANCE = 'NPC male Steve by supersteve, CC0; fitted and animated for the Cornfields prologue';
const TAU = Math.PI * 2;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const mod = (value, period) => ((value % period) + period) % period;

// Set a bone in world space without making it depend on the actor's scene parent.
function worldRotation(bone, rotation) {
  const parent = bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
  bone.quaternion.copy(parent.multiply(rotation));
  bone.updateWorldMatrix(false, true);
}

function aimBone(bone, from, to) {
  const rotation = new THREE.Quaternion().setFromUnitVectors(from.normalize(), to.normalize());
  worldRotation(bone, rotation.multiply(bone.getWorldQuaternion(new THREE.Quaternion())));
}

function decayMaterial(material, decay) {
  const compile = material.onBeforeCompile;
  const key = material.customProgramCacheKey.bind(material);
  material.onBeforeCompile = function(shader, renderer) {
    compile.call(this, shader, renderer);
    shader.uniforms.prologueDecay = decay;
    shader.vertexShader = 'varying vec3 vPrologueCastBody;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvPrologueCastBody=position;');
    shader.fragmentShader = 'uniform float prologueDecay; varying vec3 vPrologueCastBody;\n' + shader.fragmentShader.replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
      vec3 cell=floor(vPrologueCastBody*24.);
      float grain=fract(sin(dot(cell,vec3(17.13,71.7,43.9)))*43758.5453);
      if(prologueDecay>0.&&grain<prologueDecay)discard;`);
  };
  material.customProgramCacheKey = () => `${key()}:prologue-textured-decay-v1`;
}

/** Clone a preloaded cast. Geometry/textures belong to the scene's asset owner. */
export function createTexturedPrologueActor({name = 'Clarence', police = true, gltf, onMaterial} = {}) {
  if (!gltf?.scene || !gltf.animations?.some(clip => clip.name === 'Walk')) {
    const fallback = createPrologueActor({name, police});
    const materials = new Set();
    fallback.root.traverse(object => {
      for (const material of [].concat(object.material || [])) materials.add(material);
    });
    for (const material of materials) onMaterial?.(material);
    return {...fallback, dispose() {}};
  }

  const root = new THREE.Group(); root.name = `Prologue ${name}`;
  const fit = new THREE.Group(); root.add(fit);
  const model = cloneSkeleton(gltf.scene); fit.add(model);
  model.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model);
  const height = bounds.max.y - bounds.min.y;
  const scale = 1.8 / Math.max(.01, height);
  model.scale.multiplyScalar(scale);
  model.position.y -= bounds.min.y * scale;

  const materials = new Map(), skeletons = new Set(), bones = new Map(), decay = {value:0};
  model.traverse(object => {
    if (object.isBone) bones.set(object.name.replaceAll('.', ''), object);
    if (object.isSkinnedMesh) {
      skeletons.add(object.skeleton);
      // The source clip bounds differ significantly between standing and seated.
      object.frustumCulled = false;
    }
    if (!object.material) return;
    const copies = [].concat(object.material).map(source => {
      if (!materials.has(source)) {
        const material = source.clone();
        const skin = /head|cheek|ear|arms/i.test(source.name);
        if(/ear/i.test(source.name)){material.map=null;material.color.setHex(0xc6a18b);}
        if (/shirt|pants/i.test(source.name)) material.color.multiply(new THREE.Color(police ? 0x70829c : 0xb5a48c));
        onMaterial?.(material);
        decayMaterial(material, decay);
        materials.set(source, {material, color:material.color.clone(), skin});
      }
      return materials.get(source).material;
    });
    object.material = Array.isArray(object.material) ? copies : copies[0];
  });
  const clips = new Map(gltf.animations.map(clip => [clip.name, clip]));
  const mixer = new THREE.AnimationMixer(model);
  let action = null, clipName = null, lastPose = 'standing', lastCorpse = false, disposed = false;
  const head = bones.get('head'), mouth = bones.get('mouth'), torso = bones.get('torso');
  const headTilt = new THREE.Quaternion(), actorRotation = new THREE.Quaternion();
  const arms = ['L', 'R'].map((side, index) => ({
    side, sign:index ? -1 : 1,
    upper:bones.get(`armup${side}`), lower:bones.get(`armlo${side}`), hand:bones.get(`hand${side}`),
    fingers:[`f1${side}`, `f2${side}`, `f1${side}002`, `f2${side}002`].map(id => bones.get(id)).filter(Boolean),
  }));
  const wristTargets = [];
  // AnimationMixer skips unchanged channels. Restore its last sampled pose before
  // applying the next sample so procedural head/hand offsets never accumulate.
  const sampled = [...bones.values()].map(bone => ({bone, position:bone.position.clone(), quaternion:bone.quaternion.clone(), scale:bone.scale.clone()}));

  function sample(name, seconds) {
    const clip = clips.get(name) || clips.get('Walk');
    if (clipName !== clip.name) {
      action?.stop();
      action = mixer.clipAction(clip).reset().play();
      clipName = clip.name;
    }
    action.time = mod(seconds, clip.duration || 1);
    // Absolute sampling preserves seeks, pause, reduced motion, and footstep phase.
    mixer.update(0);
  }

  function holdWheel(steer) {
    root.updateWorldMatrix(true, true);
    wristTargets.length = 0;
    for (const arm of arms) {
      if (!arm.upper || !arm.lower || !arm.hand) continue;
      const {upper, lower, hand, sign} = arm;
      const a = upper.getWorldPosition(new THREE.Vector3());
      const b = lower.getWorldPosition(new THREE.Vector3());
      const c = hand.getWorldPosition(new THREE.Vector3());
      const lowerRotation = lower.getWorldQuaternion(new THREE.Quaternion());
      const lowerAxis = c.clone().sub(b).applyQuaternion(lowerRotation.clone().invert()).normalize();
      const lengthA = a.distanceTo(b), lengthB = b.distanceTo(c);
      const wheelAngle = clamp(steer * 12, -1.2, 1.2);
      const local = new THREE.Vector3(sign * .145, 1.30, .70);
      local.sub(new THREE.Vector3(0, 1.25, .70)).applyAxisAngle(new THREE.Vector3(0, 0, 1), -wheelAngle).add(new THREE.Vector3(0, 1.25, .70));
      const target = root.localToWorld(local.clone());
      const direction = target.clone().sub(a), distance = direction.length();
      direction.normalize();
      const reach = clamp(distance, .01, Math.max(.011, lengthA + lengthB - .0001));
      const along = clamp((lengthA * lengthA - lengthB * lengthB + reach * reach) / (2 * reach), -lengthA, lengthA);
      const bend = root.localToWorld(new THREE.Vector3(sign * .34, 1.00, .38)).sub(a);
      bend.addScaledVector(direction, -bend.dot(direction)).normalize();
      const elbow = a.clone().addScaledVector(direction, along).addScaledVector(bend, Math.sqrt(Math.max(0, lengthA * lengthA - along * along)));
      aimBone(upper, b.clone().sub(a), elbow.clone().sub(a));
      const actualElbow = lower.getWorldPosition(new THREE.Vector3());
      const currentAxis = lowerAxis.applyQuaternion(lower.getWorldQuaternion(new THREE.Quaternion()));
      aimBone(lower, currentAxis, target.clone().sub(actualElbow));
      hand.position.copy(hand.parent.worldToLocal(target.clone()));
      const fingerDirection = new THREE.Vector3(-sign * .87, -.35, .15).normalize();
      const palm = new THREE.Vector3(0, 0, 1);
      const across = new THREE.Vector3().crossVectors(fingerDirection, palm).normalize();
      palm.crossVectors(across, fingerDirection).normalize();
      const handRotation = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(across, fingerDirection, palm));
      worldRotation(hand, root.getWorldQuaternion(new THREE.Quaternion()).multiply(handRotation));
      for (const finger of arm.fingers) finger.rotation.x -= .65;
      wristTargets.push(local.toArray());
    }
  }

  return {
    root,
    pose({time = 0, phase = 0, mode = 'standing', speaking = false, distress = 0, look = 0, reduced = false, corpse = false, dissolve = 0, steer = 0} = {}) {
      if (disposed) return;
      for (const state of sampled) {state.bone.position.copy(state.position); state.bone.quaternion.copy(state.quaternion); state.bone.scale.copy(state.scale);}
      lastPose = mode; lastCorpse = !!corpse; decay.value = clamp(dissolve, 0, 1);
      for (const {material, color, skin} of materials.values()) {
        material.color.copy(color);
        if (corpse) material.color.multiply(new THREE.Color(skin ? 0x71816b : 0xa6aca3));
      }
      // The cast and authored escorts share local +Z as their forward direction.
      fit.position.set(0, 0, 0); fit.rotation.set(0, 0, 0);
      const walking = mode === 'walk' || mode === 'run';
      if (mode === 'drive') {
        sample('Seated', reduced ? 0 : time * .22);
        // The source seated clip has lower hips than the old standing-origin rig.
        fit.position.set(0, .19, .15);
      } else if (walking) {
        sample('Walk', (Number.isFinite(phase) ? phase : 0) / TAU * clips.get('Walk').duration);
        if (mode === 'run') fit.rotation.x = .07;
      } else if (speaking && mode !== 'limp') sample('Talk', time);
      else if (clips.has('Idle')) sample('Idle', reduced ? 0 : time * .5);
      else sample('Walk', 0); // The rest pose is a T-pose; freeze a planted walk frame.

      for (const state of sampled) {state.position.copy(state.bone.position); state.quaternion.copy(state.bone.quaternion); state.scale.copy(state.bone.scale);}
      if (mode === 'drive') holdWheel(steer);
      else wristTargets.length = 0;

      if (torso && (mode === 'breathe' || distress > 0)) torso.rotation.x += -.07 - clamp(distress, 0, 1) * .04;
      if (head) {
        root.updateWorldMatrix(true, true);
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(root.getWorldQuaternion(actorRotation));
        headTilt.setFromAxisAngle(up, clamp(look, -.72, .72));
        worldRotation(head, headTilt.multiply(head.getWorldQuaternion(new THREE.Quaternion())));
        if (corpse || mode === 'limp') head.rotation.x += mode === 'limp' ? .65 : .16;
      }
      if (mouth && speaking) mouth.rotation.x += Math.max(0, Math.sin(time * 17)) * (reduced ? .04 : .13);
      if (mode === 'limp') { fit.rotation.x = .10; fit.rotation.z = police ? .05 : -.05; }
      // SkinnedMesh overrides updateMatrixWorld to refresh bindMatrixInverse.
      // updateWorldMatrix alone moves the control bones but leaves CPU skinning
      // and any renderer using the current matrices with the old mesh transform.
      root.updateMatrixWorld(true);
    },
    diagnostics:() => ({name, kind:police ? 'uniformed police officer' : 'civilian father', pose:lastPose, corpse:lastCorpse, dissolve:decay.value, provenance:TEXTURED_CAST_PROVENANCE, textured:true, clip:clipName, height:1.8, wristTargets:wristTargets.map(point => [...point])}),
    dispose() {
      if (disposed) return;
      disposed = true; mixer.stopAllAction(); mixer.uncacheRoot(model);
      for (const skeleton of skeletons) skeleton.dispose();
      // The parent disposes cloned materials while traversing its scene. Shared
      // geometry and texture disposal happens once, in the parent's asset owner.
    },
  };
}
