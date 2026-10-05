import {createPrologue} from '../src/prologue.js';
import {PROLOGUE_VOICE_TIMING} from '../src/prologue-voice-timing.js';
import {samplePrologueExit} from '../src/prologue-performance.js';
import nodeTest from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createTexturedPrologueActor} from '../src/prologue-model-actor.js';
import {createPrologueActor} from '../src/prologue-actors.js';
import {BANG_TIMES,sampleRoadsideConfrontation} from '../src/prologue-confrontation.js';

// Keep actual animation, skinning, and geometry, without requiring browser image
// decoding in Node. Texture ownership is checked with an injected texture below.
async function castFixture(file) {
  const bytes = await readFile(new URL('../assets/intro/'+file, import.meta.url));
  const length = bytes.readUInt32LE(12), json = JSON.parse(bytes.subarray(20, 20 + length));
  for (const material of json.materials) {
    delete material.pbrMetallicRoughness.baseColorTexture;
    delete material.pbrMetallicRoughness.metallicRoughnessTexture;
    for (const key of ['normalTexture', 'occlusionTexture', 'emissiveTexture']) delete material[key];
  }
  delete json.images; delete json.textures; delete json.samplers;
  const source = Buffer.from(JSON.stringify(json)), padded = Buffer.alloc(Math.ceil(source.length / 4) * 4, 32);
  source.copy(padded);
  const binary = bytes.subarray(20 + length), output = Buffer.alloc(20 + padded.length + binary.length);
  bytes.copy(output, 0, 0, 12); output.writeUInt32LE(output.length, 8);
  output.writeUInt32LE(padded.length, 12); output.writeUInt32LE(0x4e4f534a, 16);
  padded.copy(output, 20); binary.copy(output, 20 + padded.length);
  return new GLTFLoader().parseAsync(output.buffer, '');
}
for(const file of ['cast.glb','cast-clarence.glb','cast-stanley.glb']){
const cast = await castFixture(file);
const test=(title,run)=>nodeTest(file+': '+title,run);

test('roadside approach, two contacts and cabin retreat share continuous endpoints',()=>{
  assert.deepEqual(sampleRoadsideConfrontation({chapter:'emergence',chapterProgress:1}).position,sampleRoadsideConfrontation({chapter:'bang',chapterTime:0}).position);
  assert.deepEqual(sampleRoadsideConfrontation({chapter:'bang',chapterTime:2}).position,sampleRoadsideConfrontation({chapter:'cabin',chapterTime:0}).position);
  for(const chapterTime of BANG_TIMES){const sample=sampleRoadsideConfrontation({chapter:'bang',chapterTime});assert.equal(sample.bang,1);assert.equal(sample.impact,1);}
  assert.deepEqual(sampleRoadsideConfrontation({chapter:'cabin',chapterTime:3.05}).position,[2.1,0,-2.25]);
});

test('both cast rigs reach the passenger-window targets and retract between impacts',()=>{
  const targets=[[.18,1.08,.395],[-.18,1.08,.395]];
  for(const actor of [createTexturedPrologueActor({gltf:cast,police:false}),createPrologueActor({police:false})]){
    actor.root.position.set(1.42,0,-.48);actor.root.rotation.y=-Math.PI/2;
    actor.pose({mode:'bang',bang:1,bangTargets:targets});const contact=actor.diagnostics();
    for(let i=0;i<2;i++)assert.ok(Math.hypot(...contact.windowContacts[i].map((v,j)=>v-contact.windowTargets[i][j]))<.015);
    actor.pose({mode:'bang',bang:0,bangTargets:targets});const retreat=actor.diagnostics();
    assert.ok(retreat.windowContacts.every((point,i)=>point[2]<contact.windowContacts[i][2]-.15));actor.dispose?.();
  }
});
function bones(actor) {
  const result = new Map(); actor.root.traverse(object => { if (object.isBone) result.set(object.name, object); }); return result;
}
function point(actor, bone) { return actor.root.worldToLocal(bone.getWorldPosition(new THREE.Vector3())).toArray(); }
function snapshot(actor) { return [...bones(actor)].map(([name, bone]) => [name, ...point(actor, bone), ...bone.quaternion.toArray()]); }

test('textured actor samples movement by shared stride phase, and seeks without accumulated posing', () => {
  const actor = createTexturedPrologueActor({gltf:cast});
  actor.pose({mode:'walk', time:1, phase:.7}); const expected = snapshot(actor);
  actor.pose({mode:'drive', time:27, steer:.1, look:.6});
  actor.pose({mode:'limp', corpse:true, dissolve:.8});
  actor.pose({mode:'walk', time:300, phase:.7}); assert.deepEqual(snapshot(actor), expected);
  actor.pose({mode:'walk', phase:.7 + Math.PI}); assert.notDeepEqual(snapshot(actor), expected);
  assert.equal(actor.diagnostics().height, 1.8); actor.dispose();
});

test('seated driver pins both hands to the wheel when actor or parent rotates', () => {
  const actor = createTexturedPrologueActor({gltf:cast});
  const stage = new THREE.Group(); stage.position.set(4, 2, -3); stage.rotation.y = .9; stage.add(actor.root);
  actor.root.position.set(-.45, -.38, .09); actor.root.rotation.y = Math.PI;
  for (const steer of [-.12, 0, .12]) {
    actor.pose({mode:'drive', time:8, steer});
    const joints = bones(actor), targets = actor.diagnostics().wristTargets;
    for (const [index, side] of ['L', 'R'].entries()) {
      const hand = point(actor, joints.get(`hand${side}`));
      assert.ok(Math.hypot(...hand.map((value, axis) => value - targets[index][axis])) < 1e-6);
      const forearm = point(actor, joints.get(`armlo${side}`));
      assert.ok(Math.hypot(...hand.map((value, axis) => value - forearm[axis])) < .34, 'wrist must remain within forearm reach');
    }
  }
  actor.dispose();
});

test('wheel fitting deforms the visible palm and sleeve vertices toward the wheel', () => {
  const actor = createTexturedPrologueActor({gltf:cast});
  actor.root.position.set(-.45, -.38, .09); actor.root.rotation.y = Math.PI;
  actor.pose({mode:'drive', time:8, steer:0});
  const region = boneName => {
    const sum = new THREE.Vector3(); let count = 0;
    actor.root.traverse(mesh => {
      if (!mesh.isSkinnedMesh) return;
      const indices = mesh.geometry.attributes.skinIndex, weights = mesh.geometry.attributes.skinWeight;
      const bone = mesh.skeleton.bones.findIndex(bone => bone.name === boneName);
      for (let index = 0; index < indices.count; index++) {
        let weight = 0;
        for (let slot = 0; slot < 4; slot++) if (indices.getComponent(index, slot) === bone) weight += weights.getComponent(index, slot);
        if (weight < .8) continue;
        const point = mesh.getVertexPosition(index, new THREE.Vector3());
        sum.add(actor.root.worldToLocal(mesh.localToWorld(point))); count++;
      }
    });
    assert.ok(count > 10); return sum.divideScalar(count);
  };
  for (const side of ['L', 'R']) {
    const palm = region(`hand${side}`), sleeve = region(`armlo${side}`);
    const target = new THREE.Vector3().fromArray(actor.diagnostics().wristTargets[side === 'L' ? 0 : 1]);
    assert.ok(palm.distanceTo(target) < .12, `${side} visible palm must surround its wheel target`);
    assert.ok(palm.z > .40 && palm.z < .58, `${side} palm follows the relocated wheel ${palm.toArray()}`);
    assert.ok(sleeve.z > .15, `${side} sleeve ${sleeve.toArray()}`);
  }
  actor.dispose();
});

test('visible face points along actor forward in standing and driving poses', () => {
  const actor = createTexturedPrologueActor({gltf:cast}); actor.root.rotation.set(0, Math.PI, 0, 'YXZ');
  let face; actor.root.traverse(object => {if (object.isSkinnedMesh && object.name === 'headHDmale') face = object;});
  assert.ok(face);
  for (const mode of ['standing', 'drive']) {
    actor.pose({mode, time:2});
    const nose = new THREE.Vector3(), positions = face.geometry.attributes.position; let count = 0;
    // Central, protruding face vertices are a visible landmark, independent of
    // whichever axis the source rig's mouth control happens to use.
    for (let index = 0; index < positions.count; index++) {
      if (Math.abs(positions.getX(index)) > .04 || positions.getZ(index) < .25) continue;
      nose.add(actor.root.worldToLocal(face.localToWorld(face.getVertexPosition(index, new THREE.Vector3())))); count++;
    }
    assert.ok(count > 2); nose.divideScalar(count);
    const head = point(actor, bones(actor).get('head'));
    assert.ok(nose.z > head[2] + .08, `${mode}: face must point along actor +Z`);
  }
  actor.dispose();
});

test('cast instances own poses and materials, share source geometry, and restore corpse tint', () => {
  const first = createTexturedPrologueActor({gltf:cast}), second = createTexturedPrologueActor({gltf:cast, police:false});
  const meshes = actor => { const result = []; actor.root.traverse(object => {if (object.isSkinnedMesh) result.push(object);}); return result; };
  const a = meshes(first), b = meshes(second);
  assert.ok(a.length > 0); assert.equal(a[0].geometry, b[0].geometry); assert.notEqual(a[0].material, b[0].material); assert.notEqual(a[0].skeleton, b[0].skeleton);
  first.pose({mode:'standing'}); second.pose({mode:'standing'});
  const initial = a.map(mesh => mesh.material.color.getHex()), untouched = snapshot(second);
  first.pose({mode:'limp', corpse:true, dissolve:.65});
  assert.notDeepEqual(a.map(mesh => mesh.material.color.getHex()), initial);
  assert.deepEqual(snapshot(second), untouched);
  const shader = {uniforms:{}, vertexShader:'#include <begin_vertex>', fragmentShader:'#include <clipping_planes_fragment>'};
  a[0].material.onBeforeCompile(shader); assert.equal(shader.uniforms.prologueDecay.value, .65);
  first.pose({mode:'standing'}); assert.deepEqual(a.map(mesh => mesh.material.color.getHex()), initial);
  assert.equal(shader.uniforms.prologueDecay.value, 0);
  let disposedGeometry = false; a[0].geometry.addEventListener('dispose', () => {disposedGeometry = true;});
  first.dispose(); first.dispose(); assert.equal(disposedGeometry, false); second.dispose();
});

test('missing cast keeps the established procedural actor contract', () => {
  const actor = createTexturedPrologueActor(); actor.pose({mode:'limp', corpse:true, dissolve:.5});
  assert.equal(actor.root.name, 'Prologue Clarence'); assert.equal(actor.diagnostics().pose, 'limp');
  assert.equal(actor.diagnostics().dissolve, .5); actor.dispose();
});

test('polished walk preserves limb lengths and locks supported feet on translated stage',()=>{
  const actor=createTexturedPrologueActor({gltf:cast}),stage=new THREE.Group();stage.position.set(4,2,-3);stage.rotation.y=.7;stage.add(actor.root);
  const joints=bones(actor),lengths=()=>['L','R'].map(side=>{
    const a=joints.get('legup'+side).getWorldPosition(new THREE.Vector3()),b=joints.get('leglo'+side).getWorldPosition(new THREE.Vector3()),c=joints.get('foot1'+side).getWorldPosition(new THREE.Vector3());return[a.distanceTo(b),b.distanceTo(c)];
  });
  const expected=new Map();let maximum=0;
  for(let i=0;i<120;i++){
    const distance=i*.008,phase=distance/.48*Math.PI;actor.root.position.z=distance;
    actor.pose({time:i/60,phase,mode:'walk',gait:1,support:{time:i/60,distance,phase,stride:.48,grounded:true,moving:true,segment:'outdoors'}});
    const current=lengths();for(const pair of current)assert(pair.every(n=>n>.2&&n<.5));
    for(const foot of actor.diagnostics().feet){maximum=Math.max(maximum,foot.error);if(foot.planted&&foot.locked){const world=joints.get('foot1'+foot.side).getWorldPosition(new THREE.Vector3()),key=foot.side+Math.floor(phase/(Math.PI*2)+(foot.side==='R'?.5:0));if(expected.has(key))assert(world.distanceTo(expected.get(key))<.002,`frame ${i} ${foot.side} drift ${world.distanceTo(expected.get(key))} error ${foot.error}`);else expected.set(key,world);}}
  }
  assert(maximum<.025,`maximum fitted ankle error ${maximum}`);actor.dispose();
});

test('speech cannot replace walking legs and idle clips have normalized explicit weights',()=>{
  const actor=createTexturedPrologueActor({gltf:cast});
  actor.pose({mode:'walk',phase:.8,gait:.6,speaking:false});const joints=bones(actor),leg=joints.get('legupL').quaternion.clone();
  actor.pose({mode:'walk',phase:.8,gait:.6,speaking:true,performance:{lineId:'ARR-00',lineOffset:.8,emphasis:1}});
  assert(leg.angleTo(joints.get('legupL').quaternion)<1e-7);assert(Math.abs(Object.values(actor.diagnostics().blends).reduce((a,b)=>a+b,0)-1)<1e-8);
  assert(actor.diagnostics().speech>0);actor.pose({mode:'standing',speaking:true,performance:{lineId:'ARR-00',lineOffset:99}});assert.equal(actor.diagnostics().speech,0);actor.dispose();
});

test('fitted eyelids close without scaling eyeballs and dispose their own geometry',()=>{
  const actor=createTexturedPrologueActor({gltf:cast});actor.pose({mode:'standing',performance:{blink:0}});
  const lids=[];actor.root.traverse(o=>{if(o.name==='Fitted upper eyelid')lids.push(o)});assert.equal(lids.length,2);
  const before=lids[0].geometry.attributes.position.array.slice();const eye=bones(actor).get('eyeL'),scale=eye.scale.clone();
  actor.pose({mode:'standing',performance:{blink:1}});assert.notDeepEqual(lids[0].geometry.attributes.position.array,before);assert.deepEqual(eye.scale,scale);
  let disposed=0;lids.forEach(o=>o.geometry.addEventListener('dispose',()=>disposed++));actor.dispose();assert.equal(disposed,2);
});


test('actual approach and retreat release turns and preserve continuous support at 60 Hz',()=>{
  const story=createPrologue({durations:PROLOGUE_VOICE_TIMING}),actor=createTexturedPrologueActor({gltf:cast,police:false}),joints=bones(actor),last=new Map();
  story.begin();story.tick(34.40);let maxPlanted=0,maxJump=0,maxTransition=0;
  for(let i=0;i<660;i++){
    story.tick(1/60);const frame=story.frame(),a=frame.motion.actors.stanley;actor.root.position.fromArray(a.position);actor.root.rotation.y=a.yaw;
    actor.pose({...a,time:frame.elapsed});
    assert.equal(a.contactIndex,Math.floor(a.phase/Math.PI+1e-9));
    for(const foot of actor.diagnostics().feet){
      if(foot.planted)maxPlanted=Math.max(maxPlanted,foot.error);
      const world=joints.get('foot1'+foot.side).getWorldPosition(new THREE.Vector3()),previous=last.get(foot.side);
      if(previous){const distance=world.distanceTo(previous.world);maxJump=Math.max(maxJump,distance);if(previous.mode!==a.mode)maxTransition=Math.max(maxTransition,distance);}
      last.set(foot.side,{world,mode:a.mode});
    }
  }
  assert(maxPlanted<.025,`planted error ${maxPlanted}`);assert(maxJump<.24,`per-frame foot displacement ${maxJump}`);assert(maxTransition<.09,`stop/start discontinuity ${maxTransition}`);
  actor.dispose();story.dispose();
});

test('driver exit keeps both fitted legs in reach while the door-side turn completes',()=>{
  const actor=createTexturedPrologueActor({gltf:cast}),stage=new THREE.Group();stage.add(actor.root);let max=0;
  for(let t=0;t<=1.601;t+=1/120){const exitPose=samplePrologueExit(t);actor.root.position.fromArray(exitPose.driver);actor.root.rotation.y=exitPose.driverYaw;actor.pose({mode:'exit',exitPose,time:t,gait:0});for(const foot of actor.diagnostics().feet)max=Math.max(max,foot.error);}
  assert(max<.012,`driver ankle fit ${max}`);actor.dispose();
});


test('contact checkpoints restore a fresh actor to the same supported pose',()=>{
  const story=createPrologue({durations:PROLOGUE_VOICE_TIMING}),actor=createTexturedPrologueActor({gltf:cast,police:false});story.begin();story.tick(34.4);
  for(let i=0;i<150;i++){story.tick(1/60);const f=story.frame(),a=f.motion.actors.stanley;actor.root.position.fromArray(a.position);actor.root.rotation.y=a.yaw;actor.pose({...a,time:f.elapsed});}
  const checkpoint=structuredClone(actor.capturePoseState());story.tick(1/60);const frame=story.frame(),a=frame.motion.actors.stanley;
  actor.root.position.fromArray(a.position);actor.root.rotation.y=a.yaw;actor.pose({...a,time:frame.elapsed});const expected=snapshot(actor);
  const fresh=createTexturedPrologueActor({gltf:cast,police:false});assert(fresh.restorePoseState(checkpoint));fresh.root.position.fromArray(a.position);fresh.root.rotation.y=a.yaw;fresh.pose({...a,time:frame.elapsed});
  const actual=snapshot(fresh);for(let i=0;i<actual.length;i++)for(let j=1;j<actual[i].length;j++)assert(Math.abs(actual[i][j]-expected[i][j])<1e-8);
  fresh.dispose();actor.dispose();story.dispose();
});


test('visible textured hand skin contacts the pane without wrist-origin penetration',()=>{
  const actor=createTexturedPrologueActor({gltf:cast,police:false});actor.root.position.set(1.42,0,.30);actor.root.rotation.y=-Math.PI/2;
  actor.pose({mode:'bang',bang:1,crouch:1,bangTargets:[[.18,1.08,.395],[-.18,1.08,.395]]});
  for(const side of ['L','R']){const names=new Set();bones(actor).get('hand'+side).traverse(b=>{if(b.isBone)names.add(b.name)});let min=Infinity,count=0;
    actor.root.traverse(mesh=>{if(!mesh.isSkinnedMesh)return;const ids=new Set(mesh.skeleton.bones.map((b,i)=>names.has(b.name)?i:-1).filter(i=>i>=0)),index=mesh.geometry.attributes.skinIndex,weight=mesh.geometry.attributes.skinWeight;
      for(let v=0;v<index.count;v++){let w=0;for(let slot=0;slot<4;slot++)if(ids.has(index.getComponent(v,slot)))w+=weight.getComponent(v,slot);if(w<.75)continue;min=Math.min(min,mesh.localToWorld(mesh.getVertexPosition(v,new THREE.Vector3())).x);count++;}
    });assert(count>100);assert(min>=1.024,`${side} hand penetrates glass: ${min}`);assert(min<1.027,`${side} hand floats off glass: ${min}`);
  }actor.dispose();
});


test('v2 walk calibrates upright mid-stance and preserves measured anatomy without the old crouch',()=>{
  const actor=createTexturedPrologueActor({gltf:cast}),joints=bones(actor);
  actor.pose({mode:'standing'});const refY=joints.get('legupL').getWorldPosition(new THREE.Vector3()).y;
  const reference=['L','R'].map(side=>{const a=joints.get('legup'+side).getWorldPosition(new THREE.Vector3()),b=joints.get('leglo'+side).getWorldPosition(new THREE.Vector3()),c=joints.get('foot1'+side).getWorldPosition(new THREE.Vector3());return[a.distanceTo(b),b.distanceTo(c)];});
  let flatSamples=0;
  for(let i=0;i<128;i++){
    actor.pose({mode:'walk',phase:i/128*Math.PI*2});
    actor.diagnostics().feet.forEach((foot,j)=>{
      const a=joints.get('legup'+foot.side).getWorldPosition(new THREE.Vector3()),b=joints.get('leglo'+foot.side).getWorldPosition(new THREE.Vector3()),c=joints.get('foot1'+foot.side).getWorldPosition(new THREE.Vector3());
      assert(refY-a.y<=.03+1e-6,`pelvis below upright reference by ${refY-a.y}`);
      assert(Math.abs(a.distanceTo(b)/reference[j][0]-1)<.01);assert(Math.abs(b.distanceTo(c)/reference[j][1]-1)<.01);
      if(foot.planted&&foot.contact==='sole'){flatSamples++;assert(foot.kneeDegrees>=5&&foot.kneeDegrees<=20,`mid-stance knee ${foot.kneeDegrees}`);}
      assert(foot.error<.01);
    });
  }
  assert(flatSamples>40);actor.dispose();
});

test('v2 independent run has different flight, leg and arm poses at the same shared phase',()=>{
  const actor=createTexturedPrologueActor({gltf:cast}),joints=bones(actor);let distinct=0;
  for(let i=0;i<8;i++){const phase=i/8*Math.PI*2;actor.pose({mode:'walk',phase});const walk=joints.get('handL').getWorldPosition(new THREE.Vector3()),foot=joints.get('foot1L').getWorldPosition(new THREE.Vector3());
    actor.pose({mode:'run',phase});assert.equal(actor.diagnostics().clip,'Run');assert(actor.diagnostics().locomotion.run.startsWith('independent authored'));
    if(walk.distanceTo(joints.get('handL').getWorldPosition(new THREE.Vector3()))>.08&&foot.distanceTo(joints.get('foot1L').getWorldPosition(new THREE.Vector3()))>.06)distinct++;
  }
  assert(distinct>=6);actor.dispose();
});

test('body-only normalization and seated pose do not add wheel grips or optional uniform draws',()=>{
  const box=new THREE.Box3().setFromObject(cast.scene),sourceHeight=box.getSize(new THREE.Vector3()).y;
  const actor=createTexturedPrologueActor({gltf:cast,sourceHeight,uniformDetails:false});actor.pose({mode:'seated'});
  assert.equal(actor.diagnostics().clip,'Seated');assert.deepEqual(actor.diagnostics().wristTargets,[]);
  assert.equal(actor.diagnostics().feet.length,2);assert(actor.diagnostics().feet.every(f=>f.error<.012));
  let details=0;actor.root.traverse(o=>{if(o.name.startsWith('Fictional police uniform '))details++});assert.equal(details,0);actor.dispose();
});


test('supported walk, turns, uneven soles and start-stop keep anatomy and ground-contact bounds',()=>{
  for(const scenario of ['straight','turn','uneven','start-stop']){
    const actor=createTexturedPrologueActor({gltf:cast}),joints=bones(actor),shoe=actor.root.getObjectByName('black_fancy_shoes'),g=shoe.geometry;
    const vertices=['L','R'].map(side=>{const ids=new Set(shoe.skeleton.bones.flatMap((b,i)=>b.name==='foot1'+side||b.name==='foot2'+side?[i]:[]));return Array.from({length:g.attributes.position.count},(_,v)=>v).filter(v=>{let w=0;for(let k=0;k<4;k++)if(ids.has(g.attributes.skinIndex.getComponent(v,k)))w+=g.attributes.skinWeight.getComponent(v,k);return w>.75;});});
    actor.pose({});const pelvisY=joints.get('pelvis').getWorldPosition(new THREE.Vector3()).y;
    const lengths=['L','R'].map(side=>{const a=joints.get('legup'+side).getWorldPosition(new THREE.Vector3()),b=joints.get('leglo'+side).getWorldPosition(new THREE.Vector3()),c=joints.get('foot1'+side).getWorldPosition(new THREE.Vector3());return[a.distanceTo(b),b.distanceTo(c)];});
    let distance=0,flatCount=0;const anchors=new Map();
    for(let i=0;i<180;i++){
      const moving=scenario!=='start-stop'||i>=15&&i<130,gait=scenario==='start-stop'?i<15?0:i<30?(i-15)/15:i<130?1:i<145?1-(i-130)/15:0:1;
      if(moving)distance+=.005;const phase=distance/.35*Math.PI,terrainHeights=scenario==='uneven'?{L:.015,R:-.010}:null;
      actor.root.position.z=distance;if(scenario==='turn')actor.root.rotation.y=Math.min(1,i/240);
      actor.pose({mode:moving?'walk':'standing',phase,gait,support:{time:i/60,distance,stride:.35,moving,grounded:true,terrainHeights}});shoe.skeleton.update();
      assert(pelvisY-joints.get('pelvis').getWorldPosition(new THREE.Vector3()).y<=.03+1e-6,scenario+' upright pelvis');
      for(const[j,f]of actor.diagnostics().feet.entries()){
        const a=joints.get('legup'+f.side).getWorldPosition(new THREE.Vector3()),b=joints.get('leglo'+f.side).getWorldPosition(new THREE.Vector3()),c=joints.get('foot1'+f.side).getWorldPosition(new THREE.Vector3());
        assert(Math.abs(a.distanceTo(b)/lengths[j][0]-1)<.01,scenario+' thigh length');assert(Math.abs(b.distanceTo(c)/lengths[j][1]-1)<.01,scenario+' shin length');assert(f.error<.01,scenario+' contact reach');
        if(f.planted){let minimum=Infinity;for(const v of vertices[j])minimum=Math.min(minimum,shoe.localToWorld(shoe.getVertexPosition(v,new THREE.Vector3())).y-(terrainHeights?.[f.side]||0));assert(minimum>=-.01&&minimum<=.01,scenario+' visible sole clearance '+minimum);}
        if(f.planted&&f.contact==='sole'&&gait>=.99){flatCount++;assert(f.kneeDegrees>=5&&f.kneeDegrees<=20,scenario+' mid-stance knee '+f.kneeDegrees);}
        if(f.locked&&gait>=.99){const key=f.side+':'+f.cycle;if(anchors.has(key))assert(c.distanceTo(anchors.get(key))<=.02,scenario+' support drift');else anchors.set(key,c);}
      }
    }
    assert(flatCount>25);actor.dispose();
  }
});


test('run urgency and steering preserve both measured arm segments on the scaled source rig',()=>{
 const actor=createTexturedPrologueActor({gltf:cast}),joints=bones(actor),lengths=()=>['L','R'].map(s=>{const p=['armup','armlo','hand'].map(n=>joints.get(n+s).getWorldPosition(new THREE.Vector3()));return[p[0].distanceTo(p[1]),p[1].distanceTo(p[2])];});
 actor.pose({});const reference=lengths();
 for(const mode of ['walk','run','drive'])for(let i=0;i<32;i++){
  actor.pose({mode,phase:i/32*Math.PI*2,gait:mode==='walk'?.5:null,steer:Math.sin(i/32*Math.PI*2)*.12});
  lengths().forEach((pair,j)=>pair.forEach((length,k)=>assert(Math.abs(length/reference[j][k]-1)<.01,mode+' arm segment length')));
 }
 actor.dispose();
});


test('turning restart blends support orientation continuously when full gait is reached',()=>{
 const actor=createTexturedPrologueActor({gltf:cast}),joints=bones(actor),stride=.35,startDistance=3.126547615174693;
 actor.root.position.set(-1.3,0,-3.48);actor.root.rotation.y=Math.PI;
 actor.pose({mode:'standing',phase:(startDistance/stride+.37)*Math.PI,gait:0,support:{time:0,distance:startDistance,stride,moving:false,grounded:true}});
 let prior=['L','R'].map(side=>joints.get('foot1'+side).getWorldQuaternion(new THREE.Quaternion()));
 for(let i=1;i<=24;i++){
  const distance=startDistance+i*.0108333333333333,phase=(distance/stride+.37)*Math.PI,gait=Math.min(1,i/16.8);
  actor.root.position.x=-1.3-i*.0108;actor.root.rotation.y=Math.PI+i*.0466666666666667;
  actor.pose({mode:'walk',phase,gait,support:{time:i/60,distance,phase,stride,moving:true,grounded:true}});
  const current=['L','R'].map(side=>joints.get('foot1'+side).getWorldQuaternion(new THREE.Quaternion()));
  current.forEach((q,j)=>assert(q.angleTo(prior[j])<.15,'turning startup must not snap on its full-gait frame'));prior=current;
 }
 actor.dispose();
});


test('rigid lower shoe sole retains shared geometry while the ankle collar keeps its flexible weights',()=>{
 const first=createTexturedPrologueActor({gltf:cast}),second=createTexturedPrologueActor({gltf:cast}),shoe=first.root.getObjectByName('black_fancy_shoes'),other=second.root.getObjectByName('black_fancy_shoes');assert.equal(shoe.geometry,other.geometry);
 const ids=new Set(shoe.skeleton.bones.flatMap((bone,index)=>/^foot[12][LR]$/.test(bone.name)?[index]:[])),g=shoe.geometry;let rigid=0,flexible=0;
 for(let v=0;v<g.attributes.skinWeight.count;v++){let sum=0;for(let k=0;k<4;k++)if(ids.has(g.attributes.skinIndex.getComponent(v,k)))sum+=g.attributes.skinWeight.getComponent(v,k);if(sum>.9999)rigid++;else if(sum>.75)flexible++;}
 assert(rigid>100,'the visible sole has rigid foot/toe binding');assert(flexible>0,'upper collar retains calf-weighted flexibility');first.dispose();second.dispose();
});

}
