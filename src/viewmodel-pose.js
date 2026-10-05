const PISTOL_SCALE=1.15,GRIP=[.20,-.22,-.275],CONTACT=[-.032,-.009,-.104];
const expand=(point,contact)=>point.map((value,i)=>contact[i]+(value-contact[i])*PISTOL_SCALE);
export const PLAYER_VIEWMODEL=Object.freeze({
  grip:GRIP,pistolScale:PISTOL_SCALE,pistol:expand([-.032,.01,-.12],CONTACT),
  muzzle:expand([.168,-.148,-.535],CONTACT.map((value,i)=>value+GRIP[i])),
  knifeRight:{position:[.029,-.107,.023],rotation:[Math.PI/2,0,0]},
  knifeLeft:{position:[.0015,-.1078,.152],rotation:[0,0,-.15]},
  flashlightLeft:{position:[-.029,-.107,.038],rotation:[Math.PI/2,0,0]},
  // The source bulb faces +Z. Turn it down the camera's -Z beam.
  flashlight:{position:[0,0,0],rotation:[0,Math.PI,0]},
});

/** Keep the nearby flashlight off the hands while preserving world depth. */
export function renderFirstPersonLayers(renderer,scene,camera,visible){
  const mask=camera.layers.mask,background=scene.background,clear=renderer.autoClear,reset=renderer.info.autoReset;
  renderer.info.autoReset=false;renderer.info.reset();
  try{
    camera.layers.set(0);renderer.render(scene,camera);
    if(visible){
      // Three filters lights against the camera, not each mesh's layers.
      // This second pass shares depth and draws only the first-person meshes.
      scene.background=null;renderer.autoClear=false;camera.layers.set(1);renderer.render(scene,camera);
    }
  }finally{
    camera.layers.mask=mask;scene.background=background;renderer.autoClear=clear;renderer.info.autoReset=reset;
  }
}

/** Presentation only; never changes aim, ammunition, collision or QTE timing. */
export function viewmodelPose({time=0,steps=0,moving=false,recoil=0,reduced=false,nearWall=false,aspect=16/9}={}){
  const motion=reduced?0:1,walk=moving?1:0,kick=Math.max(0,Math.min(1,recoil/.16))*motion;
  return {
    position:[-.035+(aspect<1.3?-.045:0)+Math.sin(steps*3.5)*.006*walk*motion,
      .02+Math.sin(time*1.8)*.002*motion+Math.cos(steps*7)*.005*walk*motion-(nearWall?.07:0),-.20+kick*.025],
    rotation:[kick*.10-(nearWall?.3:0),Math.sin(steps*3.5)*.01*walk*motion,Math.sin(time*1.3)*.004*motion],
  };
}

/** Left hand carries a forward-facing torch, independently of pistol recoil. */
export function flashlightPose({time=0,steps=0,moving=false,reduced=false,nearWall=false,aspect=16/9}={}){
  const motion=reduced?0:1,walk=moving?1:0;
  return {
    position:[-.26+(aspect<1.3?.055:0)-Math.sin(steps*3.5)*.004*walk*motion,
      -.22+Math.sin(time*1.8+.6)*.0015*motion+Math.cos(steps*7)*.004*walk*motion-(nearWall?.06:0),-.43],
    rotation:[nearWall?-.20:0,-.09,Math.sin(time*1.3+.8)*.003*motion],
  };
}

export function createActorHeading(){
  let yaw=null,run=null,actor=null,zone=null,x=0,z=0;
  return {sample(state,runId,dt,{immediate=false}={}){
    const target=(state.yaw||0)+Math.PI;
    if(yaw===null||run!==runId||actor!==state||zone!==state.zone||Math.hypot(state.x-x,state.z-z)>3||immediate)yaw=target;
    else{const delta=Math.atan2(Math.sin(target-yaw),Math.cos(target-yaw));yaw+=delta*Math.min(1,Math.max(0,dt)*10);}
    run=runId;actor=state;zone=state.zone;x=state.x;z=state.z;return yaw;
  }};
}

/** One physical, cabin-relative reach shared by Mike's body and eye camera.
 * The head remains free to look; only its eye origin follows the upper body.
 * Neutral waist→head vector is measured from the shipped seated Mike skin rig.
 */
export function samplePrologueBodyReach(reach=0){
  const weight=Math.max(0,Math.min(1,Number(reach)||0)),waistTilt=.72*weight;
  const hipOffset=[-.10*weight,0,-.22*weight],dy=.582238,forward=.0556;
  return {weight,hipOffset,waistTilt,eyeOffset:[hipOffset[0],dy*(Math.cos(waistTilt)-1)-forward*Math.sin(waistTilt),hipOffset[2]-dy*Math.sin(waistTilt)-forward*(Math.cos(waistTilt)-1)]};
}
