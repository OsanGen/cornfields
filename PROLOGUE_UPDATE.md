# Fast interactive prologue playtest

Local implementation of `CORNFIELDS_FAST_INTERACTIVE_PROLOGUE_REFINEMENT.md`.
This document is not a public release receipt. The existing Three.js browser and
phone architecture, hunt, corridor progression and HIDE HERE transitions remain.

## Experience and controls

Mike is the passenger; Clarence drives. Mouse/touch look stays free throughout.
The dispatch report has a visible handheld radio. Clarence exits first; Mike
leaves only after E or the touch EXIT button. F/LIGHT works, then normal movement
follows Stanley and Clarence along a compact outdoor route. The gun stays visible
without firing, ammo loss, enemies, QTE or live-game time during the story.

Distance from the group triggers sentence-boundary dialogue holds and spaced
follow calls. Returning resumes the next sentence without replaying the account.
There is no automatic following, forced exit or teleport to meet a time budget.

- After WAL-05: a two-second corpse vision of the escorts, with live controls.
- After WAL-09: ten seconds in a walkable red room with a projector and an original
  ambiguous face. Outdoor actors freeze and Mike's exact outdoor pose is restored.
- After WAL-16: five seconds of liquid scenery, escorts, hands and gun. One large
  anonymous WE ARE ONE phrase occupies seconds one through four.
- Two-second final approach, then twelve seconds of crash, red sky, limp bodies,
  ascent, spatial dissolution and visible binary fragments before mist takes over.
- The unchanged twenty-second credits, followed immediately by gameplay. Mike's
  exact final question plays while the controls and hunt are already live.

Escape/Pause, focus loss, portrait rotation and audio interruptions freeze the
opening until Continue. J/SKIP STORY retains credits; K/SKIP OPENING enters the game
immediately. Retry bypasses it; replay preserves the existing paused hunt. The
look tutorial acknowledges actual input. Touch actions match the desktop gates.

## Lean assets and timing

No dependencies, downloads or runtime services were added. Existing licensed
hands/gun are cloned for isolated story rendering. The cruiser, escorts, room,
radio, projected face and binary effects are original procedural playtest art.
These are temporary character presentations, not final photorealistic acting.

Thirty-nine exact handoff cues use local natural-speed synthetic Piper audio.
Every line retains its R/A/N/U provenance in `src/prologue-script.js`. Attribution,
model hash, transformations and file hashes are in `assets/audio/prologue/`.
The older recordings remain in source for rollback but are excluded from the
runtime asset list. `PROLOGUE_AUDIO_LINES` includes main, follow and final lines.

Measured audio-driven authored runtime is 151.89 seconds of story plus twenty
seconds of credits and four seconds of final caption, about 2:56 total. A test
driver supplying ordinary movement completed in 175.95 seconds including END-01,
with no follow interruptions. This is simulation timing, not a measured first-time
human playthrough. Intentional idle, detours and pauses extend elapsed time.

## Verification

`npm run test:prologue` covers dialogue, timing, actual movement, tutorial input,
follow spacing, room restoration, pause, skip, replay, final-line lifecycle,
render ownership, liquid shaders and optional audio failure. The full suite also
protects gameplay and the recently fixed HIDE HERE entrance collision.

`npm run test:prologue:browser` exercises the packaged desktop and touch-emulated
flow, real mouse capture/audio decode, screenshots, mobile controls, reduced
effects, orientation pause, credits, QTE, replay and missing voices.

Current proof belongs in `output/interactive-prologue-2026-10-02/`. Human fear,
voice acting, first-time comprehension and physical phone performance remain
playtest judgments and are not established by automated assertions.

## Rollback

No dependency, saved-data or public API migration. `?intro=off` bypasses all opening
content; `?prologue=off` retains the old title-only path. The source baseline is
`4eee5c56b99df2b6aef9ec7f8c578cf027bb525c`. Preserve unrelated `.npmrc` and
`verification.json`. Publishing requires a separate explicit request.
