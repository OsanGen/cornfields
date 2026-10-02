# CORNFIELDS

**[Published playtest](https://osangen.github.io/cornfields/)** · Automatically selects desktop or touch controls.

This source includes rain and puddles, the hands/QTE/enterable-corn update and a cinematic story before the psychedelic intro, with recorded footsteps in gameplay and the cinematic. The cinematic uses temporary playtest artwork and synthetic voices; publication status and deployed commit are available in the [Pages workflow runs](https://github.com/OsanGen/cornfields/actions/workflows/pages.yml).

The progressive upgrade adds graphics tiers, corn motion/detail, animation blending, safer phone interruptions and pacing controls. It also replaces the first-person placeholders with a CC0 textured pistol and rigged arms, improves timber and wet-ground presentation, and provides repeatable asset exports. See [UPGRADE.md](UPGRADE.md) for the authoring guide, experiment outcomes and remaining device acceptance. The workflow runs above identify the deployed revision.

The main game now uses spacious wooden corridors. Open glowing entrances lead into a separate,
open cornfield for optional hiding; going deep attracts additional zombies and
warnings to return. See [CORRIDOR_FIELD_UPDATE.md](CORRIDOR_FIELD_UPDATE.md) for the
corrected design, verification and release gates. SURVIVAL_UPDATE.md records the
superseded dedicated survival detour.

The local gunshot/beacon update adds a credited recorded pistol shot, a brief muzzle
light on the weapon and nearby surfaces, and a red mist/sky beacon at the cornfield
return door. The beacon retains its true doorway bearing beyond normal fog and draw
distance; low quality reduces mist, while reduced effects quiet the flash and pulse.
Weapon audio has two reserved voices so detection cues cannot cancel a shot.
`npm run test:effects:browser` checks sound output, flashes, far-field navigation and
optional-asset fallbacks. The workflow runs above identify what has been published.

The follow-up local polish gives warnings one display priority, adds sparse instanced
grass and small stones, slows the corn wind, fits weapon-specific finger grips and
keeps the knife tip aligned to the animated eye at contact. Stabbing rules are
unchanged. Three small CC0 creature recordings add a stalking growl and varied
attack roars; provenance is in `assets/audio/creature-sources.json`.
Use `npm run test:polish:browser` for desktop/touch captures and contact checks.

The corridor pursuer continually routes toward the player around corners. Walking
loses distance; Shift or the outer edge of the touch joystick sprints. Gun stagger,
flashlight recoil and the ten-second escape recovery keep their existing rules.
Walk through a neon **HIDE HERE** opening to enter corn without an interaction.
The pursuer follows its last corridor doorway clue, then searches using field
sight and sound. Quiet hiding still works; field time does not advance the main
three-minute goal. Openings use a shared fractal/liquid border and the existing
CC0 mist texture, with at most two nearby effects (one on phones/low quality).
Reduced effects freezes the border motion. No new asset download is required.

On a phone, turn to landscape and choose **BEGIN STORY**. Gameplay follows the story and titles automatically. **Skip Story** retains the titles; **Skip Opening** goes straight to the brief return shot. The left joystick moves and its outer edge sprints; drag the right side to look. Buttons control firing, the flashlight, interaction and pause.

For future changes, start with [ARCHITECTURE.md](ARCHITECTURE.md). It maps mechanics, input, UI, AI, visuals and audio to their files and verification commands.

A lean browser horror prototype for desktop and landscape phones. Play Chief Mike Hartmouth, searching for missing Sadie Yates while an unkillable stalker pursues you. Two rounds buy time. Hiding only works if you enter unseen and stay completely still.

## Play locally

Local development requires Node.js 22 or later. Playing requires a browser with WebGL 2 and either touch or keyboard/mouse input.

```sh
npm ci
npm start
```

Open <http://127.0.0.1:4173>. Choose sound/reduced effects, then click **BEGIN STORY**. Mouse capture and sound activation happen on that click. Look freely, press E to exit when prompted, use F for the flashlight, and follow the two men. The interactive opening has about three minutes of authored content including credits and the final gameplay line; deliberate wandering, idle and pause add time. The preview binds only to loopback and closes after one hour; run `npm start` again if needed. Use `PORT=4174 npm start` if the default port is occupied.

The opening plays once per page session. Escape pauses; J skips the story and K skips the opening. Switching away pauses until **Continue**; retry bypasses it. **Replay Opening** preserves the paused run. `?intro=off` restores direct entry; `?prologue=off` restores the previous title-only opening; `?introfx=off` uses the direct-render title fallback. See [PROLOGUE_UPDATE.md](PROLOGUE_UPDATE.md) for story, assets and verification. [INTRO_UPDATE.md](INTRO_UPDATE.md) documents the retained title controller.

| Control | Action |
| --- | --- |
| WASD / arrow keys | Move |
| Shift while moving | Sprint in the corridor/field game |
| Mouse | Look |
| Left click | Fire one scarce, nonlethal round |
| E | Open the main entrance; hiding openings require no interaction |
| Esc | Skip an active intro; otherwise pause and release the mouse |
| F | Toggle flashlight |
| Space, repeatedly while grabbed | Drive the knife forward and break free |
| M | Mute or unmute |

Walking is 3.8 m/s; sprinting is 4.8 m/s and makes louder footsteps. The corridor pursuer moves at 4.0 to 4.2 m/s. The pause menu includes volume, reduced motion, fullscreen and restart. Switching away pauses the simulation. Headphones are recommended. Death restarts at the entrance; checkpoints are one-time rewards, not saved respawn points.

## Phone controls

Use landscape and tap BEGIN STORY. Drag the right side to look, tap EXIT when prompted, then use the left joystick to follow and LIGHT for the flashlight. The story gun is visible but cannot fire. Gameplay starts immediately after credits or SKIP OPENING. In gameplay, push the stick to the outer edge to sprint; FIRE spends one round per tap. The contextual button opens the main entrance. Walk directly through a glowing HIDE HERE opening to enter corn and through the red return frame to leave. Pause opens settings and restart. Fullscreen is optional and appears only when supported.

When grabbed, repeatedly tap the contextual **STAB** button. Eight fresh taps free you;
holding it does not count. Existing health drains during the struggle. After a successful
eye stab, you land in nearby corn with free movement and a ten-second escape window.
Its final scream briefly turns the sky red. No health is restored by escaping.

Rotation to portrait or switching away pauses the game and clears held controls. Return to landscape and tap CONTINUE. Action buttons never count as looking. Deliberate joystick movement and looking produce local rustling. Only a zombie within hearing range and a valid acoustic route learns that position. Automatic graphics quality adapts separately from the control mode; Low, Balanced and High are available in the pause menu.

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
   Spacious wooden corridors own the hidden 180-second and 120-metre qualification.
   Glowing walk-through openings offer optional hiding in a separate open cornfield. Time there does
   not advance corridor qualification; returning resumes it.
2. Follow landmarks; choose movement, flashlight, hiding or a shot to survive.
3. A successful hit staggers the zombie. A miss spends the round. It cannot die.
4. The flashlight makes it recoil, then rage. Shoot it or escape beyond sight and distance to end rage.
5. The Broken Watchman and Water Barrels each restore health and grant up to two rounds once. Each reward escalates the hunt.
6. Reach your daughter in the center to win immediately.

Close contact has a short interruptible windup before a tackle and knife struggle.
The struggle needs eight fresh Space presses or STAB taps, with a brief input grace
before health drains at one full health bar per three active seconds. A successful
escape follows a collision-checked route into nearby walkable space. Both actors
share the gates, solid partitions and walkable geometry. Mandatory checkpoints remain
physical bottlenecks even when every corn gate is open.
The zombie remains incapacitated for exactly ten seconds after landing, then screams
once and resumes corridor pursuit or field hunting from observations. Extra shots cannot reset an
active gun stagger or the escape recovery timer. A shot outside recovery buys the
original 3 / 2.5 / 2 seconds, depending on checkpoint progress.

Fixed open passages return the player from the open cornfield to the same corridor
entrance. Their transition covers the full walkable opening at the glowing frame,
including diagonal approaches and recovery from inside the doorway recess. A blocked
destination keeps the player on the current side until a safe crossing is possible.
Going deeper triggers warnings and up to three additional field zombies.
Standing still can conceal the player without locking movement or deleting enemy
memory. Rustling can trigger a nearby rush, while distant input does not reveal
the player's position. The older dense-gate maze remains only in legacy fixtures.

The optional title-screen alias is normalized to 24 Unicode graphemes. Blank input
uses STRANGER. It stays in this session, survives quick retry, and can be edited through
TITLE / EDIT ALIAS in the pause menu. It is rendered as literal text and omitted from
game snapshots, AI state, storage and network requests. Sparse authored corn taunts
use only this name. QTE corruption text is presentation, separate from tactical warnings.

CC0 rigged hands use a 1K skin texture and a fitted grip around the textured service
pistol. The original knife has a narrower blade and shaped handle. Weapon motion,
slide recoil, near-wall lowering and gradual dirt remain presentation only; knife
progress follows the existing interaction clock. Reduced effects suppress idle
motion, blood rain and excessive tremor. Optional model failure retains the primitive
fallback. Use `?test=1&intro=off&lab=1&horror=off` and the Viewmodel scene for inspection.

## Lean implementation

- One runtime dependency: pinned Three.js. No application framework, bundler, backend or runtime networked services. Visual assets are served locally.
- A shared spacious corridor graph and separate open-field layout. Rendering, collision, visibility and pathfinding use the same active level data; the original 33 x 35 map remains for older fixtures.
- Fine-grid circle collision, bounded movement substeps and cached A* enemy routing through the same door geometry.
- One zombie state machine plus a small threat director. The primary pursuer receives a corridor-only route target while the player is in the main game. Field sight, sound, decaying memory and bounded searches guide hiding pursuit; unseen field coordinates never guide prediction.
- Instanced corn, a rigged zombie with a primitive fallback, authored landmarks, fog and a toggleable flashlight.
- Local CC0 creature vocals and recorded footsteps, with synthesized wind, rustling and impacts. Stereo direction and distance gain; optional audio-load failure retains synthesized fallback.
- A tiny allowlisted local static server. App resources are served locally after installation. No telemetry, accounts, cookies or persistence.

## Files

- `src/maze.js`: authored geometry, navigation and collision.
- `src/game.js`: deterministic state, ordered simulation and progression.
- `src/game-config.js`: gameplay tuning values.
- `src/combat.js`, `src/hiding.js`: shooting, contact, physical corn entry and local rustling.
- `src/corn-world.js`, `src/corn-view.js`: shared lane topology, collision, routing, door geometry and instanced rendering.
- `src/corn-layout.js`, `src/corn-survival.js`: pooled corridor footprints, protected recycling, committed entry, hidden qualification and original-gate return.
- `src/corn-survival-view.js`: fixed-capacity dynamic corn instances driven by the run's geometry revision.
- `src/corridor-layout.js`, `src/corridor-run.js`, `src/corridor-view.js`: current main-game layout, qualification, field trips and world presentation.
- `src/hands.js`, `src/viewmodel-pose.js`: optional pistol/rigged-hand loading, fit settings, recoil and bounded presentation motion.
- `src/horror-presentation.js`: derived QTE/taunt presentation.
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
- `tests/corridor-field-browser.mjs`: current desktop/touch door, open-field, QTE, return and qualification scenarios.
- `tests/player-upgrade-browser.mjs`: real pistol/arms, firing, QTE and failed optional-asset fallback.
- `tests/upgrade-browser.mjs`: matched presentation/performance, intro and lifecycle checks.
- `tests/hands-corn-browser.mjs`: retained name/QTE and inherited corn-layout scenarios.
- `tests/corn-survival.test.mjs`, `tests/corn-survival-browser.mjs`: dynamic-maze simulation checks and the prepared desktop/touch entry, QTE and return browser story.
- `tests/hands-corn-performance.mjs`: pending matched comparison against the saved pre-update source.
- Older `browser.mjs`, `mobile-browser.mjs` and `horror-browser.mjs` are historical harnesses for the superseded pocket mechanic; the npm browser commands use the current harness.
- `scripts/build.mjs`, `scripts/preview-dist.mjs`: allowlisted static packaging and project-path preview.
- `scripts/build-player-viewmodel.py`: reproducible Blender export of the selected CC0 assets; source hashes live in `assets/field/player-viewmodel-source.json`.
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

The current scene uses spacious timber corridors, fixed side doors and dense corn
in a separate open field. Shared field assets remain instanced and distance-culled.
Existing wood textures are reused for panels, braces and door details. The pistol
and rigged-arm GLBs total about 2.9 MB and replace the older posed-hand asset in
the runtime package.

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
960-triangle sphere with no shadows or additional world lights. The same JPEG
is reused for inexpensive puddle reflections, with no extra scene render pass.
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
to the head and obey depth testing. An optional clip bank adds Pixelhouse Fury and
Collapse from the original archive, blended through the existing rig. It requires
no animation library or ragdoll solver. Denys, Mixamo and Quaternius clips were not
integrated. See `zombie-clips.json` for source hashes and `UPGRADE.md` for export steps.
The two local vocals are artisticdude's CC0 Zombies Sound Pack selections, with
source filenames and hashes in `assets/audio/sources.json`.

## Mud, rain and puddles

The existing 1K Brown Mud maps now use a darker wet material. Shallow puddles blend into the ground and catch existing lights. Walking through water creates expanding ripples, a short gravity-driven droplet splash and one synchronized wet footstep. Nearby raindrop rings are sampled cheaply; water does not flow or change gameplay movement/hearing.

Rain is one camera-local batch: 300 streaks on touch devices and 800 on desktop. Ripple/drop pools are capped at 12/24 on touch and 24/48 on desktop. The entire weather renderer uses at most four additional batches and two small generated textures. Reduced effects cap rain at 100 streaks and disable lightning/splash droplets. Storms use active gameplay time, pause with the game and reset on retry. QTE, the red-sky cue and critical scares take priority over thunder and lightning.

Four local CC0 recordings add 699,480 bytes: Ylmir's loopable rain and rubberduck's thunder and splash effects. They load after the audio-unlock gesture with bounded failure handling. Provenance, exact hashes and licenses are in `assets/audio/weather-sources.json` and `assets/audio/LICENSES.md`. Missing sound files preserve play and visual effects.

Gameplay and the cinematic share twelve recorded CC0 footsteps by Fantozzi, adding 58,757 bytes. Dirt/corn uses soft steps, wet mud layers existing splash recordings, and the cinematic roadside uses hard-surface contacts. Nearby zombies use heavier spatial steps. Cinematic footsteps follow the same movement phase as the cast's legs and stop on pause, stillness and skips. Files and licenses are in `assets/audio/footsteps/sources.json`; no runtime audio service is required. Verify with `node --test tests/footsteps.test.mjs tests/prologue-motion.test.mjs tests/prologue-audio.test.mjs` and `node tests/footsteps-browser.mjs` against the packaged local preview.

Use `?weather=off` for the dry baseline or immediate weather rollback. The regular shared link still detects desktop/touch controls automatically.

## Pacing and remaining human acceptance

The updated target is a 4-7-minute unfamiliar first run. The authored corridor route is about 517 meters; opening corn loops can shorten sections while preserving both checkpoints. Skilled known-route runs can be shorter. **First-play duration, fear, fairness and sensory comfort require human playtesting.** No waiting period pads the route.

Next human playtest: use three unfamiliar players without coaching after the entrance tutorial. Record completion time, shots, checkpoint timing, damage, hiding comprehension, fear and fairness ratings. Check that light recoil communicates the coming rage, hiding feels fair, and rewards never cause unavoidable damage. Tune behavior and sound before expanding art or map scope.

Saving, multiplayer and generated mazes remain future work. Browser emulation,
provider deployment and physical-phone acceptance remain separate verification steps.

## Reversibility

Stop the exact preview process with Ctrl+C. Generated `dist/` and local `output/` are disposable build and verification artifacts. Source snapshots were captured outside the served root before the refactor and mobile update. After the first GitHub release, redeploy a known-good commit to roll back the hosted game.
