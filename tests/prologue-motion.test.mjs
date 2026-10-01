import test from 'node:test';
import assert from 'node:assert/strict';
import {samplePrologueMotion,createPrologueContactTracker} from '../src/prologue-motion.js';
import {createPrologueActor} from '../src/prologue-actors.js';

const durations={car:60,dispatch:23,emergence:25,walk:68,history:60,disappearance:50,arrival:16,rupture:24};
const actors=['mike','clarence','stanley'];
function frame(chapter,p,time=100+p){return {chapter,chapterProgress:p,time,chapterTime:p*durations[chapter]};}

test('retiming dialogue changes neither blocking nor distance-driven gait phase',()=>{
  const a=samplePrologueMotion(frame('history',.36,200)),b=samplePrologueMotion(frame('history',.36,340));
  for(const id of actors){assert.deepEqual(a.actors[id].position,b.actors[id].position);assert.equal(a.actors[id].phase,b.actors[id].phase);}
  assert.equal(new Set(actors.map(id=>a.actors[id].phase%Math.PI)).size,3);
});

test('guided paths and cumulative distances join without invented travel',()=>{
  for(const [before,after]of [['walk','history'],['history','disappearance'],['disappearance','arrival']]){
    const a=samplePrologueMotion(frame(before,1)),b=samplePrologueMotion(frame(after,0));
    for(const id of actors){assert.deepEqual(a.actors[id].position,b.actors[id].position);assert.equal(a.actors[id].distance,b.actors[id].distance);assert.equal(a.actors[id].phase,b.actors[id].phase);}
  }
  const roadside=samplePrologueMotion(frame('emergence',1)),walk=samplePrologueMotion(frame('walk',0));
  for(const id of actors)for(let axis=0;axis<3;axis++)assert.ok(Math.abs(roadside.actors[id].position[axis]-walk.actors[id].position[axis])<1e-10);
});

test('Stanley keeps running until his translation ends and then stops contacts',()=>{
  const running=samplePrologueMotion(frame('emergence',.32)),stopped=samplePrologueMotion(frame('emergence',.34)),later=samplePrologueMotion(frame('emergence',.60));
  assert.equal(running.actors.stanley.mode,'run');assert.equal(stopped.actors.stanley.mode,'breathe');
  assert.deepEqual(stopped.actors.stanley.position,later.actors.stanley.position);assert.equal(stopped.actors.stanley.phase,later.actors.stanley.phase);
});

test('Clarence steps out onto a planted foot and remains planted before the walk',()=>{
  const a=samplePrologueMotion(frame('emergence',.91)).actors.clarence;
  assert.equal(a.stepOut,true);assert.equal(a.grounded,true);assert.equal(a.phase,Math.PI);
  assert.equal(samplePrologueMotion(frame('emergence',1)).actors.clarence.phase,Math.PI);
});

function collect(fps){
  const tracker=createPrologueContactTracker(),contacts=[];let time=0;
  for(const [chapter,duration]of Object.entries(durations)){
    for(let tick=0;tick<=duration*fps;tick++)for(const event of tracker.update(samplePrologueMotion(frame(chapter,tick/(duration*fps),time+tick/fps))))contacts.push({chapter,actor:event.actor,foot:event.foot,stepOut:event.stepOut,surface:event.surface});
    time+=duration;
  }
  return contacts;
}

test('contacts agree across frame rates and include exactly two car step-outs',()=>{
  const slow=collect(15),fast=collect(60);
  // A low-FPS frame can contain two actors' contacts; their per-actor order is fixed.
  for(const id of actors)assert.deepEqual(slow.filter(event=>event.actor===id),fast.filter(event=>event.actor===id));
  assert.deepEqual(slow.filter(event=>event.stepOut).map(event=>event.actor).sort(),['clarence','mike']);
  assert.ok(slow.some(event=>event.actor==='stanley'&&event.chapter==='emergence'&&event.surface==='hard'));
  assert.ok(slow.some(event=>event.actor==='mike'&&event.chapter==='walk'&&event.surface==='soft'));
  assert.equal(slow.some(event=>['car','dispatch','rupture'].includes(event.chapter)),false);
});

test('teleport, repeated frames, rewind, pause reset, and large gaps never catch up',()=>{
  const tracker=createPrologueContactTracker();
  tracker.update(samplePrologueMotion(frame('arrival',.15,300)));
  assert.deepEqual(tracker.update(samplePrologueMotion(frame('arrival',.16,300.1))),[]);
  assert.deepEqual(tracker.update(samplePrologueMotion(frame('arrival',.8,300.2))),[]);
  const a=samplePrologueMotion(frame('history',.4,180));tracker.reset();assert.deepEqual(tracker.update(a),[]);assert.deepEqual(tracker.update(a),[]);
  assert.deepEqual(tracker.update(samplePrologueMotion(frame('history',.39,179))),[]);
  assert.deepEqual(tracker.update(samplePrologueMotion(frame('history',.8,200))),[]);
  tracker.reset();assert.deepEqual(tracker.update(samplePrologueMotion(frame('history',.9,201))),[]);
});

test('reduced motion preserves foot contacts and empty return stays silent',()=>{
  const ordinary=samplePrologueMotion(frame('walk',.7)),reduced=samplePrologueMotion({...frame('walk',.7),reduced:true});
  for(const id of actors)assert.deepEqual(ordinary.actors[id],reduced.actors[id]);
  const tracker=createPrologueContactTracker();tracker.update(ordinary);
  assert.deepEqual(tracker.update(samplePrologueMotion({...frame('rupture',1,101),returning:true})),[]);
});

test('contact phase corresponds to the articulated cast flat-foot plant',()=>{
  const actor=createPrologueActor(),hip=actor.root.children[0],legs=hip.children.filter(child=>child.isGroup&&child.position.y===-.045);
  assert.equal(legs.length,2);
  for(const phase of [0,Math.PI,Math.PI*2]){
    actor.pose({time:17,phase,mode:'walk'});actor.root.updateMatrixWorld(true);
    for(const thigh of legs){
      const knee=thigh.children.find(child=>child.isGroup);
      assert.ok(Math.abs(thigh.rotation.x)<1e-10);assert.ok(Math.abs(knee.rotation.x)<1e-10);
      // Both soles are level at the contact boundary; the cursor alternates lead feet.
      const bottoms=knee.children.filter(child=>child.isMesh).map(child=>{child.geometry.computeBoundingBox();return child.geometry.boundingBox.min.y;});
      assert.ok(Math.abs(hip.position.y-.045-.42+Math.min(...bottoms)-.009)<1e-7);
    }
  }
  const geometries=new Set(),materials=new Set();actor.root.traverse(object=>{if(object.geometry)geometries.add(object.geometry);if(object.material)materials.add(object.material);});
  for(const geometry of geometries)geometry.dispose();for(const material of materials)material.dispose();
});
