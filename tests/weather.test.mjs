import test from 'node:test';
import assert from 'node:assert/strict';
import {createWeather, createPuddleLayout, puddleRadius, containsPuddle, WEATHER_LIMITS} from '../src/weather.js';
import {createMaze, canOccupy} from '../src/maze.js';
import {createGame, startGame} from '../src/game.js';
import {createHarness} from './helpers/browser.mjs';

function fixture(options) {
  const maze = createMaze(), game = createGame(maze), weather = createWeather(maze, options);
  startGame(game);
  const tick = (time, options = {}) => { game.elapsed = time; return weather.update(game, 1 / 60, options); };
  return {maze, game, weather, tick};
}

test('puddle layout is repeatable across device budgets and fits physical corridors/corn bays', () => {
  const maze = createMaze(), before = JSON.stringify(maze.grid), layout = createPuddleLayout(maze);
  assert.ok(layout.length > 30 && layout.length < 250);
  assert.deepEqual(createWeather(maze).state.puddles, createWeather(maze, {touch:true}).state.puddles);
  for (const p of layout) {
    assert.ok(containsPuddle(p,p.x,p.z));
    assert.equal(containsPuddle(p,p.x+3,p.z+3),false);
    for (let i=0;i<64;i++) {
      const a=i/64*Math.PI*2,r=puddleRadius(a),u=Math.cos(a)*r*p.rx,v=Math.sin(a)*r*p.rz;
      assert.ok(canOccupy(maze,p.x+p.cos*u+p.sin*v,p.z-p.sin*u+p.cos*v,.01));
    }
  }
  assert.equal(JSON.stringify(maze.grid),before);
});

test('spatial lookup covers the whole puddle footprint even across cell boundaries', () => {
  const {weather} = fixture();
  for(const p of weather.state.puddles) for(let i=0;i<20;i++) {
    const a=i/20*Math.PI*2,u=Math.cos(a)*.8*p.rx,v=Math.sin(a)*.8*p.rz;
    const x=p.x+p.cos*u+p.sin*v,z=p.z-p.sin*u+p.cos*v;
    if(containsPuddle(p,x,z))assert.ok(weather.puddleAt(x,z));
  }
});

test('actual distance triggers exactly one wet footstep with synchronized pooled effects', () => {
  const {game,weather,tick}=fixture(),p=weather.state.puddles[0];
  Object.assign(game.player,{x:p.x,z:p.z,moving:true,yaw:0});game.steps=1.56;
  const events=tick(.5);
  assert.equal(events.length,1);assert.equal(events[0].type,'footstep');assert.equal(events[0].wet,true);
  assert.equal(weather.snapshot().wetSteps,1);assert.equal(weather.snapshot().splashes,1);
  assert.ok(weather.snapshot().activeRipples>0);
  assert.equal(tick(.51).length,0);
});

test('stationary, blocked, hiding and throw travel never invent walking splashes', () => {
  const {game,weather,tick}=fixture();
  tick(1);assert.equal(weather.snapshot().drySteps+weather.snapshot().wetSteps,0);
  game.player.moving=false;game.steps=2;tick(2);
  game.player.moving=true;game.player.hidden=true;tick(3);
  game.player.hidden=false;game.interaction={phase:'throw'};game.steps=9;tick(4);
  game.interaction=null;game.player.moving=false;tick(5);
  assert.equal(weather.snapshot().drySteps+weather.snapshot().wetSteps,0);
});

test('landing is a separate authoritative splash, with no duplicate on later updates', () => {
  const {game,weather,tick}=fixture(),p=weather.state.puddles[0];
  Object.assign(game.player,{x:p.x,z:p.z});
  const events=tick(1,{events:[{type:'landing'}]});
  assert.equal(events.filter(e=>e.type==='splash').length,1);
  tick(1.1);assert.equal(weather.snapshot().splashes,1);
  assert.equal(weather.snapshot().wetSteps,0);
});

test('one soft flash schedules one later thunder, with no replay', () => {
  const {weather,tick}=fixture();
  tick(12);assert.equal(weather.snapshot().flashes,1);assert.ok(weather.snapshot().thunderAt>12);
  tick(12.3);assert.ok(weather.state.lightning>0);
  const due=weather.snapshot().thunderAt;
  assert.equal(tick(due).filter(e=>e.type==='thunder').length,1);
  assert.equal(tick(due+.1).length,0);assert.equal(weather.snapshot().thunders,1);
});

