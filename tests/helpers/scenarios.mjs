import { createMaze, centerOf } from '../../src/maze.js';
import { createGame, startGame, updateGame } from '../../src/game.js';
import { enterCorn } from '../../src/hiding.js';

export const STEP = 1 / 60;

/** A deterministic playable fixture. Only setup may place actors directly. */
export function playingScenario() {
  const game = createGame(createMaze());
  startGame(game);
  game.doorOpen = true;
  game.entered = true;
  game.player.flashlightOn = false;
  Object.assign(game.player, centerOf(3, 20));
  Object.assign(game.enemy, { ...centerOf(3, 18), yaw: Math.PI, visible: true });
  return game;
}

export function nearCornScenario() {
  const game = playingScenario();
  const anchor = game.maze.hideAnchors[0];
  Object.assign(game.player, { x: anchor.x, z: anchor.z });
  Object.assign(game.enemy, centerOf(29, 3));
  return game;
}

export function hiddenScenario() {
  const game = nearCornScenario();
  enterCorn(game, game.maze.hideAnchors[0], []);
  return game;
}

/** Advance the public simulation; one-shot inputs are consumed by updateGame. */
export function advance(game, seconds, input = {}) {
  updateGame(game, seconds, input);
  return game;
}

export function navigationState(game) {
  const { state, x, z, target, memory, rushAnchorId, ingressDepth } = game.enemy;
  return structuredClone({ state, x, z, target, memory, rushAnchorId, ingressDepth });
}
