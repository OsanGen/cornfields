# CORNFIELD

**[Play on your phone](https://osangen.github.io/cornfields/?controls=touch)** · [Play with keyboard and mouse](https://osangen.github.io/cornfields/?controls=mouse)

On a phone, turn to landscape and tap **ENTER THE FIELD**. The left joystick moves; drag the right side to look. Buttons control firing, the flashlight, interaction and pause.

For future changes, start with [ARCHITECTURE.md](ARCHITECTURE.md). It maps mechanics, input, UI, AI, visuals and audio to their files and verification commands.

A lean browser horror prototype for desktop and landscape phones. Find your daughter in the center of the corn maze while an unkillable stalker listens, searches and predicts your route. Two rounds buy time. Hiding only works if you enter unseen and stay completely still.

## Play locally

Local development requires Node.js 22 or later. Playing requires a browser with WebGL 2 and either touch or keyboard/mouse input.

```sh
npm ci
npm start
```

Open <http://127.0.0.1:4173>. Click **ENTER THE FIELD** to enable mouse look and sound. The preview binds only to loopback and closes after one hour; run `npm start` again if needed. Use `PORT=4174 npm start` if the default port is occupied.

| Control | Action |
| --- | --- |
| WASD / arrow keys | Move |
| Mouse | Look |
| Left click | Fire one scarce, nonlethal round |
| E | Open the door, enter corn, or leave corn |
| Esc | Pause and release the mouse |
| F | Toggle flashlight |
| Space, repeatedly while grabbed | Drive the knife forward and break free |
| M | Mute or unmute |

Movement always uses the fast speed; Shift is unnecessary. The pause menu includes volume, reduced motion, fullscreen and restart. Switching away pauses the simulation. Headphones are recommended. Death restarts at the entrance; checkpoints are one-time rewards, not saved respawn points.

## Phone controls

On a phone, turn to landscape and tap ENTER THE FIELD to start sound and play. The left joystick moves; drag the right side to look. FIRE spends one round per tap. LIGHT toggles the flashlight. The contextual button opens the door, enters corn or exits. The top-right pause button opens settings and restart. Fullscreen is optional and appears only when supported.

When grabbed, repeatedly tap the contextual **STAB** button. Eight fresh taps free you;
holding it does not count. Existing health drains during the struggle. After a successful
eye stab, you land in nearby corn with free movement and a ten-second escape window.
Its final scream briefly turns the sky red. No health is restored by escaping.

Rotation to portrait or switching away pauses the game and clears held controls. Return to landscape and tap CONTINUE. Action buttons never count as looking. Genuine joystick movement and looking still reveal a hiding player. Touch mode caps rendering pixel ratio at 1.

Input mode normally follows the browser's primary pointer. Use `?controls=touch` or `?controls=mouse` to override it on hybrid devices or during verification. Physical-phone frame rate, browser interruptions and comfort still need a phone playtest.

## Static build and GitHub Pages

```sh
npm run build
CORNFIELD_BASE_PATH=/cornfields/ npm run preview
```

Open <http://127.0.0.1:4180/cornfields/> to check the packaged game beneath a project URL. `dist/` contains only runtime modules, pinned Three.js modules, assets and credits. The source preview and packaged build work without a root-domain URL or external CDN.

The manual `Publish playtest to GitHub Pages` workflow installs locked dependencies, runs checks, builds and deploys `dist/`. See [DEPLOYMENT.md](DEPLOYMENT.md) for setup, verification and rollback. A loopback preview cannot be opened from a separate phone; use the published HTTPS URL after deployment.

## Implemented loop

1. Enter the field with 100 health and two rounds.
2. Follow landmarks; choose movement, flashlight, hiding or a shot to survive.
3. A successful hit staggers the zombie. A miss spends the round. It cannot die.
4. The flashlight makes it recoil, then rage. Shoot it or escape beyond sight and distance to end rage.
5. The Broken Watchman and Water Barrels each restore health and grant up to two rounds once. Each reward escalates the hunt.
6. Reach your daughter in the center to win immediately.

Close contact has a short interruptible windup before a tackle and knife struggle.
The struggle needs eight fresh Space presses or STAB taps, with a brief input grace
before health drains at one full health bar per three active seconds. A successful
escape follows a collision-checked route into a nearby shallow corn bay. Both actors
can walk into and out of these bays; they do not connect otherwise separated corridors.
The zombie remains incapacitated for exactly ten seconds after landing, then screams
once and resumes hunting from legitimate observations. Extra shots cannot reset an
active gun stagger or the escape recovery timer. A shot outside recovery buys the
original 3 / 2.5 / 2 seconds, depending on checkpoint progress.

Six marked openings still offer voluntary hiding. While hidden, movement, deliberate
looking, shooting or toggling the light discloses the pocket. A detected hide causes
a visible rush and the same tackle. E allows an exit attempt before the struggle.

## Lean implementation

- One runtime dependency: pinned Three.js. No application framework, bundler, backend or runtime networked services. Visual assets are served locally.
- One explicit 33 x 35 grid, 370 navigable cells. Rendering, collision, visibility and pathfinding share the same authored level.
- Grid-based circle collision, bounded movement substeps and breadth-first enemy routing.
- One explicit evidence-based zombie state machine plus a small threat director. Perception, decaying memory, seeded prediction and bounded searches drive navigation; unseen hidden coordinates do not guide prediction.
- Instanced corn, a rigged zombie with a primitive fallback, authored landmarks, fog and a toggleable flashlight.
- Local CC0 creature vocal recordings with original synthesized wind, rustling, footsteps and impacts. Stereo direction and distance gain; optional audio-load failure retains synthesized fallback.
- A tiny allowlisted local static server. App resources are served locally after installation. No telemetry, accounts, cookies or persistence.

## Files

- `src/maze.js`: authored geometry, navigation and collision.
- `src/game.js`: deterministic state, ordered simulation and progression.
- `src/game-config.js`: gameplay tuning values.
- `src/combat.js`, `src/hiding.js`: shooting, damage and authored corn pockets.
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
- `tests/browser.mjs`: real-browser interaction and full-loop verification.
- `tests/mobile-browser.mjs`: Chromium touch emulation, multi-touch, rotation, hiding and complete route checks.
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

The default scene uses wooden fencing on both sides of corridors, with six marked hiding openings and shallow walkable landing bays,
two strands of barbed wire and dense corn behind the boards. It reuses the
Blender-authored boards as instanced fence panels; wire/barbs use 264 triangles
per panel, with a free photographed rust material. There are no green backing
boxes in this mode. The authored maze route remains unchanged; bounded corn bays extend collision and navigation only at their corridor entrances.

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
node tests/browser.mjs
```

The browser harness launches headed Chrome. The native window must be foreground for pointer lock. This machine rejected pointer lock in the separately launched automated window; foreground Chrome was checked through the desktop browser controls instead. See `output/survival-update-receipt.json` for exactly which checks ran.

Screenshots and the report are written to `output/survival-browser/`. Use `CORNFIELD_NATIVE_START=1` if macOS requires a genuine foreground click before the runner can obtain mouse capture. The shared Codex web-game client can also run with the runtime adapter using `node --import ./scripts/browser-runtime.mjs /path/to/web_game_playwright_client.js ...`.

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

## Pacing and remaining human acceptance

The updated target is a 4-7-minute unfamiliar first run. The shortest route to the daughter is about 517 meters, approximately 136 seconds at the single fast speed before stops and encounters. Skilled known-route runs can be shorter. **First-play duration, fear, fairness and sensory comfort require human playtesting.** No waiting period pads the route.

Next human playtest: use three unfamiliar players without coaching after the entrance tutorial. Record completion time, shots, checkpoint timing, damage, hiding comprehension, fear and fairness ratings. Check that light recoil communicates the coming rage, hiding feels fair, and rewards never cause unavoidable damage. Tune behavior and sound before expanding art or map scope.

Saving, multiplayer and generated mazes remain future work. Browser emulation,
provider deployment and physical-phone acceptance remain separate verification steps.

## Reversibility

Stop the exact preview process with Ctrl+C. Generated `dist/` and local `output/` are disposable build and verification artifacts. Source snapshots were captured outside the served root before the refactor and mobile update. After the first GitHub release, redeploy a known-good commit to roll back the hosted game.
