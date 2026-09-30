import {pathTo} from './maze.js';
import {
  createGame, startGame, pauseGame, resumeGame,
  updateGame, gameSnapshot, blocksFor,
} from './game.js';
import {createStepper} from './runtime-loop.js';
import {createInput} from './input.js';
import {createTouchInput} from './touch-input.js';
import {createUI} from './ui.js';

/**
 * Owns one game session and its browser lifecycle.
 * Scene/audio are supplied by the entrypoint; tests use small adapters.
 * Importing this module has no browser or WebGL side effects.
 */
export function createGameApp({
  maze, view, audio, document, window,
  debug = false,
  reducedMotion = false,
  touch = false,
  now = () => performance.now(),
  requestFrame = callback => window.requestAnimationFrame(callback),
  cancelFrame = id => window.cancelAnimationFrame(id),
}) {
  const canvas = document.getElementById('scene');
  const ui = createUI(document, {debug, reducedMotion, touch});
  const listeners = [];
  let game = createGame(maze);
  let previousMode = game.mode;
  let last = now();
  let frameId = null;
  let disposed = false;
  let manual = false;
  let pointerError = null;
  let audioTicks = 0;
  let entryAttempt = 0;

  const input = (touch ? createTouchInput : createInput)({
    document,
    canvas,
    isPlaying: () => game.mode === 'playing',
    isQte:()=>game.interaction?.phase==='qte',
    inputTime:stamp=>manual?game.elapsed:game.elapsed+clock.pendingSeconds+Math.max(0,Math.min(.25,((Number.isFinite(stamp)&&stamp<1e12?stamp:now())-last)/1000)),
    onPause: pause,
    onMute() {
      game.caption = audio.toggleMute() ? 'Sound muted.' : 'Sound on.';
      game.captionTime = 2;
    },
  });
  const clock = createStepper((dt, controls) => {
    const previousPhase=game.interaction?.phase;
    updateGame(game, dt, controls);
    if(previousPhase!==game.interaction?.phase){input.clearEdges();game.pendingStabs.length=0;}
    for (const event of game.events.splice(0)) {
      audio.event(event, game);
      view.event?.(event);
    }
    audio.update(game, dt);
    audioTicks++;
    // Present the newly enabled action before consuming any more catch-up time.
    return previousPhase!=='qte'&&game.interaction?.phase==='qte';
  });

  function listen(target, type, handler) {
    target.addEventListener(type, handler);
    listeners.push(() => target.removeEventListener(type, handler));
  }

  function syncMode() {
    if (previousMode === game.mode) return;
    // Releasing capture can synchronously dispatch another lifecycle event.
    previousMode = game.mode;
    input.clear();
    clock.reset();
    if (game.mode !== 'playing' && document.pointerLockElement === canvas) {
      document.exitPointerLock();
    }
    if (game.mode === 'paused') audio.pause();
    ui.focusMode(game.mode);
  }

  function present(time = game.elapsed) {
    syncMode();
    ui.render(game);
    view.render(game, time, reducedMotion);
  }

  function pause() {
    input.clear();
    pauseGame(game);
    clock.reset();
    present();
  }

  async function enter(reset = false) {
    if (disposed) return;
    if (touch && window.innerHeight > window.innerWidth) return;
    const attempt = ++entryAttempt;
    if (reset) {
      game = createGame(maze);
      audio.reset();
      view.reset?.();
      ui.reset();
      manual = false;
    }
    if (game.mode === 'menu') startGame(game);
    else resumeGame(game);
    input.clear();
    clock.reset();
    last = now();
    pointerError = null;
    const failed = error => {
      if (disposed || attempt !== entryAttempt) return;
      pointerError = error?.message || 'Mouse capture was denied. Click Continue to retry.';
      pause();
    };
    // Request capture inside the click, before awaiting audio unlock.
    try {
      if (!touch) {
        const lock = canvas.requestPointerLock();
        if (lock?.catch) lock.catch(failed);
      }
    } catch (error) {
      failed(error);
    }
    try {
      await audio.unlock();
    } catch {
      if (!disposed && attempt === entryAttempt) {
        game.caption = 'Sound could not start. You can continue muted.';
        game.captionTime = 4;
      }
    }
    if (disposed || game.mode !== 'playing') audio.pause();
    if (!disposed && attempt === entryAttempt) present();
  }

  function frame(time) {
    if (disposed) return;
    const dt = (time - last) / 1000;
    last = time;
    if (!manual) clock.frame(dt, step => input.read(game.player,game.elapsed+step));
    present(game.elapsed + (game.mode === 'menu' ? time / 1000 : 0));
    frameId = requestFrame(frame);
  }

  listen(ui.node('start-btn'), 'click', () => void enter());
  listen(ui.node('resume-btn'), 'click', () => void enter());
  listen(ui.node('retry-btn'), 'click', () => void enter(true));
  listen(ui.node('restart-btn'), 'click', () => void enter(true));
  listen(ui.node('volume'), 'input', event => audio.setVolume(Number(event.target.value) / 100));
  listen(ui.node('motion'), 'change', event => {
    reducedMotion = event.target.checked;
    ui.setReducedMotion(reducedMotion);
  });
  ui.node('fullscreen-btn').hidden = typeof ui.node('game').requestFullscreen !== 'function';
  listen(ui.node('fullscreen-btn'), 'click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen?.();
      else await ui.node('game').requestFullscreen?.();
    } catch { /* Fullscreen is optional, including on mobile browsers. */ }
  });
  listen(document, 'pointerlockchange', () => {
    if (touch) return;
    if (document.pointerLockElement !== canvas && game.mode === 'playing') pause();
  });
  listen(document, 'pointerlockerror', () => {
    if (touch) return;
    // A delayed error from an older request must not cancel a newer capture.
    if (document.pointerLockElement === canvas) return;
    pointerError ||= 'Mouse capture denied';
    pause();
  });
  listen(window, 'blur', pause);
  if (touch) {
    const viewportChanged = () => {
      input.clear();
      const portrait = window.innerHeight > window.innerWidth;
      ui.node('rotate').hidden = !portrait;
      if (portrait) pause();
    };
    listen(window, 'resize', viewportChanged);
    listen(window, 'orientationchange', pause);
    viewportChanged();
  }
  listen(document, 'visibilitychange', () => {
    if (document.hidden) pause();
  });
  listen(canvas, 'webglcontextlost', event => {
    event.preventDefault();
    pause();
    ui.showError('Graphics were interrupted. Reload to restart the field.');
  });

  ui.node('loading').textContent = 'FIND YOUR DAUGHTER · 2 ROUNDS · NO SAVES';
  ui.node('start-btn').disabled = false;
  present();

  return {
    enter,
    pause,
    restart: () => enter(true),
    startLoop() {
      if (frameId === null && !disposed) frameId = requestFrame(frame);
    },
    snapshot: () => gameSnapshot(game),
    route: () => pathTo(maze, game.player, maze.center, blocksFor(game)),
    diagnostics: () => ({
      ...gameSnapshot(game),
      audioState: audio.ctx?.state || 'uninitialized',
      audioSamples:Object.keys(audio.samples||{}),
      audioSources:audio.transients?.size||0,
      creature:view.creatureDiagnostics?.(),
      audioTicks,
      muted: audio.muted,
      reducedMotion,
      controlMode: touch ? 'touch' : 'mouse',
      pointerLocked: document.pointerLockElement === canvas,
      pointerError,
      documentFocused: document.hasFocus(),
      visibility: document.visibilityState,
      droppedSeconds: clock.droppedSeconds,
      drawCalls: view.renderer.info.render.calls,
      triangles: view.renderer.info.render.triangles,
      visuals: view.visuals,
    }),
    advance(milliseconds) {
      manual = true;
      clock.advance(milliseconds / 1000, step => input.read(game.player,game.elapsed+step));
      present();
    },
    step(seconds, controls = {}) {
      manual = true;
      let first = true;
      clock.advance(seconds, () => {
        const value = {...controls};
        if (!first) Object.assign(value, {
          fire: false, flashlight: false, interact: false, lookDelta: 0,stab:false,stabTimes:[],
        });
        first = false;
        return value;
      });
      present();
      return gameSnapshot(game);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      entryAttempt++;
      if (frameId !== null) cancelFrame(frameId);
      input.dispose();
      for (const remove of listeners) remove();
      if (document.pointerLockElement === canvas) document.exitPointerLock();
      audio.pause();
    },
  };
}
