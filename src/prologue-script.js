// Jacob Nangle's playtest dialogue, with the approved roadside staging.
// Full utterances are the speech synthesis source; subtitles are display chunks.
const freeze=Object.freeze;
export const PROLOGUE_CHAPTERS=freeze([
  ['car','Police car',0,60],['dispatch','Dispatch call',60,83],
  ['emergence','Stanley emerges',83,108],['walk','Sadie saw someone',108,176],
  ['history','The field goes too far',176,236],['disappearance','Sadie disappears',236,286],
  ['arrival','The threshold',286,302],['rupture','Reality breaks',302,326],
].map(([id,title,start,end])=>freeze({id,title,start,end})));

function subtitleBlocks(parts){
  return parts.flatMap(part=>{
    const rows=[];let row='';
    for(const word of part.split(/\s+/)){
      if(row&&row.length+word.length+1>44){rows.push(row);row='';}
      row+=(row?' ':'')+word;
    }
    if(row)rows.push(row);
    const blocks=[];for(let i=0;i<rows.length;i+=2)blocks.push(rows.slice(i,i+2).join('\n'));
    return blocks;
  });
}
function subtitles(parts,start,end){
  const blocks=subtitleBlocks(parts),weights=blocks.map(text=>text.split(/\s+/).length),total=weights.reduce((a,b)=>a+b,0);
  let cursor=start;
  return freeze(blocks.map((text,i)=>{
    const next=i===blocks.length-1?end:cursor+(end-start)*weights[i]/total;
    const chunk=freeze({text,start:cursor,end:next});cursor=next;return chunk;
  }));
}
function line(id,voice,chapter,start,end,parts,adaptation){
  return freeze({id,speaker:voice.toUpperCase(),voice,chapter,start,end,text:parts.join(' '),
    ...(adaptation?{adaptation}:{}),subtitles:subtitles(parts,start,end)});
}

export const PROLOGUE_LINES=freeze([
  line('car_mike_memory','mike','car',2,32,[
    "It's certainly miraculous, there's no doubt about that.",
    "But I can't get this shit out of my head.",
    "Clarence, I've been doing this job for what feels like an eternity",
    "and it feels like every other minute I'm seeing that hoodie fucker",
    'with the mask and the guns and the blitzkrieg.',
    "It won't stop replaying in my head.",
    "Like the worst overplayed song you've heard on the radio.",
  ]),
  line('car_mike_2002','mike','car',33,36.5,[
    'Ever since that night in 2002.',
  ],'Minimal bridge: names the year of Mike\'s established trauma.'),
  line('car_clarence_nervous','clarence','car',38,40.5,["You're making me nervous, Mike."]),
  line('car_mike_story','mike','car',42,48,[
    "Every cop has to have a story. It's basically a law or something.",
  ]),
  line('car_mike_ready','mike','car',49,59,[
    "Don't be nervous. Be ready.",
    "That's what'll make you the man who tells the story back and wears it like a crown.",
  ]),
  line('dispatch_missing','dispatch','dispatch',61,71,[
    "Chief Hartmouth, Edwards, we've got a missing-person report",
    'just down the road from your current position.',
    'Juvenile female. Sadie Yates.',
  ],'Approved roadside adaptation: radio report replaces the telephone call.'),
  line('dispatch_property','dispatch','dispatch',73,78,[
    'Family property backs onto the cornfields. Father is on scene.',
  ],'Approved roadside adaptation: radio report replaces the telephone call.'),
  line('dispatch_clarence_close','clarence','dispatch',79.5,81.5,["That's close."]),
  line('emergence_stanley_missing','stanley','emergence',91,99,[
    'Officer, my name is Stanley Yates and my daughter Sadie has gone missing.',
  ]),
  line('emergence_stanley_follow','stanley','emergence',102,105,["Come on. It's back here."]),
  line('walk_stanley_curious','stanley','walk',110,113,[ 'Sadie was a curious child.' ]),
  line('walk_stanley_weeks','stanley','walk',115,122,[
    "It didn't start today. She went missing today,",
    'but the real issues started a few weeks ago.',
  ]),
  line('walk_stanley_dinner','stanley','walk',124,134,[
    'One evening over dinner she asked me, her mother, and her brother Owen',
    'who lived in the cornfields behind our house.',
  ]),
  line('walk_clarence_lives','clarence','walk',135,137,[ 'Who lives in them?' ]),
  line('walk_stanley_nobody','stanley','walk',139,148,[
    "Nobody. That's what we told her. Nothing lives in the cornfields.",
    "They're just tall weeds we need for the farm's sake.",
  ]),
  line('walk_stanley_asked','stanley','walk',149,152,[ 'Then she told us why she asked.' ]),
  line('walk_stanley_man','stanley','walk',154,161,[
    'I saw something earlier out there. A man.',
    'He had a gray jacket with holes in it.',
  ]),
  line('walk_clarence_known','clarence','walk',162,164,[ 'Someone you knew?' ]),
  line('walk_stanley_stranger','stanley','walk',165,169,[
    "No. She said she'd never seen that man before.",
  ]),
  line('walk_stanley_protective','stanley','walk',170,175,[
    'After that, Glenda and I kept a closer eye on her.',
  ],'Minimal bridge: retains the source fact that her parents became more protective.'),
  line('history_stanley_miles','stanley','history',178,183,[
    'Those cornfields run on for miles and miles and miles.',
  ]),
  line('history_stanley_acres','stanley','history',184,192.5,[
    'More than the seven hundred acres we legally own.',
    'Longer than me or Glenda have ever dared venture.',
  ]),
  line('history_clarence_through','clarence','history',194,196.5,["You've never gone through it?"]),
  line('history_stanley_compass','stanley','history',198,207,[
    "When you're in there, there's zero sense of direction.",
    "You could be holding a compass and you'd still get lost.",
  ]),
  line('history_stanley_direction','stanley','history',209,220,[
    'The mind needs some semblance of direction to function.',
    "Out there, your brain doesn't have a north, west, east, or south to latch onto.",
  ],'Approved adaptation: Glenda\'s source explanation is reassigned to Stanley.'),
  line('history_stanley_rule','stanley','history',221.2,232,[
    'We had a rule. Only go as far as the mind sees north.',
    'If that gets blurry, even in the slightest bit, turn back immediately.',
  ]),
  line('history_stanley_knew','stanley','history',232.5,236,[
    'Sadie knew that rule. She knew it well.',
  ]),
  line('disappearance_mike_when','mike','disappearance',238,241.5,[
    'When did she go missing exactly?',
  ]),
  line('disappearance_stanley_dog','stanley','disappearance',243,251,[
    'About two hours ago. I was out with her in the backyard.',
    'We were taking the dog out.',
  ]),
  line('disappearance_stanley_barking','stanley','disappearance',252,264,[
    'She kept glancing into the cornfields.',
    'Then I spun around because the dog was barking wild at something.',
    'She never barks wild like that.',
  ]),
  line('disappearance_stanley_gone','stanley','disappearance',265,270,[
    'Then I spun back around and she was nowhere to be seen.',
  ]),
  line('disappearance_clarence_footsteps','clarence','disappearance',273,276,[
    'And did you hear anything? Were there footsteps?',
  ]),
  line('disappearance_stanley_vanished','stanley','disappearance',277,284,[
    'Not at all. It was like something out of a horror movie. She just vanished.',
  ]),
  line('arrival_clarence_here','clarence','arrival',291,294,[ 'This where you lost her?' ],
    'Approved threshold adaptation: a short observation at the game entrance.'),
  line('arrival_stanley_yes','stanley','arrival',295,296.2,[ 'Yeah.' ]),
  line('rupture_clarence_mike','clarence','rupture',311,312.8,[ 'Mike?' ]),
]);

