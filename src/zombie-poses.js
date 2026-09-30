import * as THREE from 'three';

const clamp = value => Math.max(0, Math.min(1, value));
const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
const vector = (x, y, z) => new THREE.Vector3(x, y, z);
const turn = (x = 0, y = 0, z = 0) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, 'YXZ'));

/** Presentation only. All phase boundaries/deadlines come from the simulation. */
export function zombiePoseState(enemy, time, game = {}) {
  const interaction = game.interaction;
  const phase = interaction?.phase;
  const age = Math.max(0, time - (enemy.stateStartedAt ?? time));
  const phaseAge = Math.max(0, time - (interaction?.phaseStartedAt ?? interaction?.startedAt ?? time));
  if (phase === 'tackle') return {name:'tackle', weight:1, age:phaseAge, eyes:'red'};
  if (phase === 'qte') return {name:'grapple', weight:1, age:phaseAge, eyes:'red', progress:clamp(interaction.presses / (interaction.targetPresses || 8))};
  if (phase === 'stab' || phase === 'throw') return {name:phase, weight:1, age:phaseAge, eyes:'red'};
  if (phase === 'recovery') {
    const remaining = Math.max(0, (interaction.recoveryDeadline ?? time) - time);
    return {name:'fetal', weight:remaining > 1.4 ? 1 : smooth(remaining / 1.4), age:phaseAge, eyes:'dim'};
  }
  if (enemy.state === 'staggered') {
    const total = Math.max(.1, age + Math.max(0, enemy.timer || 0));
    const progress = clamp(age / total);
    const weight = progress < .2 ? smooth(progress / .2) : progress > .75 ? 1 - smooth((progress - .75) / .25) : 1;
    return {name:'fetal', weight, age, eyes:age < .12 ? 'burst' : 'dim'};
  }
  if (['chase', 'rage_chase', 'corn_rush'].includes(enemy.state)) return {name:'inverted', weight:smooth(age / .18), age, eyes:'red'};
  if (enemy.state === 'flashlight_recoil') return {name:'recoil', weight:smooth(age / .1), age, eyes:age < .45 ? 'dim' : 'red'};
  if (enemy.state === 'detection_tell') return {name:'recoil', weight:1, age, eyes:age < .08 ? 'off' : 'red'};
  return {name:enemy.state === 'noticed_retreat' ? 'retreat' : 'painful', weight:1, age, eyes:'white'};
}

/**
 * Original Pixelhouse-specific joint choreography over its existing lurch clip.
 * Targets live in the creature's normalized local space (+Z forward, Y up).
 * No animation callback, bone position, or eye effect can mutate gameplay.
 */
