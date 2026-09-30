# CORNFIELDS

**[Published playtest](https://osangen.github.io/cornfields/)** · Automatically selects desktop or touch controls.

This source includes rain and puddles, the hands/QTE/enterable-corn update and the psychedelic intro. Publication status and deployed commit are available in the [Pages workflow runs](https://github.com/OsanGen/cornfields/actions/workflows/pages.yml).

This source also includes the dynamic survival-maze update. The manual Pages
workflow gates publication on the full tests, checks and build. See
[SURVIVAL_UPDATE.md](SURVIVAL_UPDATE.md) for the implementation evidence and
remaining browser, performance and human acceptance checks.

On a phone, choose **BEGIN** or **SKIP INTRO**, then turn to landscape and tap **ENTER THE FIELD**. The left joystick moves; drag the right side to look. Buttons control firing, the flashlight, interaction and pause.

For future changes, start with [ARCHITECTURE.md](ARCHITECTURE.md). It maps mechanics, input, UI, AI, visuals and audio to their files and verification commands.

A lean browser horror prototype for desktop and landscape phones. Find your daughter in the center of the corn maze while an unkillable stalker listens, searches and predicts your route. Two rounds buy time. Hiding only works if you enter unseen and stay completely still.

## Play locally

Local development requires Node.js 22 or later. Playing requires a browser with WebGL 2 and either touch or keyboard/mouse input.

```sh
npm ci
npm start
```

Open <http://127.0.0.1:4173>. Enter an optional alias, choose sound/reduced effects, then click **BEGIN** for the 20-second opening or **SKIP INTRO**. Click **ENTER THE FIELD** on the title to capture the mouse and start playing. The preview binds only to loopback and closes after one hour; run `npm start` again if needed. Use `PORT=4174 npm start` if the default port is occupied.

The intro plays once per page session. Escape skips it; switching away pauses it until Continue Intro. Retry bypasses it. Credits and Replay Intro are available from non-playing screens. `?intro=off` restores direct entry; `?introfx=off` uses the direct-render fallback. See [INTRO_UPDATE.md](INTRO_UPDATE.md) for implementation, verification and rollback.

| Control | Action |
| --- | --- |
| WASD / arrow keys | Move |
| Mouse | Look |
| Left click | Fire one scarce, nonlethal round |
| E | Open the entrance or toggle the aimed corn gate |
| Esc | Skip an active intro; otherwise pause and release the mouse |
| F | Toggle flashlight |
| Space, repeatedly while grabbed | Drive the knife forward and break free |
| M | Mute or unmute |

Movement always uses the fast speed; Shift is unnecessary. The pause menu includes volume, reduced motion, fullscreen and restart. Switching away pauses the simulation. Headphones are recommended. Death restarts at the entrance; checkpoints are one-time rewards, not saved respawn points.

## Phone controls

After watching or skipping the intro, turn to landscape and tap ENTER THE FIELD to play. The left joystick moves; drag the right side to look. FIRE spends one round per tap. LIGHT toggles the flashlight. The contextual button opens or closes the aimed gate. Walk through its opening to enter or leave corn. The top-right pause button opens settings and restart. Fullscreen is optional and appears only when supported.

When grabbed, repeatedly tap the contextual **STAB** button. Eight fresh taps free you;
holding it does not count. Existing health drains during the struggle. After a successful
eye stab, you land in nearby corn with free movement and a ten-second escape window.
Its final scream briefly turns the sky red. No health is restored by escaping.

Rotation to portrait or switching away pauses the game and clears held controls. Return to landscape and tap CONTINUE. Action buttons never count as looking. Deliberate joystick movement and looking produce local rustling. Only a zombie within hearing range and a valid acoustic route learns that position. Touch mode caps rendering pixel ratio at 1.

Input mode follows the device: a touchscreen with a coarse primary pointer gets touch controls; a mouse or trackpad gets desktop controls. Window size does not determine input mode. Older shared links containing `controls=touch` or `controls=mouse` also auto-detect. Verification alone can force a mode with `?test=1&controls=touch` or `?test=1&controls=mouse`. Physical-phone frame rate, browser interruptions and comfort still need a phone playtest.

## Static build and GitHub Pages

```sh
npm run build
CORNFIELD_BASE_PATH=/cornfields/ npm run preview
```

Open <http://127.0.0.1:4180/cornfields/> to check the packaged game beneath a project URL. `dist/` contains only runtime modules, pinned Three.js modules, assets and credits. The source preview and packaged build work without a root-domain URL or external CDN.

The manual `Publish playtest to GitHub Pages` workflow installs locked dependencies, runs checks, builds and deploys `dist/`. See [DEPLOYMENT.md](DEPLOYMENT.md) for setup, verification and rollback. A loopback preview cannot be opened from a separate phone; use the published HTTPS URL after deployment.

## Implemented loop

1. Enter the field with 100 health and two rounds.
   The local update first leads south through two gates into a required corn detour.
   Its original entrance eventually reconnects; returning through it unlocks the
   onward route. This segment grants no health, ammunition or checkpoint reward.
2. Follow landmarks; choose movement, flashlight, hiding or a shot to survive.
3. A successful hit staggers the zombie. A miss spends the round. It cannot die.
4. The flashlight makes it recoil, then rage. Shoot it or escape beyond sight and distance to end rage.
5. The Broken Watchman and Water Barrels each restore health and grant up to two rounds once. Each reward escalates the hunt.
6. Reach your daughter in the center to win immediately.

Close contact has a short interruptible windup before a tackle and knife struggle.
The struggle needs eight fresh Space presses or STAB taps, with a brief input grace
before health drains at one full health bar per three active seconds. A successful
escape follows a collision-checked route into nearby connected corn lanes. Both actors
share the gates, solid partitions and walkable geometry. Mandatory checkpoints remain
physical bottlenecks even when every corn gate is open.
The zombie remains incapacitated for exactly ten seconds after landing, then screams
once and resumes hunting from legitimate observations. Extra shots cannot reset an
active gun stagger or the escape recovery timer. A shot outside recovery buys the
original 3 / 2.5 / 2 seconds, depending on checkpoint progress.

Outside the new dedicated segment, the inherited route retains 631 operable corn
gates and 29 fixed outer-containment spans. Those gates stay
open until explicitly closed. A closing leaf stops safely if an actor blocks its arc.
The zombie opens gates on its planned route. Corn contains 25 connected loop regions;
standing still conceals without locking movement or deleting enemy memory. Rustling
can trigger a nearby rush, while distant input does not reveal your position.

The optional title-screen alias is normalized to 24 Unicode graphemes. Blank input
uses STRANGER. It stays in this session, survives quick retry, and can be edited through
TITLE / EDIT ALIAS in the pause menu. It is rendered as literal text and omitted from
game snapshots, AI state, storage and network requests. Sparse authored corn taunts
use only this name. QTE corruption text is presentation, separate from tactical warnings.

Original posed hands share a 1K atlas and gain gradual dirt at checkpoints. Knife
progress, bounded tremor, brief pre-impact easing and immediate recoil are driven
by the existing interaction clock. Blood rain and red sky have separate QTE and
recovery ownership. Reduced effects suppress blood rain and reduce text/tremor.
Use ?horror=off for clean hand/eye inspection.

## Lean implementation

- One runtime dependency: pinned Three.js. No application framework, bundler, backend or runtime networked services. Visual assets are served locally.
- One authored 33 x 35 progression map with 370 corridor cells, plus a fixed 3 x subdivision for corn lanes. Rendering, collision, visibility and pathfinding share the same level data.
- Fine-grid circle collision, bounded movement substeps and cached A* enemy routing through the same door geometry.
- One explicit evidence-based zombie state machine plus a small threat director. Perception, decaying memory, seeded prediction and bounded searches drive navigation; unseen hidden coordinates do not guide prediction.
- Instanced corn, a rigged zombie with a primitive fallback, authored landmarks, fog and a toggleable flashlight.
- Local CC0 creature vocal recordings with original synthesized wind, rustling, footsteps and impacts. Stereo direction and distance gain; optional audio-load failure retains synthesized fallback.
- A tiny allowlisted local static server. App resources are served locally after installation. No telemetry, accounts, cookies or persistence.

## Files

- `src/maze.js`: authored geometry, navigation and collision.
- `src/game.js`: deterministic state, ordered simulation and progression.
- `src/game-config.js`: gameplay tuning values.
- `src/combat.js`, `src/hiding.js`: shooting, contact, physical corn entry and local rustling.
- `src/corn-world.js`, `src/corn-view.js`: shared lane topology, collision, routing, door geometry and instanced rendering.
- `src/corn-layout.js`, `src/corn-survival.js`: pooled corridor footprints, protected recycling, committed entry, hidden qualification and original-gate return.
- `src/corn-survival-view.js`: fixed-capacity dynamic corn instances driven by the run's geometry revision.
- `src/hands.js`, `src/horror-presentation.js`: optional hand asset, progression dirt and derived QTE/taunt presentation.
- `src/grapple.js`: tackle, timestamped knife input, health drain, safe throw and recovery deadlines.
- `src/zombie-poses.js`: original per-bone choreography over the existing Pixelhouse rig.
- `src/zombie-ai.js`, `src/threat-director.js`: perception, memory, prediction and pressure.
- `src/runtime-loop.js`: shared bounded real-time and test stepping.
- `src/scene.js`: Three.js presentation and lighting.
- `src/audio.js`: bounded, prioritized local vocals and synthesized environmental sound.
- `src/main.js`: startup wiring only.
- `src/app.js`: importable session lifecycle, shared stepping, and event dispatch.
- `src/input.js`, `src/touch-input.js` and `src/ui.js`: browser input and HUD/menu presentation.
- `src/enemy-state.js`: shared AI state initialization and explicit refresh.
- `src/debug.js`: stable browser verification hooks.
- `src/style.css`, `index.html`: title screen, controls and overlays.
- `tests/*.test.mjs`: deterministic gameplay, AI fairness, input and infrastructure checks.
- `tests/hands-corn-browser.mjs`: current desktop/touch gate, name, QTE and recovery browser scenarios.
- `tests/corn-survival.test.mjs`, `tests/corn-survival-browser.mjs`: dynamic-maze simulation checks and the prepared desktop/touch entry, QTE and return browser story.
- `tests/hands-corn-performance.mjs`: pending matched comparison against the saved pre-update source.
- Older `browser.mjs`, `mobile-browser.mjs` and `horror-browser.mjs` are historical harnesses for the superseded pocket mechanic; the npm browser commands use the current harness.
- `scripts/build.mjs`, `scripts/preview-dist.mjs`: allowlisted static packaging and project-path preview.
- `scripts/serve.mjs`, `scripts/server-path.mjs`: loopback preview and canonical public-file allowlist.
- `progress.md`: implementation and verification record.

## Verify

```sh
npm test
npm run check
```

## Cornfield visual kit

The original visual upgrade covers corn plants, field surfaces and the entrance.
Subsequent approved passes add a photographic sky, zombie and prop surface detail.
Its editable source is `art/cornfield-kit.blend`; `assets/field/cornfield-kit.glb`
contains reusable near/far plants, fallen leaves and the entrance assembly.
Soil, wood and rust use local 1K CC0 Poly Haven maps. See `assets/field/LICENSES.md`
and `assets/field/sources.json` for provenance and download hashes.

The current scene uses instanced wooden swing gates, retained outer fencing and dense
corn around walkable lanes. Thin foliage-colored partition meshes match physical
stage boundaries. Existing wood textures are reused. Gate leaves fold fully back
so open geometry does not sever the corn loops. Original field assets remain
chunked and distance-culled; the 6,720-triangle hand asset adds about 1.38 MB.

`?visuals=field` and the old `?visuals=sample` URL both show the complete field.
`?visuals=legacy` is an explicit reload-based rollback. Missing assets preserve
the original playable scene and expose a fallback reason in test diagnostics.

Rebuild the small asset kit with an installed Blender (no add-ons):

```sh
node scripts/fetch-field-textures.mjs
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --threads 2 --python scripts/build-field-assets.py
```

The first command is only needed to restore missing source JPEGs. Generation
writes to the project on the external volume. The Blender source and generator
are never served by the preview server. Gameplay, audio, lighting, fog, camera,
enemy and landmark models are outside the visual upgrade.

### Photographic night sky

The default field view loads one local 2048 x 1024 JPEG prepared in Blender from
Andreas Mischok's CC0 Solitude Night panorama. The photographed ground, building
and horizon lights are masked below 16 degrees, then blended to the existing fog
color through 33 degrees. Three taller silhouettes are replaced with nearby sky
pixels offline. Cloud detail is static. The background uses one unlit
960-triangle sphere with no shadows, reflection map, additional lights or effects.
It follows camera position without rotating as the player turns.

Use `?visuals=field&sky=off` for a sky-only comparison or rollback. The explicit
legacy view also keeps the original sky. A missing sky texture or load exceeding
eight seconds falls back to the original background independently of field assets.

The editable source is `art/night-sky.blend`. To regenerate the JPEG from the
retained HDR, using the installed Blender:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --threads 2 --python scripts/build-night-sky.py
```

The generator does image preparation only, with no rendering or simulation, and
enforces a 900 KB download budget. `assets/field/sky-source.json` records output
dimensions, size and hashes after generation. `tests/sky-visuals.mjs` checks the
background from opposite directions, compares sky on/off, and checks missing-asset
fallback. See `progress.md` for which generation and checks have actually run.

`tests/field-visuals.mjs` compares identical entrance, corridor and close-up views
at 1280 x 720, checks sprinting through the first corner and exercises asset-load
failure. Its report records warm browser frame intervals, submitted triangles
and draw calls. The 10% p95 target is a local browser comparison, not a universal
hardware guarantee or a subjective realism score. See `progress.md` for the
current rollout and acceptance state.

Browser verification uses an existing Playwright installation and a browser executable. These are optional test tools, not runtime dependencies. `scripts/browser-runtime.mjs` accepts `CORNFIELD_PLAYWRIGHT_MODULE` and `CORNFIELD_BROWSER_EXECUTABLE` so an installed browser can be reused without downloads. With those configured and the preview running:

```sh
npm run test:browser
```

The browser harness launches headed Chrome. The native window must be foreground for pointer lock. This machine rejected pointer lock in the separately launched automated window; foreground Chrome was checked through the desktop browser controls instead. See `output/survival-update-receipt.json` for exactly which checks ran.

Current screenshots and reports are in `output/hands-corn/`. The shared game client uses the unchanged installed script through `output/playwright-loader.mjs`, which resolves Playwright to the existing runtime adapter. No dependency or browser download is needed.

`window.render_game_to_text()` is a read-only gameplay snapshot. `window.advanceTime(ms)` switches to deterministic stepping until reload. The local `?test=1` URL additionally exposes real movement stepping and read-only path/diagnostic data. All three stepping paths update the same gameplay and continuous audio tick. Verification moves through the same collisions and gameplay state machine; it does not teleport to victory. `?debug=1` displays local state, memory and run metrics. No metrics leave memory or travel over a network.

Real-time simulation uses 60 Hz substeps with at most 250 ms of catch-up per frame. Longer individual stalls discard excess time to prevent an update spiral; diagnostics count that discarded time. Pause/resume clears accumulated time and pending input. A 10 FPS schedule still advances one gameplay second per real second.

## Lean prop surface detail

Poly Haven's CC0 Hessian 380 adds photographed sackcloth color and normal detail
to both scarecrows. Blue Metal Plate adds scratches, scuffed paint and varied
roughness to the three water barrels, preserving their blue landmark color.
Scarecrow timbers, the gate and lamp/exit posts share the field's existing wood
maps. Barrel bands and the entrance hardware share the existing rust material.

This pass adds no mesh objects, triangles, lights, shadows, render passes or
per-frame work. Four new 1K maps total 2.82 MB of transfer, approximately 21.3 MiB
of uncompressed RGBA texture storage including mipmaps. Material sampling adds
some GPU work on the few affected props; frame-time impact has not been measured.
The wood/rust reuse does not upload duplicate texture images.

Missing optional textures retain the original material, independently for cloth
and barrels, with an eight-second load deadline. `?visuals=field&details=off`
disables these surface upgrades. Restore source maps with
`node scripts/fetch-prop-textures.mjs`. Sources and hashes are recorded in
`assets/field/prop-sources.json`; bounded check results are in
`output/prop-details-check.json`.

## Zombie asset

The enemy uses Pixelhouse's free CC BY 3.0 textured zombie, converted in Blender
with a sickly, desaturated color grade, 2K color and 1K normal maps. It has 3,573
triangles, one material, one walking animation and a 1.25 MB GLB. The source is
`art/zombie.blend`; rebuild with `scripts/build-zombie.py` in Blender.
The gameplay update drives animation from the new AI states. Only the skeleton root's horizontal travel is removed; child bone animation is preserved. A failed or stalled
model load retains the original enemy after a bounded deadline and cannot block Start. Credits appear on the title screen and in
`assets/field/LICENSES.md`.

Original per-bone animation now adds painful searching, a four-limb inverted chase,
face-shielding recoil, fetal collapse and a lowered knife struggle. Eye meshes attach
to the head and obey depth testing. No additional lights, bloom, ragdoll solver,
animation library or imported stock clips are used. Denys, Mixamo and Quaternius
clips were not integrated: current download or license access could not be verified.
The two local vocals are artisticdude's CC0 Zombies Sound Pack selections, with
source filenames and hashes in `assets/audio/sources.json`.

## Mud, rain and puddles

The existing 1K Brown Mud maps now use a darker wet material. Shallow puddles blend into the ground and catch existing lights. Walking through water creates expanding ripples, a short gravity-driven droplet splash and one synchronized wet footstep. Nearby raindrop rings are sampled cheaply; water does not flow or change gameplay movement/hearing.

Rain is one camera-local batch: 300 streaks on touch devices and 800 on desktop. Ripple/drop pools are capped at 12/24 on touch and 24/48 on desktop. The entire weather renderer uses at most four additional batches and two small generated textures. Reduced effects cap rain at 100 streaks and disable lightning/splash droplets. Storms use active gameplay time, pause with the game and reset on retry. QTE, the red-sky cue and critical scares take priority over thunder and lightning.

Four local CC0 recordings add 699,480 bytes: Ylmir's loopable rain and rubberduck's thunder and splash effects. They load after the audio-unlock gesture with bounded failure handling. Provenance, exact hashes and licenses are in `assets/audio/weather-sources.json` and `assets/audio/LICENSES.md`. Missing sound files preserve play and visual effects.

Use `?weather=off` for the dry baseline or immediate weather rollback. The regular shared link still detects desktop/touch controls automatically.

## Pacing and remaining human acceptance

The updated target is a 4-7-minute unfamiliar first run. The authored corridor route is about 517 meters; opening corn loops can shorten sections while preserving both checkpoints. Skilled known-route runs can be shorter. **First-play duration, fear, fairness and sensory comfort require human playtesting.** No waiting period pads the route.

Next human playtest: use three unfamiliar players without coaching after the entrance tutorial. Record completion time, shots, checkpoint timing, damage, hiding comprehension, fear and fairness ratings. Check that light recoil communicates the coming rage, hiding feels fair, and rewards never cause unavoidable damage. Tune behavior and sound before expanding art or map scope.

Saving, multiplayer and generated mazes remain future work. Browser emulation,
provider deployment and physical-phone acceptance remain separate verification steps.

## Reversibility

Stop the exact preview process with Ctrl+C. Generated `dist/` and local `output/` are disposable build and verification artifacts. Source snapshots were captured outside the served root before the refactor and mobile update. After the first GitHub release, redeploy a known-good commit to roll back the hosted game.
