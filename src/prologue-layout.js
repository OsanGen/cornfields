// Post-exit blocking has one compass: the road is north/south, the destination
// is WEST (-X), and the live maze begins at the same authored gameplay spawn.
export const WEST_APPROACH=Object.freeze({
  centerZ:-4.2,fieldYaw:Math.PI/2,entranceX:-9.2,thresholdX:-48,
  bounds:Object.freeze({minX:-55,maxX:10,minZ:-12,maxZ:7}),
});
export const approachPoint=([lateral,y,depth])=>[depth,y,WEST_APPROACH.centerZ-lateral];
export const approachCoordinates=([x,y,z])=>[WEST_APPROACH.centerZ-z,y,x];
export const approachDepth=position=>-position[0];
export const approachYaw=-Math.PI/2;
export const approachViewYaw=Math.PI/2;
export const approachThreshold=()=>[WEST_APPROACH.thresholdX,0,WEST_APPROACH.centerZ];
export function approachStageTransform(spawn={}){
  const yaw=(Number(spawn.yaw)||0)-WEST_APPROACH.fieldYaw,[x,,z]=approachThreshold();
  return {yaw,position:[(Number(spawn.x)||0)-x*Math.cos(yaw)-z*Math.sin(yaw),0,(Number(spawn.z)||0)+x*Math.sin(yaw)-z*Math.cos(yaw)]};
}
const smooth=v=>{const t=Math.max(0,Math.min(1,v));return t*t*(3-2*t);};
const mix=(a,b,t)=>a+(b-a)*t;
const EXIT_START={mike:[1.85,0,-.35],clarence:[-1.30,0,-2.1],stanley:[2.1,0,-2.25]};
export const approachLateral=id=>id==='clarence'?-.72:id==='stanley'?.48:0;
export function approachWaypoint(id){return [EXIT_START[id][0],0,WEST_APPROACH.centerZ-approachLateral(id)];}
// A short first leg clears the hood before the player and escorts turn west.
export function approachPathPosition(id,travel,eye=0){
  const start=EXIT_START[id],corner=approachWaypoint(id),turn=smooth(travel/.055),depth=Math.max(0,Math.min(1,(travel-.055)/.945));
  const final=approachPoint([approachLateral(id),eye,-48-(id==='clarence'?1.85:id==='stanley'?3.25:0)]);
  return travel<.055?[mix(start[0],corner[0],turn),eye,mix(start[2],corner[2],turn)]:[mix(corner[0],final[0],depth),eye,final[2]];
}
export function clampApproachPosition(x,z){
  const b=WEST_APPROACH.bounds;return [Math.max(b.minX,Math.min(b.maxX,x)),Math.max(b.minZ,Math.min(b.maxZ,z))];
}
export function followApproachTarget(player,escorts){
  const corner=approachWaypoint('mike');
  if(player.x>-.9&&player.z>corner[2]+.32)return {x:player.x,z:corner[2]};
  return {x:(escorts.clarence.x+escorts.stanley.x)/2+2.3,z:WEST_APPROACH.centerZ};
}
