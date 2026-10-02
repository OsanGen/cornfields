// Exact approved gatekeeper script. Timings follow the local voice recordings.
import {SURVIVAL_VOICE_TIMING} from './survival-voice-timing.js';
const script=[
  ['GATE-01','Trial access has been granted.'],
  ['GATE-02','Survive three minutes with one of the residents.'],
  ['GATE-03','Completion permits passage deeper into our home.'],
  ['GATE-04','The corridors will not remain where you left them.'],
  ['GATE-05','There is no reliable way back. Proceed forward.'],
  ['GATE-06','When passage fails, enter the corn. Remain still.'],
  ['GATE-07','These rules are not mine. They remain binding.'],
  ['GATE-08','Begin.'],
];
let cursor=.3;
const room=script.map(([id,text],index)=>{const start=cursor,end=start+SURVIVAL_VOICE_TIMING[id].duration+(index<script.length-1?.4:0);cursor=end;return {id,text,start,end,voice:'face',chapter:'room'};});
export const ROOM_DURATION=room.at(-1).end;
export const SURVIVAL_LINES=Object.freeze([...room,
  {id:'PIT-01',text:'Trial complete. Deeper access permitted.',start:0,end:SURVIVAL_VOICE_TIMING['PIT-01'].duration,voice:'face',chapter:'pit'},
  {id:'PIT-02',text:'Jump.',start:3.8,end:3.8+SURVIVAL_VOICE_TIMING['PIT-02'].duration,voice:'face',chapter:'pit'},
  {id:'PIT-03',text:'There is no other passage.',start:25,end:25+SURVIVAL_VOICE_TIMING['PIT-03'].duration,voice:'face',chapter:'pit'},
]);
