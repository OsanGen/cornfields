import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {samplePrologueWake,prologueRadioOffTime,PROLOGUE_OPENING} from '../src/prologue-performance.js';
import {sampleRoomTransition,createLiquidVeil,ROOM_TRANSITION} from '../src/prologue-liquid-transition.js';
import {sampleHallucination,createPrologueHallucination} from '../src/prologue-hallucination.js';
import {prologueVisionState,createPrologueVisuals} from '../src/prologue-visuals.js';
import {createPrologue,prologueFrame} from '../src/prologue.js';
import {createPrologueTimeline} from '../src/prologue-script.js';
import {createEntertainmentRadio} from '../src/prologue-cabin.js';
import {createBloodRoom} from '../src/blood-room.js';
import {load} from '../scripts/load-glb-cpu.mjs';
import {rendererStub} from './helpers/foliage-motion-cpu.mjs';

test('waking lids and radio contact follow a single sampled clock, with exact off boundary',()=>{
 const off=prologueRadioOffTime(),sample=t=>samplePrologueWake({chapter:'car',chapterTime:t,radioOffAt:off});
 assert.equal(sample(0).blink,1);assert.equal(sample(.8).blink,1);assert.equal(sample(1.9).blink,0);assert(sample(2.2).blink>.95);assert.equal(sample(2.65).blink,0); // v2: closed-eye lead followed by one natural blink.
 assert.equal(sample(off-.01).radioOn,true);assert.equal(sample(off).radioOn,false);assert.equal(sample(off).reach,1);assert(sample(off).turn>0);assert.equal(sample(off+1.5).reach,0);
 const r=createEntertainmentRadio();r.update(sample(off-.5));const lit=r.display.material.color.clone();r.update(sample(off+.5));assert(!r.display.material.color.equals(lit));assert(r.knob.rotation.y<0);
 const s=createPrologue();s.begin();s.tick(1.9);const held=s.frame().wake;s.pause();s.tick(9);assert.deepEqual(s.frame().wake,held);s.resume();s.tick(off);assert.equal(s.frame().wake.radioOn,false);s.skip();assert.equal(s.frame().wake.blink,0);s.begin();assert.equal(s.frame().wake.blink,1);s.dispose();
});
test('only two exact new lines are added and the three pleas retain a full ten-second room hold',()=>{
 const timeline=createPrologueTimeline(),get=id=>timeline.lines.find(l=>l.id===id),room=timeline.chapters.find(c=>c.id==='redroom');
 assert.equal(get('CAR-00').text,'Clarence, I gotta tell you something.');assert.equal(get('UND-01').text,'What the fuck.');assert.equal(get('CAR-01').text,'That standoff in 2002. I lost my partner that day.');
 assert.equal(get('CAR-00').start,PROLOGUE_OPENING.musicLead);assert(get('CAR-01').start>get('CAR-00').end);assert.equal(ROOM_TRANSITION.hold,10);
 assert(Math.abs(room.end-room.start-12.4)<1e-8);for(const id of ['RED-01','RED-02','RED-03'])assert(get(id).start>=room.start+1.2&&get(id).end<=room.start+11.2);
 for(const id of ['entertainment_off','zombie_scream_1','zombie_scream_2'])assert.equal(timeline.cues.filter(([cue])=>cue===id).length,1);
});
test('room transfers occur only at fully opaque cover, including slow frame boundaries',()=>{
 const sample=t=>sampleRoomTransition({chapter:'redroom',chapterTime:t});
 for(const t of [.48,.59,.6,.7,11.69,11.8,11.9])assert.equal(sample(t).cover,1,`${t}`);
 assert.equal(sample(.59).room,false);assert.equal(sample(.6).room,true);assert.equal(sample(11.79).room,true);assert.equal(sample(11.8).room,false);
 for(const t of [1.2,2,6,11.2,12.4])assert.equal(sample(t).cover,0);
 const v=createLiquidVeil();v.update({chapter:'redroom',chapterTime:.6});assert.equal(v.mesh.material.uniforms.cover.value,1);assert.equal(v.mesh.material.depthTest,false);v.update({chapter:'walk'});assert.equal(v.mesh.visible,false);v.mesh.geometry.dispose();v.mesh.material.dispose();
});
test('zombie peak is stable, blink fully closes and the human reset occurs inside closed lids',()=>{
 for(const reduced of [false,true]){const s=t=>sampleHallucination({chapter:'undead',chapterTime:t,reduced});
 assert.equal(s(0).zombie,0);assert(s(1).bridge>0);assert.equal(s(2).zombie,1);assert.equal(s(3.7).restored,false);assert.equal(s(3.85).blink,1);assert.equal(s(3.85).zombie,0);assert.equal(s(4.3).blink,0);assert.equal(s(5).restored,true);}
 assert.deepEqual(sampleHallucination({chapter:'history'}),{active:false,bridge:0,zombie:0,blink:0,restored:true});
});
test('two real zombie rigs are render-only, aligned, depth-tested red-eyed and beam-free',async()=>{
 const gltf=await load('assets/field/zombie.glb'),parent=new T.Group(),v=createPrologueHallucination(parent,{loader:{loadAsync:async()=>gltf}});await v.ready;
 const humans=[{root:new T.Group()},{root:new T.Group()}];humans[0].root.position.set(1,0,-3);humans[1].root.position.set(-1,0,-4);
 v.update({chapter:'undead',chapterTime:2},humans);assert.equal(v.stats.status,'ready');assert.equal(v.stats.combatActors,0);assert.equal(parent.children.length,2);
 for(const [i,root]of v.roots.entries()){assert(root.visible);assert(root.position.equals(humans[i].root.position));const eye=root.getObjectByName('Creature left eye');assert(eye);assert.equal(eye.material.depthTest,true);assert.equal(eye.material.color.getHex(),0xff170c);}
 v.update({chapter:'history',chapterTime:0},humans);assert(v.roots.every(r=>!r.visible));v.dispose();assert.equal(parent.children.length,0);
});
test('released hallucinations reject late asset results without restoring clones',async()=>{
 let resolve;const parent=new T.Group(),v=createPrologueHallucination(parent,{loader:{loadAsync:()=>new Promise(r=>resolve=r)}});v.dispose();const gltf=await load('assets/field/zombie.glb');resolve(gltf);await v.ready;assert.equal(parent.children.length,0);assert.equal(v.stats.status,'disposed');
});
test('rupture stays liquid during the lift and retains six bounded connected ribbons',()=>{
 let scene;const view=createPrologueVisuals(rendererStub(s=>scene=s));
 for(const t of [0,2,5,8,9,12]){const v=prologueVisionState({chapter:'rupture',chapterTime:t});if(t>=2&&t<9)assert(v.liquid>0);if(t>=9)assert.equal(v.escortsVisible,false);view.render({chapter:'rupture',chapterTime:t,time:t,chapterProgress:t/12});if(t===8){assert.equal(view.diagnostics().ribbons,6);assert.equal(view.diagnostics().binaryFragments,0);}}
 view.render({chapter:'car',chapterTime:0,time:0});assert.equal(view.diagnostics().ribbons,0);view.dispose();
});
test('projector is legible geometry at ordinary desktop and landscape-phone gaze',()=>{
 const room=createBloodRoom();room.group.updateMatrixWorld(true);const projector=room.group.getObjectByName('Single film projector');assert.equal(projector.children.filter(c=>c.name==='Visible projector film reel').length,2);
 for(const aspect of [16/9,844/390]){const camera=new T.PerspectiveCamera(65,aspect,.035,175);camera.position.set(0,1.58,2);camera.updateMatrixWorld(true);const p=projector.getWorldPosition(new T.Vector3()).project(camera);assert(Math.abs(p.x)<.85&&Math.abs(p.y)<.85);}
});

