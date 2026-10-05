import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {createPrologueTimeline} from '../src/prologue-script.js';
import {samplePrologueDriving} from '../src/prologue-driving.js';
import {sampleRoadsideConfrontation,ROADSIDE_ENCOUNTER} from '../src/prologue-confrontation.js';
import {createPrologue} from '../src/prologue.js';

// 2026-10-05 v2 outcome: dispatch no longer parks the car before Stanley appears.
// Replace only that obsolete staging expectation; preserve exact endpoint,
// derivative, frame-rate, pause, reduced-motion and world-space safety checks.
const timeline=createPrologueTimeline(),chapter=(id,t=timeline)=>t.chapters.find(c=>c.id===id);
const frame=(id,time)=>({chapter:id,chapterTime:time});
const sample=(id,time,script=timeline)=>samplePrologueDriving(frame(id,time),{timeline:script});
const near=(a,b,tolerance=1e-8)=>assert.ok(Math.abs(a-b)<=tolerance,`${a} != ${b}`);

test('car and dispatch join at cruise speed and emergence carries the actual stop for retimed speech',()=>{
  for(const script of [timeline,createPrologueTimeline({durations:{'CAR-01':24,'RAD-01':30,'RAD-02':7}})]){
    for(const [before,after]of [['car','dispatch'],['dispatch','emergence']]){
      const c=chapter(before,script),a=sample(before,c.end-c.start,script),b=sample(after,0,script);
      for(const key of ['position','speed','distance','wheelRoll'])assert.deepEqual(a[key],b[key]);near(a.yaw,b.yaw);near(a.steer,b.steer);near(a.bodyPitch,b.bodyPitch);assert.equal(a.parked,false);
    }
    const e=chapter('emergence',script),end=sample('emergence',e.end-e.start,script),parked=sample('bang',0,script);
    for(const key of ['position','yaw','speed','steer','wheelRoll','bodyPitch','bodyRoll','distance','parked'])assert.deepEqual(end[key],parked[key]);assert.deepEqual(end.position,[0,0,0]);assert.equal(end.parked,true);
    assert.equal(script.lines.find(l=>l.id==='RAD-02').chapter,'emergence');assert.equal(script.lines.find(l=>l.id==='ARR-00').chapter,'bang');
  }
});

test('Clarence reacts after half a second, honks once, brakes to 2.3s and then settles',()=>{
  let previous=sample('emergence',0),rightTurn=false,straightening=false,braking=false;
  for(let i=1;i<=260;i++){
    const t=i/100,next=sample('emergence',t);
    assert(next.position[0]>=previous.position[0]-1e-9);assert(next.position[2]<=previous.position[2]+1e-9);
    assert(next.speed<=previous.speed+1e-9);assert(next.distance>=previous.distance);assert(next.wheelRoll>=previous.wheelRoll);
    assert(next.yaw<=1e-9&&next.yaw>-.8);assert(Math.abs(next.bodyRoll)<=.02);
    if(t<.5){near(next.speed,6);near(next.yaw,0);assert.equal(next.honk,false);}
    if(t>=.5&&t<.82)assert.equal(next.honk,true);
    rightTurn||=next.steer<-.001;straightening||=next.steer>.001;braking||=next.speed<previous.speed;previous=next;
  }
  assert(rightTurn&&straightening&&braking);assert(previous.parked);
  assert.equal(sample('emergence',2.299).parked,false);assert.equal(sample('emergence',2.3).parked,true);
  assert.equal(timeline.cues.filter(([id])=>id==='car_honk').length,1);
});

test('reported heading, speed and wheel travel follow the actual position derivative',()=>{
  const dt=.0005;
  for(const time of [.1,.3,.6,.85,1.1,1.4,1.8,2.1]){
    const before=sample('emergence',time-dt),at=sample('emergence',time),after=sample('emergence',time+dt);
    const dx=(after.position[0]-before.position[0])/(2*dt),dz=(after.position[2]-before.position[2])/(2*dt);
    near(Math.hypot(dx,dz),at.speed,.003);near(Math.atan2(-dx,-dz),at.yaw,.00006);near((after.wheelRoll-before.wheelRoll)*.31/(2*dt),at.speed,.000002);
  }
});

test('Stanley remains at least one metre clear of the complete moving cruiser envelope',()=>{
  const bodyRadius=.32;let minimum=Infinity;
  const first=sample('emergence',0),father=sampleRoadsideConfrontation(frame('emergence',0));
  assert(first.position[2]-1.617-father.position[2]>=12,'first emergence is at least 12m ahead of front bumper');
  for(let i=0;i<230;i++){
    const t=i/100,drive=sample('emergence',t),s=sampleRoadsideConfrontation(frame('emergence',t));
    const matrix=new T.Matrix4().compose(new T.Vector3().fromArray(drive.position),new T.Quaternion().setFromEuler(new T.Euler(drive.bodyPitch,drive.yaw,drive.bodyRoll,'YXZ')),new T.Vector3(1,1,1));
    const local=new T.Vector3(s.position[0],.9,s.position[2]).applyMatrix4(matrix.invert());
    const car=new T.Box3(new T.Vector3(-1.363,0,-1.617),new T.Vector3(1.363,1.65,2.74));
    minimum=Math.min(minimum,car.distanceToPoint(local)-bodyRadius);assert(minimum>=1);
    if(t>=.65){assert.equal(s.moving,false);assert.deepEqual(s.position,[-2.3,0,-7.5]);}
  }
  assert(ROADSIDE_ENCOUNTER.approach>ROADSIDE_ENCOUNTER.stop);
});

test('sampling, pause and reduced effects keep a single story-clock path',()=>{
  const at=chapter('emergence').start+1.2;
  const endFor=rate=>{for(let i=0;i<Math.floor(at*rate);i++)samplePrologueDriving({chapter:'car',time:i/rate},{timeline});return samplePrologueDriving({chapter:'emergence',storyTime:at},{timeline});};
  assert.deepEqual(endFor(24),endFor(60));assert.deepEqual(endFor(60),endFor(144));
  const controller=createPrologue({timeline});controller.begin();controller.tick(at);controller.pause();const held=samplePrologueDriving(controller.frame(),{timeline});controller.tick(8);assert.deepEqual(samplePrologueDriving(controller.frame(),{timeline}),held);
  const normal=samplePrologueDriving(frame('emergence',1.2),{timeline}),reduced=samplePrologueDriving({...frame('emergence',1.2),reduced:true},{timeline});
  for(const key of ['position','yaw','speed','steer','wheelRoll','bodyRoll','distance','parked','honk'])assert.deepEqual(normal[key],reduced[key]);
  assert(Math.abs(normal.bodyPitch-reduced.bodyPitch)<.0013);assert.deepEqual(samplePrologueDriving({chapter:'rupture'}).position,[0,0,0]);
});
