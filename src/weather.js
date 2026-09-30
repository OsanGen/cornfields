import {CELL, centerOf, cellOf, key, canOccupy} from './maze.js';
import {actorPosition} from './hiding.js';
import {interactionLocked} from './grapple.js';

// Presentation only: separate randomness, clock and events from the enemy AI.
export const WEATHER_LIMITS = Object.freeze({
  desktop: Object.freeze({rain: 800, ripples: 24, drops: 48}),
  touch: Object.freeze({rain: 300, ripples: 12, drops: 24}),
});
export function weatherRandom(seed = 8317) {
  return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
}
export const puddleRadius = angle => .86 + .08 * Math.sin(angle * 3) + .055 * Math.cos(angle * 5);

export function containsPuddle(p, x, z) {
  const dx = x - p.x, dz = z - p.z;
  const u = (p.cos * dx - p.sin * dz) / p.rx;
  const v = (p.sin * dx + p.cos * dz) / p.rz;
  return Math.hypot(u, v) <= puddleRadius(Math.atan2(v, u));
}

export function createPuddleLayout(maze) {
  const random = weatherRandom(614), puddles = [];
  function add(x, z, rx, rz, angle) {
    const p = {id: puddles.length, x, z, rx, rz, angle, cos: Math.cos(angle), sin: Math.sin(angle)};
    // Keep the whole footprint inside real walkable ground, including corn bays.
    for (let i = 0; i < 32; i++) {
      const a = i / 32 * Math.PI * 2, r = puddleRadius(a);
      const u = Math.cos(a) * r * rx, v = Math.sin(a) * r * rz;
      if (!canOccupy(maze, x + p.cos * u + p.sin * v, z - p.sin * u + p.cos * v, .025)) return;
    }
    puddles.push(p);
    return p;
  }
  for (let z = 0; z < maze.grid.length; z++) for (let x = 0; x < maze.grid[z].length; x++) {
    if (maze.grid[z][x] || (x === maze.door.x && z === maze.door.z) ||
        (x === maze.gate.x && z === maze.gate.z)) continue;
    const firstCorridor = x === 15 && [31, 29].includes(z);
    if (!firstCorridor && random() > .36) continue;
    const at = centerOf(x, z);
    add(at.x + (firstCorridor ? 0 : (random() - .5) * .25),
      at.z + (firstCorridor ? 0 : (random() - .5) * .25),
      .65 + random() * .35, .62 + random() * .35, random() * Math.PI * 2);
  }
  for (const bay of maze.landingZones || []) {
    if (random() > .08) continue;
    add(bay.pocket.x, bay.pocket.z, .27, .48, Math.atan2(-bay.cornSide.z, bay.cornSide.x));
  }
  for(const section of maze.survivalLayout?.sections||[]){
    const puddle=add(section.anchor.x,section.anchor.z,.3,.3,section.slot*.7);
    if(puddle)puddle.section=section.slot;
  }
  return puddles;
}

const importantCues = new Set(['detection', 'chase', 'rage', 'corn_rush', 'hunt_resume', 'stagger',
  'eye_stab', 'tackle', 'landing', 'glimpse', 'near', 'sound', 'false', 'death', 'win']);

