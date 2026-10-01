# Cinematic prologue playtest

Local implementation of `CORNFIELDS_CINEMATIC_PROLOGUE_PLAYTEST.md`. This document
does not establish a public release. The implementation remains on the existing
Three.js/browser and phone architecture.

## Experience

Mike Hartmouth is the first-person passenger and Clarence drives. A rural cruiser
ride leads to a dispatch call, Stanley at the roadside, a guided walk, the real
maze threshold, the unlocatable crash and red mist. The men disappear under cover.
The existing OPENGAMES/Jacob Nangle/Oscar Sanchez/CORNFIELDS titles follow, then a
four-second empty return at the same spawn and automatic gameplay. Total: 350
seconds. Retry bypasses the opening; replay preserves the paused hunt.

Jacob Nangle's supplied dialogue is retained closely. Dispatch replaces the
telephone call; two marked bridge lines make 2002 and the parents' increased
protectiveness explicit. Mike is responding to Sadie's disappearance, so visible
objectives and hints name Sadie rather than calling her the player's daughter.

## Controls and lifecycle

- Begin Story activates mouse capture/audio in the initial desktop gesture.
- Escape or Pause stops the opening. Background, orientation and audio
  interruptions freeze its clock and require Continue.
- J / Skip Story keeps the titles. K / Skip Opening keeps only the short return.
- Reduced effects retain every line while removing subtitle fringe and camera sway.
- Gameplay, enemy AI, weather and the corridor-only three-minute clock remain
  frozen until the handoff. Held movement/fire/QTE inputs are quarantined.
- `?prologue=off` restores the previous title-only opening; `?intro=off` bypasses all.

## Assets and authoring

The cruiser, staged countryside and articulated cast are original procedural
playtest meshes. They are temporary artwork, not photorealistic human assets or
motion capture. Corn and the threshold world reuse existing licensed game assets.

All 36 utterances are temporary synthetic Piper performances, prepared offline
using a CC BY 4.0 LibriTTS-R model and compressed to 925,608 bytes total. No model,
speech service, external request or microphone is needed to play. Credits link
to `assets/audio/prologue/LICENSES.md`; `sources.json` records attribution, model
hash, speaker selection, transformations and per-file checksums.

To change dialogue, edit `src/prologue-script.js`. Export PROLOGUE_LINES to JSON,
then use `scripts/build-prologue-voices.py` with explicit model/config/script and
external scratch paths. The script uses the already-installed Piper/ONNX/ffmpeg
tooling, bounds CPU threads and does not install or download anything. Generated
durations retime subtitles and extend reserved slots only when necessary.
Runtime assets are enumerated from the stable line IDs in `scripts/build.mjs`.

## Verification and acceptance

`npm run test:prologue` covers story facts, subtitle completeness, timing, the
combined lifecycle, input/capture, scene restoration and audio ownership/failure.
`npm run test:prologue:browser` records desktop and touch-emulated scene captures,
actual Web Audio playback, pause/orientation, both skips, missing voices, replay,
resource release, immediate handoff and the existing QTE after entry.

Proof is under `output/prologue-2026-10-01/`. Browser automation establishes the
rendered flow, not human comprehension or physical iPhone/Android performance.
The remaining human playtest is whether a first-time viewer understands Mike,
Clarence, Sadie and Stanley, the field's rules, and the final isolation without
needing the brief. Natural acting and final character art remain polish work.

## Rollback

No runtime dependency or save schema changes. Use `?prologue=off` for the old title
path while diagnosing, or restore the recorded baseline source revision for a
full rollback. Keep unrelated `.npmrc` and `verification.json` untouched. Publishing
this local build is a separate action.
