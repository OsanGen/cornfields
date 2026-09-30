const MOVE_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD',
  'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight',
]);

/**
 * Browser input adapter. Held movement survives each read; action edges do not.
 * movementIntent stays true when opposite keys cancel the movement vector.
 * @typedef {Object} PlayerInput
 * @property {number} forward
 * @property {number} strafe
 * @property {number} yaw
 * @property {number} pitch
 * @property {boolean} movementIntent
 * @property {boolean} fire
 * @property {boolean} flashlight
 * @property {boolean} interact
 * @property {number} lookDelta Raw mouse travel in pixels, independent of yaw.
 */
export function createInput({document, canvas, isPlaying, onPause, onMute}) {
  const keys = new Set();
  const listeners = [];
  const emptyEdges = () => ({
    fire: false, flashlight: false, interact: false,
    dx: 0, dy: 0, lookDelta: 0,
  });
  let pending = emptyEdges();

  function listen(target, type, handler) {
    target.addEventListener(type, handler);
    listeners.push(() => target.removeEventListener(type, handler));
  }

  listen(document, 'keydown', event => {
    if (event.code === 'Escape') {
      onPause();
      return;
    }
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target?.tagName)) return;
    if (event.code.startsWith('Arrow') || event.code === 'Space') event.preventDefault();
    if (event.repeat) return;
    if (event.code === 'KeyM') onMute();
    if (!isPlaying()) return;
    if (event.code === 'KeyE') pending.interact = true;
    if (event.code === 'KeyF') pending.flashlight = true;
    keys.add(event.code);
  });
  listen(document, 'keyup', event => keys.delete(event.code));
  listen(document, 'mousemove', event => {
    if (!isPlaying() || document.pointerLockElement !== canvas) return;
    pending.dx += event.movementX;
    pending.dy += event.movementY;
    pending.lookDelta += Math.hypot(event.movementX, event.movementY);
  });
  listen(canvas, 'mousedown', event => {
    if (event.button !== 0 || !isPlaying() || document.pointerLockElement !== canvas) return;
    pending.fire = true;
    event.preventDefault();
  });

  return {
    /** @returns {PlayerInput} */
    read(player) {
      const held = (first, second) => keys.has(first) || keys.has(second) ? 1 : 0;
      const input = {
        forward: held('KeyW', 'ArrowUp') - held('KeyS', 'ArrowDown'),
        strafe: held('KeyD', 'ArrowRight') - held('KeyA', 'ArrowLeft'),
        movementIntent: [...MOVE_KEYS].some(key => keys.has(key)),
        yaw: player.yaw - pending.dx * 0.002,
        pitch: Math.max(-1.25, Math.min(1.25, player.pitch - pending.dy * 0.002)),
        fire: pending.fire,
        flashlight: pending.flashlight,
        interact: pending.interact,
        lookDelta: pending.lookDelta,
      };
      pending = emptyEdges();
      return input;
    },
    clear() {
      keys.clear();
      pending = emptyEdges();
    },
    dispose() {
      this.clear();
      for (const remove of listeners) remove();
    },
  };
}