export function createWeather(maze, {touch = false, enabled = true} = {}) {
  const limits = WEATHER_LIMITS[touch ? 'touch' : 'desktop'];
  const puddles = enabled ? createPuddleLayout(maze) : [];
  const cells = new Map();
  function indexPuddles(){
  cells.clear();
  for (const p of puddles) {
    const radius = Math.max(p.rx, p.rz);
    for (let z = Math.floor((p.z - radius) / CELL); z <= Math.floor((p.z + radius) / CELL); z++) {
      for (let x = Math.floor((p.x - radius) / CELL); x <= Math.floor((p.x + radius) / CELL); x++) {
        const id = key(x, z);
        if (!cells.has(id)) cells.set(id, []);
        cells.get(id).push(p);
      }
    }
  }
  }
  indexPuddles();
  let geometry='';
  const ripples = Array.from({length: limits.ripples}, () => ({born: -Infinity}));
  const drops = Array.from({length: limits.drops}, () => ({born: -Infinity}));
  let random, ringIndex, dropIndex, lastStep, foot, nextStorm, thunderAt, nextRain, quietUntil;
  const state = {enabled, limits, puddles, ripples, drops, time: 0, lightning: 0, quiet: false,
    reduced: false, active: false, flashStarted: -Infinity, flashes: 0, thunders: 0,
    wetSteps: 0, drySteps: 0, splashes: 0, lastFootstep: null,layoutRevision:0};

  function reset() {
    geometry='';
    if(maze.survivalLayout){
      for(const p of puddles)if(p.section!==undefined)Object.assign(p,maze.survivalLayout.sections[p.section].anchor);
      indexPuddles();state.layoutRevision++;
    }
    random = weatherRandom(); ringIndex = dropIndex = foot = 0; lastStep = 0;
    nextStorm = 12; thunderAt = null; nextRain = .15; quietUntil = 0;
    Object.assign(state, {time: 0, lightning: 0, quiet: false, active: false,
      flashStarted: -Infinity, flashes: 0, thunders: 0, wetSteps: 0, drySteps: 0,
      splashes: 0, lastFootstep: null});
    for (const pool of [ripples, drops]) for (const item of pool) item.born = -Infinity;
  }
  function puddleAt(x, z) {
    const c = cellOf({x, z});
    return cells.get(key(c.x, c.z))?.find(p => containsPuddle(p, x, z)) || null;
  }
  function ripple(p, x, z, strength, rain = false) {
    Object.assign(ripples[ringIndex++ % ripples.length], {puddle: p, x, z,
      born: state.time, life: rain ? .7 : 1.15, size: rain ? .19 : .52, strength});
  }
  function splash(p, x, z, strength) {
    state.splashes++;
    ripple(p, x, z, strength);
    if (state.reduced) return;
    for (let i = 0; i < (touch ? 4 : 7); i++) {
      const angle = random() * Math.PI * 2, speed = (.28 + random() * .55) * strength;
      Object.assign(drops[dropIndex++ % drops.length], {x, z, born: state.time,
        vx: Math.cos(angle) * speed, vz: Math.sin(angle) * speed, vy: .65 + random() * .8});
    }
  }
  function update(game, dt, {events = [], reduced = false, muted = false} = {}) {
    const output = [];
    const revision=`${game.runId}:${game.maze.cornWorld.revision||0}`;
    if(game.maze.survivalLayout&&revision!==geometry){
      geometry=revision;
      for(const p of puddles)if(p.section!==undefined)Object.assign(p,game.maze.survivalLayout.sections[p.section].anchor);
      indexPuddles();state.layoutRevision++;
      // A recycled surface must not retain a ripple or splash from its old location.
      for(const pool of [ripples,drops])for(const item of pool)item.born=-Infinity;
    }
    state.reduced = reduced;
    state.active = game.mode === 'playing';
    if (!state.active) {
      if (game.mode !== 'paused') { thunderAt = null; state.lightning = 0; }
      return output;
    }
    state.time = game.elapsed;
    const at = actorPosition(game, 'player');
    if (events.some(e => importantCues.has(e.type))) quietUntil = state.time + 2.8;
    state.quiet = !!game.interaction || game.skyRedUntil > game.elapsed || state.time < quietUntil;
    if (state.quiet || muted) thunderAt = null;

    if (interactionLocked(game) || game.player.hidden) lastStep = game.steps;
    else if (game.player.moving && game.steps - lastStep > 1.55) {
      lastStep = game.steps;
      const side = (++foot % 2 ? 1 : -1) * .12;
      const x = at.x + Math.cos(game.player.yaw) * side;
      const z = at.z - Math.sin(game.player.yaw) * side;
      const p = puddleAt(x, z);
      const event = {type: 'footstep', wet: !!p, x, z, variant: foot % 2};
      state.lastFootstep = {...event};
      state[p ? 'wetSteps' : 'drySteps']++;
      if (p) splash(p, x, z, .8);
      output.push(event);
    }
    if (!enabled) return output;
    for (const event of events) if (event.type === 'landing') {
      const p = puddleAt(at.x, at.z);
      if (p) {
        splash(p, at.x, at.z, 1.2);
        output.push({type: 'splash', x: at.x, z: at.z, variant: foot % 2});
      }
    }
    if (state.time >= nextRain) {
      nextRain = state.time + (touch ? .19 : .10);
      // A nearby random surface sample replaces hundreds of per-drop raycasts.
      const x = at.x + (random() - .5) * 9, z = at.z + (random() - .5) * 9;
      const p = puddleAt(x, z);
      if (p) ripple(p, x, z, .4, true);
    }
    if (state.time >= nextStorm) {
      nextStorm = state.time + 18 + random() * 16;
      if (!state.quiet) {
        state.flashStarted = state.time;
        state.flashes++;
        if (!muted) thunderAt = state.time + 1.1 + random() * 1.5;
      }
    }
    const flashAge = state.time - state.flashStarted;
    state.lightning = reduced || state.quiet || flashAge < 0 || flashAge > .65 ? 0 :
      Math.sin(flashAge / .65 * Math.PI) ** 2;
    if (thunderAt !== null && state.time >= thunderAt) {
      thunderAt = null;
      if (!muted && !state.quiet) { state.thunders++; output.push({type: 'thunder'}); }
    }
    return output;
  }
  function snapshot() {
    return {enabled, time: +state.time.toFixed(3), puddles: puddles.length, limits: {...limits},
      lightning: +state.lightning.toFixed(3), quiet: state.quiet, reduced: state.reduced,
      activeRipples: ripples.filter(r => state.time - r.born < r.life).length,
      activeDrops: drops.filter(d => { const t = state.time - d.born; return t >= 0 && t < .5 && d.vy * t - 4.9 * t * t > -.012; }).length,
      flashes: state.flashes, thunders: state.thunders, wetSteps: state.wetSteps,
      drySteps: state.drySteps, splashes: state.splashes, nextStorm, thunderAt,
      lastFootstep: state.lastFootstep ? {...state.lastFootstep} : null};
  }
  reset();
  return {state, update, reset, puddleAt, snapshot};
}