test('the specific voice deferral affects only the two new cues and preserves required legacy audio',async()=>{
 const {PROLOGUE_LINES,PROLOGUE_AUDIO_LINES,PROLOGUE_SUBTITLE_ONLY_IDS}=await import('../src/prologue-script.js');
 const {runtimeAssets}=await import('../scripts/build.mjs');
 assert.deepEqual(PROLOGUE_SUBTITLE_ONLY_IDS,['CAR-00','UND-01']);
 assert.deepEqual(PROLOGUE_LINES.filter(l=>l.audioMode==='subtitle-only').map(l=>l.id),PROLOGUE_SUBTITLE_ONLY_IDS);
 assert.equal(PROLOGUE_AUDIO_LINES.length,42);
 for(const id of PROLOGUE_SUBTITLE_ONLY_IDS){assert(!PROLOGUE_AUDIO_LINES.some(l=>l.id===id));assert(!runtimeAssets.includes(`assets/audio/prologue/${id}.mp3`));assert(PROLOGUE_LINES.some(l=>l.id===id&&l.text));}
 for(const line of PROLOGUE_AUDIO_LINES){assert.equal(line.audioMode,'recorded');assert(runtimeAssets.includes(`assets/audio/prologue/${line.id}.mp3`));}
 const {readFile,readdir}=await import('node:fs/promises'),{createHash}=await import('node:crypto');let aggregate='';
 const names=(await readdir('assets/audio/prologue')).filter(n=>n.endsWith('.mp3')&&!['entertainment-music.mp3','title-music.mp3'].includes(n)).sort();assert.equal(names.length,78,'all78 inherited voice files remain byte-identical; the two explicitly approved music excerpts are separate');
 for(const name of names)aggregate+=`${name}\0${createHash('sha256').update(await readFile(`assets/audio/prologue/${name}`)).digest('hex')}\n`;
 assert.equal(createHash('sha256').update(aggregate).digest('hex'),'e0afed33ffcf237189deea22a64ddd1520c01544095d4daac4970d491098a6bc');
});
