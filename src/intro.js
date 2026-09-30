// Presentation only. No game state, browser API, audio scheduling or global RNG.
export const INTRO_ENABLED = true;
export const INTRO = Object.freeze({
  duration: 20, seed: 33929,
  roles: 'GAME DIRECTION • DEVELOPMENT • BUILD • GAMEPLAY • CINEMATIC IMPLEMENTATION',
  title: 'CORNFIELDS',
  cues: Object.freeze([
    ['studio_swell', 2.85], ['studio_tear', 5.8], ['cry', 7],
    ['story_tear', 11.8], ['creator_pulse', 12], ['title_rise', 16],
    ['title_dip', 17.55], ['title_sting', 17.8],
  ]),
});
const clamp = value => Math.max(0, Math.min(1, value));
const smooth = value => { const x = clamp(value); return x * x * (3 - 2 * x); };
const hold = (t, start, end, fade = .2) => smooth((t - start) / fade) * smooth((end - t) / fade);

export function introFrame(seconds, {reduced = false, seed = INTRO.seed, ready = false} = {}) {
  const t = Number.isFinite(seconds) ? Math.max(0, Math.min(20, seconds)) : 0;
  let shot = 'cold_open', label = '', name = '', opacity = 0;
  if (t >= 3 && t < 6) { shot = 'studio'; label = 'CREATED BY'; name = 'OPENGAMES'; opacity = hold(t, 3, 5.9); }
  else if (t >= 6 && t < 9) shot = 'watching_eyes';
  else if (t >= 9 && t < 12) { shot = 'story'; label = 'STORY BY'; name = 'JACOB NANGLE'; opacity = hold(t, 9, 11.9); }
  else if (t >= 12 && t < 16) { shot = 'creator'; label = INTRO.roles; name = 'OSCAR SANCHEZ'; opacity = hold(t, 12, 16); }
  else if (t >= 16 || ready) { shot = 'title'; name = INTRO.title; opacity = ready ? 1 : smooth((t - 17.8) / .2); }
  const accent = reduced || ready ? 0 : Math.max(...[5.8, 11.8, 17.8].map(start =>
    t >= start && t <= start + .2 ? Math.sin(Math.PI * (t - start) / .2) : 0));
  return {
    time: t, shot, label, name, opacity, accent, reduced, ready,
    breathing: reduced || ready ? 0 : Math.sin(t * .6 + seed * .001) * .002,
    tunnel: reduced || ready ? 0 : hold(t, 16, 18.5, .5),
    eyes: ready ? .18 : hold(t, 6.15, 8.7, .5) + hold(t, 16.4, 20.5, .6),
    red: ready ? 1 : smooth((t - 17.8) / .2),
    retreat: smooth((t - 7.5) / 1.2),
  };
}

export function createIntro({enabled = INTRO_ENABLED, onCue = () => {}} = {}) {
  let phase = enabled ? 'preflight' : 'finished', time = 0, replay = false, disposed = false;
  const fired = new Set(), dropped = new Set();
  return {
    get phase() { return phase; },
    get active() { return phase !== 'finished'; },
    get replaying() { return replay; },
    begin({replay: isReplay = false} = {}) {
      if (disposed || (!isReplay && phase !== 'preflight') || phase === 'playing') return false;
      time = 0; replay = isReplay; fired.clear(); dropped.clear(); phase = 'playing'; return true;
    },
    tick(dt) {
      if (disposed || phase !== 'playing' || !Number.isFinite(dt) || dt <= 0) return;
      const previous = time; time = Math.min(INTRO.duration, time + dt);
      for (const [id, at] of INTRO.cues) if (previous < at && time >= at && !fired.has(id)) {
        fired.add(id);
        if (time - at > .2 + 1e-9) dropped.add(id);
        else onCue(id);
      }
      if (time >= INTRO.duration) phase = 'ready';
    },
    pause() { if (phase === 'playing') phase = 'paused'; },
    resume() { if (!disposed && phase === 'paused') phase = 'playing'; },
    skip() { if (!disposed && phase !== 'finished') { time = INTRO.duration; phase = 'ready'; } },
    finish() { phase = 'finished'; },
    frame(reduced = false) { return introFrame(time, {reduced, ready: phase === 'ready'}); },
    snapshot() { return {phase, time, replay, fired: [...fired], dropped: [...dropped]}; },
    dispose() { disposed = true; phase = 'finished'; fired.clear(); dropped.clear(); },
  };
}
