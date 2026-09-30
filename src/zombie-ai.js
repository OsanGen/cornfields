import { cellOf, centerOf, key, neighbors, pathTo, moveBody, lineOfSight } from './maze.js';
import { GAME_CONFIG as C, distance, emitEvent } from './game-config.js';
import { seesPlayer, actorPosition, hideAnchor } from './hiding.js';
import { transition } from './enemy-state.js';

export { transition };
const aggressive = new Set(['chase', 'rage_chase', 'corn_rush']);
const hiddenSounds = new Set(['seen_entry', 'rustle', 'gunshot']);
const point = ({ x, z }) => ({ x, z });

export function createEnemy() {
  return {
    ...centerOf(3, 26),
    radius: .24,
    yaw: Math.PI,
    state: 'concealed_stalk',
    visible: false,
    timer: 0,
    attackCooldown: 0,
    step: 0,
    path: [],
    target: null,
    repath: 0,
    decision: 0,
    lost: 0,
    flashlightExposure: 0,
    rageEscapeTimer: 0,
    ingressDepth: 0,
    rushAnchorId: null,
    reason: 'initial_patrol',
    rng: 7321,
    searchCells: [],
    searchVisited: 0,
    listenTimer: 0,
    perception: { seen: false, heard: false, beam: false },
    memory: {
      lastSeen: null,
      lastSeenAt: -1,
      lastHeard: null,
      lastHeardAt: -1,
      lastKnownHeading: null,
      lastKnown: null,
      lastObservation: null,
      anchorId: null,
      recentPlayerRoute: [],
      searchedCells: [],
      knownCheckpointIndex: 0,
    },
  };
}

function random(enemy) {
  enemy.rng = (Math.imul(enemy.rng, 1664525) + 1013904223) >>> 0;
  return enemy.rng / 4294967296;
}

function recordObservation(game, source, position, anchorId = null, at = game.elapsed) {
  const memory = game.enemy.memory;
  memory.lastKnown = point(position);
  memory.anchorId = anchorId;
  memory.lastObservation = {
    source,
    position: point(position),
    at,
    anchorId,
  };
}

/**
 * Perception is the only AI boundary allowed to inspect the live player.
 * Navigation receives observations, never a remote hiding-occupancy lookup.
 * escapeEligible is a fairness rule, not a target position.
 * @typedef {object} Perception
 * @property {boolean} seen
 * @property {object|null} heard The strongest newly audible event.
 * @property {boolean} beam
 * @property {boolean} observed Whether a new player observation was recorded.
 * @property {boolean} escapeEligible Physical range/occlusion rule for ending rage.
 * @property {{anchorId:string,occupied:boolean}|null} inspectedHide Local inspection only.
 */
