# Updating Cornfield

The production corridor/field update is described in CORRIDOR_FIELD_UPDATE.md.
`corridor-layout.js` owns wide wooden paths and protected recycling;
`corridor-run.js` owns the hidden corridor-only clock, zone transitions, field
pressure and per-enemy dispatch; `corridor-view.js` owns their distinct views.
The original `corn-survival` modules below remain historical test fixtures.
Normal startup selects `createMaze({corridors:true})`.

The opening is a separate presentation controller in `opening.js`, driven by the existing `app.js` frame loop. It sequences `prologue.js` (326-second story), `intro.js` (existing 20-second titles), and a four-second return. Script and recording timing live in `prologue-script.js` and `prologue-voice-timing.js`. Gameplay, AI and weather ticks remain frozen until handoff. `prologue-visuals.js` owns the cruiser/approach/cast and borrows the renderer and corn geometry. Under a mist veil it transfers to the actual maze at the real spawn. Temporary scene membership, fog, sky tint and camera visibility are restored after every draw. `intro-visuals.js` retains the title scene/composer. Owned scene resources are released after entry. Core loading gates Begin.

`FieldAudio.prepare()` resumes the shared context without starting game loops. `prologue-audio.js` owns a separate bus, prerecorded dialogue, road/wind ambience and centered rupture effects. It sequentially fetches at most three upcoming utterances and retains at most four decoded buffers; pause cancels voices, resume seeks from the story clock, and release clears buffers. Speech failures preserve subtitles. `startGameplay()` activates game ambience once; legacy `unlock()` remains prepare plus startGameplay. The initial Begin gesture requests pointer lock before awaiting anything. Capture persists through the opening; only interruption requires Continue and recapture. The end automatically starts gameplay and quarantines held inputs.

`INTRO_ENABLED` and `?intro=off` restore direct entry. `?prologue=off` retains the old title-only behavior. `npm run test:prologue` and `npm run test:prologue:browser` cover the complete opening; title-only browser regression explicitly sets prologue=off. Existing gameplay browser suites bypass all opening scenes. Voice MP3s and notices are explicitly allowlisted; no CDN, TTS runtime or new package is required. See PROLOGUE_UPDATE.md for authoring and asset provenance.

This is a JavaScript/Three.js game with desktop and landscape touch input. It has one runtime dependency and a small static packaging step for hosting. Keep changes small and preserve the deterministic simulation.

## Where changes belong

| Change | Primary location | Verification |
| --- | --- | --- |
| Dedicated corn segment and hidden progression | src/corn-survival.js; src/game-config.js | tests/corn-survival.test.mjs |
| Pooled geometry and protected recycling | src/corn-layout.js; src/corn-survival-view.js | tests/corn-survival.test.mjs; tests/corn-survival-browser.mjs |
| Ammo, movement, damage, AI timing | src/game-config.js | npm run test:gameplay |
| Keyboard, mouse, action edges | src/input.js | npm run test:runtime |
| Touch pointer ownership, joystick, button edges | src/touch-input.js | npm run test:runtime; npm run test:mobile |
| Portable assets and static publication | scripts/build.mjs; scripts/preview-dist.mjs; .github/workflows/pages.yml | npm run test:build; project-path browser check |
| Start, pause, resume, restart, event dispatch | src/app.js | npm run test:runtime |
| HUD, menus, readable threat text | src/ui.js; index.html; src/style.css | Runtime tests and browser screenshots |
| Checkpoints, objectives, action ordering | src/game.js | Gameplay scenarios |
| Shooting, hits, damage | src/combat.js | Combat and timed recovery scenarios |
| Tackle, QTE, corn throws and recovery | src/grapple.js; src/maze.js | tests/grapple.test.mjs |
| Rigged creature presentation and eyes | src/zombie-poses.js; src/zombie.js | tests/zombie-poses.test.mjs; browser screenshots |
| Physical corn presence and rustling | src/hiding.js | tests/corn-world.test.mjs; information-boundary regressions |
| Shared corn topology, gates, collision and navigation | src/corn-world.js; src/corn-view.js | Gate coverage, component cycles, swept routes, checkpoint cuts |
| Hand asset and gradual dirt | src/hands.js; scripts/build-hands.py | Actual rendered asset, grip and progression review |
| Derived tremor, nightmare effects and session-only alias | src/horror-presentation.js; src/ui.js | tests/horror-presentation.test.mjs; browser screenshots |
| AI perception, memory, navigation | src/zombie-ai.js | Whole-AI regression scenarios |
| AI state initialization | src/enemy-state.js | Same-state refresh and combat regressions |
| Threat text and intensity | src/threat-director.js | Truthfulness and cooldown tests |
| Scene, gun, landmarks, foliage | src/scene.js; src/field-visuals.js | Browser screenshots and frame-time comparison |
| Mud, rain, puddles, ripple/splash limits, storm timing | src/weather.js; src/weather-view.js; src/field-visuals.js | tests/weather.test.mjs; tests/weather-browser.mjs |
| Sounds and spatial cues | src/audio.js, src/footsteps.js | Audio unit and browser checks |

