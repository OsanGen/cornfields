import {ease,clamp} from './prologue-performance.js';
/** Presentation clocks only. No physics, weapon inventory, ammunition or input. */
export const REALISM_SEQUENCE=Object.freeze({rise:12,solidReturn:4,gunRecovery:5.8,reaction:2.4,projector:12.4});
export const POST_TITLE_CHAPTERS=Object.freeze(['solid_return','gun_recovery','reaction','redroom']);
export function sampleRealismSequence(frame={}){
 const chapter=frame.chapter,t=Math.max(0,Number(frame.chapterTime)||0),low=!!frame.reduced;
 const rise=chapter==='rupture',solid=chapter==='solid_return',recovery=chapter==='gun_recovery',after=POST_TITLE_CHAPTERS.includes(chapter);
 const lift=rise?ease(t,.45,3.3):solid?1-ease(t,0,2.8):0;
 const bodyLiquid=rise?ease(t,1,3.5):solid?1-ease(t,.6,2.7):0;
 const worldLiquid=rise?ease(t,3,6.8):solid?1-ease(t,.25,3.4):0;
 const cover=rise?ease(t,9,11.35):solid?1-ease(t,.15,1.9):0;
 const fall=recovery?ease(t,.35,1.10):0,reach=recovery?ease(t,1.8,3.0):0,pickup=recovery?ease(t,3.0,4.8):0;
 const settled=recovery?t>=4.8:after&&chapter!=='solid_return';
 return {active:rise||after,afterTitles:after,lift:lift*(low?.30:.9),bodyLiquid,worldLiquid,cover,
   freeze:rise||after&&chapter!=='redroom',escortsVisible:!after&&(!rise||t<11.35),
   gun:{active:recovery,fall,reach,pickup,settled,detached:recovery&&t>=.35&&t<3.0,contact:recovery&&t>=3.0,rest:recovery&&t>=1.10&&t<3.0,
     down:fall*(1-pickup),roll:fall*(1-pickup)*1.32,handReach:reach*(1-ease(t,3.2,4.8))},
   cameraPitch:recovery?-.72*ease(t,.2,1.4)*(1-ease(t,4.5,5.7)):rise?-(low?.10:.28)*ease(t,1,3):solid?-(low?.10:.28)*(1-ease(t,0,2.8)):0,
   crouch:recovery?reach*(1-ease(t,3.2,5.5)):0,
   // Full cover conceals the relocation into the unchanged gameplay entry.
   fieldHandoff:solid,restoreWeight:solid?ease(t,.15,2.8):1};
}
/** Current camera-relative pistol group offset, preserving its existing grip. */
export function sampleRecoveryGunPose(frame={}){
 const s=sampleRealismSequence(frame),g=s.gun;
 return {active:g.active,position:[-.035+g.down*.055,-.035-g.down*1.12,-.20-g.down*.48],rotation:[-.09+g.down*.42,0,g.roll],handReach:g.handReach,detached:g.detached,contact:g.contact};
}