export function senseZombie(game, blocks) {
  const enemy = game.enemy;
  const player = game.player;
  const memory = enemy.memory;
  const seen = seesPlayer(game, blocks);
  let heard = null;

  for (const event of game.evidence) {
    if (game.elapsed - event.at > 1 || distance(enemy, event.position) > event.radius) continue;
    if (!heard || event.priority >= heard.priority) heard = event;
  }
  game.evidence.length = 0;

  if (seen) {
    const previous = memory.lastSeen;
    memory.lastSeen = point(player);
    memory.lastSeenAt = game.elapsed;
    recordObservation(game, 'vision', player);
    if (previous && distance(previous, player) > .001) {
      const d = distance(previous, player);
      memory.lastKnownHeading = { x: (player.x - previous.x) / d, z: (player.z - previous.z) / d };
    }
    const cell = cellOf(player);
    const cellKey = key(cell.x, cell.z);
    if (memory.recentPlayerRoute.at(-1) !== cellKey) {
      memory.recentPlayerRoute.push(cellKey);
      if (memory.recentPlayerRoute.length > 12) memory.recentPlayerRoute.shift();
    }
  }

  if (heard) {
    memory.lastHeard = point(heard.position);
    memory.lastHeardAt = heard.at;
    const knownHide = hiddenSounds.has(heard.type) ? heard.anchorId || null : null;
    recordObservation(game, heard.type, heard.position, knownHide, heard.at);
  }

  const from = actorPosition(game, 'player');
  const to = actorPosition(game, 'enemy');
  const d = distance(from, to);
  const facing = d < .01 ? 1 :
    (-Math.sin(player.yaw) * (to.x - from.x) - Math.cos(player.yaw) * (to.z - from.z)) / d;
  const beam = player.flashlightOn && !player.hidden &&
    d < C.zombie.flashlightRange &&
    facing > Math.cos(C.zombie.flashlightCone) &&
    Math.abs(player.pitch) < .55 &&
    lineOfSight(game.maze, from, to, blocks);
  const noticed=!player.hidden&&d<16&&facing>.88&&Math.abs(player.pitch)<.65&&lineOfSight(game.maze,from,to,blocks);

  if (beam) {
    memory.lastBeam = point(player);
    memory.lastBeamAt = game.elapsed;
    recordObservation(game, 'beam', player);
  }
  if (seen || beam) {
    memory.viewObservation = {
      position: point(player), yaw: player.yaw, flashlightOn: player.flashlightOn, at: game.elapsed,
    };
  }

  const lastEvidenceAt = Math.max(memory.lastSeenAt, memory.lastHeardAt, memory.lastBeamAt ?? -1);
  if (memory.lastKnown && game.elapsed - lastEvidenceAt > C.zombie.memorySeconds && !aggressive.has(enemy.state)) {
    memory.lastKnown = null;
    memory.lastObservation = null;
    memory.anchorId = null;
  }
  if (memory.viewObservation && game.elapsed - memory.viewObservation.at > C.zombie.memorySeconds) {
    memory.viewObservation = null;
  }

  // Finding a pocket empty requires physically reaching its local inspection point.
  const anchor = hideAnchor(game, enemy.rushAnchorId);
  const canInspect = anchor && (anchor.walkable?distance(enemy,anchor.pocket)<.35:
    distance(enemy, anchor) < .12 && enemy.ingressDepth >= C.hiding.pocketDepth - .15);
  const inspectedHide = canInspect ? {
    anchorId: anchor.id,
    occupied: anchor.walkable?player.cornZoneId===anchor.id:player.hidden && player.hideAnchorId === anchor.id,
  } : null;
  const escapeEligible = distance(enemy, player) >= C.zombie.rageEscapeDistance &&
    !lineOfSight(game.maze, enemy, player, blocks);

  enemy.perception = {
    seen,
    heard: !!heard,
    heardType: heard?.type || null,
    beam,
    inspectedHide,
    certainty: seen ? 'visual' : beam ? 'beam' : heard ? 'sound' : memory.lastKnown ? 'memory' : 'uncertain',
  };
  return { seen, heard, beam, noticed, observed: seen || beam || !!heard, escapeEligible, inspectedHide };
}

function move(game, dt, target, speed, blocks) {
  const enemy = game.enemy;
  if (!target) return false;
  if(enemy.contactSince!=null&&aggressive.has(enemy.state))return false;
  enemy.repath -= dt;
  const targetCell = cellOf(target);
  const targetKey = key(targetCell.x, targetCell.z);
  if (enemy.repath <= 0 || enemy.pathGoal !== targetKey) {
    enemy.path = pathTo(game.maze, enemy, target, blocks).slice(1);
    enemy.pathGoal = targetKey;
    enemy.repath = C.zombie.repathSeconds;
  }

  let destination = enemy.path[0];
  if (!destination) {
    if (distance(enemy, target) < .12) return true;
    const currentCell = cellOf(enemy);
    if (currentCell.x !== targetCell.x || currentCell.z !== targetCell.z) return false;
    destination = target;
  }
  const d = distance(enemy, destination);
  if (d < .09) {
    enemy.path.shift();
    return false;
  }

  const dx = (destination.x - enemy.x) / d;
  const dz = (destination.z - enemy.z) / d;
  const step = Math.min(d, speed * dt);
  const before = point(enemy);
  enemy.yaw = Math.atan2(-dx, -dz);
  moveBody(game.maze, enemy, dx * step, dz * step, blocks);
  enemy.step += distance(enemy, before);
  return distance(enemy, target) < .2;
}

export function predictionCandidates(game, blocks) {
  const enemy = game.enemy;
  const origin = enemy.memory.lastKnown || enemy;
  const objective = game.maze.checkpoints[game.progress.checkpointIndex] || game.maze.daughter;
  const route = pathTo(game.maze, origin, objective, blocks);
  const candidates = [];
  const unique = new Set();
  const add = position => {
    const cell = cellOf(position);
    const cellKey = key(cell.x, cell.z);
    if (!unique.has(cellKey) && candidates.length < C.zombie.maxCandidates) {
      unique.add(cellKey);
      candidates.push(position);
    }
  };

  route.slice(1, 11).forEach((position, index) => {
    add(position);
    if (index % 2 === 0) {
      neighbors(game.maze, cellOf(position), blocks).forEach(cell => add(centerOf(cell.x, cell.z)));
    }
  });
  neighbors(game.maze, cellOf(origin), blocks).forEach(cell => add(centerOf(cell.x, cell.z)));
  if (!candidates.length) add(centerOf(cellOf(enemy).x, cellOf(enemy).z));
  return candidates;
}

