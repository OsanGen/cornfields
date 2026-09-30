# Dynamic survival maze: playtest release

Status: **partial gameplay acceptance; publication authorized**. Source and targeted
simulation checks are in place. The user requested publication for playtesting.
The existing [Pages workflow](https://github.com/OsanGen/cornfields/actions/workflows/pages.yml)
runs the full regression suite, checks and static build before deployment. Its
exact commit and successful deployment status are the publication evidence. Browser
story, visual acceptance and performance comparison remain separate pending checks.

## Scope and baseline

- Root: `/Volumes/Samsung USB/🚀FUN PROJECTS/Cornfields`
- Branch: `main`; baseline HEAD: `5841707df2889a18a1d13c735012d22ab34483b2`.
- Pre-existing untracked `.npmrc` and `verification.json` were preserved.
- Source requirement: `CORNFIELDS_DYNAMIC_THREE_MINUTE_SURVIVAL_MAZE_HANDOFF.md`.
- Implementation procedure: `evidence-fix`; release procedure: `observability-release`.
- Initial focused baseline: four existing gate/input/sound/restart tests passed.

## Implemented flow

The initial view now faces the dedicated gate south of the forecourt. The outer
gate opens with the existing E/action button, closes after a valid crossing, and
locks. The inner gate begins open and closes only after clearance. The active
clock starts once the inner gate has shut. A clear, unseen corn cap conceals the
vestibule without moving either actor.

Nine reusable section slots form three reconnecting branches. Fixed ports support
a short hub and a longer northern dogleg. A seeded selector changes unseen
interiors, preferring short layouts during a chase or critical health. Current
actor sections and neighbors, exposed wall faces, navigation/search targets,
observations, fresh sounds and QTE reservations protect geometry from recycling.
When no safe candidate exists, the current connected layout stays in place.

Eligibility requires 180 active simulation seconds and 120 meters of valid
locomotion inside the field. QTE and recovery contribute time. Camera motion,
blocked movement, scripted throw travel, menus and pause cannot manufacture
progress. Qualification has no HUD, audio, health, ammunition or checkpoint reward.

After eligibility, ordinary recycling stops. At a safe unseen opportunity, one
atomic revision changes two pieces: the vestibule connector opens and the northern
junction loses its two lateral connections. All nine sections remain connected
through the southern junction. This removes the section cycles and funnels ordinary
branch-following back through the center to the original entrance. Both left- and
right-turn policies terminate there in the graph test.

The same inner gate unlocks first. Clearing it unlocks the same outer gate.
Completion requires an alive crossing between the outer gateposts. It fires once
and enables the original onward door. The inherited Watchman, Barrels and daughter
progression then continues; the zombie is the same entity throughout. Completed
re-entry does not start another survival timer or award another reward.

The new active field contains no wood or additional door objects. The inherited
631 side gates remain in the larger route beyond this dedicated segment.
Visual proof of occlusion and the huge-field illusion is still required.

## Ownership and tuning

| Owner | Responsibility |
| --- | --- |
| `src/corn-layout.js` | Authored footprints, per-run arrays, protection rules, bounded selection, return topology |
| `src/corn-survival.js` | Entry/exit states, active clock, movement qualification, completion |
| `src/game-config.js` | 180 seconds and 120 meters, both proposed tuning defaults |
| `src/corn-world.js` | Shared physical gates and navigation; hard locks and actor-specific path radius |
| `src/zombie-ai.js` | Existing perception/brain; reachable field predictions and geometry revision invalidation |
| `src/corn-survival-view.js` | Four fixed instance batches, 836 slots each; matrix/count updates on geometry revision |
| `src/weather.js`, `src/weather-view.js` | Nine pooled field puddles, revised spatial lookup and instance matrices |
| `src/app.js`, `src/debug.js` | Restart, current-run routes and test-only segment diagnostics |

The pool uses nine mutable footprints plus two fixed entry/return pieces, within a
16-piece budget. It is an authored bounded layout, not a general infinite-world
framework. No assets, libraries or dependencies were added. The selector's default
seed is 394729 for reproducible local testing.

The selected return bound is **one atomic commit affecting two pieces**, after
visibility and reservations permit it. A separate deterministic check establishes
that every corridor cell in the all-short and all-long return layouts has a
physical shortest route to the inner gate taking less than 15 seconds at 3.8 m/s.
That does not prove a player exploring/backtracking will arrive within 15 seconds,
nor does it override a QTE, an occupied junction or visible geometry.

The longer variant exposed a pre-existing clearance mismatch: the zombie's body
radius is .24 m but navigation checked .25 m. Pathfinding now uses the moving
actor's radius. A tight-corner regression and the full-duration simulations cover
this fix. Prediction also has a legal current-position fallback when temporarily
disconnected; it never receives hidden live player coordinates from the generator.

## Proof obtained

| Check | Result |
| --- | --- |
| `node --test --test-concurrency=1 tests/corn-survival.test.mjs` | 19 passed before extending the final progression walkthrough |
| `node --test --test-name-pattern='valid physical return' tests/corn-survival.test.mjs` | Updated full gate-to-checkpoints-to-daughter walkthrough passed |
| `node --test --test-name-pattern='cannot bypass' tests/corn-survival.test.mjs` | New twentieth test passed: two unique entry gates and no checkpoint bypass |
| `node --test --test-concurrency=1 tests/weather.test.mjs` | 14 passed |
| `node --test --test-concurrency=1 tests/corn-world.test.mjs` | 13 passed after the radius/lock changes |
| Four 180-second simulations | Left circuit, right circuit, alternating and backtracking; real zombie and responsive QTE inputs; no movement teleporting |
| Post-eligibility graph traversal | Both turn policies, all nine starting sections, four headings, both variants reach the original entry |
| Continued movement after qualification | All four full-duration circuits also obtain the protected return commit |
| Real application retry | Clears dynamic geometry, locks, clock, qualification, evidence, interaction and weather |
| Runtime browser harness | Prepared at `tests/corn-survival-browser.mjs`; not run |

The earlier clearance crash was reproduced at a position occupiable with .24 m
but not .25 m clearance and corrected. The return tests also caught stale inactive
search queues unnecessarily pinning the junction; only active searches now reserve
their queued cells. These are fixed findings, not pending failures.

See `output/corn-survival/acceptance.json` for T01-T78 status. Unexercised claims are
marked `not_run`, including visual cases. Human targets V01-V12 are all `not_run`.
There is no current FPS, frame-time, memory-trend or physical-phone acceptance claim.

| Decisions | Current coverage |
| --- | --- |
| M01-M02 | Field geometry and wood-free interior authored; perceived scale/occlusion need browser and human acceptance |
| M03-M05 | Same-entry-only exit and locked two-gate commitment tested |
| M06-M07 | Bounded seeded reuse and threat-sensitive short/dogleg selection implemented and tested |
| M08 | Four duration circuits obtain eligibility/return; both final turn policies terminate; natural discovery still needs playtesting |
| M09-M10 | Hidden time/movement qualification and no reward tested; normal segment diagnostics excluded |
| M11-M12 | Single real pursuer, shared physical graph, radius fix and evidence-limited predictions tested |
| M13 | Existing systems retained; selected regressions pass, full suite/browser regression pending |
| M14-M15 | Physical original-gate return, reverse unlocking and continued daughter progression tested |
| M16 | One protected atomic commit changes two pieces; unsafe visible/occupied changes defer, never force a teleport |

## Remaining verification and resource gate

The first read-only audit was admitted after memory/swap sampling. Later readings
were 34% free memory and 9859.44 MiB swap. The Mac A policy requires at least 35%
free memory and swap below 9.5 GiB. Internal free space was 38,143,076 KB; external
scratch free space was 164,908,320 KB. The task's existing external `output/` folder
is a non-symlink directory with mode 0700 on the Samsung volume.

A five-minute sequential verification exception was requested and remains pending.
No build, browser automation, extra fanout or persistent preview was started after
that gate failed. Lightweight edits and narrow deterministic checks continued.

Release verification uses the existing GitHub Actions workflow, as explicitly
authorized by the subsequent request to push the update live. Local heavy work
still requires resource admission or an exception.

For remaining local acceptance after resource admission:

1. Run `node --test --test-concurrency=1 tests/*.test.mjs`, `npm run check`, then
   `npm run build`, sequentially with bounded output and duration.
2. Verify the existing preview's listener and build identity. Start a bounded
   loopback preview only if needed. Do not confuse HTTP reachability with play proof.
3. Run `node tests/corn-survival-browser.mjs`; inspect desktop and touch screenshots.
   This uses real gate controls plus an explicit eligibility fixture and a QTE
   setup fixture. It does not replace the full-duration simulation tests.
4. Run the inherited intro and hands/QTE browser regressions. The latter uses the
   test-only legacy layout; it does not prove the new segment.
5. Measure matched baseline/update routes and collect human visual acceptance,
   particularly corridor readability, invisible recycling, entry rediscovery and
   the feeling of scale. Physical phone testing remains separate from emulation.

## Rollback and safety

Local verification can select `?test=1&survival=off` to use the inherited layout.
Normal URLs enable the new source behavior. Keep this test-only rollback until the
new slice passes browser acceptance; it is not a new player-facing mode.

Only the listed source, tests and documentation belong to this update. Preserve
the pre-existing untracked files when reverting this patch. No asset download or
dependency change is needed. The pre-release rollback baseline is
`5841707df2889a18a1d13c735012d22ab34483b2`. A rollback uses a new revert commit
and the manual Pages workflow.