test('pause freezes weather time and a pending thunder resumes without a burst', () => {
  const {game,weather,tick}=fixture();tick(12);
  const before=weather.snapshot();game.mode='paused';tick(99);
  assert.deepEqual(weather.snapshot(),before);
  game.mode='playing';tick(12.1);
  assert.equal(tick(before.thunderAt).filter(e=>e.type==='thunder').length,1);
});

test('mute consumes pending thunder while weather visuals keep progressing', () => {
  const {weather,tick}=fixture();tick(12);const due=weather.snapshot().thunderAt;
  tick(12.1,{muted:true});assert.equal(weather.snapshot().thunderAt,null);
  assert.equal(tick(due+1).filter(e=>e.type==='thunder').length,0);
  assert.ok(weather.snapshot().time>12);
});

test('QTE, red sky and threat cues suppress pending thunder and lightning', () => {
  for(const type of ['qte','red','cue','stagger']) {
    const {game,weather,tick}=fixture();tick(12);const due=weather.snapshot().thunderAt;
    if(type==='qte')game.interaction={phase:'qte'};
    if(type==='red')game.skyRedUntil=30;
    tick(12.1,{events:type==='cue'?[{type:'hunt_resume'}]:type==='stagger'?[{type:'stagger'}]:[]});
    assert.equal(weather.state.lightning,0);assert.equal(weather.snapshot().thunderAt,null);
    assert.equal(tick(due).filter(e=>e.type==='thunder').length,0);
  }
});

test('reduced effects disable flashes and splash droplets; ripple feedback remains', () => {
  const {game,weather,tick}=fixture({touch:true}),p=weather.state.puddles[0];
  Object.assign(game.player,{x:p.x,z:p.z,moving:true});game.steps=2;
  tick(12,{reduced:true});tick(12.3,{reduced:true});
  assert.equal(weather.state.lightning,0);assert.equal(weather.snapshot().activeDrops,0);
  assert.ok(weather.snapshot().activeRipples>0);
});

test('pools remain bounded and reset clears transient effects, distance and storm state', () => {
  const {game,weather,tick}=fixture({touch:true}),p=weather.state.puddles[0];
  Object.assign(game.player,{x:p.x,z:p.z,moving:true});
  for(let i=1;i<=100;i++){game.steps=i*1.6;tick(i/100);}
  assert.equal(weather.state.ripples.length,WEATHER_LIMITS.touch.ripples);
  assert.equal(weather.state.drops.length,WEATHER_LIMITS.touch.drops);
  assert.ok(weather.snapshot().activeRipples<=12);assert.ok(weather.snapshot().activeDrops<=24);
  tick(12);weather.reset();
  const reset=weather.snapshot();assert.equal(reset.splashes,0);assert.equal(reset.thunderAt,null);
  assert.equal(reset.activeRipples,0);assert.equal(reset.activeDrops,0);assert.equal(reset.nextStorm,12);
});

test('diagnostics are detached and disabled weather retains dry footsteps only', () => {
  const {game,weather,tick}=fixture({enabled:false});
  game.player.moving=true;game.steps=2;const [event]=tick(20);
  assert.equal(event.wet,false);assert.equal(weather.snapshot().puddles,0);
  const snapshot=weather.snapshot();snapshot.lastFootstep.x=999;snapshot.limits.rain=999;
  assert.notEqual(weather.snapshot().lastFootstep.x,999);assert.notEqual(weather.snapshot().limits.rain,999);
  assert.equal(weather.snapshot().flashes,0);
});

test('real frames and manual stepping share weather/footstep timing',async()=>{
  const live=createHarness({weather:true}),manual=createHarness({weather:true});
  await live.app.enter();await manual.app.enter();
  live.app.startLoop();live.key('KeyW');
  for(let time=100;time<=500;time+=100)live.frame(time);
  manual.app.step(.5,{forward:1,movementIntent:true});
  assert.deepEqual(live.weather.snapshot(),manual.weather.snapshot());
  assert.deepEqual(live.audio.weatherEvents,manual.audio.weatherEvents);
  assert.ok(live.audio.weatherEvents.some(e=>e.type==='footstep'));
});

test('runtime restart resets weather and pause does not generate extra footsteps',async()=>{
  const h=createHarness({weather:true});await h.app.enter();h.app.step(.5,{forward:1});
  const count=h.audio.weatherEvents.length;h.app.pause();h.app.step(2,{forward:1});
  assert.equal(h.audio.weatherEvents.length,count);
  await h.app.restart();assert.equal(h.weather.snapshot().wetSteps,0);assert.equal(h.weather.snapshot().time,0);
  assert.equal(h.weather.snapshot().activeRipples,0);
});
