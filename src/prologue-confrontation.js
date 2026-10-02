import * as THREE from 'three';

export const BANG_TIMES = Object.freeze([.60, 1.30]);
const clamp = value => Math.max(0, Math.min(1, Number(value) || 0));
const smooth = value => {const t = clamp(value); return t * t * (3 - 2 * t);};
const mix = (a,b,t) => t<=0?[...a]:t>=1?[...b]:a.map((value,index) => value + (b[index] - value) * t);
const START = [4.5,0,-7.5], FRONT = [0,0,-3.25], CORNER = [1.75,0,-2.7], WINDOW = [1.42,0,.30], BACK = [2.1,0,-2.25];
export const BANG_WINDOW_TARGET=Object.freeze([1.025,1.08,.30]);
const length=(a,b)=>Math.hypot(a[0]-b[0],a[2]-b[2]);
const LEGS=[length(START,FRONT),length(FRONT,CORNER),length(CORNER,WINDOW)];
export const ROADSIDE_RUN_DISTANCE=LEGS.reduce((sum,value)=>sum+value,0);
export const ROADSIDE_DISTANCE=ROADSIDE_RUN_DISTANCE+length(WINDOW,BACK);

export function sampleRoadsideConfrontation(frame = {}) {
  const chapter = frame.chapter, t = Math.max(0, Number(frame.chapterTime) || 0), p = clamp(frame.chapterProgress);
  let position = [...WINDOW], yaw = -Math.PI / 2, mode = 'standing', moving = false, bang = 0, impact = 0, travel=ROADSIDE_RUN_DISTANCE;
  if (chapter === 'emergence') {
    if (p < .48) position = mix(START, FRONT, smooth(p / .48));
    else if (p < .58) position = [...FRONT];
    else if (p < .72) position = mix(FRONT, CORNER, smooth((p - .58) / .14));
    else position = mix(CORNER, WINDOW, smooth((p - .72) / .28));
    const from = p < .48 ? START : p < .72 ? FRONT : CORNER, to = p < .48 ? FRONT : p < .72 ? CORNER : WINDOW;
    const tangent = [to[0]-from[0], to[2]-from[2]];
    const travelYaw = Math.atan2(...tangent);
    yaw = travelYaw + (-Math.PI / 2 - travelYaw) * smooth((p - .84) / .16);
    if(p>=.48&&p<=.58)yaw=0;
    moving = p > 0 && p < .995 && !(p >= .48 && p <= .58); mode = moving ? 'run' : 'standing';
    travel=p<.48?LEGS[0]*smooth(p/.48):p<.58?LEGS[0]:p<.72?LEGS[0]+LEGS[1]*smooth((p-.58)/.14):LEGS[0]+LEGS[1]+LEGS[2]*smooth((p-.72)/.28);
  } else if (chapter === 'bang') {
    mode = 'bang';
    for (const contact of BANG_TIMES) {
      const age = t - contact;
      bang = Math.max(bang, age <= 0 ? smooth((age + .28) / .28) : 1 - smooth(age / .20));
      impact = Math.max(impact, age >= 0 ? Math.max(0, 1 - age / .14) : 0);
    }
  } else if (chapter === 'cabin') {
    const retreat = smooth(t / .7); position = mix(WINDOW, BACK, retreat);
    moving = t > 0 && t < .7; mode = moving ? 'walk' : 'standing';
    travel+=length(WINDOW,BACK)*retreat;
  } else return null;
  return {position, yaw, mode, moving, bang, impact, travel};
}

/** Two-bone reach used by both the procedural cast and the imported skin. */
export function reachPrologueArm(root, upper, lower, hand, target, pole, independentHand = false) {
  root.updateWorldMatrix(true, true);
  const a = upper.getWorldPosition(new THREE.Vector3()), b = lower.getWorldPosition(new THREE.Vector3()), c = hand.getWorldPosition(new THREE.Vector3());
  const axis = c.clone().sub(b).applyQuaternion(lower.getWorldQuaternion(new THREE.Quaternion()).invert()).normalize();
  const lengthA = a.distanceTo(b), lengthB = b.distanceTo(c), destination = root.localToWorld(target.clone());
  const direction = destination.clone().sub(a), reach = Math.max(.001, Math.min(lengthA + lengthB - .0001, direction.length())); direction.normalize();
  const bend = root.localToWorld(pole.clone()).sub(a); bend.addScaledVector(direction, -bend.dot(direction)).normalize();
  const along = (lengthA*lengthA - lengthB*lengthB + reach*reach) / (2*reach);
  const elbow = a.clone().addScaledVector(direction, along).addScaledVector(bend, Math.sqrt(Math.max(0, lengthA*lengthA - along*along)));
  const rotate = (bone, from, to) => {
    const world = new THREE.Quaternion().setFromUnitVectors(from.normalize(), to.normalize()).multiply(bone.getWorldQuaternion(new THREE.Quaternion()));
    bone.quaternion.copy(bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(world)); bone.updateWorldMatrix(false, true);
  };
  rotate(upper, b.clone().sub(a), elbow.clone().sub(a));
  rotate(lower, axis.applyQuaternion(lower.getWorldQuaternion(new THREE.Quaternion())), destination.clone().sub(lower.getWorldPosition(new THREE.Vector3())));
  if (independentHand) hand.position.copy(hand.parent.worldToLocal(destination));
  const palm = root.getWorldQuaternion(new THREE.Quaternion());
  if (!independentHand) palm.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1), Math.PI));
  hand.quaternion.copy(hand.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(palm));
  hand.updateWorldMatrix(false, true);
  return root.worldToLocal(hand.getWorldPosition(new THREE.Vector3())).toArray();
}
