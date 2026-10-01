# Progressive browser upgrade

Progressive upgrade from `b234a99`. The production engine remains Three.js 0.186.0 with WebGL2. The research plan's later engine, texture-compression and physics proposals retain their measurement gates. GitHub Pages workflow runs identify the published revision.

## Implemented

- Shared presentation tuning in `src/presentation-config.js`. Simulation configuration stays in `src/game-config.js` and retains a single owner.
- Automatic rendering quality with a two-second warm-up, sustained-load downgrade and slower upgrade. The pause menu also offers Low, Balanced and High. Pointer capabilities still choose controls independently.
- Quality changes pixel ratio, near/far plant detail and rendered rain count. Every tier uses identical field placement, crop coverage, fog, collision, enemies and progression. Phone no longer receives fewer corn plants.
- Bounded foliage wind and player bending with reduced-effects support. Existing near/far plant assets are reused; the field's mud UV scale now matches the corridor material. Timber gains subtle tint and edge variation.
- Production corridors stop constructing the retired maze's large vegetation batches and unused legacy stalk/straw instances. Source assets remain available to the intro and older test layouts.
- Explicit idle/locomotion/reaction animation graph with 180 ms blends, reset-safe sampling and the existing procedural horror poses as the final owner. The original Pixelhouse archive contained Fury and Collapse actions on the same 56-joint skeleton, avoiding a new rig or external retargeting dependency. The optional 239 KB clip bank falls back to the existing lurch and local poses if it cannot load.
- Pagehide, persisted pageshow and unexpected audio interruption pause gameplay and sound. Browser recovery cannot resume audio until the player resumes. Pending audio resume promises cannot undo pause intent.
- Calm, warning, pressure and recovery pacing for discretionary threat messages, with transition reasons in diagnostics. Quiet footsteps and flashlight sounds lose range behind occluding geometry; loud shots retain their recorded source position.
- A local scene/animation picker, repeatable built-package comparison and an isolated renderer trial. No new production dependency or service worker.
- A fitted [Poly Haven service pistol](https://polyhaven.com/a/service_pistol) by Mateusz Sadek and [rigged FPS arms](https://opengameart.org/content/fps-arms-rigged-only) by para/MakeHuman, both CC0. The shipped pistol retains one grip variant, animated slide and textured metal; the arm export preserves the skeleton and grip pose while cropping unseen shoulder geometry. A small first-person lighting rig and environment map improve material readability without brightening the whole world.
- Controlled weapon sway, firing recoil, moving slide, a small soft muzzle glow, near-wall lowering and aspect-aware framing. The knife uses an original slimmer blade, guard and shaped handle. All are presentation changes; shooting and QTE simulation remain authoritative. Reduced effects remove idle motion.
- Bounded optional-asset loading with primitive fallback, late-load rejection and explicit geometry, material, texture and skeleton cleanup. App disposal now releases the scene too.
- World-anchored field mud UVs, instanced timber posts/braces, return-door hardware and inexpensive sky reflections in existing puddles. Reflections reuse the sky texture, not another render pass. Puddle interaction remains the existing lightweight ripple/splash system, not fluid simulation.
- Multi-enemy pacing checks every active pursuer in the player's zone. Hearing still records legitimate evidence, but older sound cannot override a fresh sighting. Zombie heading smoothing takes the shortest turn and resets on zone changes, teleports and QTE ownership.

The hidden 180 seconds and 120 metres still count corridor play only. The separate field remains optional hiding, keeps the original return doorway, and retains the existing depth warnings and capped additional zombies. One attacker owns the QTE; eight presses and the ten-second recovery remain unchanged.

## Make the next update

| Change | Smallest editing surface | Acceptance |
|---|---|---|
| Graphics tier, corn presentation or cue spacing | `src/presentation-config.js` | `tests/upgrade.test.mjs`, matched field captures |
| Zombie behavior timing/ranges | `src/game-config.js`, existing AI state handler | Existing AI fairness, corridor and grapple tests |
| Perception rule | `src/zombie-ai.js` | Recorded evidence only; blocked sound, stale memory and hidden-player regressions |
| Animation mapping | `src/zombie-animation.js` | Real rig tests, source trial, actual QTE camera |
| New animation | Export original FBX; rebuild clip bank | Skeleton hierarchy, finite tracks, root drift, license and motion acceptance |
| Wooden panel variant | `src/wood-panels.js` | Keep collision dimensions; compare draw calls and phone visibility |
| Gun/hand placement and motion | `src/viewmodel-pose.js` | Clean Viewmodel scene at desktop and landscape-phone aspect; QTE and recoil captures |
| Gun/hand model, material or load behavior | `scripts/build-player-viewmodel.py`, `src/hands.js` | Source hashes, rig/slide validation, fallback and disposal tests |
| Field ground or puddle reflections | `src/corridor-view.js`, `src/weather-view.js` | Fixed-world UV regression, field/door captures and reduced-effects behavior |
| Mobile lifecycle | `src/audio-lifecycle.js`, `src/app.js` | Interrupted/late resume, page history, intro and held-input tests |

To inspect assets locally, open the existing preview with `?test=1&intro=off&lab=1`. Enter first, then use Load scene. Viewmodel removes enemies for a clean gun/hand inspection; Animation offers the zombie clips. These trials intentionally freeze gameplay; reload to return to a normal game. `?debug=1` shows perception, memory, pacing, field depth and world revision. Existing `render_game_to_text`, `advanceTime` and test hooks remain available.

`?quality=low`, `balanced` or `high` fixes a tier. Missing/invalid values select Automatic. Development-only `?test=1&wallbatches=on` enables the spatial wall trial; it is disabled by default because the measured draw-call tradeoff did not justify promotion.

## Rebuild the optional clips

Preserve `art/reference/zombie-source`. The exporter was exercised with Blender 5.2.1, 30 FPS and sampled glTF animation. It never modifies the FBX files or the shipped character model.

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --threads 2 --python scripts/export-zombie-clips.py -- output/upgrade-execution-2026-10-01/animation
node scripts/build-zombie-clips.mjs output/upgrade-execution-2026-10-01/animation
```

The bank carries author, CC-BY-3.0 license, source URL, per-FBX SHA-256, selected clip names, durations and export settings. Horizontal root travel is stripped; navigation remains authoritative. Original local idle breathing and QTE choreography are not represented as downloaded clips. Keep Pixelhouse attribution in `assets/field/LICENSES.md` and the in-game credits.

## Rebuild the pistol and arms

The verified sources are preserved under `art/reference/player-viewmodel/`. `assets/field/player-viewmodel-source.json` records source URLs, licenses, author, source/export SHA-256 values and Blender version. No paid asset or account was used. The initially considered Sketchfab arms were not downloaded; the actual integrated fallback is the CC0 rig linked above.

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --disable-autoexec --threads 2 --python scripts/build-player-viewmodel.py
npm run test:player
npm run build
npm run test:player:browser
```

The exporter imports the FBX with automatic script execution disabled, preserves weighted bones, exports the posed grip rather than the original rest pose, and embeds the textures. It removes unused pistol variants and loose props, preserves the forearm cross-section and extends the cropped ends outside the first-person frame. The two runtime GLBs total 2,903,096 bytes. They replace the old posed-hand GLB in the package; the original remains in the source tree for reference. Keep the license notices in `assets/field/LICENSES.md`.

The optional `-- --meshopt-trial` exporter argument writes experimental compressed GLBs only under `output/remaining-upgrade-2026-10-01/meshopt-trial`. The renderer trial detects their presence; a fresh checkout can still run the uncompressed trial without them.

## Experiments and gates

- **Spatial corridor batches:** the intermediate trial raised the matched corridor from 54 to 74 draw calls without improving its roughly 16.7 ms frame cadence on this Mac. Small batches remain available for deliberate comparison; production uses a compact shared batch.
- **TSL bridge:** the pinned WebGLNodesHandler omitted the exponential fog density uniform. A trial-local subclass supplies it, without modifying Three.js or production code. The isolated real pistol/skinned-arm scene now initializes and renders through the bridge.
- **WebGPU:** `npm run build:renderer-trial` builds a separate package under the ignored output directory. `npm run test:renderer-trial` checks classic WebGL, the TSL bridge, forced WebGL fallback and WebGPU with the real pistol and skinned arm, fog, resize and teardown. These paths pass on the local Chrome/Mac setup. Full-game parity for the intro, instanced corn and custom weather shaders, plus real-phone compatibility, remain required before promotion.
- **Bevy:** preflight found local Rust 1.93.1 and only the native Apple target. The pinned [Bevy 0.19.1 manifest](https://raw.githubusercontent.com/bevyengine/bevy/v0.19.1/Cargo.toml) requires Rust 1.95.0. Its browser challenger remains pending an isolated compatible toolchain and Wasm target; no Bevy performance or migration claim is made.
- **Meshopt:** the final measured export saves 274,520 bytes across the two viewmodel GLBs, about 9.5%. Local browser samples have not established a loading-speed benefit; the renderer report records load times separately from encoded size. Decoder use remains isolated to the trial. Compressed textures would target the larger remaining texture cost, but KTX2 requires a separately validated encoder/decoder and visual comparison.
- **Rust, Rapier and KTX2:** not added to the production game. No measured phone bottleneck currently justifies replacing deterministic navigation or collision. A future Rust/Bevy challenger must remain a separate bounded experiment; it is not a prerequisite for the visual upgrade.

## Verification and release boundary

```sh
npm run check
node --test --test-concurrency=1 tests/*.test.mjs
npm run build
npm run test:player:browser
npm run test:upgrade
```

Browser commands require an installed Playwright and Chromium. `scripts/browser-runtime.mjs` supports `CORNFIELD_PLAYWRIGHT_MODULE` and `CORNFIELD_BROWSER_EXECUTABLE` for existing installations; no download is required. `CORNFIELD_NATIVE_GPU=1` removes forced software-rendering switches.

Execution evidence for the first pass is under `output/upgrade-execution-2026-10-01/`; the pistol/arms, environment and renderer follow-up is under `output/remaining-upgrade-2026-10-01/`. The benchmark renders the actual frozen scene on every sampled RAF; it records browser frame cadence, not isolated GPU time. Baseline and upgraded packages run sequentially at the same seed, camera, viewport and DPR. Automatic resolution changes are disabled for comparison. A physical iPhone/Safari and Android/Chrome playtest, sustained thermal run, animation feel and complete human gameplay acceptance remain pending.

The local regression suite has 263 passing tests. Browser coverage includes both control modes, real asset loading, failed optional models, firing, tackle/QTE/stab/recovery, field entry and original-door return, paused corridor qualification while hiding, intro/history interruptions and actual WebGL context loss. The shared web-game client also exercises real keyboard/mouse input. Screenshots were reviewed for grip, forearm cropping, lighting and mobile control clearance.

At the matched 960 x 540, DPR 1 camera, the corridor changed from 54 calls / 37,834 triangles to 56 / 58,464 with the added assets and timber detail. The desktop field fell from 178,682 to 125,364 triangles; the touch baseline had fewer plants, so its 119,380 to 125,364 change is not a like-for-like density reduction. Both upgraded modes retain the same field coverage. Local p95 frame cadence remained about 16.7-16.8 ms. These samples do not establish phone FPS or thermal stability.

Publication is a separately authorized workflow run. The October 1 publication was requested after local acceptance checks. Retain the baseline package and `b234a99` release for rollback. The release receipt records the actual deployment outcome and live hashes; do not infer publication from a local build or source push.
