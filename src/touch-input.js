/** Touch controls implement the same PlayerInput contract as keyboard/mouse. */
export function createTouchInput({document, isPlaying, onPause}) {
  const pointers = new Map();
  const listeners = [];
  const node = id => document.getElementById(id);
  const stick = node('move-stick'), knob = node('move-knob');
  let forward = 0, strafe = 0;
  const empty = () => ({fire: false, flashlight: false, interact: false, moved: false, dx: 0, dy: 0, lookDelta: 0});
  let pending = empty();

  function listen(target, type, fn) {
    target.addEventListener(type, fn);
    listeners.push(() => target.removeEventListener(type, fn));
  }
  function moveStick(event, owner) {
    const dx = event.clientX - owner.x, dy = event.clientY - owner.y;
    const length = Math.hypot(dx, dy), scale = Math.min(1, owner.radius / (length || 1));
    const x = dx * scale, y = dy * scale;
    const active = length > owner.radius * 0.18;
    pending.moved ||= active;
    strafe = active ? x / owner.radius : 0;
    forward = active ? -y / owner.radius : 0;
    knob.style.setProperty('--stick-x', x + 'px');
    knob.style.setProperty('--stick-y', y + 'px');
  }
  function centerStick() {
    forward = strafe = 0;
    knob.style.setProperty('--stick-x', '0px');
    knob.style.setProperty('--stick-y', '0px');
  }
  function release(id) {
    const owner = pointers.get(id);
    if (!owner) return;
    pointers.delete(id);
    if (owner.role === 'move') centerStick();
    if (owner.target.hasPointerCapture?.(id)) owner.target.releasePointerCapture(id);
  }
  function clear() {
    for (const id of [...pointers.keys()]) release(id);
    centerStick();
    pending = empty();
  }
  function bind(target, role) {
    listen(target, 'pointerdown', event => {
      if (!isPlaying() || (event.button !== undefined && event.button !== 0)) return;
      event.preventDefault();
      if ([...pointers.values()].some(owner => owner.role === role)) return;
      const owner = {role, target, x: event.clientX, y: event.clientY};
      if (role === 'move') {
        const rect = stick.getBoundingClientRect();
        Object.assign(owner, {x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, radius: rect.width * 0.34});
        moveStick(event, owner);
      }
      pointers.set(event.pointerId, owner);
      target.setPointerCapture?.(event.pointerId);
      if (role === 'pause') onPause();
      else if (['fire', 'interact', 'flashlight'].includes(role)) pending[role] = true;
    });
    listen(target, 'pointermove', event => {
      const owner = pointers.get(event.pointerId);
      if (!owner || !isPlaying()) return;
      event.preventDefault();
      if (owner.role === 'move') moveStick(event, owner);
      if (owner.role === 'look') {
        const dx = event.clientX - owner.x, dy = event.clientY - owner.y;
        pending.dx += dx; pending.dy += dy; pending.lookDelta += Math.hypot(dx, dy);
        owner.x = event.clientX; owner.y = event.clientY;
      }
    });
    listen(target, 'pointerup', event => release(event.pointerId));
    for (const type of ['pointercancel', 'lostpointercapture']) {
      listen(target, type, event => { if (pointers.has(event.pointerId)) clear(); });
    }
  }
  bind(stick, 'move');
  bind(node('look-zone'), 'look');
  for (const [id, role] of [['touch-fire', 'fire'], ['touch-interact', 'interact'], ['touch-light', 'flashlight'], ['touch-pause', 'pause']]) bind(node(id), role);

  return {
    read(player) {
      const value = {
        forward, strafe, movementIntent: pending.moved || Boolean(forward || strafe),
        yaw: player.yaw - pending.dx * 0.004,
        pitch: Math.max(-1.25, Math.min(1.25, player.pitch - pending.dy * 0.004)),
        fire: pending.fire, flashlight: pending.flashlight, interact: pending.interact,
        lookDelta: pending.lookDelta,
      };
      pending = empty();
      return value;
    },
    clear,
    dispose() { clear(); for (const remove of listeners) remove(); },
  };
}
