import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PROLOGUE,PROLOGUE_CHAPTERS,PROLOGUE_LINES,PROLOGUE_AUDIO_LINES,PROLOGUE_FOLLOW_LINES,PROLOGUE_END_LINE,createPrologueTimeline} from '../src/prologue-script.js';
import {PROLOGUE_VOICE_TIMING} from '../src/prologue-voice-timing.js';

const ids=['car','dispatch','emergence','bang','cabin','exit','flashlight','walk','undead','history','redroom','return_walk','disappearance','liquid','arrival','rupture'];
function verifyTimeline(timeline){
  assert.deepEqual(timeline.chapters.map(c=>c.id),ids);
  let end=0;for(const chapter of timeline.chapters){assert.equal(chapter.start,end);assert(chapter.end>chapter.start);end=chapter.end;}
  assert.equal(end,timeline.duration);
  end=0;
  for(const line of timeline.lines){
    assert(line.start>=end);assert(line.end>line.start);end=line.end;
    const chapter=timeline.chapters.find(c=>c.id===line.chapter);assert(line.start>=chapter.start&&line.end<=chapter.end);
    assert.equal(line.subtitles[0].start,line.start);assert.equal(line.subtitles.at(-1).end,line.end);
    let subtitleEnd=line.start;for(const chunk of line.subtitles){
      assert.equal(chunk.start,subtitleEnd);assert(chunk.end>chunk.start);subtitleEnd=chunk.end;
      const rows=chunk.text.split('\n');assert(rows.length<=2);assert(rows.every(row=>row.length<=44));
    }
    assert.equal(line.subtitles.map(c=>c.text).join(' ').replace(/\s+/g,' '),line.text);
  }
}

test('fast opening keeps one contiguous, complete script and independent follow/end cues',()=>{
  verifyTimeline({chapters:PROLOGUE_CHAPTERS,lines:PROLOGUE_LINES,duration:PROLOGUE.duration});
  assert.equal(new Set(PROLOGUE_AUDIO_LINES.map(line=>line.id)).size,42);
  assert(PROLOGUE.duration+20+4<223,'baseline has room for tutorial reactions');
  assert.deepEqual(PROLOGUE_FOLLOW_LINES.map(line=>line.id),['FOL-01','FOL-02','FOL-03']);
  assert.equal(PROLOGUE_END_LINE.text,'Where did they go? Am I going crazy?');
  assert.equal(PROLOGUE_END_LINE.basis,'U');
  assert(PROLOGUE_LINES.every(line=>!line.id.startsWith('FOL-')&&line.id!=='END-01'));
});

test('source wording, provenance and unanswered identity survive the fast adaptation',()=>{
  const line=id=>PROLOGUE_AUDIO_LINES.find(item=>item.id===id),text=PROLOGUE_LINES.map(item=>item.text).join(' ');
  assert.equal(line('CAR-01').basis,'A');assert.equal(line('CAR-02').basis,'R');assert.equal(line('RAD-01').basis,'N');
  assert.equal(line('WAL-14').text,'Then I spun around, and she was nowhere to be seen.');
  assert.equal(line('ARR-01').text,'Officer, my name is Stanley Yates and my daughter Sadie has gone missing.');
  assert.equal(line('FLA-03').voice,'mike');assert.equal(line('FLA-03').chapter,'cabin');
  assert.equal(PROLOGUE_LINES.filter(item=>/fucking insane/.test(item.text)).length,1);
  assert.equal(line('LIQ-01').text,'WE ARE ONE');assert.equal(line('LIQ-01').speaker,'');
  assert.equal(line('RED-01').speaker,'PROJECTED FACE');
  for(const fact of [/2002/,/Sadie Yates/,/gray jacket with holes in it/,/seven hundred acres/,/compass.*lost/,/mind sees north/,/Sadie knew that rule/,/dog was barking wild/,/Were there footsteps\?/,/She just vanished/])assert.match(text,fact);
  assert.doesNotMatch(text,/Cold Case|that thing on TV|blitzkrieg|Glenda/);
  assert(PROLOGUE_AUDIO_LINES.every(item=>['R','A','N','U'].includes(item.basis)));
  assert.equal(PROLOGUE_LINES.filter(item=>item.chapter==='rupture').length,0);
});

test('hallucinations hold at the three required completed-sentence boundaries',()=>{
  const timeline=createPrologueTimeline(),chapter=id=>timeline.chapters.find(c=>c.id===id),line=id=>timeline.lines.find(l=>l.id===id);
  for(const [id,seconds,preceding,next] of [['undead',2,'WAL-05','WAL-06'],['redroom',10,'WAL-09','RET-01'],['liquid',5,'WAL-16',null]]){
    const c=chapter(id);assert(Math.abs(c.end-c.start-seconds)<1e-9);assert(c.start>=line(preceding).end);
    if(next)assert(line(next).start>=c.end);
    assert(timeline.lines.filter(l=>l.start>=c.start&&l.start<c.end).every(l=>l.chapter===id));
  }
  assert.equal(chapter('rupture').end-chapter('rupture').start,12);
  assert(Math.abs(line('RED-01').start-chapter('redroom').start-1)<1e-9);
  assert(Math.abs(line('RED-02').start-chapter('redroom').start-3)<1e-9);
  assert(Math.abs(line('RED-03').start-chapter('redroom').start-6)<1e-9);
});

test('natural recordings drive speech chapters without inherited slot padding or voice acceleration',()=>{
  const first=PROLOGUE_LINES[0],long=first.end-first.start+15;
  const expanded=createPrologueTimeline({durations:{[first.id]:long}}),compact=createPrologueTimeline({durations:{[first.id]:2}});
  verifyTimeline(expanded);verifyTimeline(compact);
  assert(Math.abs(expanded.lines[0].end-expanded.lines[0].start-long-PROLOGUE.voiceTail)<1e-9);
  assert(expanded.duration>PROLOGUE.duration);assert(compact.duration<PROLOGUE.duration);
  assert.equal(expanded.chapters.find(c=>c.id==='redroom').end-expanded.chapters.find(c=>c.id==='redroom').start,10);
  for(const value of [undefined,0,-1,NaN,Infinity])assert.equal(createPrologueTimeline({durations:{[first.id]:value}}).duration,PROLOGUE.duration);
  assert.doesNotMatch(fs.readFileSync(new URL('../scripts/build-prologue-voices.py',import.meta.url),'utf8'),/atempo=/);
});

test('all shipped fast cues have natural recordings, complete captions and fit their fixed vision windows',()=>{
  const timeline=createPrologueTimeline({durations:PROLOGUE_VOICE_TIMING});verifyTimeline(timeline);
  for(const line of PROLOGUE_AUDIO_LINES){
    assert(PROLOGUE_VOICE_TIMING[line.id]?.duration>0,line.id);
    assert(fs.statSync(new URL(`../assets/audio/prologue/${line.id}.mp3`,import.meta.url)).size>100,line.id);
  }
  for(const id of ['RED-01','RED-02','RED-03','LIQ-01']){
    const line=timeline.lines.find(l=>l.id===id);assert(PROLOGUE_VOICE_TIMING[id].duration<=line.end-line.start,id);
  }
  assert(timeline.duration+20+PROLOGUE_END_LINE.end<240,'normal authored runtime allows four minute target');
});
