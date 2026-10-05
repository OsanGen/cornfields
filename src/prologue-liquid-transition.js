import * as THREE from 'three';
import {ease,clamp} from './prologue-performance.js';
export const ROOM_TRANSITION=Object.freeze({edge:1.2,hold:10,duration:12.4,enter:.6,leave:11.8});
/** A single story clock owns the veil and both scene transfers. */
export function sampleRoomTransition(frame={}){
 const active=frame.chapter==='redroom',t=Math.max(0,frame.chapterTime||0);
 if(!active)return {active:false,room:false,cover:0,holdTime:0};
 const ramp=x=>x<.48?ease(x,0,.48):x<=.72?1:1-ease(x,.72,1.2);
 return {active:true,room:t>=ROOM_TRANSITION.enter&&t<ROOM_TRANSITION.leave,
  cover:t<1.2?ramp(t):t>11.2?ramp(t-11.2):0,holdTime:clamp(t-1.2,0,10)};
}
/** Clip-space geometry is bounded and cannot expose an uncovered scene switch. */
export function createLiquidVeil(){
 const uniforms={cover:{value:0},clock:{value:0},reduced:{value:0}};
 const material=new THREE.ShaderMaterial({uniforms,transparent:true,depthTest:false,depthWrite:false,toneMapped:false,
 vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
 fragmentShader:`varying vec2 vUv;uniform float cover,clock,reduced;void main(){
 float flow=sin(vUv.y*13.+sin(vUv.x*9.+clock*.7))*sin(vUv.x*17.-clock*.42);
 float edge=vUv.y+(1.-reduced)*flow*.075;
 float alpha=cover>=.999?1.:smoothstep(edge-.12,edge+.12,cover*1.35-.16);
 vec3 c=mix(vec3(.026,.050,.043),vec3(.22,.022,.036),vUv.y);
 c+=vec3(.14,.08,.07)*pow(max(0.,flow),7.);gl_FragColor=vec4(c,alpha);}`});
 const mesh=new THREE.Mesh(new THREE.PlaneGeometry(2,2),material);mesh.name='Continuous liquid scene-transfer veil';mesh.frustumCulled=false;mesh.renderOrder=1002;
 return {mesh,update(frame){const s=sampleRoomTransition(frame);uniforms.cover.value=s.cover;uniforms.clock.value=frame.reduced?0:frame.time||0;uniforms.reduced.value=frame.reduced?1:0;mesh.visible=s.cover>0;return s;}};
}
