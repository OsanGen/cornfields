import { cellOf, key, centerOf, moveBody, lineOfSight, cornZoneAt } from './maze.js';
import { GAME_CONFIG as C, distance, emitEvent, addEvidence } from './game-config.js';
import {nearestHideAnchor,hiddenInput,updateCornPresence,actorPosition} from './hiding.js';
import {gateAt,toggleDoor,advanceDoors} from './corn-world.js';
import { fireGun, attackPlayer } from './combat.js';
import { createEnemy, updateZombie, checkpointDisengage } from './zombie-ai.js';
import { updateDirector, updateFeedback } from './threat-director.js';
import {interactionLocked,updateInteraction} from './grapple.js';
let nextRunId=0;

export { actorPosition };
export const WALK_SPEED = C.player.moveSpeed;
export const RUN_SPEED = C.player.moveSpeed;
export const BEATS = [];
export const emit = emitEvent;

/**
 * @typedef {object} GameInput
 * @property {number} [forward] Net movement axis, independent of held-key intent.
 * @property {number} [strafe]
 * @property {number} [yaw] Absolute desired view; deliberate hidden look still rustles.
 * @property {number} [pitch]
 * @property {boolean} [fire] One-shot edge.
 * @property {boolean} [flashlight] One-shot edge.
 * @property {boolean} [interact] One-shot edge.
 * @property {number} [lookDelta] Raw mouse movement in pixels, consumed once.
 * @property {boolean} [movementIntent] Any movement key held, even opposing keys.
 */

function createPlayer(spawn) {
  return {
    ...spawn,
    yaw: 0,
    pitch: 0,
    radius: .25,
    moving: false,
    sprinting: false,
    health: C.player.maxHealth,
    maxHealth: C.player.maxHealth,
    ammo: C.player.startAmmo,
    flashlightOn: true,
    hidden: false,
    hideAnchorId: null,
    hideDepth: 0,
    hideDetected: false,
    returnTransform: null,
    shotCooldown: 0,
    damageCooldown: 0,
    muzzleFlash: 0,
  };
}

function createMetrics() {
  return {
    shotsFired: 0,
    shotsHit: 0,
    damageTaken: 0,
    hitsTaken: 0,
    hidesEntered: 0,
    hidesDetected: 0,
    hidesSurvived: 0,
    rageEpisodes: 0,
    rageEscapes: 0,
    predictions: 0,
    searchCellsVisited: 0,
    checkpointTimes: [],
    hiddenRepositions: 0,
    ammoRemaining: C.player.startAmmo,
    chaseSeconds: 0,
    proximitySeconds: [0, 0, 0, 0, 0],
    outcome: 'in_progress',
    completionTime: null,
  };
}

/** Every run owns fresh mutable state; the authored maze is shared read-only. */
export function createGame(maze) {
  return {
    maze,
    runId:++nextRunId,eventId:0,interaction:null,interactionSerial:0,pendingStabs:[],skyRedUntil:0,
    mode: 'menu',
    elapsed: 0,
    player: createPlayer(maze.spawn),
    enemy: createEnemy(),
    doorOpen: false,
    doorAmount: 0,
    cornDoors:maze.cornDoors.map(()=>({amount:0,target:0})),movingDoors:new Set(),doorRevision:0,
    entered: false,
    deepest: 0,
    beats: [],
    events: [],
    evidence: [],
    evidenceId: 0,
    caption: '',
    captionTime: 0,
    chapter: 'THE THRESHOLD',
    objective: 'Open the CORNFIELD door. Find your daughter.',
    landmark: 'TRUST THE LANDMARKS',
    landmarks: [],
    centerReached: false,
    finalTime: 0,
    gateClosed: false,
    grace: 0,
    steps: 0,
    footstepTimer: 0,
    tutorial: { hideShown: false, entered: false },
    progress: {
      objective: 'Find your daughter',
      checkpointIndex: 0,
      escalationTier: 0,
      activatedCheckpoints: [],
      daughterFound: false,
    },
    threat: {
      escalationTier: 0,
      pressure: 0,
      intensity: 0,
      proximityTier: 0,
      lastMessageAt: -10,
      activeMessage: null,
      activeMessageTime: 0,
      directorIntent: 'quiet',
      quietWindow: 0,
    },
    metrics: createMetrics(),
  };
}

