# Wooden corridors and optional open corn

This update supersedes the dedicated corn survival detour. The main game is a
network of wooden corridors with 3.13 m clearance, looping routes and protected,
unseen changes to authored section interiors. The hidden 180-second clock and
120 m movement requirement belong to the corridors. Field hiding pauses that
clock, while enemies, weather and ordinary gameplay time remain active.

Nine always-open side entrances connect to a reusable open-field space. Walking across
an open threshold changes location and rotates the local coordinates. Returning
crosses the same logical door into its preserved corridor position. The active
doorway and corridor layout remain fixed for the trip. This is a deliberate zone
transition, not a continuous geographical overworld. The field has no internal
collision walls or finite walk grid; a fixed foliage pool follows the player.

The corridor pursuer continually routes toward the player's corridor position,
including around corners, at 4.0 to 4.2 m/s. Walking is 3.8 m/s; Shift or the outer
edge of the phone joystick sprints at 4.8 m/s. Stagger, flashlight recoil and QTE
recovery retain priority. This route target is separate from sensory memory and
is cleared on field entry, so quiet field hiding remains evidence-based.

The original pursuer can follow its last corridor doorway clue by physically
approaching the open threshold. Three additional field-only creatures are pooled.
At 15 m, a cooldown-limited message directs the player back to the corridors.
At 25 m one extra is eligible; at 40 m up to three are eligible, at least eight
seconds apart, outside the five-meter field sight range and away from the return
door. Retreat stops spawning and releases sufficiently distant extras.

Each enemy receives its own perception and memory. Noise is delivered to all
eligible enemies before the shared batch is cleared. Shooting selects the nearest
valid target; only one enemy can own a QTE. Corridor throws reserve clear local
landing space rather than requiring a corn bay through a wooden wall. The existing
eight presses, ten-second recovery and three-second red sky remain unchanged.

After qualification, the daughter approach opens and safe unseen outer cross-links
can close into a connected return tree. No actor, active route, or visible opening
is covered. The end still requires reaching the daughter alive. Checkpoint rewards
remain one-time, tied to their stable landmarks.

## Code ownership

- `src/corridor-layout.js`: wide section geometry, fixed doors, protected recycling.
- `src/corridor-run.js`: corridor progress, field travel/pressure, enemy ownership.
- `src/corridor-view.js`: wooden boundaries and bounded open-field foliage.
- `src/hide-portals.js`: shared liquid/fractal border, neon label and reused CC0 mist.
- `src/zombie-ai.js`: corridor route target and ordinary field perception/search.
- Existing movement, combat, QTE, model, audio and input modules retain their roles.

`?test=1&survival=off` retains the legacy authored test layout. The previous dedicated
survival layout remains available only with `?test=1&layout=survival` for comparison.
Normal snapshots omit hidden progression; explicit test diagnostics expose it.

Entrance effects are limited to the nearest two on desktop and one on phones/low
quality. Low quality removes wisps and halves noise layers. Reduced effects freezes
motion. The return retains its red sky beacon. Main and daughter gates remain normal.
Crossing has a short latch and checks landing occupancy; rejected crossings cannot
credit movement. `node tests/pursuit-portals-browser.mjs` checks actual desktop/touch
movement, sprint, same-entrance return, clock pause, pursuit and reduced effects.

## Verification and release

The Pages workflow now runs deterministic tests, checks, build, desktop/touch browser
scenarios and the shared web-game client before publication. `publish=false` captures
verification artifacts without changing the live site; `publish=true` publishes only
after these gates pass. Browser tooling is pinned in isolated runner scratch and is
not a game dependency. CI follows the [official Playwright guidance](https://playwright.dev/docs/ci-intro).

Initial local focused checks passed. Exact full-suite, browser and deployment outcomes
belong to the Actions run and release receipt, not this pre-release source document.
Human first-play navigation, fear and physical-phone performance remain playtest checks.
The pre-update rollback commit is `72aab3c43db634b6b5fb1ed3297c622bf818f65f`.