`footsteps.js` caches twelve CC0 Fantozzi recordings (58,757 bytes) and the two existing splash clips once per audio context. Gameplay and cinematic voices have separate owners and buses, with ten active footstep layers maximum and an immediate synthesized fallback. Weather remains the sole gameplay contact owner when present; its existing collision-resolved distance counter emits one dry/wet contact. Audio does not change AI hearing or consume its random stream. Each nearby zombie has its own distance cursor and existing zone/visibility/distance gates.

`prologue-motion.js` supplies the cinematic's blocking, distance-driven gait and contact cursor to both visuals and audio. Retimed dialogue changes travel speed without breaking leg/sound alignment. Car exits have explicit contacts; seated, stationary and rupture scenes are silent. Pauses, replay, time jumps and the concealed location transfer rebase contact cursors. Cast steps use relative pan/distance and sit below dialogue. `tests/footsteps-browser.mjs` verifies real decoding/playback in desktop and touch browser contexts.
| Browser diagnostics | src/debug.js | Keep existing verification hooks compatible |

When balance changes affect instructions, also update the corresponding tutorial copy in index.html or ui.js.

## Runtime flow

main.js creates the maze, scene and audio, waits for presentation readiness, then creates the application. It contains startup wiring only.

input.js converts browser events into a PlayerInput. app.js advances the shared stepper, calls updateGame, drains game events into audio and scene, and presents the result through ui.js and scene.js. Both real frames and explicit test stepping use this path.

main.js uses control-mode.js to select touch input only for a real touchscreen with a coarse primary pointer. A fine primary pointer selects desktop input even on touch laptops. Public links ignore legacy controls=touch/mouse hints; explicit overrides require test=1 for verification. Viewport width never selects the controls. touch-input.js implements the same input contract. Each pointer owns one control until release; action buttons cannot contribute look evidence. Movement that crosses the joystick deadzone is retained until read even if the finger returns or lifts first. Cancellation and lifecycle transitions clear all pointer ownership and pending input. Only mouse mode requests or responds to pointer lock. Both modes unlock audio within the entry gesture.

CSS owns canvas display dimensions; renderer.setSize changes the backing buffer only. This prevents a landscape inline canvas width from expanding the phone viewport after rotation. Touch mode pauses on portrait orientation and requires explicit resume after returning to landscape.

build.mjs traverses the runtime import graph from main.js and copies an explicit asset allowlist into dist/. It copies only the required Three.js import closure and license, rewriting the import map to vendor/three/. Keep new assets in runtimeAssets; use module-relative new URL paths. Verify both root and project-prefix hosting when paths change. Publication is manual through the Pages workflow; see DEPLOYMENT.md.

The simulation never imports DOM, WebGL or Web Audio modules. The UI never advances the simulation. Tests import createGameApp directly with small browser/renderer/audio adapters; they do not rewrite source text.

