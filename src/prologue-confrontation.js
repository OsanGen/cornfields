import * as THREE from 'three';
import {angle,ease} from './prologue-performance.js';

export const BANG_TIMES = Object.freeze([.60, 1.30]);
const clamp = value => Math.max(0, Math.min(1, Number(value) || 0));
const smooth = value => {const t = clamp(value); return t * t * (3 - 2 * t);};
const mix = (a,b,t) => t<=0?[...a]:t>=1?[...b]:a.map((value,index) => value + (b[index] - value) * t);
export const ROADSIDE_ENCOUNTER=Object.freeze({reaction:.5,stop:2.3,approach:2.6,arrival:5.2});
const START = [-.2,0,-7.5], FRONT = [-2.3,0,-7.5], HOOD=[0,0,-3.25], WINDOW = [1.42,0,.30], BACK = [2.1,0,-2.25];
export const BANG_WINDOW_TARGET=Object.freeze([1.025,1.08,.30]);
const length=(a,b)=>Math.hypot(a[0]-b[0],a[2]-b[2]);
const hood=p=>{const q=1-p;return [q*q*q*HOOD[0]+3*q*q*p*2.3+3*q*p*p*1.95+p*p*p*WINDOW[0],0,q*q*q*HOOD[2]+3*q*q*p*(-3.0)+3*q*p*p*(-1.2)+p*p*p*WINDOW[2]];};
const ARC=[0];for(let i=1;i<=128;i++)ARC.push(ARC.at(-1)+length(hood((i-1)/128),hood(i/128)));
const hoodDistance=p=>{const u=clamp(p)*128,i=Math.min(127,Math.floor(u));return ARC[i]+(ARC[i+1]-ARC[i])*(u-i);};
const LEGS=[length(START,FRONT),length(FRONT,HOOD),ARC.at(-1)];
export const RETREAT_START=.85,RETREAT_SECONDS=2.2;
export const ROADSIDE_RUN_DISTANCE=LEGS.reduce((sum,value)=>sum+value,0);
export const ROADSIDE_DISTANCE=ROADSIDE_RUN_DISTANCE+length(WINDOW,BACK);

export function sampleRoadsideConfrontation(frame = {}) {
  const chapter = frame.chapter, t = Math.max(0, Number(frame.chapterTime) || 0), p = clamp(frame.chapterProgress);
  let position = [...WINDOW], yaw = -Math.PI / 2, mode = 'standing', moving = false, bang = 0, impact = 0, travel=ROADSIDE_RUN_DISTANCE;
  if (chapter === 'emergence') {
    // Entry is in the headlights while the car still moves. Stanley holds
    // ahead of the bumper during reaction/braking, then circles the parked car.
    const seconds=Number.isFinite(frame.chapterTime)?t:p*ROADSIDE_ENCOUNTER.arrival;
    if(seconds<.65){const u=smooth(seconds/.65);position=mix(START,FRONT,u);position[1]=Math.sin(Math.PI*u)*.12;travel=LEGS[0]*u;yaw=-Math.PI/2;moving=seconds>0;}
    else if(seconds<ROADSIDE_ENCOUNTER.approach){position=[...FRONT];travel=LEGS[0];yaw=0;}
    else{
      const u=smooth((seconds-ROADSIDE_ENCOUNTER.approach)/(ROADSIDE_ENCOUNTER.arrival-ROADSIDE_ENCOUNTER.approach)),total=LEGS[1]+LEGS[2],d=u*total;
      if(d<LEGS[1]){position=mix(FRONT,HOOD,d/LEGS[1]);yaw=Math.atan2(HOOD[0]-FRONT[0],HOOD[2]-FRONT[2]);}
      else{const hd=d-LEGS[1];let lo=0,hi=1;for(let i=0;i<18;i++){const q=(lo+hi)/2;if(hoodDistance(q)<hd)lo=q;else hi=q;}const v=(lo+hi)/2;position=u>=1?[...WINDOW]:hood(v);const before=hood(Math.max(0,v-.002)),after=hood(Math.min(1,v+.002));yaw=angle(Math.atan2(after[0]-before[0],after[2]-before[2]),-Math.PI/2,ease(u,.78,1));}
      travel=u>=1?ROADSIDE_RUN_DISTANCE:LEGS[0]+d;moving=u>0&&u<1;
    }
    mode=moving?'run':'standing';
  } else if (chapter === 'bang') {
    mode = 'bang';
    for (const contact of BANG_TIMES) {
      const age = t - contact;
      bang = Math.max(bang, age <= 0 ? smooth((age + .28) / .28) : 1 - smooth(age / .20));
      impact = Math.max(impact, age >= 0 ? Math.max(0, 1 - age / .14) : 0);
    }
  } else if (chapter === 'cabin') {
    const progress=t>=RETREAT_START+RETREAT_SECONDS-1e-8?1:clamp((t-RETREAT_START)/RETREAT_SECONDS),retreat=smooth(progress); position=mix(WINDOW,BACK,retreat);
    moving=progress>0&&progress<1;mode=moving?'walk':'standing';
    const heading=Math.atan2(BACK[0]-WINDOW[0],BACK[2]-WINDOW[2]);
    yaw=angle(-Math.PI/2,heading,smooth(progress/.25));
    yaw=angle(yaw,-.13,smooth((progress-.72)/.28));
    travel+=length(WINDOW,BACK)*retreat;
  } else if(chapter==='car'||chapter==='dispatch'){position=[...START];yaw=-Math.PI/2;travel=0;}
  else return null;
  const crouch=chapter==='emergence'?ease(Number.isFinite(frame.chapterTime)?t:p*ROADSIDE_ENCOUNTER.arrival,4.65,5.2):chapter==='bang'?1:chapter==='cabin'?1-ease(t,0,.45):0;
  return {position,yaw,mode,moving,bang,impact,travel,crouch};
}

