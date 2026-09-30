# Updating Cornfield

This is a JavaScript/Three.js game with desktop and landscape touch input. It has one runtime dependency and a small static packaging step for hosting. Keep changes small and preserve the deterministic simulation.

## Where changes belong

| Change | Primary location | Verification |
| --- | --- | --- |
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
| Hiding and entry/exit evidence | src/hiding.js | Hidden-input and information-boundary scenarios |
| AI perception, memory, navigation | src/zombie-ai.js | Whole-AI regression scenarios |
| AI state initialization | src/enemy-state.js | Same-state refresh and combat regressions |
| Threat text and intensity | src/threat-director.js | Truthfulness and cooldown tests |
| Scene, gun, landmarks, foliage | src/scene.js; src/field-visuals.js | Browser screenshots and frame-time comparison |
| Sounds and spatial cues | src/audio.js | Browser checks with sound |
| Browser diagnostics | src/debug.js | Keep existing verification hooks compatible |

When balance changes affect instructions, also update the corresponding tutorial copy in index.html or ui.js.

## Runtime flow

main.js creates the maze, scene and audio, waits for presentation readiness, then creates the application. It contains startup wiring only.

input.js converts browser events into a PlayerInput. app.js advances the shared stepper, calls updateGame, drains game events into audio and scene, and presents the result through ui.js and scene.js. Both real frames and explicit test stepping use this path.

main.js selects touch input for a coarse primary pointer, with controls=touch/mouse URL overrides for hybrid devices. touch-input.js implements the same input contract. Each pointer owns one control until release; action buttons cannot contribute look evidence. Movement that crosses the joystick deadzone is retained until read even if the finger returns or lifts first. Cancellation and lifecycle transitions clear all pointer ownership and pending input. Only mouse mode requests or responds to pointer lock. Both modes unlock audio within the entry gesture.

CSS owns canvas display dimensions; renderer.setSize changes the backing buffer only. This prevents a landscape inline canvas width from expanding the phone viewport after rotation. Touch mode pauses on portrait orientation and requires explicit resume after returning to landscape.

build.mjs traverses the runtime import graph from main.js and copies an explicit asset allowlist into dist/. It copies only the required Three.js import closure and license, rewriting the import map to vendor/three/. Keep new assets in runtimeAssets; use module-relative new URL paths. Verify both root and project-prefix hosting when paths change. Publication is manual through the Pages workflow; see DEPLOYMENT.md.

The simulation never imports DOM, WebGL or Web Audio modules. The UI never advances the simulation. Tests import createGameApp directly with small browser/renderer/audio adapters; they do not rewrite source text.

## Contracts to preserve

- Movement is continuous. Fire, light, interaction and raw look evidence are consumed once per supplied action.
- movementIntent records any held movement key, even when opposite keys cancel direction.
- Hiding entry resolves interaction first, then checks newly hidden movement/fire/light. Mouse aim that preceded entry is not replayed as hidden movement.
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
- npm run test:mobile: browser touch emulation against the packaged project-path preview.
- npm run build; npm run test:build: static package and portability checks.
- CORNFIELD_BASE_PATH=/cornfields/ npm run preview: packaged preview on port 4180.
- npm test: all deterministic tests.
- npm run check: JavaScript syntax, including test helpers, and pinned Three.js lock consistency.
- npm run test:browser: headed browser controls, full route, restart and optional-model fallback checks.

The browser adapter can reuse installed Playwright and Chrome through CORNFIELD_PLAYWRIGHT_MODULE and CORNFIELD_BROWSER_EXECUTABLE. CORNFIELD_NATIVE_GPU=1 preserves native graphics. No dependency or browser download is required.

On macOS, use CORNFIELD_NATIVE_START=1 when automation cannot obtain mouse capture. The runner prints READY_FOR_NATIVE_START and waits up to 60 seconds for a genuine click on ENTER THE FIELD in its foreground verification window. It never bypasses capture. A denied capture is an environment failure, not a passing controls check.

Set CORNFIELD_BASELINE_SOURCE to a saved source snapshot to include before/after frame-time comparisons using the same assets, viewport and camera positions. The browser report records measured median/p95 times and enforces a 10% p95 budget. This comparison is distinct from the older legacy-art comparison in tests/field-visuals.mjs.

Respect the machine resource policy before browser, full-suite or service workloads. A blocked check remains outstanding. Human first-play pacing, fear, navigation clarity and audio comfort remain human acceptance checks.