export function startGame(game) {
  if (game.mode === 'menu') game.mode = 'playing';
}

export function pauseGame(game) {
  if (game.mode !== 'playing') return;
  game.mode = 'paused';
  game.pendingStabs.length=0;
  game.player.moving = false;
  game.player.sprinting = false;
}

export function resumeGame(game) {
  if (game.mode === 'paused') game.mode = 'playing';
}

export function blocksFor(game) {
  const blocks=game.doorOpen?[]:[game.maze.door];blocks.doors=game.cornDoors;blocks.revision=game.doorRevision;game.blocks=blocks;return blocks;
}

export function nearDoor(game) {
  return !game.doorOpen &&
    distance(game.player, centerOf(game.maze.door.x, game.maze.door.z)) < 3.2;
}

export function interactionPrompt(game) {
  if(interactionLocked(game))return '';
  if (nearDoor(game)) return 'E - OPEN DOOR';
  blocksFor(game);const door=gateAt(game);
  if(door)return game.cornDoors[door.index].target>.5?'E - CLOSE':'E - OPEN';
  return '';
}

export function interact(game) {
  if (game.mode !== 'playing'||interactionLocked(game)) return;
  const blocks = blocksFor(game);
  if (nearDoor(game)) {
    game.doorOpen = true;
    game.objective = 'FIND YOUR DAUGHTER';
    emit(game, 'door', 'Find your daughter. Keep moving.');
    addEvidence(game, 'door', game.player, C.hearing.doorRadius, 2);
    return;
  }
  const door=gateAt(game);
  if(door){toggleDoor(game,door);addEvidence(game,'door',door,C.hearing.doorRadius,3);emit(game,'door','',door);}
}

function finishMetrics(game, outcome) {
  game.interaction=null;game.pendingStabs.length=0;game.skyRedUntil=0;
  game.metrics.outcome = outcome;
  game.metrics.completionTime = game.elapsed;
  game.metrics.ammoRemaining = game.player.ammo;
  game.player.moving = false;
  game.player.sprinting = false;
}

export function fail(game) {
  if (game.mode !== 'playing') return;
  game.mode = 'dead';
  finishMetrics(game, 'dead');
  emit(game, 'death');
}

export function win(game) {
  if (game.mode !== 'playing') return;
  game.mode = 'won';
  finishMetrics(game, 'won');
  game.centerReached = true;
  game.progress.daughterFound = true;
  game.chapter = 'THE CENTER';
  game.objective = 'You found her.';
  emit(game, 'win', 'You found her.', game.maze.daughter);
}

function checkpoints(game, blocks) {
  for (const checkpoint of game.maze.checkpoints) {
    if (checkpoint.index !== game.progress.checkpointIndex ||
        game.progress.activatedCheckpoints.includes(checkpoint.id) ||
        distance(game.player, checkpoint) > C.progress.checkpointRadius ||
        !lineOfSight(game.maze, game.player, checkpoint, blocks)) continue;

    game.progress.activatedCheckpoints.push(checkpoint.id);
    game.progress.checkpointIndex++;
    game.progress.escalationTier = game.progress.checkpointIndex;
    game.player.health = game.player.maxHealth;
    const previousAmmo = game.player.ammo;
    game.player.ammo = Math.min(C.player.maxAmmo, game.player.ammo + C.player.checkpointAmmo);
    game.grace = C.progress.checkpointGraceSeconds;
    game.threat.quietWindow = 3;
    game.metrics.checkpointTimes.push(game.elapsed);
    game.chapter = checkpoint.index === 0 ? 'BEYOND THE WATCHMAN' : 'THE INNER ROWS';
    checkpointDisengage(game, blocks);
    emit(game, 'checkpoint', 'HEALTH RESTORED. +' + (game.player.ammo - previousAmmo) + ' ROUNDS.',
      checkpoint, { checkpointId: checkpoint.id, tier: game.progress.escalationTier });
  }
}

