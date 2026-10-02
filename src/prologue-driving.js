import {createPrologueTimeline} from './prologue-script.js';

const ROAD_X=-4.3,CRUISE_SPEED=6,WHEEL_RADIUS=.31,WHEELBASE=2.55,SEGMENTS=192;
const clamp=(value,min=0,max=1)=>Math.max(min,Math.min(max,value));
const smooth=t=>t*t*(3-2*t);
const smoother=t=>t*t*t*(t*(t*6-15)+10);
const defaultTimeline=createPrologueTimeline(),plans=new WeakMap();

function curve(u,length){
  const dx=-ROAD_X*30*u*u*(1-u)*(1-u),ddx=-ROAD_X*60*u*(1-u)*(1-2*u);
  return {x:ROAD_X*(1-smoother(u)),z:length*(1-u),dx,dz:-length,ddx};
}
function arcTable(length){
  const table=[0];let previous=curve(0,length),distance=0;
  for(let i=1;i<=SEGMENTS;i++){
    const next=curve(i/SEGMENTS,length);distance+=Math.hypot(next.x-previous.x,next.z-previous.z);table.push(distance);previous=next;
  }
  return table;
}
function planFor(timeline){
  if(plans.has(timeline))return plans.get(timeline);
  const car=timeline.chapters.find(c=>c.id==='car'),dispatch=timeline.chapters.find(c=>c.id==='dispatch');
  const duration=Math.max(.001,dispatch.end-dispatch.start),decelerate=duration*.20,stop=duration*.90,braking=stop-decelerate;
  // Integrating smooth braking yields exactly half its cruise-speed distance.
  // Author the shoulder path to that distance instead of changing road offsets.
  const speedWindow=decelerate+braking/2,targetLength=Math.max(12,CRUISE_SPEED*speedWindow);
  let lo=0,hi=targetLength;
  for(let i=0;i<24;i++){
    const mid=(lo+hi)/2;
    if(arcTable(mid).at(-1)<targetLength)lo=mid;else hi=mid;
  }
  const length=(lo+hi)/2,table=arcTable(length),distance=table.at(-1),speed=distance/speedWindow;
  const plan={car,dispatch,duration,decelerate,stop,braking,length,table,distance,speed,approachDistance:(car.end-car.start)*speed};
  plans.set(timeline,plan);return plan;
}
function parameterAtDistance(table,distance){
  if(distance<=0)return 0;if(distance>=table.at(-1))return 1;
  let lo=0,hi=SEGMENTS;
  while(hi-lo>1){const mid=(lo+hi)>>1;if(table[mid]<distance)lo=mid;else hi=mid;}
  return (lo+(distance-table[lo])/(table[hi]-table[lo]))/SEGMENTS;
}
function chapterSeconds(frame,chapter){
  if(Number.isFinite(frame.chapterTime))return clamp(frame.chapterTime,0,chapter.end-chapter.start);
  if(Number.isFinite(frame.storyTime)||Number.isFinite(frame.time))return clamp((Number.isFinite(frame.storyTime)?frame.storyTime:frame.time)-chapter.start,0,chapter.end-chapter.start);
  return clamp(Number(frame.chapterProgress)||0)*(chapter.end-chapter.start);
}

/**
 * Absolute story-clock sample. Pass the same speech-driven timeline as the
 * prologue so pausing, seeking, slow frames and retimed recordings remain exact.
 * Car forward is local -Z; negative yaw/steer turns right toward the shoulder.
 * The parked transform is the existing outdoor origin, including after skips.
 */
export function samplePrologueDriving(frame={}, {timeline=defaultTimeline}={}){
  const plan=planFor(timeline),{car,dispatch,speed:cruise}=plan;
  const chapter=frame.chapter||'car',approach=chapter==='car',maneuver=chapter==='dispatch';
  const seconds=approach?chapterSeconds(frame,car):maneuver?chapterSeconds(frame,dispatch):plan.duration;
  let distance=0,speed=0,acceleration=0,u=0,position=[0,0,0],yaw=0,curvature=0;
  if(approach){
    distance=seconds*cruise;speed=cruise;
    position=[ROAD_X,0,plan.length+(car.end-car.start-seconds)*cruise];
  }else{
    const brake=clamp((seconds-plan.decelerate)/plan.braking);
    speed=maneuver?cruise*(1-smooth(brake)):0;
    acceleration=maneuver&&brake>0&&brake<1?-cruise*6*brake*(1-brake)/plan.braking:0;
    const travelled=seconds<=plan.decelerate?seconds*cruise:cruise*(plan.decelerate+plan.braking*(brake-brake**3+.5*brake**4));
    const pathDistance=maneuver&&seconds<plan.stop?clamp(travelled,0,plan.distance):plan.distance;
    u=parameterAtDistance(plan.table,pathDistance);
    const sample=curve(u,plan.length),norm=Math.hypot(sample.dx,sample.dz);
    distance=plan.approachDistance+pathDistance;
    position=u>=1?[0,0,0]:[sample.x,0,sample.z];
    yaw=u>=1?0:Math.atan2(-sample.dx,-sample.dz);
    curvature=plan.length*sample.ddx/norm**3;
  }
  const roadBounce=frame.reduced?0:Math.sin(distance*2.3)*.0012*(speed/cruise);
  const settled=clamp((seconds-plan.stop)/(plan.duration-plan.stop));
  const settle=maneuver&&!frame.reduced&&seconds>plan.stop?Math.sin((seconds-plan.stop)*10)*Math.exp(-6*(seconds-plan.stop))*.005*(1-smoother(settled)):0;
  return {
    position,yaw,speed,steer:Math.atan(-WHEELBASE*curvature),wheelRoll:distance/WHEEL_RADIUS,
    bodyPitch:acceleration*.004+roadBounce+settle,bodyRoll:clamp(-speed*speed*curvature*.002,-.02,.02),
    distance,parked:!approach&&(!maneuver||seconds>=plan.stop),
  };
}
