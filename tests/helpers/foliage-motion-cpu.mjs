// Independent CPU reference for the current GLSL equations. This is geometry/math
// evidence only: it neither executes the vertex shader nor validates a GPU image.
import * as T from 'three';
import {PRESENTATION} from '../../src/presentation-config.js';
export function sampleWind(position,flex,matrix,{time=0,player={x:0,z:0},playerPush=false,reduced=false,art=true}={}){
  const root=new T.Vector3().setFromMatrixPosition(matrix),world=position.clone().applyMatrix4(matrix);
  const tip=Math.max(0,Math.min(1,position.y/3)),away=new T.Vector2(world.x-player.x,world.z-player.z),distance=away.length();
  const wave=time*.72-root.x*.24-root.z*.09,gust=.55+.45*Math.sin(wave),motion=reduced?0:1;
  const drift=new T.Vector2((.28+gust)*PRESENTATION.field.wind,.18*Math.sin(wave*.71)*PRESENTATION.field.wind);
  if(art)drift.add(new T.Vector2(Math.sin(wave-1.2+position.y*1.4),Math.cos(wave*1.3-position.y)).multiplyScalar(.016*flex));
  if(playerPush)drift.add(away.multiplyScalar(Math.max(0,1-distance/1.1)*.18/Math.max(distance,.1)));
  drift.multiplyScalar(tip*tip*motion);
  const worldOffset=new T.Vector3(drift.x,0,drift.y),localOffset=worldOffset.clone().applyMatrix3(new T.Matrix3().setFromMatrix4(matrix).invert());
  if(art)localOffset.y+=Math.sin(wave*1.8-1.3)*.012*flex*motion;
  const local=position.clone().add(localOffset),deformed=local.clone().applyMatrix4(matrix);
  return {local,world:deformed,offset:deformed.clone().sub(world),worldOffset,localOffset};
}
export function rendererStub(onRender){
  const rect=new T.Vector4(0,0,800,600),color=new T.Color();
  return {domElement:{clientWidth:800,clientHeight:600},autoClear:true,info:{autoReset:true,render:{calls:0},reset(){}},getRenderTarget:()=>null,setRenderTarget(){},getScissorTest:()=>false,setScissorTest(){},getViewport:p=>p.copy(rect),getScissor:p=>p.copy(rect),setViewport(){},setScissor(){},getClearColor:p=>p.copy(color),getClearAlpha:()=>1,setClearColor(){},render(s,c){s.updateMatrixWorld(true);onRender(s,c);}};
}
export function cornBatches(scene){const batches=[];scene.traverse(o=>{if(o.isInstancedMesh&&/corn/i.test(o.name))batches.push(o);});return batches;}
