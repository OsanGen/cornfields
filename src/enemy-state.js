import { emitEvent } from './game-config.js';
import { actorPosition } from './hiding.js';

/**
 * @typedef {'concealed_stalk'|'observe'|'investigate'|'predictive_search'|'chase'|
 * 'flashlight_recoil'|'rage_chase'|'staggered'|'corn_rush'|'disengage'} EnemyState
 */

/**
 * Enter one enemy state. Repeated ordinary observations do not restart it.
 * Rewards and new hits explicitly refresh an existing state's complete entry.
 * Navigation targets are caller-owned except stagger, which cancels navigation.
 * @param {object} game
 * @param {EnemyState} state
 * @param {string} reason
 * @param {number} timer
 * @param {{refresh?: boolean}} options
 * @returns {boolean} Whether state entry ran.
 */
export function transition(game, state, reason, timer = 0, { refresh = false } = {}) {
  const enemy = game.enemy;
  if (enemy.state === state && !refresh) return false;

  enemy.state = state;
  enemy.reason = reason;
  enemy.timer = timer;
  enemy.repath = 0;
  enemy.path = [];
  enemy.decision = 0;

  const position = actorPosition(game, 'enemy');
  if (state === 'staggered') {
    enemy.attackCooldown = 0;
    enemy.rageEscapeTimer = 0;
    enemy.flashlightExposure = 0;
    enemy.target = null;
    emitEvent(game, 'stagger', 'That bought you time. Move.', position);
  } else if (state === 'chase') {
    emitEvent(game, 'chase', 'It found you. Move.', position);
  } else if (state === 'rage_chase') {
    game.metrics.rageEpisodes++;
    emitEvent(game, 'rage', 'THE LIGHT MADE IT ANGRY.', position);
  } else if (state === 'flashlight_recoil') {
    emitEvent(game, 'recoil', 'It cannot stand the light.', position);
  } else if (state === 'corn_rush') {
    emitEvent(game, 'corn_rush', 'IT IS COMING INTO THE CORN.', position);
  }
  return true;
}
