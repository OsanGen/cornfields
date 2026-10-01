export const PLAYER_VIEWMODEL=Object.freeze({
  grip:[.20,-.22,-.275],pistol:[-.032,.01,-.12],muzzle:[.168,-.148,-.535],
  knifeRight:{position:[.035,-.08,.035],rotation:[1.05,0,-.2]},
  knifeLeft:{position:[-.055,-.14,.12],rotation:[Math.PI/2,0,.4]},
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

export function createActorHeading(){
  let yaw=null,run=null,actor=null,zone=null,x=0,z=0;
  return {sample(state,runId,dt,{immediate=false}={}){
    const target=(state.yaw||0)+Math.PI;
    if(yaw===null||run!==runId||actor!==state||zone!==state.zone||Math.hypot(state.x-x,state.z-z)>3||immediate)yaw=target;
    else{const delta=Math.atan2(Math.sin(target-yaw),Math.cos(target-yaw));yaw+=delta*Math.min(1,Math.max(0,dt)*10);}
    run=runId;actor=state;zone=state.zone;x=state.x;z=state.z;return yaw;
  }};
}
