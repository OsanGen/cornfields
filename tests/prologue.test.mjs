import test from 'node:test';
import assert from 'node:assert/strict';
import {PROLOGUE,PROLOGUE_CHAPTERS,PROLOGUE_LINES,createPrologueTimeline,prologueFrame,createPrologue} from '../src/prologue.js';

test('story has contiguous chapters and readable, complete subtitles for every utterance',()=>{
  assert.deepEqual(PROLOGUE_CHAPTERS.map(c=>c.id),['car','dispatch','emergence','walk','history','disappearance','arrival','rupture']);
  assert(PROLOGUE.duration>=240&&PROLOGUE.duration<=360);
  let end=0;for(const chapter of PROLOGUE_CHAPTERS){assert.equal(chapter.start,end);assert(chapter.end>chapter.start);end=chapter.end;}
  assert.equal(end,PROLOGUE.duration);
  const ids=new Set();end=0;
  for(const line of PROLOGUE_LINES){
    assert(!ids.has(line.id));ids.add(line.id);assert(line.start>=end);assert(line.end>line.start);end=line.end;
    const chapter=PROLOGUE_CHAPTERS.find(c=>c.id===line.chapter);assert(line.start>=chapter.start&&line.end<=chapter.end);
    assert(['mike','clarence','stanley','dispatch'].includes(line.voice));assert.equal(line.speaker,line.voice.toUpperCase());
    assert.equal(line.subtitles[0].start,line.start);assert.equal(line.subtitles.at(-1).end,line.end);
    let subtitleEnd=line.start;for(const chunk of line.subtitles){
      assert.equal(chunk.start,subtitleEnd);assert(chunk.end>chunk.start);subtitleEnd=chunk.end;
      const rows=chunk.text.split('\n');assert(rows.length<=2);assert(rows.every(row=>row.length<=44));
    }
    assert.equal(line.subtitles.map(c=>c.text).join(' ').replace(/\s+/g,' '),line.text);
  }
});

test('source story facts and exactly one final fragment survive the adaptation',()=>{
  const text=PROLOGUE_LINES.map(line=>line.text).join(' ');
  for(const fact of [/mask and the guns and the blitzkrieg/,/2002/,/Sadie Yates/,/gray jacket with holes in it/,/seven hundred acres/,/compass.*lost/,/mind sees north/,/Sadie knew that rule/,/dog was barking wild/,/Were there footsteps\?/,/Not at all/])assert.match(text,fact);
  assert(PROLOGUE_LINES.find(line=>line.id==='car_mike_2002').adaptation);
  assert(PROLOGUE_LINES.find(line=>line.id==='walk_stanley_protective').adaptation);
  assert(PROLOGUE_LINES.find(line=>line.id==='history_stanley_direction').adaptation);
  assert.doesNotMatch(text,/Cold Case|that thing on TV/);
  assert.deepEqual(PROLOGUE_LINES.filter(line=>line.chapter==='rupture').map(line=>[line.speaker,line.text]),[['CLARENCE','Mike?']]);
});

test('real voice durations extend later dialogue, chapter boundaries and effects without overlap',()=>{
  const source=JSON.stringify(PROLOGUE_LINES),first=PROLOGUE_LINES[0],longDuration=first.end-first.start+15;
  const timeline=createPrologueTimeline({durations:{[first.id]:longDuration,rupture_clarence_mike:{duration:4}}});
  const extra=15+PROLOGUE.voiceTail;
  assert(Math.abs(timeline.lines[0].end-first.end-extra)<1e-9);
  assert(Math.abs(timeline.chapters[0].end-PROLOGUE_CHAPTERS[0].end-extra)<1e-9);
  assert(Math.abs(timeline.cues[0][1]-PROLOGUE.cues[0][1]-extra)<1e-9);
  assert(timeline.duration>PROLOGUE.duration+extra);
  for(let i=1;i<timeline.lines.length;i++)assert(timeline.lines[i].start>=timeline.lines[i-1].end);
  for(const line of timeline.lines){
    const chapter=timeline.chapters.find(c=>c.id===line.chapter);assert(line.start>=chapter.start&&line.end<=chapter.end);
    assert.equal(line.subtitles.at(-1).end,line.end);
  }
  assert.equal(JSON.stringify(PROLOGUE_LINES),source);
  assert(Object.isFrozen(timeline.lines[0].subtitles));
  assert.equal(createPrologue({durations:{[first.id]:longDuration}}).snapshot().duration,PROLOGUE.duration+extra);
});