export const PROLOGUE=freeze({
  duration:326,storyCredit:'Jacob Nangle',perspective:'Mike Hartmouth',
  cues:freeze([['radio',60.4],['corn_burst',87],['door_open',100],['crash',305]].map(freeze)),
  voiceTail:.12,lateCueWindow:.35,
});

/** Extend spoken slots to fit recordings, preserving all later silence and beats. */
export function createPrologueTimeline({durations={}}={}){
  const extensions=PROLOGUE_LINES.map(line=>{
    const value=durations[line.id],duration=typeof value==='number'?value:value?.duration;
    return {line,extra:Number.isFinite(duration)&&duration>0?Math.max(0,duration+PROLOGUE.voiceTail-(line.end-line.start)):0};
  });
  function at(time){
    let result=time;
    for(const {line,extra} of extensions){
      if(time>=line.end)result+=extra;
      else if(time>line.start)result+=extra*(time-line.start)/(line.end-line.start);
    }
    return result;
  }
  return freeze({
    duration:at(PROLOGUE.duration),
    chapters:freeze(PROLOGUE_CHAPTERS.map(chapter=>freeze({...chapter,start:at(chapter.start),end:at(chapter.end)}))),
    lines:freeze(PROLOGUE_LINES.map(line=>{
      const value=durations[line.id],duration=typeof value==='number'?value:value?.duration;
      const start=at(line.start),reservedEnd=at(line.end);
      // Speech can finish before its reserved dramatic pause. Keep captions with
      // the recording instead of displaying the final sentence after it ends.
      const end=Number.isFinite(duration)&&duration>0?Math.min(reservedEnd,start+Math.max(1.2,duration+PROLOGUE.voiceTail)):reservedEnd;
      const scale=(end-start)/(line.end-line.start);
      return freeze({...line,start,end,subtitles:freeze(line.subtitles.map(chunk=>freeze({...chunk,start:start+(chunk.start-line.start)*scale,end:start+(chunk.end-line.start)*scale})))});
    })),
    cues:freeze(PROLOGUE.cues.map(([id,time])=>freeze([id,at(time)]))),
  });
}
