import { lineOfSight } from './maze.js';
import { GAME_CONFIG as C, distance, addEvidence, emitEvent } from './game-config.js';
import { actorPosition, localIngressVisible } from './hiding.js';
import { transition } from './enemy-state.js';
import {beginTackle,interactionLocked} from './grapple.js';

/** Deterministic aim capsule; animated bones never decide whether a shot lands. */
export function shotHits(game, blocks) {
  const player = game.player;
  const enemy = game.enemy;
  const from = actorPosition(game, 'player');
  const to = actorPosition(game, 'enemy');
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  if (!enemy.visible || distance(from, to) > C.gun.maxRange) return false;
  const projection = dx * -Math.sin(player.yaw) + dz * -Math.cos(player.yaw);
  const lateral = Math.abs(dx * Math.cos(player.yaw) - dz * Math.sin(player.yaw));
  const height = C.player.eyeHeight + Math.tan(player.pitch) * projection;
  const low=['chase','rage_chase','corn_rush','tackle'].includes(enemy.state);
  const curled=['staggered','post_qte_recovery'].includes(enemy.state);
  const targetHeight=curled?.5:low?.8:C.gun.targetHeight;
  const targetHalfHeight=curled?.48:low?.65:C.gun.targetHalfHeight;
  if (projection < 0 || lateral > C.gun.hitRadius ||
      Math.abs(height - targetHeight) > targetHalfHeight) return false;
  return localIngressVisible(game) || (!player.hidden && lineOfSight(game.maze, from, to, blocks));
}

export function fireGun(game, blocks) {
  const player = game.player;
  if(interactionLocked(game))return false;
  if (player.shotCooldown > 0) return false;
  if (player.ammo <= 0) {
    emitEvent(game, 'empty');
    player.shotCooldown = .2;
    return false;
  }
  player.ammo--;
  player.shotCooldown = C.player.shotCooldown;
  player.muzzleFlash = C.gun.muzzleFlashSeconds;
  game.metrics.shotsFired++;
  addEvidence(game, 'gunshot', actorPosition(game, 'player'), C.hearing.gunshotRadius, 4,
    player.hidden ? { anchorId: player.hideAnchorId } : {});
  emitEvent(game, 'shot', '', actorPosition(game, 'player'));
  if (!shotHits(game, blocks)) return false;

  if(!['staggered','post_qte_recovery'].includes(game.enemy.state))transition(game, 'staggered', 'shot_hit',
    C.zombie.staggerSecondsByTier[game.progress.escalationTier]);
  else emitEvent(game,'hit','',actorPosition(game,'enemy'));
  game.metrics.shotsHit++;
  return true;
}

export function attackPlayer(game, blocks) {
  const player = game.player;
  const enemy = game.enemy;
  if (game.interaction||game.grace > 0 || player.damageCooldown > 0 || enemy.attackCooldown > 0 ||
      !['chase', 'rage_chase', 'corn_rush'].includes(enemy.state)) return false;
  const from = actorPosition(game, 'enemy');
  const to = actorPosition(game, 'player');
  if (distance(from, to) > C.zombie.attackRange){enemy.contactSince=null;return false;}
  if(!localIngressVisible(game)&&!lineOfSight(game.maze,from,to,blocks))return false;

  enemy.contactSince??=game.elapsed;
  if(game.elapsed-enemy.contactSince<.22)return false;
  enemy.contactSince=null;
  return beginTackle(game,blocks);
}
