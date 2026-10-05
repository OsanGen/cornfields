// Presentation-only motion. No simulation, input, chapter, or cue ownership here.
export const EXIT_SECONDS=1.60;
export const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,Number(x)||0));
export const smooth=x=>{const t=clamp(x);return t*t*(3-2*t);};
export const mix=(a,b,t)=>a+(b-a)*t;
export const ease=(t,a,b)=>smooth((t-a)/(b-a));
export const angle=(a,b,t)=>a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*clamp(t);

// Door clearance precedes translation; rise happens over the planted outside foot.
export function samplePrologueExit(seconds=0){
  const t=clamp(seconds,0,EXIT_SECONDS),turn=ease(t,.16,.62),transfer=ease(t,.62,1.30),settle=ease(t,1.30,1.60);
  return {time:t,progress:t/EXIT_SECONDS,door:ease(t,.10,.58),plant:ease(t,.55,.95),transfer,settle,
    hand: ease(t,0,.18)*(1-ease(t,1.15,1.48)),
    position:t>=EXIT_SECONDS?[1.85,1.58,-.35]:[mix(.5,1.06,turn)+.79*transfer,1.13-.055*Math.sin(Math.PI*turn)+(1.58-1.13)*transfer,.35-.24*turn-.46*transfer],
    driver:t>=EXIT_SECONDS?[-1.30,0,-.35]:[-.45-.30*turn-.55*transfer,-.38*(1-transfer),.09-.44*turn],
    footTargets:[
      [mix(-.58,-1.39,ease(t,.38,.93)),mix(.02,.045,ease(t,.38,.93))+Math.sin(Math.PI*ease(t,.38,.93))*.12,mix(-.51,-.22,ease(t,.38,.93))],
      [mix(-.32,-1.19,ease(t,.65,1.42)),mix(.02,.045,ease(t,.65,1.42))+Math.sin(Math.PI*ease(t,.65,1.42))*.10,mix(-.51,-.48,ease(t,.65,1.42))],
    ],
    driverYaw:angle(Math.PI,-Math.PI/2,turn)*(1-settle)+Math.PI*settle,
    clearance:turn,finished:t>=EXIT_SECONDS};
}

export function phrasePulse(offset,duration,seed=0){
  if(offset<0||offset>=duration)return 0;
  const attack=ease(offset,0,.18),release=1-ease(offset,Math.max(.2,duration-.35),duration);
  // Low-amplitude phrase accents, never used for mouth movement.
  return attack*release*(.58+.42*Math.sin(offset*2.1+seed)**2);
}

export function performanceFor(frame,actor,actorPosition,listener){
  const time=frame.elapsed??frame.time??0,line=frame.line;
  const speaking=line?.voice===actor,offset=line?Math.max(0,frame.time-line.start):0;
  const duration=line?line.end-line.start:0,emphasis=speaking?phrasePulse(offset,duration,actor==='stanley'?.8:2):0;
  const yaw=actorPosition.yaw||0,p=actorPosition.position;
  const relative=listener?Math.atan2(listener[0]-p[0],listener[2]-p[2])-yaw:0;
  const target=Math.atan2(Math.sin(relative),Math.cos(relative));
  const driving=actorPosition.mode==='drive',listening=!!line&&!speaking;
  const attention=driving?(speaking?.30:.025):(speaking?.62:listening?.38:.12);
  const look=clamp(target,-.65,.65)*attention;
  const blinkPhase=((time+(actor==='stanley'?1.71:.27))%5.37+5.37)%5.37;
  const blink=blinkPhase<.16?Math.sin(blinkPhase/.16*Math.PI)**2:0;
  return {look,eyeLook:clamp(target-look,-.25,.25)*attention,speaking,emphasis,
    blink:frame.reduced?0:blink,breath:frame.reduced?0:Math.sin(time*(actor==='stanley'?2.7:1.7))*.006,
    nod:frame.reduced?0:-.018*emphasis*Math.sin(offset*3.2),lineId:line?.id||null,lineOffset:offset};
}

export const WAKE_SECONDS=6;
/** Deterministic eyelids, hand reach and entertainment radio, without a timer. */
export function samplePrologueWake(frame={}){
 const active=frame.chapter==='car',t=Number(frame.chapterTime)||0;
 if(!active)return {blink:0,reach:0,turn:0,radioOn:false};
 const pulse=(a,b,c,d)=>ease(t,a,b)*(1-ease(t,c,d));
 const blink=Math.max(1-ease(t,.2,1.1),pulse(1.65,1.85,2.0,2.3),pulse(2.65,2.8,2.9,3.2));
 return {blink,reach:pulse(3.1,3.8,4.55,5.3),turn:ease(t,3.95,4.25),radioOn:t<4.15};
}