/** A prediction changes the navigation target, never the last confirmed observation. */
export function choosePrediction(game, blocks) {
  const enemy = game.enemy;
  const memory = enemy.memory;
  const candidates = predictionCandidates(game, blocks);
  const origin = memory.lastKnown || enemy;
  const heading = memory.lastKnownHeading || { x: 0, z: 0 };
  const tier = game.progress.escalationTier;
  const view = memory.viewObservation && game.elapsed - memory.viewObservation.at <= C.zombie.memorySeconds ?
    memory.viewObservation : null;
  let best = null;
  let bestScore = -Infinity;

  for (let index = 0; index < candidates.length; index++) {
    const position = candidates[index];
    const d = distance(position, origin) || 1;
    const cell = cellOf(position);
    const cellKey = key(cell.x, cell.z);
    const intercept = game.threat.directorIntent === 'intercept';
    const circle = game.threat.directorIntent === 'circle';
    let score = (heading.x * (position.x - origin.x) + heading.z * (position.z - origin.z)) / d *
      (intercept ? 3 : 2) + (index < 10 ? 1 : 0) -
      (memory.searchedCells.includes(cellKey) ? 4 : 0) + random(enemy) * (tier === 0 ? 4 : 1.5);
    if (view) {
      const viewDistance = distance(position, view.position) || 1;
      const dot = (-Math.sin(view.yaw) * (position.x - view.position.x) -
        Math.cos(view.yaw) * (position.z - view.position.z)) / viewDistance;
      if (dot < .25) score += circle ? 2.2 : 1.4;
      if (view.flashlightOn && dot > Math.cos(C.zombie.flashlightCone) &&
          viewDistance < C.zombie.flashlightRange) score -= 2;
    }
    if (score > bestScore) {
      bestScore = score;
      best = position;
    }
  }
  enemy.target = point(best);
  enemy.reason = memory.lastKnownHeading ? 'heading_and_route' : 'route_branch';
  enemy.predictionCandidates = candidates.length;
  enemy.predictionViewAt = view?.at ?? null;
  game.metrics.predictions++;
  return best;
}

function beginSearch(game, blocks) {
  const enemy = game.enemy;
  const target = choosePrediction(game, blocks);
  enemy.searchCells = [
    target,
    ...neighbors(game.maze, cellOf(target), blocks).slice(0, 3).map(cell => centerOf(cell.x, cell.z)),
  ];
  enemy.searchVisited = 0;
  enemy.listenTimer = 0;
  transition(game, 'predictive_search', 'lost_evidence');
}

export function checkpointDisengage(game, blocks) {
  const enemy = game.enemy;
  enemy.rageEscapeTimer = 0;
  enemy.flashlightExposure = 0;
  enemy.rushAnchorId = null;
  enemy.ingressDepth = 0;
  enemy.memory.anchorId = null;
  enemy.memory.lastKnown = null;
  enemy.memory.lastObservation = null;
  // Checkpoint progress is public director information; no private player transform is needed.
  const checkpoint = game.maze.checkpoints[game.progress.checkpointIndex - 1] || enemy;
  const options = neighbors(game.maze, cellOf(enemy), blocks)
    .map(cell => centerOf(cell.x, cell.z))
    .sort((a, b) => distance(b, checkpoint) - distance(a, checkpoint));
  enemy.target = options[0] || point(enemy);
  transition(game, 'disengage', 'checkpoint_grace', 3, { refresh: true });
}

function resumeAfterStagger(game) {
  const enemy = game.enemy;
  emitEvent(game, 'recover', '', actorPosition(game, 'enemy'));
  const knownAnchor = enemy.memory.anchorId && hideAnchor(game, enemy.memory.anchorId);
  if (knownAnchor) {
    enemy.rushAnchorId = knownAnchor.id;
    enemy.target = point(knownAnchor);
    transition(game, 'corn_rush', 'known_hide_after_stagger');
  } else {
    transition(game, 'investigate', 'stagger_recovered');
    enemy.target = enemy.memory.lastKnown;
  }
}