export function createZombiePoses(model, space) {
  const bones = new Map();
  model.traverse(object => { if (object.isBone) bones.set(object.name.replaceAll('_', ' '), object); });
  const bone = name => bones.get('Bip01 ' + name);
  const root = model.getObjectByName('Bip01');
  const required = ['Pelvis', 'Spine', 'Spine1', 'Spine2', 'Spine3', 'Neck', 'Head',
    ...['L', 'R'].flatMap(side => [`${side} Thigh`, `${side} Calf`, `${side} Foot`, `${side} UpperArm`, `${side} Forearm`, `${side} Hand`])];
  if (!root || required.some(name => !bone(name))) throw new Error('Zombie pose rig is missing a required Bip01 joint');
  space.updateWorldMatrix(true, true);
  const inverseSpace = space.getWorldQuaternion(new THREE.Quaternion()).invert();
  const rest = [...new Set([root, ...bones.values()])].map(object => ({
    object, position:object.position.clone(), quaternion:object.quaternion.clone(), scale:object.scale.clone(),
    inSpace:inverseSpace.clone().multiply(object.getWorldQuaternion(new THREE.Quaternion())),
  }));
  const restByBone = new Map(rest.map(item => [item.object, item]));
  const base = rest.map(item => ({position:item.position.clone(), quaternion:item.quaternion.clone()}));
  let state = {name:'painful', eyes:'white'};
  let gait = 0;
  const local = object => space.worldToLocal(object.getWorldPosition(new THREE.Vector3()));
  const world = point => space.localToWorld(point.clone());

  function setWorldRotation(object, rotation) {
    const parent = object.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
    object.quaternion.copy(parent.multiply(rotation));
    object.updateWorldMatrix(false, true);
  }
  function orient(name, rotation) {
    const object = bone(name);
    if (!object) return;
    const target = space.getWorldQuaternion(new THREE.Quaternion())
      .multiply(rotation).multiply(restByBone.get(object).inSpace);
    setWorldRotation(object, target);
  }
  function offset(name, rotation) {
    const object = bone(name);
    const spaceQ = space.getWorldQuaternion(new THREE.Quaternion());
    const delta = spaceQ.clone().multiply(rotation).multiply(spaceQ.invert());
    setWorldRotation(object, delta.multiply(object.getWorldQuaternion(new THREE.Quaternion())));
  }
  function placePelvis(point) {
    const wanted = root.parent.worldToLocal(world(point));
    const current = root.parent.worldToLocal(bone('Pelvis').getWorldPosition(new THREE.Vector3()));
    root.position.add(wanted.sub(current));
    root.updateWorldMatrix(false, true);
  }
  function aim(object, child, target) {
    const origin = object.getWorldPosition(new THREE.Vector3());
    const from = child.getWorldPosition(new THREE.Vector3()).sub(origin).normalize();
    const to = target.clone().sub(origin).normalize();
    const delta = new THREE.Quaternion().setFromUnitVectors(from, to);
    setWorldRotation(object, delta.multiply(object.getWorldQuaternion(new THREE.Quaternion())));
  }
  function limb(firstName, middleName, lastName, target, pole) {
    const first = bone(firstName), middle = bone(middleName), last = bone(lastName);
    const start = first.getWorldPosition(new THREE.Vector3());
    const bend = middle.getWorldPosition(new THREE.Vector3());
    const end = last.getWorldPosition(new THREE.Vector3());
    const a = start.distanceTo(bend), b = bend.distanceTo(end);
    const destination = world(target), direction = destination.clone().sub(start);
    const reach = Math.max(.001, Math.min(a + b - .0001, direction.length()));
    direction.normalize();
    const across = world(pole).sub(start);
    across.addScaledVector(direction, -across.dot(direction)).normalize();
    const along = (a * a + reach * reach - b * b) / (2 * reach);
    const height = Math.sqrt(Math.max(0, a * a - along * along));
    const elbow = start.clone().addScaledVector(direction, along).addScaledVector(across, height);
    aim(first, middle, elbow);
    aim(middle, last, destination);
  }
  function resetToRest() {
    for (const item of rest) {
      item.object.position.copy(item.position);
      item.object.quaternion.copy(item.quaternion);
      item.object.scale.copy(item.scale);
    }
    root.updateWorldMatrix(false, true);
  }
  function inverted(time) {
    const arch = [-.28, -.55, -1.05, -1.58, -2.12, -2.48, -2.92];
    ['Pelvis', 'Spine', 'Spine1', 'Spine2', 'Spine3', 'Neck', 'Head'].forEach((name, index) =>
      orient(name, turn(arch[index], Math.PI, .035 * Math.sin(gait * 2 + index))));
    placePelvis(vector(0, .34 + .025 * Math.sin(gait * 2), -.2));
    for (const [side, sign] of [['L', 1], ['R', -1]]) {
      const cycle = gait + (sign < 0 ? Math.PI : 0);
      const stride = Math.sin(cycle), lift = Math.max(0, Math.cos(cycle)) * .08;
      limb(`${side} Thigh`, `${side} Calf`, `${side} Foot`, vector(-sign * .33, .085 + lift, -.74 + stride * .16), vector(-sign * .75, .7, -.2));
      orient(`${side} Foot`, turn(0, Math.PI));
      limb(`${side} UpperArm`, `${side} Forearm`, `${side} Hand`, vector(-sign * .40, .075 + Math.max(0, -Math.cos(cycle)) * .07, .67 - stride * .13), vector(-sign * .8, .35, .45));
      const hand = bone(`${side} Hand`), finger = bone(`${side} Finger2`);
      if (finger) { const p = local(hand); aim(hand, finger, world(vector(p.x, p.y, p.z + .2))); }
    }
  }
  function fetal(time) {
    const curl = [.75, .9, 1.15, 1.35, 1.5, 1.65, 1.9];
    ['Pelvis', 'Spine', 'Spine1', 'Spine2', 'Spine3', 'Neck', 'Head'].forEach((name, index) => orient(name, turn(curl[index], .2, 1.18)));
    placePelvis(vector(-.05, .30 + Math.sin(time * 5) * .006, -.12));
    const face = local(bone('Head'));
    for (const [side, sign] of [['L', 1], ['R', -1]]) {
      limb(`${side} Thigh`, `${side} Calf`, `${side} Foot`, vector(sign * .10, .14, .17), vector(-.3, .72, .6));
      limb(`${side} UpperArm`, `${side} Forearm`, `${side} Hand`, face.clone().add(vector(sign * .10, -.02, .08)), vector(-.5, .23, .65));
      orient(`${side} Hand`, turn(.7, .2, sign * .6));
    }
  }
  function grapple(time, progress = 0, release = 0) {
    ['Pelvis', 'Spine', 'Spine1', 'Spine2', 'Spine3', 'Neck', 'Head'].forEach((name, index) =>
      orient(name, turn(.2 + index * .10, Math.sin(time * 7) * .025, index > 4 ? .05 : 0)));
    placePelvis(vector(0, .32, -.42));
    for (const [side, sign] of [['L', 1], ['R', -1]]) {
      limb(`${side} Thigh`, `${side} Calf`, `${side} Foot`, vector(sign * .38, .09, -.55), vector(sign * .6, .25, .1));
      limb(`${side} UpperArm`, `${side} Forearm`, `${side} Hand`, vector(sign * .22, .58 + progress * .12 + release * .2, .40 - progress * .1 + release * .25), vector(sign * .6, 1, .4));
    }
  }
  function painful(time, moving, name) {
    const breath = Math.sin(time * 2.2) * .018;
    const recoil = moving ? Math.pow(Math.max(0, Math.sin(gait)), 6) * .11 : 0;
    offset('Spine', turn(.09 + recoil, 0, -.045));
    offset('Spine2', turn(.08 + breath, -.07, .055));
    offset('Neck', turn(.17 + recoil * .5, name === 'retreat' ? .4 : Math.sin(time * .8) * .1, -.10));
    offset('Head', turn(.1, -.06, .06));
    offset('L UpperArm', turn(.12, .18, -.12));
    offset('R UpperArm', turn(-.1, -.15, .09));
    limb('R UpperArm', 'R Forearm', 'R Hand', vector(-.08, 1.42 + breath, .22), vector(-.65, 1.18, .06));
  }

  return {
    update(enemy, time, game, travelled = 0) {
      state = zombiePoseState(enemy, time, game);
      gait += Math.max(0, travelled) * 4.8;
      for (let i = 0; i < rest.length; i++) {
        base[i].position.copy(rest[i].object.position);
        base[i].quaternion.copy(rest[i].object.quaternion);
      }
      if (['inverted', 'fetal', 'grapple', 'tackle', 'stab', 'throw'].includes(state.name)) {
        resetToRest();
        if (state.name === 'inverted') inverted(time);
        else if (state.name === 'fetal') fetal(time);
        else if (state.name === 'tackle') { inverted(time); const target = local(bone('Pelvis')); target.y += .3 * smooth(state.age / .3); placePelvis(target); }
        else { grapple(time, state.progress, state.name === 'throw' ? smooth(state.age / .5) : 0); if (state.name === 'stab') offset('Head', turn(-.35 * smooth(state.age / .2), -.2, .15)); }
        for (let i = 0; i < rest.length; i++) {
          const object = rest[i].object;
          object.position.lerpVectors(base[i].position, object.position.clone(), state.weight);
          object.quaternion.slerpQuaternions(base[i].quaternion, object.quaternion.clone(), state.weight);
        }
      } else {
        painful(time, travelled > .0001, state.name);
        if (state.name === 'recoil') {
          offset('Spine2', turn(-.30 * state.weight, .08, .06));
          offset('Neck', turn(.40 * state.weight, -.25, .12));
          const face = local(bone('Head'));
          for (const [side, sign] of [['L', 1], ['R', -1]]) limb(`${side} UpperArm`, `${side} Forearm`, `${side} Hand`, face.clone().add(vector(sign * .13, -.08, .13)), vector(sign * .6, 1.4, .2));
        }
      }
      root.updateWorldMatrix(false, true);
      return state;
    },
    reset: resetToRest,
    resetCycle() { gait = 0; resetToRest(); },
    bone,
    diagnostics: () => ({pose:state.name, eyes:state.eyes, joints:bones.size,
      head:local(bone('Head')).toArray(), hands:['L', 'R'].map(side => local(bone(`${side} Hand`)).toArray()),
      feet:['L', 'R'].map(side => local(bone(`${side} Foot`)).toArray())}),
  };
}
