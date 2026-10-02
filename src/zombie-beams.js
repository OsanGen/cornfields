import * as THREE from 'three';
import {canOccupy} from './maze.js';
import {zombiePoseState} from './zombie-poses.js';

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const MAX_LENGTH = 7.2, MAX_STEPS = 48;
const beamRadius = length => .06 + length * .09;
const ACTIVE = new Set(['chase', 'rage_chase', 'corn_rush', 'detection_tell', 'flashlight_recoil']);

/** Presentation follows the existing eye choreography, including its delays. */
export function zombieBeamState(enemy, time, game = {}, {reduced = false, trial = false, suppressed = false, presentation} = {}) {
  const eyes = presentation?.eyes ?? zombiePoseState(enemy, time, game).eyes;
  const active = Number.isFinite(time) && !trial && !suppressed && !game.interaction &&
    (game.mode === undefined || game.mode === 'playing') && enemy.active !== false && enemy.visible !== false &&
    (game.player?.zone === undefined || enemy.zone === undefined || enemy.zone === game.player.zone) &&
    ACTIVE.has(enemy.state) && eyes === 'red';
  const rage = enemy.state === 'rage_chase', amplitude = (rage ? .19 : .065) * (reduced ? .2 : 1);
  const clock = Number.isFinite(time) ? time * (reduced ? .22 : 1) : 0;
  return {
    active, length:rage ? MAX_LENGTH : 5.8,
    intensity:active ? (rage ? 6 : 3.8) * (reduced ? .45 : 1) : 0,
    opacity:active ? (rage ? .19 : .125) * (reduced ? .55 : 1) : 0,
    yaw:amplitude * (.72 * Math.sin(clock * 1.31) + .28 * Math.sin(clock * 3.17 + .7)),
    pitch:amplitude * .38 * Math.sin(clock * 1.83 + 1.2),
    noiseTime:reduced ? 0 : clock * .38,
  };
}

/** Stop before collision surfaces. Padding also catches thin wooden segments. */
export function clipZombieBeam(maze, origin, direction, distance = MAX_LENGTH, blocks = []) {
  const requested = clamp(Number(distance) || 0, 0, MAX_LENGTH);
  if (!maze || requested === 0) return requested;
  if (![origin.x, origin.z, direction.x, direction.z].every(Number.isFinite)) return 0;
  const steps = Math.min(MAX_STEPS, Math.max(1, Math.ceil(requested / .15)));
  const step = requested / steps;
  // The smoky cones grow to at most 1.42 m across; sample their half width so the
  // visible volume ends ahead of walls even when its centre ray just misses.
  for (let index = 0; index <= steps; index++) {
    const length = index * step, radius = beamRadius(length);
    if (Number.isFinite(origin.y) && origin.y + direction.y * length < .025) return Math.max(0, length - step);
    if (!canOccupy(maze, origin.x + direction.x * length, origin.z + direction.z * length, radius, blocks)) return Math.max(0, length - step);
  }
  return requested;
}

function beamMaterial() {
  return new THREE.ShaderMaterial({
    transparent:true, depthWrite:false, depthTest:true, side:THREE.DoubleSide,
    blending:THREE.AdditiveBlending, toneMapped:false,
    uniforms:{opacity:{value:0}, clock:{value:0}},
    vertexShader:`varying float beamDepth; varying vec3 beamNormal,beamView,beamAxis;
      void main(){
        vec4 view=modelViewMatrix*vec4(position,1.);
        beamDepth=position.z;beamNormal=normalize(normalMatrix*normal);
        beamView=-view.xyz;beamAxis=normalize(mat3(modelViewMatrix)*vec3(0.,0.,1.));
        gl_Position=projectionMatrix*view;
      }`,
    fragmentShader:`uniform float opacity,clock; varying float beamDepth; varying vec3 beamNormal,beamView,beamAxis;
      void main(){
        vec3 view=normalize(beamView);
        float edge=pow(abs(dot(normalize(beamNormal),view)),.7);
        float angle=.35+.65*pow(abs(dot(normalize(beamAxis),view)),.65);
        float fade=smoothstep(0.,.025,beamDepth)*(1.-smoothstep(.45,1.,beamDepth));
        float mist=.86+.09*sin(beamDepth*23.-clock)+.05*sin(beamDepth*47.+clock*.61);
        gl_FragColor=vec4(1.,.018,.008,opacity*edge*angle*fade*mist);
      }`,
  });
}