Weather is presentation state created beside the scene in main.js. After each simulation tick, app.js captures the game-event batch once, updates weather from active game time, dispatches gameplay events, then sends weather events through the separate audio.weatherEvent boundary. Weather never uses the gameplay event-ID sequence or AI random stream. The shared distance trigger owns player footsteps when weather is connected, including dry footsteps with weather=off. Authoritative landing events produce separate splashes. No new hearing evidence, movement penalty or collision is introduced.

weather.js owns deterministic puddle footprints, a cell index, fixed ripple/drop pools and the lightning/thunder timer. weather-view.js reads that state into four render batches and uses two tiny generated textures. Reduced effects remove lightning and splash droplets and lower rain density. Pause freezes time, mute consumes pending thunder, and restart clears cues and pools. QTE, red sky and priority scare cues suppress lightning, stop active thunder and duck rain. The existing flat ground and mud maps remain the terrain; puddles simulate surface reactions, not fluid flow or depth.

## Contracts to preserve

- The production entrypoint enables the dedicated survival detour. `createMaze()`
  retains the inherited authored fixture for existing tests; use
  `createMaze({survival:true})` when testing the new play flow. Browser rollback is
  limited to `?test=1&survival=off` during local acceptance.
- Each survival run clones mutable walk, cover and owner arrays plus section
  state. Gate definitions and static topology remain immutable. A geometry revision
  invalidates the zombie route, corn instances and puddle placement together.
- Nine six-cell section footprints form three reconnecting branches. During the
  hunt their ports stay fixed; unseen interiors select a short hub or a longer dogleg. Protect actor
  sections and neighbors, current routes/targets/searches, recent sounds, exposed
  wall faces and QTE reservations before replacing a footprint. A rejected
  candidate leaves the current valid layout intact.
- Both entry gates use the shared animated leaves and safe collision. Explicit
  locks apply to player, zombie and throw navigation; sound can still attenuate
  across a locked gate. Pathfinding uses the moving actor's actual radius.
- Active time starts once the inner gate has closed. Only post-collision player
  locomotion contributes to qualification. QTE and recovery count as active time;
  pause, menu, camera motion and scripted throws cannot manufacture progress.
- The same original inner and outer gates unlock in reverse. A valid alive outer
  crossing emits one `corn_survival_complete` event and unlocks the old onward
  door. It neither grants a checkpoint reward nor wins the daughter objective.
- At exit readiness, the unseen northern junction and vestibule connector change
  atomically into a return tree. Both side branches remain connected through the
  south; the central branch reaches the original entrance. No section is dropped
  with an actor in it, and no return connection is closed across an active route.
- Hidden segment fields are absent from ordinary snapshots/UI. Development
  `__test.state()` includes seed, sections, protection reasons and qualification.
  See SURVIVAL_UPDATE.md for the limits of return-route and visual proof.

- Movement is continuous. Fire, light, interaction and raw look evidence are consumed once per supplied action.
- movementIntent records any held movement key, even when opposite keys cancel direction.
- E changes one aimed gate. Actual movement across a foliage boundary owns entry/exit; there is no saved exit transform or translation lock.
- Corn movement, blocked intent and deliberate look create one local rustle per input sample. Hearing uses a bounded physical route with closed-gate attenuation, not a global occupancy lookup.
- Gate state belongs to each run. Mesh transforms, circle collision, sight and pathfinding use the same leaf geometry. Closing stops on bodies; opening persists until a fresh close request.
- Aliases stay in the application/UI closure and render with textContent. Never copy them into gameplay, events, diagnostics or persistent storage.
- Confirmed observations and predicted navigation targets are different facts. AI decisions must use perception and memory; private player state is not a remote sensor.
- State re-entry can explicitly refresh initialization without duplicating entry sounds or counters.
- Events carry presentation effects; gameplay state remains authoritative.
- Interaction phase and active-time deadlines own the QTE. Timestamped fresh presses are processed before the current tick boundary; an exact lethal timestamp wins over a final press. Presentation cannot heal, advance progress or extend incapacitation.
- Real-time stepping yields its remaining catch-up when the QTE first activates so the new action can be presented before damage starts. Deterministic stepping can explicitly advance through that boundary.
- Recovery starts at the physical landing and lasts ten active seconds. Legitimate perception may update memory, but movement and other AI transitions cannot cancel it.
- Event IDs are numeric and monotonic within a run. Checkpoint identity belongs in checkpointId; audio deduplicates by run and event identity and bounds simultaneous sources.
- Creature pose updates read authoritative state and time without mutating gameplay. getEyeWorld supplies the knife target from the actual animated head.
- Restart creates a fresh game through the real application path and clears pending input and presentation state.
- Audio mute, volume and reduced-motion preferences persist across runs.
- app.dispose removes controller listeners and stops its frame loop. It does not destroy the supplied scene or AudioContext, whose lifetime belongs to their owner.
- render_game_to_text and advanceTime remain available for the shared game client. Extra diagnostics are exposed only with ?test=1. Test stepping pauses realtime advancement; starting a fresh run restores it.

