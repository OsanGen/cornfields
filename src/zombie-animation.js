import * as THREE from 'three';
import {stripRootTravel} from './asset-safety.js';

/** Explicit sampling stays reliable when procedural IK writes the same joints. */
export function createZombieAnimation(model, sourceClips) {
  const clips=sourceClips.map(clip=>{const copy=clip.clone();stripRootTravel(copy,['Bip01']);return copy;});
  const walk=clips[0];
  if(!walk)return {update(){},reset(){},snapshot:()=>({clip:null,clips:[]})};
  const idle=walk.clone();idle.name='Original breathing idle';idle.duration=1;
  for(const track of idle.tracks){const size=track.getValueSize();track.times=new Float32Array([0,1]);track.values=new Float32Array([...track.values.slice(0,size),...track.values.slice(0,size)]);}
  clips.push(idle);
  const records=new Map(), samplers=new Map();
  for(const clip of clips){
    const channels=[];
    for(const track of clip.tracks){
      const split=track.name.lastIndexOf('.'),object=model.getObjectByName(track.name.slice(0,split)),property=track.name.slice(split+1);
      if(!object||!['position','quaternion','scale'].includes(property))continue;
      if(!records.has(track.name))records.set(track.name,{value:object[property],last:object[property].clone(),from:object[property].clone(),target:object[property].clone(),quaternion:property==='quaternion'});
      channels.push({record:records.get(track.name),sample:track.createInterpolant()});
    }
    samplers.set(clip.name,{clip,channels});
  }
  let current=null,blendAge=1;
  function reset(){current=null;blendAge=1;}
  return {
    reset,
    update({state,game,time,walkTime,travelled,dt,trial=null}){
      let name=travelled>.0001?walk.name:idle.name,seconds=travelled>.0001?walkTime:time,loop=true;
      if(!game.interaction&&['flashlight_recoil','detection_tell'].includes(state.state)&&samplers.has('Pixelhouse Fury')){name='Pixelhouse Fury';seconds=Math.max(0,time-state.stateStartedAt);loop=false;}
      if(!game.interaction&&state.state==='staggered'&&samplers.has('Pixelhouse Collapse')){name='Pixelhouse Collapse';seconds=Math.max(0,time-state.stateStartedAt);loop=false;}
      if(trial&&samplers.has(trial)){name=trial;seconds=time;loop=true;}
      const source=samplers.get(name);
      if(name!==current){for(const r of records.values())r.from.copy(r.last);blendAge=current===null?1:0;current=name;}
      blendAge+=dt;const alpha=Math.min(1,blendAge/.18),at=loop?seconds%source.clip.duration:Math.min(seconds,source.clip.duration);
      for(const {record:r,sample} of source.channels){
        r.target.fromArray(sample.evaluate(at));
        if(alpha===1)r.value.copy(r.target);
        else{r.value.copy(r.from);if(r.quaternion)r.value.slerp(r.target,alpha);else r.value.lerp(r.target,alpha);}
        r.last.copy(r.value);
      }
    },
    snapshot:()=>({clip:current,clips:clips.map(clip=>clip.name),blendSeconds:.18}),
  };
}
