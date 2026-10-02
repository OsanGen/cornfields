// Fast playtest adaptation. R=retained, A=adapted, N=new draft, U=user wording.
// Cue IDs and provenance match CORNFIELDS_FAST_INTERACTIVE_PROLOGUE_REFINEMENT.md.
const freeze=Object.freeze;
const VOICE_TAIL=.12,LINE_GAP=.18;
const raw=(id,voice,chapter,basis,text)=>freeze({id,voice,chapter,basis,text,speaker:voice==='face'?'PROJECTED FACE':voice==='unknown'?'':voice.toUpperCase()});
const SOURCE=freeze([
  raw('CAR-01','mike','car','A','That standoff in 2002. I lost my partner that day.'),
  raw('CAR-02','mike','car','R',"But I can't get this shit out of my head."),
  raw('CAR-03','mike','car','R',"It won't stop replaying in my head. Like the worst overplayed song you've heard on the radio."),
  raw('CAR-04','mike','car','R',"Every cop has to have a story. It's basically a law or something."),
  raw('CAR-05','clarence','car','R',"You're making me nervous, Mike."),
  raw('CAR-06','mike','car','R',"Don't be nervous. Be ready."),
  raw('CAR-07','mike','car','R',"That's what'll make you the man who tells the story back and wears it like a crown."),
  raw('RAD-01','dispatch','dispatch','N','Chief Hartmouth, Edwards. Missing child reported just down the road. Sadie Yates. Her father is at the cornfield.'),
  raw('RAD-02','clarence','dispatch','N',"That's close. Pulling over."),
  raw('ARR-01','stanley','emergence','R','Officer, my name is Stanley Yates and my daughter Sadie has gone missing.'),
  raw('ARR-02','stanley','exit','N','Please. Come with me.'),
  raw('FLA-01','mike','flashlight','N','Need some light.'),
  raw('FLA-02','stanley','flashlight','N',"Be careful. There are tales of undead in there. They don't like the light. Don't shine it at them."),
  raw('FLA-03','clarence','flashlight','N',"This guy's fucking insane. Let's just make sure he didn't kill his own daughter."),
  raw('WAL-01','stanley','walk','A',"It didn't start today. A few weeks ago, at dinner, Sadie asked who lived in the cornfields behind our house."),
  raw('WAL-02','stanley','walk','N','I told her,'),
  raw('WAL-03','stanley','walk','R','Nothing lives in the cornfields, dearie.'),
  raw('WAL-04','stanley','walk','N','Then she said,'),
  raw('WAL-05','stanley','walk','R','I saw something earlier out there. A man. He had a gray jacket with holes in it.'),
  raw('WAL-06','stanley','history','A','Those cornfields run on for miles and miles and miles. Far beyond our seven hundred acres.'),
  raw('WAL-07','stanley','history','A',"You could be holding a compass and you'd still get lost."),
  raw('WAL-08','stanley','history','A','Our rule was: only go as far as the mind sees north. If that gets blurry, even in the slightest bit, turn back immediately.'),
  raw('WAL-09','stanley','history','A','Sadie knew that rule. She knew it well.'),
  raw('RED-01','face','redroom','N','Help me.'),
  raw('RED-02','face','redroom','N',"I'm trapped here."),
  raw('RED-03','face','redroom','N','Free me.'),
  raw('RET-01','clarence','return_walk','N','Mike? You okay? You just stopped moving for a second.'),
  raw('WAL-10','mike','disappearance','R','When did she go missing exactly?'),
  raw('WAL-11','stanley','disappearance','R','About two hours ago. I was out with her in the backyard.'),
  raw('WAL-12','stanley','disappearance','A','We were taking the dog out.'),
  raw('WAL-13','stanley','disappearance','R','She kept glancing into the cornfields and then I spun around because the dog was barking wild at something.'),
  raw('WAL-14','stanley','disappearance','R','Then I spun around, and she was nowhere to be seen.'),
  raw('WAL-15','clarence','disappearance','R','And did you hear anything? Were there footsteps?'),
  raw('WAL-16','stanley','disappearance','R','Not at all. It was like something out of a horror movie. She just vanished.'),
  raw('LIQ-01','unknown','liquid','U','WE ARE ONE'),
]);
const CHAPTERS=freeze([
  {id:'car',title:'Police car',lead:.45},
  {id:'dispatch',title:'Dispatch call',lead:.3},
  {id:'emergence',title:'Stanley emerges',lead:.65},
  {id:'exit',title:'Leave the cruiser',lead:.85},
  {id:'flashlight',title:'Light and warning',lead:.2},
  {id:'walk',title:'Sadie saw someone',lead:.15},
  {id:'undead',title:'Wrong in the lightning',duration:2},
  {id:'history',title:'The field goes too far',lead:.1},
  {id:'redroom',title:'The projected face',duration:10,slots:[[1,3],[3,6],[6,9]]},
  {id:'return_walk',title:'Only a second',lead:.1},
  {id:'disappearance',title:'Sadie disappears',lead:.15},
  {id:'liquid',title:'Liquid reality',duration:5,slots:[[1,4]]},
  {id:'arrival',title:'The threshold',duration:2},
  {id:'rupture',title:'Reality breaks',duration:12},
].map(freeze));
function blocks(text){
  const rows=[];let row='';
  for(const word of text.split(/\s+/)){
    if(row&&row.length+word.length+1>44){rows.push(row);row='';}
    row+=(row?' ':'')+word;
  }
  if(row)rows.push(row);
  const result=[];for(let i=0;i<rows.length;i+=2)result.push(rows.slice(i,i+2).join('\n'));
  return result;
}
function timedLine(line,start,end){
  const parts=blocks(line.text),weights=parts.map(text=>text.split(/\s+/).length),total=weights.reduce((a,b)=>a+b,0);
  let cursor=start;
  const subtitles=parts.map((text,i)=>{const next=i===parts.length-1?end:cursor+(end-start)*weights[i]/total;const chunk=freeze({text,start:cursor,end:next});cursor=next;return chunk;});
  return freeze({...line,start,end,subtitles:freeze(subtitles)});
}
function durationFor(line,durations){
  const value=durations[line.id],recorded=typeof value==='number'?value:value?.duration;
  const words=line.text.split(/\s+/).length;
  // Missing recordings use a comfortable reading estimate. Real clips run at
  // natural speed, with enough caption time to avoid flashing short fragments.
  return Number.isFinite(recorded)&&recorded>0?Math.max(1.15,words/3.1,recorded+VOICE_TAIL):Math.max(1.15,words/2.75);
}
/** Speech-driven chapters have no inherited cinematic padding. Visions stay fixed. */
export function createPrologueTimeline({durations={}}={}){
  let cursor=0;const chapters=[],lines=[];
  for(const chapter of CHAPTERS){
    const start=cursor,script=SOURCE.filter(line=>line.chapter===chapter.id);
    if(chapter.duration){
      for(let i=0;i<script.length;i++){
        const [from,to]=chapter.slots[i],line=script[i];
        lines.push(timedLine(line,start+from,Math.min(start+to,start+from+durationFor(line,durations))));
      }
      cursor+=chapter.duration;
    }else{
      cursor+=chapter.lead||0;
      for(let i=0;i<script.length;i++){
        const line=script[i],end=cursor+durationFor(line,durations);lines.push(timedLine(line,cursor,end));cursor=end;
        if(i<script.length-1)cursor+=LINE_GAP;
      }
      cursor+=.12;
    }
    chapters.push(freeze({id:chapter.id,title:chapter.title,start,end:cursor}));
  }
  const chapter=id=>chapters.find(item=>item.id===id);
  const cues=[['radio',chapter('dispatch').start+.04],['corn_burst',chapter('emergence').start+.04],['door_open',chapter('exit').start],['undead',chapter('undead').start],['redroom',chapter('redroom').start],['liquid',chapter('liquid').start],['crash',chapter('rupture').start]];
  return freeze({duration:cursor,chapters:freeze(chapters),lines:freeze(lines),cues:freeze(cues.map(freeze))});
}
const baseline=createPrologueTimeline();
export const PROLOGUE_CHAPTERS=baseline.chapters;
export const PROLOGUE_LINES=baseline.lines;
export const PROLOGUE_FOLLOW_LINES=freeze([
  raw('FOL-01','clarence','follow','N','Mike, stay with us.'),
  raw('FOL-02','stanley','follow','N','Officer! What the hell are you doing? My daughter is out here!'),
  raw('FOL-03','clarence','follow','N','Mike! Get back over here!'),
].map(line=>timedLine(line,0,durationFor(line,{}))));
export const PROLOGUE_END_LINE=timedLine(raw('END-01','mike','gameplay','U','Where did they go? Am I going crazy?'),0,4);
export const PROLOGUE_AUDIO_LINES=freeze([...PROLOGUE_LINES,...PROLOGUE_FOLLOW_LINES,PROLOGUE_END_LINE]);
export const PROLOGUE=freeze({duration:baseline.duration,storyCredit:'Jacob Nangle',perspective:'Mike Hartmouth',cues:baseline.cues,voiceTail:VOICE_TAIL,lateCueWindow:.35});