function resolvePlayerInput(game, dt, input) {
  const player = game.player;
  if (Number.isFinite(input.yaw)) player.yaw = input.yaw;
  if (Number.isFinite(input.pitch)) player.pitch = Math.max(-1.25, Math.min(1.25, input.pitch));

  const wasInCorn=!!player.cornZoneId;
  if(wasInCorn)hiddenInput(game,input);
  if (input.interact) interact(game);

  if (input.flashlight) {
    player.flashlightOn = !player.flashlightOn;
    emit(game, 'flashlight', '', actorPosition(game, 'player'));
    if (!player.hidden) addEvidence(game, 'flashlight', player, C.hearing.flashlightRadius, 1);
  }

  const before = { x: player.x, z: player.z };
  const forward = Number.isFinite(input.forward) ? input.forward : 0;
  const strafe = Number.isFinite(input.strafe) ? input.strafe : 0;
  const length = Math.hypot(forward, strafe);
  const blocks = blocksFor(game);
  if (length) {
    moveBody(game.maze, player,
      (-Math.sin(player.yaw) * forward + Math.cos(player.yaw) * strafe) / length * C.player.moveSpeed * dt,
      (-Math.cos(player.yaw) * forward - Math.sin(player.yaw) * strafe) / length * C.player.moveSpeed * dt,
      blocks);
  }
  const moved = distance(player, before);
  updateCornPresence(game,input,wasInCorn);
  player.moving = moved > .0001;
  player.sprinting = false;
  game.steps += moved;
  return blocks;
}

function updateProgress(game, blocks) {
  const player = game.player;
  const cell = cellOf(player);
  if (game.doorOpen && cell.z < 30 && !game.entered) {
    game.entered = true;
    game.chapter = 'THE OUTER ROWS';
    game.objective = 'FIND YOUR DAUGHTER';
    emit(game, 'entered');
  }
  if (game.entered) game.deepest = Math.max(game.deepest, game.maze.distances.get(key(cell.x, cell.z)) || 0);
  checkpoints(game, blocks);
  for (const landmark of game.maze.landmarks) {
    if (distance(landmark, player) < 5 && !game.landmarks.includes(landmark.id) &&
        lineOfSight(game.maze, player, landmark, blocks)) {
      game.landmarks.push(landmark.id);
      game.landmark = landmark.name;
      emit(game, 'landmark', '', landmark);
    }
  }
  if (!game.tutorial.hideShown && nearestHideAnchor(game, blocks)) {
    game.tutorial.hideShown = true;
    emit(game, 'tutorial', 'OPEN A WOODEN GATE. WALK INTO CORN. CLOSING IS OPTIONAL.');
  }
}

/** One authoritative substep: input, shot, rewards, perception/AI, attack, feedback. */
function tick(game, dt, input) {
  const player = game.player;
  game.elapsed += dt;
  game.captionTime = Math.max(0, game.captionTime - dt);
  if (!game.captionTime) game.caption = '';
  game.grace = Math.max(0, game.grace - dt);
  player.shotCooldown = Math.max(0, player.shotCooldown - dt);
  player.damageCooldown = Math.max(0, player.damageCooldown - dt);
  player.muzzleFlash = Math.max(0, player.muzzleFlash - dt);
  game.doorAmount = Math.min(1, game.doorAmount + (game.doorOpen ? dt * 1.2 : 0));
  advanceDoors(game,dt);blocksFor(game);

  const stabTimes=game.pendingStabs.filter(at=>at<=game.elapsed+1e-9);
  game.pendingStabs=game.pendingStabs.filter(at=>at>game.elapsed+1e-9);
  if(interactionLocked(game)){
    player.moving=false;
    updateInteraction(game,dt,{stabTimes,stab:input.stab});
    if(player.health<=0)fail(game);
    return;
  }

  const blocks = resolvePlayerInput(game, dt, input);
  game.footstepTimer -= dt;
  if (player.moving && game.footstepTimer <= 0) {
    addEvidence(game, 'footsteps', player, C.hearing.footstepRadius, 2);
    game.footstepTimer = C.hearing.footstepInterval;
  }
  if (input.fire) fireGun(game, blocks);
  updateProgress(game, blocks);

  // Daughter contact wins over an enemy attack scheduled for this same substep.
  if (game.entered && !player.hidden && distance(player, game.maze.daughter) < C.progress.daughterRadius) {
    win(game);
    return;
  }
  updateDirector(game, dt);
  // Recovery records legitimate perception, but cannot navigate or attack.
  if(game.interaction?.phase==='recovery'){
    updateZombie(game,dt,blocks);
    updateInteraction(game,dt);
    updateFeedback(game,dt);
    return;
  }
  updateZombie(game, dt, blocks);
  attackPlayer(game, blocks);
  updateFeedback(game, dt);
  game.metrics.chaseSeconds += ['chase', 'rage_chase', 'corn_rush'].includes(game.enemy.state) ? dt : 0;
  game.metrics.proximitySeconds[game.threat.proximityTier] += dt;
  game.metrics.ammoRemaining = player.ammo;
  if (player.health <= 0) fail(game);
}