/** Original, bounded cone shader. No framebuffer, raymarch, or per-frame meshes. */
export function createZombieBeams({space, head, eyes, primary = false}) {
  const root = new THREE.Group(); root.name = 'Creature eye searchlights'; space.add(root);
  const geometry = new THREE.CylinderGeometry(1, .004, 1, 16, 4, true);
  geometry.translate(0, .5, 0); geometry.rotateX(Math.PI / 2);
  const material = beamMaterial();
  const cones = eyes.map((eye, index) => {
    const cone = new THREE.Mesh(geometry, material); cone.name = `Creature eye beam ${index + 1}`;
    cone.frustumCulled = false; cone.visible = false; root.add(cone); return cone;
  });
  const coreGeometry = new THREE.SphereGeometry(1, 8, 6);
  const coreMaterial = new THREE.MeshBasicMaterial({color:0xffeadb, toneMapped:false, depthTest:true});
  const cores = eyes.map(eye => {
    const core = new THREE.Mesh(coreGeometry, coreMaterial); core.name = 'Creature hot eye core';
    core.scale.setScalar(.48); core.position.y = .44; core.visible = false; eye.add(core); return core;
  });
  // Its real illumination stays inside the collision-tested cone envelope.
  const light = primary ? new THREE.SpotLight(0xff1909, 0, MAX_LENGTH, .09, .95, 2) : null;
  const target = new THREE.Object3D(); root.add(target);
  if (light) {light.name = 'Primary creature red searchlight'; light.castShadow = false; light.target = target; root.add(light);}
  const forward = new THREE.Vector3(), up = new THREE.Vector3(), right = new THREE.Vector3(), origin = new THREE.Vector3();
  const localDirection = new THREE.Vector3(), inverse = new THREE.Quaternion(), rotation = new THREE.Quaternion();
  const zAxis = new THREE.Vector3(0, 0, 1), midpoint = new THREE.Vector3();
  let disposed = false, active = false, lengths = eyes.map(() => 0), last = null, lastReduced = false;

  return {
    root,
    update(game, time, {reduced = false, trial = false, suppressed = false, presentation} = {}) {
      if (disposed) return;
      lastReduced = reduced;
      last = zombieBeamState(game.enemy, time, game, {reduced, trial, suppressed, presentation});
      active = last.active && space.visible !== false;
      root.visible = active; cores.forEach(core => {core.visible = active;});
      if (light) {light.visible = active; light.intensity = active ? last.intensity : 0;}
      if (!active) {lengths.fill(0); return;}
      space.updateWorldMatrix(true, true);
      head.getWorldQuaternion(rotation);
      // The Bip01 head's +Y axis is its actual face direction in every pose.
      forward.set(0, 1, 0).applyQuaternion(rotation).normalize();
      up.set(1, 0, 0).applyQuaternion(rotation).normalize();
      right.crossVectors(forward, up).normalize();
      forward.applyAxisAngle(up, last.yaw).applyAxisAngle(right, last.pitch).normalize();
      inverse.copy(root.getWorldQuaternion(rotation)).invert();
      localDirection.copy(forward).applyQuaternion(inverse).normalize();
      material.uniforms.opacity.value = last.opacity; material.uniforms.clock.value = last.noiseTime;
      midpoint.set(0, 0, 0);
      for (const [index, eye] of eyes.entries()) {
        eye.getWorldPosition(origin);
        const length = clipZombieBeam(game.maze, origin, forward, last.length, game.blocks || []);
        lengths[index] = length;
        const cone = cones[index]; cone.position.copy(root.worldToLocal(origin));
        cone.quaternion.setFromUnitVectors(zAxis, localDirection);
        cone.scale.set(beamRadius(length), beamRadius(length), length);
        cone.visible = length > .15;
        midpoint.add(cone.position);
      }
      midpoint.multiplyScalar(.5);
      if (light) {
        const reach = Math.min(...lengths);
        light.position.copy(midpoint); target.position.copy(midpoint).addScaledVector(localDirection, Math.max(.1, reach));
        light.distance = Math.max(.01, reach); light.intensity = reach > .2 ? last.intensity : 0;
        light.angle = Math.min(.12, Math.atan2(beamRadius(reach),Math.max(.01,reach)));
      }
    },
    diagnostics:() => ({active, lengths:[...lengths], primary:!!light, lightIntensity:light?.intensity || 0, reduced:lastReduced, origins:cones.map(cone => cone.getWorldPosition(new THREE.Vector3()).toArray())}),
    dispose() {
      if (disposed) return; disposed = true;
      root.removeFromParent(); cores.forEach(core => core.removeFromParent());
      geometry.dispose(); material.dispose(); coreGeometry.dispose(); coreMaterial.dispose();
      light?.dispose();
    },
  };
}