function updateCornRush(game, dt, blocks, sensed) {
  const enemy = game.enemy;
  const anchor = hideAnchor(game, enemy.rushAnchorId);
  const heardExit = sensed.heard?.type === 'leave' && sensed.heard.anchorId === enemy.rushAnchorId;
  const inspectedEmpty = sensed.inspectedHide?.anchorId === enemy.rushAnchorId &&
    !sensed.inspectedHide.occupied;
  if (!anchor || sensed.seen || heardExit || inspectedEmpty) {
    if (inspectedEmpty) enemy.memory.anchorId = null;
    transition(game, sensed.seen ? 'chase' : 'investigate',
      sensed.seen ? 'visual_contact' : inspectedEmpty ? 'hide_searched_empty' : 'observed_corn_exit');
    enemy.target = sensed.seen ? enemy.memory.lastSeen : anchor ? point(anchor) : enemy.memory.lastKnown;
    return;
  }
  if(enemy.contactSince!=null)return;
  if(anchor.walkable){
    move(game,dt,anchor.pocket,C.zombie.cornRushSpeedByTier[game.progress.escalationTier],blocks);
  }else if (distance(enemy, anchor) > .12) {
    move(game, dt, anchor, C.zombie.cornRushSpeedByTier[game.progress.escalationTier], blocks);
  } else {
    enemy.ingressDepth = Math.min(C.hiding.pocketDepth,
      enemy.ingressDepth + C.zombie.cornRushSpeedByTier[game.progress.escalationTier] * dt);
    enemy.yaw = Math.atan2(-anchor.cornSide.x, -anchor.cornSide.z);
  }
}