test('missing, short and invalid recording durations keep the readable baseline',()=>{
  const first=PROLOGUE_LINES[0];
  for(const value of [undefined,0,-1,NaN,Infinity,.1])assert.equal(createPrologueTimeline({durations:{[first.id]:value}}).duration,PROLOGUE.duration);
});

test('pause freezes time, hides captions and resumes the same utterance without restarting',()=>{
  const story=createPrologue();story.tick(10);assert.equal(story.snapshot().time,0);assert.equal(story.phase,'preflight');
  assert(story.begin());assert(!story.begin());story.tick(5);const before=story.frame();assert(before.spoken);
  assert(story.pause());story.tick(60);assert.equal(story.snapshot().time,5);assert.equal(story.frame().spoken,'');
  assert(story.resume());assert.equal(story.frame().spoken,before.spoken);assert.equal(story.frame().line.id,before.line.id);
  for(const dt of [NaN,Infinity,0,-1])story.tick(dt);assert.equal(story.snapshot().time,5);
});

test('effects fire once near their boundary and late effects never suppress current dialogue',()=>{
  const effects=[],story=createPrologue({onCue:id=>effects.push(id)});story.begin();story.tick(PROLOGUE.cues[0][1]);
  assert.deepEqual(effects,['radio']);story.tick(.01);assert.deepEqual(effects,['radio']);
  story.tick(155-story.snapshot().time);
  assert.equal(story.frame().line.id,'walk_stanley_man');assert.match(story.frame().spoken,/I saw something/);
  assert.deepEqual(story.snapshot().dropped,['corn_burst','door_open']);assert.deepEqual(effects,['radio']);
});

test('completion, skip and replay retain one deterministic timeline and do not fire skipped effects',()=>{
  const effects=[],story=createPrologue({onCue:id=>effects.push(id)});story.begin();story.tick(PROLOGUE.duration+1);
  assert.equal(story.phase,'finished');assert.equal(story.snapshot().time,PROLOGUE.duration);assert.equal(story.frame().line,null);
  assert.deepEqual(effects,[]);assert(story.begin());assert.equal(story.snapshot().time,0);assert.deepEqual(story.snapshot().fired,[]);
  story.tick(3);story.pause();assert(story.skip());assert.equal(story.snapshot().skipped,true);assert.equal(story.phase,'finished');
  assert(story.begin());assert.equal(story.snapshot().skipped,false);story.finish();assert.equal(story.snapshot().time,PROLOGUE.duration);
  story.dispose();assert(!story.begin());assert(!story.resume());
});

test('pure frames retain dialogue and rupture continuity in reduced effects mode',()=>{
  for(const line of PROLOGUE_LINES){
    const at=(line.start+line.end)/2,normal=prologueFrame(at),reduced=prologueFrame(at,{reduced:true});
    assert.equal(normal.spoken,reduced.spoken);assert.equal(normal.line.id,line.id);assert.equal(reduced.line.id,line.id);
    assert.equal(normal.returning,false);assert.equal(normal.returnTime,0);
  }
  assert.equal(prologueFrame(-10).time,0);assert.equal(prologueFrame(NaN).time,0);
  const end=prologueFrame(PROLOGUE.duration+30);assert.equal(end.chapter,'rupture');assert.equal(end.chapterProgress,1);assert.equal(end.red,1);assert.equal(end.mist,1);assert.equal(end.line,null);
});
