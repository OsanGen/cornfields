import { GAME_CONFIG as C, distance, clamp, emitEvent } from './game-config.js';
import { lineOfSight } from './maze.js';
import { actorPosition, localIngressVisible } from './hiding.js';

/** The director may set pacing intent, never an exact hidden-player navigation target. */
export function updateDirector(game, dt) {
  const threat = game.threat;
  threat.quietWindow = Math.max(0, threat.quietWindow - dt);
  threat.escalationTier = game.progress.escalationTier;
  threat.directorIntent = threat.quietWindow > 0 ? 'withdraw' :
    game.progress.escalationTier === 2 ? 'intercept' :
    game.progress.escalationTier === 1 ? 'circle' : 'investigate';
  const pursuing = ['chase', 'rage_chase', 'corn_rush'].includes(game.enemy.state);
  threat.pressure = clamp(threat.pressure + (pursuing ? dt * .1 : -dt * .04), 0, 1);
}

export function updateFeedback(game, dt) {
  const threat = game.threat;
  const enemy = game.enemy;
  const player = game.player;
  const from = actorPosition(game, 'player');
  const to = actorPosition(game, 'enemy');
  const d = distance(from, to);
  threat.proximityTier = !enemy.visible ? 0 : d < 3 ? 4 : d < 6 ? 3 : d < 11 ? 2 : d < 20 ? 1 : 0;
  threat.intensity = clamp(threat.proximityTier / 4 + game.progress.escalationTier * .05, 0, 1);
  threat.activeMessageTime = Math.max(0, threat.activeMessageTime - dt);
  if (threat.activeMessageTime <= 0) threat.activeMessage = null;
  threat.messageTimes = (threat.messageTimes || []).filter(at => game.elapsed - at < 10);
  if (threat.quietWindow > 0 || threat.proximityTier < 2 || threat.messageTimes.length >= 2 ||
      game.elapsed - threat.lastMessageAt < C.feedback.messageMinimumGapSeconds) return;

  const dot = d < .01 ? 1 :
    (-Math.sin(player.yaw) * (to.x - from.x) - Math.cos(player.yaw) * (to.z - from.z)) / d;
  const clear = localIngressVisible(game) ||
    (!player.hidden && lineOfSight(game.maze, from, to, game.doorOpen ? [] : [game.maze.door]));
  const rear = dot < -.55 && clear;
  const message = d < 4 && rear ? "IT'S RIGHT BEHIND YOU" :
    enemy.perception.seen ? 'IT CAN SEE YOU' :
    d < 6 && rear ? 'DO NOT TURN AROUND' : d < 6 ? 'IT IS CLOSE' : 'SOMETHING IS CLOSE';
  threat.activeMessage = message;
  threat.activeMessageTime = C.feedback.normalFlashSeconds;
  threat.lastMessageAt = game.elapsed;
  threat.messageTimes.push(game.elapsed);
  emitEvent(game, 'threat', '', to, { message });
}