/** State arbitration uses the perception packet and memory. No live hidden-state branching. */
export function updateZombie(game, dt, blocks) {
  const enemy = game.enemy;
  if (!game.entered) {
    game.evidence.length = 0;
    return;
  }
  enemy.visible = true;
  const sensed = senseZombie(game, blocks);
  const memory = enemy.memory;
  const tier = game.progress.escalationTier;
  enemy.timer = Math.max(0, enemy.timer - dt);
  enemy.attackCooldown = Math.max(0, enemy.attackCooldown - dt);
  enemy.decision = Math.max(0, enemy.decision - dt);
  if(game.interaction||enemy.state==='post_qte_recovery')return;

  if (enemy.state === 'staggered') {
    if (enemy.timer <= 0) resumeAfterStagger(game);
    return;
  }
  if (enemy.state === 'disengage') {
    move(game, dt, enemy.target, C.zombie.investigateSpeed, blocks);
    if (enemy.timer <= 0) {
      if (enemy.reason === 'false_withdrawal' && memory.lastKnown) beginSearch(game, blocks);
      else {
        transition(game, 'concealed_stalk', 'quiet_window_over');
        enemy.target = null;
      }
    }
    return;
  }

  if (sensed.heard?.anchorId && hiddenSounds.has(sensed.heard.type)) {
    enemy.rushAnchorId = sensed.heard.anchorId;
    transition(game, 'corn_rush', 'detected_hide');
  }
  if (enemy.state === 'corn_rush') {
    updateCornRush(game, dt, blocks, sensed);
    return;
  }
  if (enemy.ingressDepth > 0) {
    enemy.ingressDepth = Math.max(0, enemy.ingressDepth - C.zombie.investigateSpeed * dt);
    if (enemy.ingressDepth === 0) enemy.rushAnchorId = null;
    return;
  }

  enemy.flashlightExposure = sensed.beam ? enemy.flashlightExposure + dt : 0;
  if (!['rage_chase', 'flashlight_recoil'].includes(enemy.state) &&
      enemy.flashlightExposure >= C.zombie.flashlightConfirmSeconds) {
    transition(game, 'flashlight_recoil', 'beam_confirmed', C.zombie.flashlightRecoilSeconds);
    return;
  }
  if (enemy.state === 'flashlight_recoil') {
    if (enemy.timer <= 0) {
      transition(game, 'rage_chase', 'recoil_complete');
      enemy.target = memory.lastKnown;
    }
    return;
  }
  if(enemy.state==='detection_tell'){
    if(enemy.timer<=0){transition(game,'chase','discovery_complete');enemy.target=memory.lastSeen;}
    return;
  }
  if(enemy.state==='noticed_retreat'){
    if(move(game,dt,enemy.target,C.zombie.chaseSpeedByTier[tier],blocks)||enemy.timer<=0)
      transition(game,'observe','retreated',1.1);
    return;
  }
  if (enemy.state === 'rage_chase') {
    enemy.rageEscapeTimer = sensed.escapeEligible ? enemy.rageEscapeTimer + dt : 0;
    if (enemy.rageEscapeTimer >= C.zombie.rageEscapeHoldSeconds) {
      transition(game, 'disengage', 'rage_escape', 2);
      enemy.target = memory.lastKnown;
      game.metrics.rageEscapes++;
      return;
    }
    if (sensed.observed || !enemy.target) enemy.target = memory.lastKnown;
    const reached = move(game, dt, enemy.target, C.zombie.rageSpeedByTier[tier], blocks);
    if (reached && !sensed.seen && enemy.decision <= 0) {
      choosePrediction(game, blocks);
      enemy.decision = C.zombie.decisionSeconds;
    }
    return;
  }

  if(sensed.noticed&&!sensed.beam&&!aggressive.has(enemy.state)){
    const retreat=(game.maze.landingZones||[]).filter(a=>distance(a,enemy)<4&&
      !lineOfSight(game.maze,game.player,a.pocket,blocks)&&pathTo(game.maze,enemy,a.pocket,blocks).length>0)
      .sort((a,b)=>distance(b.pocket,game.player)-distance(a.pocket,game.player))[0];
    if(retreat){transition(game,'noticed_retreat','noticed',2);enemy.target=point(retreat.pocket);emitEvent(game,'retreat','',enemy);return;}
  }
  if (sensed.seen) {
    if(!aggressive.has(enemy.state)){
      transition(game,'detection_tell','confirmed_discovery',.25);enemy.target=point(memory.lastSeen);
      emitEvent(game,'detection','',enemy);return;
    }
    transition(game, 'chase', 'visual_contact');
    enemy.target = point(memory.lastSeen);
    enemy.lost = 0;
  } else if (enemy.state === 'chase') {
    enemy.lost += dt;
    if (enemy.lost > C.zombie.lostSightSeconds) beginSearch(game, blocks);
  } else if (sensed.heard) {
    transition(game, 'investigate', 'heard_' + sensed.heard.type);
    enemy.target = point(sensed.heard.position);
  }

  if (enemy.state === 'chase') {
    move(game, dt, enemy.target, C.zombie.chaseSpeedByTier[tier], blocks);
    return;
  }
  if (enemy.state === 'investigate') {
    if (!enemy.target) enemy.target = memory.lastKnown;
    if (!enemy.target || move(game, dt, enemy.target, C.zombie.investigateSpeed, blocks)) {
      beginSearch(game, blocks);
    }
    return;
  }
  if (enemy.state === 'predictive_search') {
    const target = enemy.searchCells[0];
    if (!target) {
      if (tier >= 1 && !enemy.falseWithdrawalDone && memory.lastKnown) {
        enemy.falseWithdrawalDone = true;
        const away = neighbors(game.maze, cellOf(enemy), blocks)
          .map(cell => centerOf(cell.x, cell.z))
          .sort((a, b) => distance(b, memory.lastKnown) - distance(a, memory.lastKnown));
        enemy.target = away[0] || point(enemy);
        transition(game, 'disengage', 'false_withdrawal', 1.3);
      } else transition(game, 'observe', 'search_exhausted', 1.2);
      return;
    }
    if (move(game, dt, target, C.zombie.investigateSpeed, blocks)) {
      enemy.listenTimer += dt;
      enemy.yaw += dt * 1.8;
      if (enemy.listenTimer > .35) {
        const cell = cellOf(target);
        memory.searchedCells.push(key(cell.x, cell.z));
        if (memory.searchedCells.length > 16) memory.searchedCells.shift();
        enemy.searchCells.shift();
        enemy.searchVisited++;
        game.metrics.searchCellsVisited++;
        enemy.listenTimer = 0;
      }
    }
    return;
  }
  if (enemy.state === 'observe') {
    enemy.yaw += dt * .55;
    if (enemy.timer <= 0) {
      transition(game, 'concealed_stalk', 'search_abandoned');
      enemy.target = null;
    }
    return;
  }
  if (enemy.state === 'concealed_stalk') {
    if (!enemy.target && enemy.decision <= 0) {
      choosePrediction(game, blocks);
      enemy.decision = C.zombie.decisionSeconds;
    }
    if (move(game, dt, enemy.target, C.zombie.stalkSpeed, blocks)) {
      enemy.target = null;
      transition(game, 'observe', 'listen', 1.1);
    }
  }
}
