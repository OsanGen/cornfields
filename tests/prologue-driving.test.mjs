import test from 'node:test';
import assert from 'node:assert/strict';
import {createPrologueTimeline} from '../src/prologue-script.js';
import {samplePrologueDriving} from '../src/prologue-driving.js';
import {createPrologue} from '../src/prologue.js';

const timeline=createPrologueTimeline(),chapter=id=>timeline.chapters.find(c=>c.id===id);
const frame=(id,time)=>({chapter:id,chapterTime:time});
const sample=(id,time,script=timeline)=>samplePrologueDriving(frame(id,time),{timeline:script});
const near=(a,b,tolerance=1e-8)=>assert.ok(Math.abs(a-b)<=tolerance,`${a} != ${b}`);

test('driving chapters join continuously at the roadside origin for actual and retimed speech',()=>{
  for(const script of [timeline,createPrologueTimeline({durations:{'CAR-01':24,'RAD-01':30,'RAD-02':7}})]){
    const car=script.chapters.find(c=>c.id==='car'),dispatch=script.chapters.find(c=>c.id==='dispatch');
    const before=sample('car',car.end-car.start,script),after=sample('dispatch',0,script);
    assert.deepEqual(after.position,before.position);near(after.yaw,before.yaw);near(after.speed,before.speed);near(after.steer,before.steer);near(after.wheelRoll,before.wheelRoll);near(after.bodyPitch,before.bodyPitch);
    const end=sample('dispatch',dispatch.end-dispatch.start,script),parked=sample('emergence',0,script);
    assert.deepEqual(end,parked);assert.deepEqual(end.position,[0,0,0]);assert.equal(end.yaw,0);assert.equal(end.speed,0);assert.equal(end.parked,true);
  }
});

test('car advances forward, eases onto the right shoulder, straightens, and stops without reversing',()=>{
  const duration=chapter('dispatch').end-chapter('dispatch').start;
  let previous=sample('dispatch',0),rightTurn=false,straightening=false,braking=false;
  for(let i=1;i<=240;i++){
    const next=sample('dispatch',duration*i/240);
    assert.ok(next.position[0]>=previous.position[0]-1e-9);assert.ok(next.position[2]<=previous.position[2]+1e-9);
    assert.ok(next.speed<=previous.speed+1e-9);assert.ok(next.distance>=previous.distance);assert.ok(next.wheelRoll>=previous.wheelRoll);
    assert.ok(next.yaw<=1e-9&&next.yaw>-.65);assert.ok(Math.abs(next.bodyRoll)<=.02);
    rightTurn||=next.steer<-.001;straightening||=next.steer>.001;braking||=next.speed<previous.speed;
    previous=next;
  }
  assert.ok(rightTurn&&straightening&&braking);assert.equal(previous.parked,true);
});

test('reported heading, speed and wheel travel follow the same position derivative',()=>{
  const duration=chapter('dispatch').end-chapter('dispatch').start,dt=.001;
  for(const fraction of [.05,.25,.45,.65,.8]){
    const time=duration*fraction,before=sample('dispatch',time-dt),at=sample('dispatch',time),after=sample('dispatch',time+dt);
    const dx=(after.position[0]-before.position[0])/(2*dt),dz=(after.position[2]-before.position[2])/(2*dt);
    near(Math.hypot(dx,dz),at.speed,.002);near(Math.atan2(-dx,-dz),at.yaw,.00002);
    near((after.wheelRoll-before.wheelRoll)*.31/(2*dt),at.speed,.000001);
  }
});

test('sampling is independent of frame count and repeated paused frames do not advance',()=>{
  const at=chapter('dispatch').start+4;
  const endFor=rate=>{
    let value;
    for(let i=0;i<Math.floor(at*rate);i++)value=samplePrologueDriving({chapter:'car',time:i/rate},{timeline});
    value=samplePrologueDriving({chapter:'dispatch',storyTime:at},{timeline});
    return value;
  };
  assert.deepEqual(endFor(24),endFor(60));assert.deepEqual(endFor(60),endFor(144));
  const controller=createPrologue({timeline});controller.begin();controller.tick(at);controller.pause();
  const held=samplePrologueDriving(controller.frame(),{timeline});controller.tick(8);
  assert.deepEqual(samplePrologueDriving(controller.frame(),{timeline}),held);
});

test('reduced motion removes secondary bounce without changing travel, steering or braking',()=>{
  const normal=samplePrologueDriving(frame('dispatch',3),{timeline}),reduced=samplePrologueDriving({...frame('dispatch',3),reduced:true},{timeline});
  for(const key of ['position','yaw','speed','steer','wheelRoll','bodyRoll','distance','parked'])assert.deepEqual(normal[key],reduced[key]);
  assert.ok(Math.abs(normal.bodyPitch-reduced.bodyPitch)<.0013);
  const skipped=samplePrologueDriving({chapter:'rupture',time:timeline.duration},{timeline});
  assert.deepEqual(skipped.position,[0,0,0]);assert.equal(skipped.yaw,0);assert.equal(skipped.parked,true);
});
