import { lineOfSight, canOccupy } from './maze.js';
import { GAME_CONFIG as C, distance, addEvidence, emitEvent } from './game-config.js';

export function hideAnchor(game, id = game.player.hideAnchorId) {
  return game.maze.hideAnchors.find(anchor => anchor.id === id);
}

/**
 * Corridor x/z remain authoritative for navigation. Hidden presentation and
 * combat use the one local ingress segment, never a second traversable map.
 * @param {object} game
 * @param {'player'|'enemy'} who
 * @returns {{x:number,z:number}}
 */
export function actorPosition(game, who) {
  if (who === 'player') {
    return game.player.hidden ? hideAnchor(game)?.pocket || game.player : game.player;
  }
  const enemy = game.enemy;
  const anchor = hideAnchor(game, enemy.rushAnchorId);
  return anchor && enemy.ingressDepth > 0 ? {
    x: anchor.x + anchor.cornSide.x * enemy.ingressDepth,
    z: anchor.z + anchor.cornSide.z * enemy.ingressDepth,
  } : enemy;
}

/** Physical vision query. Only the perception boundary and entry action call it. */
export function seesPlayer(game, blocks, ignoreHidden = false) {
  const enemy = game.enemy;
  const player = game.player;
  if (player.hidden && !ignoreHidden) return false;
  const d = distance(enemy, player);
  const wide = ['chase', 'rage_chase', 'corn_rush'].includes(enemy.state);
  const facing = d < .01 ? 1 :
    (-Math.sin(enemy.yaw) * (player.x - enemy.x) - Math.cos(enemy.yaw) * (player.z - enemy.z)) / d;
  return d < C.zombie.visionDistance &&
    facing > Math.cos(wide ? C.zombie.chaseHalfAngle : C.zombie.visionHalfAngle) &&
    lineOfSight(game.maze, enemy, player, blocks);
}

export function nearestHideAnchor(game, blocks = []) {
  if (!game.entered || game.player.hidden) return null;
  return game.maze.hideAnchors.find(anchor =>
    distance(anchor, game.player) < C.hiding.entryRadius &&
    lineOfSight(game.maze, game.player, anchor, blocks)) || null;
}

export function enterCorn(game, anchor, blocks) {
  const player = game.player;
  const sawEntry = seesPlayer(game, blocks);
  player.returnTransform = {
    x: player.x, z: player.z, yaw: player.yaw, pitch: player.pitch,
  };
  player.hidden = true;
  player.hideAnchorId = anchor.id;
  player.hideDepth = C.hiding.pocketDepth;
  player.hideDetected = false;
  player.yaw = anchor.entryYaw;
  player.pitch = 0;
  player.moving = false;
  player.sprinting = false;
  player.flashlightOn = false;
  game.metrics.hidesEntered++;
  emitEvent(game, 'hide', 'DO NOT MOVE. IT CAN HEAR YOU.', anchor.pocket);
  if (sawEntry) {
    addEvidence(game, 'seen_entry', anchor, Infinity, 5, { anchorId: anchor.id });
    game.metrics.hidesDetected++;
    player.hideDetected = true;
  }
}

export function leaveCorn(game, blocks) {
  const player = game.player;
  const anchor = hideAnchor(game);
  const returnTransform = player.returnTransform;
  if (!anchor || !returnTransform) return;
  const destination = canOccupy(game.maze, returnTransform.x, returnTransform.z, player.radius, blocks) ?
    returnTransform : anchor;
  player.x = destination.x;
  player.z = destination.z;
  player.yaw = returnTransform.yaw;
  player.pitch = returnTransform.pitch;
  player.hidden = false;
  player.hideAnchorId = null;
  player.hideDepth = 0;
  addEvidence(game, 'leave', anchor, C.hiding.exitHearingRadius, 3, { anchorId: anchor.id });
  emitEvent(game, 'leave', '', anchor);
  game.metrics.hidesSurvived++;
  player.returnTransform = null;
}

export function hiddenInput(game, input) {
  if (!game.player.hidden) return;
  const anchor = hideAnchor(game);
  const moving = input.movementIntent || input.forward || input.strafe;
  const closeExit = input.interact && distance(game.enemy, anchor) < C.hiding.exitHearingRadius;
  const looking = Math.abs(input.lookDelta || 0) > C.hiding.mouseMovementThresholdPixels;
  const noisy = moving || input.fire || input.flashlight || closeExit || looking;
  if (!noisy) return;

  addEvidence(game, 'rustle', anchor, C.hearing.rustleRadius, 5, { anchorId: anchor.id });
  // Evidence remains immediate; held input gets one audible cue per hiding episode.
  if (!game.player.hideDetected) {
    emitEvent(game, 'rustle', 'IT HEARD YOU.', anchor);
    game.metrics.hidesDetected++;
    game.player.hideDetected = true;
  }
}

export function localIngressVisible(game) {
  const anchor = hideAnchor(game);
  if (!game.player.hidden || !anchor) return false;
  return game.enemy.rushAnchorId === anchor.id && distance(game.enemy, anchor) < .8;
}