/**
 * Advance simulation with bounded collision substeps. The runtime budgets real-time
 * catch-up; this deterministic API consumes each one-shot input exactly once.
 * @param {object} game
 * @param {number} dt Seconds of simulation requested.
 * @param {GameInput} input
 */
export function updateGame(game, dt, input = {}) {
  if (game.mode !== 'playing' || !Number.isFinite(dt) || dt <= 0) return;
  game.pendingStabs.push(...(input.stabTimes||[]).filter(Number.isFinite));
  game.pendingStabs=game.pendingStabs.slice(-64).sort((a,b)=>a-b);
  let remaining = dt;
  let first = true;
  const continuous = { ...input, fire: false, flashlight: false, interact: false, lookDelta: 0,stab:false,stabTimes:[] };
  while (remaining > 1e-9 && game.mode === 'playing') {
    const substep = Math.min(remaining, 1 / 60);
    tick(game, substep, first ? input : continuous);
    remaining -= substep;
    first = false;
  }
}

/** Serializable diagnostic projection. Returned arrays and objects cannot mutate the run. */
export function gameSnapshot(game) {
  const player = game.player;
  const enemy = game.enemy;
  const playerPosition = actorPosition(game, 'player');
  const enemyPosition = actorPosition(game, 'enemy');
  return JSON.parse(JSON.stringify({
    coordinates: 'meters; +x east, +z south; yaw 0 looks north (-z)',
    mode: game.mode,
    interaction:game.interaction,skyRedUntil:game.skyRedUntil,
    elapsed: +game.elapsed.toFixed(2),
    player: {
      ...player,
      x: +player.x.toFixed(3),
      z: +player.z.toFixed(3),
      yaw: +player.yaw.toFixed(3),
      cell: cellOf(player),
      presentationPosition: playerPosition,
    },
    doorOpen: game.doorOpen,
    cornDoors:game.cornDoors.flatMap((s,i)=>s.amount>0||distance(player,game.maze.cornDoors[i])<2?[{id:game.maze.cornDoors[i].id,...s}]:[]),
    cornDoorCount:game.cornDoors.length,doorRevision:game.doorRevision,
    canInteract: !!interactionPrompt(game),
    interactionPrompt: interactionPrompt(game),
    objective: game.objective,
    chapter: game.chapter,
    caption: game.caption,
    beats: game.beats,
    landmarks: game.landmarks,
    centerReached: game.centerReached,
    gateClosed: false,
    progress: game.progress,
    threat: game.threat,
    metrics: game.metrics,
    enemy: {
      ...enemy,
      x: +enemy.x.toFixed(3),
      z: +enemy.z.toFixed(3),
      distance: +distance(enemyPosition, playerPosition).toFixed(2),
      lineOfSight: lineOfSight(game.maze, player, enemy, blocksFor(game)),
      presentationPosition: enemyPosition,
    },
    daughter: game.maze.daughter,
    exit: null,
  }));
}