/** Two-bone reach used by both the procedural cast and the imported skin. */
export function reachPrologueArm(root, upper, lower, hand, target, pole, independentHand = false) {
  root.updateWorldMatrix(true, true);
  const a = upper.getWorldPosition(new THREE.Vector3()), b = lower.getWorldPosition(new THREE.Vector3()), c = hand.getWorldPosition(new THREE.Vector3());
  const axis = c.clone().sub(b).applyQuaternion(lower.getWorldQuaternion(new THREE.Quaternion()).invert()).normalize();
  const lengthA = a.distanceTo(b), lengthB = b.distanceTo(c), destination = root.localToWorld(target.clone());
  const direction=destination.clone().sub(a),requested=direction.length();
  if(requested<1e-8||lengthA<1e-6||lengthB<1e-6)return root.worldToLocal(c).toArray();
  const reach=THREE.MathUtils.clamp(requested,Math.abs(lengthA-lengthB)+.0001,lengthA+lengthB-.0001);direction.normalize();
  destination.copy(a).addScaledVector(direction,reach);
  const bend=root.localToWorld(pole.clone()).sub(a);bend.addScaledVector(direction,-bend.dot(direction));
  if(bend.lengthSq()<1e-10){bend.set(0,1,0).addScaledVector(direction,-direction.y);if(bend.lengthSq()<1e-10)bend.set(1,0,0).addScaledVector(direction,-direction.x);}bend.normalize();
  const along = (lengthA*lengthA - lengthB*lengthB + reach*reach) / (2*reach);
  const elbow = a.clone().addScaledVector(direction, along).addScaledVector(bend, Math.sqrt(Math.max(0, lengthA*lengthA - along*along)));
  const rotate = (bone, from, to) => {
    const world = new THREE.Quaternion().setFromUnitVectors(from.normalize(), to.normalize()).multiply(bone.getWorldQuaternion(new THREE.Quaternion()));
    bone.quaternion.copy(bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(world)); bone.updateWorldMatrix(false, true);
  };
  rotate(upper, b.clone().sub(a), elbow.clone().sub(a));
  rotate(lower, axis.applyQuaternion(lower.getWorldQuaternion(new THREE.Quaternion())), destination.clone().sub(lower.getWorldPosition(new THREE.Vector3())));
  // This exported rig's wrist is an independent IK-control child, not a child
  // of the forearm. Move that control to the reach-clamped destination; the
  // elbow construction still preserves both measured segment lengths.
  if(independentHand)hand.position.copy(hand.parent.worldToLocal(destination.clone()));
  const palm = root.getWorldQuaternion(new THREE.Quaternion());
  if (!independentHand) palm.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1), Math.PI));
  hand.quaternion.copy(hand.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(palm));
  hand.updateWorldMatrix(false, true);
  return root.worldToLocal(hand.getWorldPosition(new THREE.Vector3())).toArray();
}

// Run and retreat use their calibrated step lengths without resetting phase.
export function roadsideSteps(distance){return Math.min(distance,ROADSIDE_RUN_DISTANCE)/.85+Math.max(0,distance-ROADSIDE_RUN_DISTANCE)/.35;}
export function roadsideFootAnchors(sample,offset=.73){
  const phaseSteps=roadsideSteps(sample.travel)+offset,anchors={};
  for(const [side,shift,x]of [['L',0,.129],['R',1,-.132]]){
    const plantSteps=Math.floor((phaseSteps+shift)/2)*2-shift-offset;
    if(plantSteps<0)continue;
    const runSteps=ROADSIDE_RUN_DISTANCE/.85,travel=plantSteps<=runSteps?plantSteps*.85:ROADSIDE_RUN_DISTANCE+(plantSteps-runSteps)*.35;
    if(travel>ROADSIDE_DISTANCE)continue;
    let lo=0,hi=1,pose;
    const emergence=travel<=ROADSIDE_RUN_DISTANCE;
    for(let n=0;n<22;n++){const p=(lo+hi)/2;pose=sampleRoadsideConfrontation(emergence?{chapter:'emergence',chapterProgress:p}:{chapter:'cabin',chapterTime:RETREAT_START+p*RETREAT_SECONDS});if(pose.travel<travel)lo=p;else hi=p;}
    const p=(lo+hi)/2;pose=sampleRoadsideConfrontation(emergence?{chapter:'emergence',chapterProgress:p}:{chapter:'cabin',chapterTime:RETREAT_START+p*RETREAT_SECONDS});
    const stride=emergence?.85:.35,front=stride*(emergence?.38:.56),sin=Math.sin(pose.yaw),cos=Math.cos(pose.yaw);
    anchors[side]=[pose.position[0]+x*cos+front*sin,.045,pose.position[2]-x*sin+front*cos];
  }
  return anchors;
}