## Change loop

1. Inspect Git status and preserve unrelated work. Use the latest verified commit as the rollback point; capture an external source snapshot when working before the first commit or outside Git.
2. Reproduce a bug with a failing behavior test, or establish the expected behavior before a refactor.
3. Change one behavior or module boundary at a time. Keep balance changes separate from structural changes.
4. Run the matching focused suite. Then run npm test and npm run check.
5. For visual/runtime changes, run the browser suite and inspect its screenshots and state files.
6. Record observed checks and remaining acceptance in progress.md. Do not turn an interrupted browser run into a passing result.

## Commands

- npm start: bounded loopback preview on port 4173.
- npm run test:gameplay: simulation and AI regressions.
- npm run test:runtime: input and actual application lifecycle.
- node --test tests/weather.test.mjs tests/weather-audio.test.mjs: weather timing, surface boundaries, lifecycle and audio priority.
- node tests/weather-browser.mjs: desktop/touch weather rendering, asset decoding, pause/restart and missing-audio fallback.
- npm run test:mobile: current gate/QTE/name/touch browser checks against the packaged project-path preview.
- npm run build; npm run test:build: static package and portability checks.
- CORNFIELD_BASE_PATH=/cornfields/ npm run preview: packaged preview on port 4180.
- npm test: all deterministic tests.
- npm run check: JavaScript syntax, including test helpers, and pinned Three.js lock consistency.
- npm run test:browser: current hands/corn browser checks. Set CORNFIELD_HEADED=1 for desktop pointer-lock verification.
- node tests/hands-corn-performance.mjs: pending matched before/after comparison; requires CORNFIELD_BASELINE_SOURCE pointing at the preserved weather-era source snapshot.

The browser adapter can reuse installed Playwright and Chrome through CORNFIELD_PLAYWRIGHT_MODULE and CORNFIELD_BROWSER_EXECUTABLE. CORNFIELD_NATIVE_GPU=1 preserves native graphics. No dependency or browser download is required.

On macOS, use CORNFIELD_NATIVE_START=1 when automation cannot obtain mouse capture. The runner prints READY_FOR_NATIVE_START and waits up to 60 seconds for a genuine click on ENTER THE FIELD in its foreground verification window. It never bypasses capture. A denied capture is an environment failure, not a passing controls check.

The current performance runner reports median/p95 and enforces a 10% p95 budget using the saved pre-update source and matching assets, viewport and positions. It is prepared but has not run for this update. Historical pocket-era browser harnesses remain as reference; npm scripts point to hands-corn-browser.mjs.

tests/horror-performance.mjs also compares the working package with the source at HEAD using identical views. Set CORNFIELD_PERFORMANCE_OUTPUT to a fresh output directory for each update. The weather fallback/comparison URL is ?weather=off; it restores the dry material and disables weather graphics/audio loads. Asset provenance and exact hashes live in assets/audio/weather-sources.json and assets/audio/LICENSES.md.

Respect the machine resource policy before browser, full-suite or service workloads. A blocked check remains outstanding. Human first-play pacing, fear, navigation clarity and audio comfort remain human acceptance checks.
