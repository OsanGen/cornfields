# Hands, QTE and physical corn update

Implementation and local verification record. The additional browser and
performance checks were explicitly left pending by the user after the approved
five-minute verification window. Deployment status is tracked by the GitHub
Pages workflow; see DEPLOYMENT.md.

## What changed

- Original posed human hands replace the knife placeholders and appear on the
  normal gun. The two source meshes total 6,720 triangles, use one embedded 1K
  atlas and add 1,376,104 bytes. Checkpoint progress gradually increases dirt.
- Fresh Space presses or STAB taps advance a straight knife reach. Bounded
  tremor, brief pre-impact easing and recoil read the existing interaction clock.
  The blade targets an attachment inside the animated eye socket. Damage stops
  when success commits; recovery remains ten active seconds from landing.
- QTE red sky, bounded blood rain and up to four desktop/two phone DIE fragments
  have separate presentation ownership. Reduced effects suppress blood rain and
  reduce tremor/text. The later recovery sky retains its own three-second cue.
- The optional alias is session-only, literal text, limited to 24 graphemes, with
  STRANGER as the blank fallback. Retry retains it; the pause menu can return to
  the title to edit it. Only sparse fictional corn taunts use it.
- 631 gates replace the reachable corridor boundary modules; 29 outer-containment
  spans remain fixed. One action toggles one aimed gate from either side. Open
  gates persist. Closing stops on bodies. The zombie physically opens a gate on
  its route and steps back to give the leaf room.
- Corn now contains 5,224 walkable fine-grid nodes in 25 connected loop regions.
  Player/AI use the same physical partitions, gate leaves, collision and routing.
  Both checkpoints and the entrance remain bottlenecks with every gate open.
- Physical crossing owns corn entry/exit. There is no saved return transform,
  teleport exit or movement lock. Local rustling includes blocked movement and
  deliberate look, with a 12-meter bounded acoustic route and door attenuation.
  Passive presentation and distant input do not reveal the player globally.

## Observed proof

| Check | Observed result |
| --- | --- |
| Pre-update baseline | 176/176 tests passed |
| Updated deterministic suite | 180/180 passed, including actual movement through both checkpoints, QTE escapes and daughter victory |
| Final focused rig/UI checks | 19/19 passed after eye/hand presentation changes |
| Syntax and dependency lock | 67 modules passed in the bounded pass; subsequently added performance runner passed its individual syntax check |
| Static package | 77 runtime files built; loopback HTTP 200 |
| Door/world coverage | All 631 apertures tested for body/sight blocking and open traversal; all 25 physical components have cycles and return gates; progression cut tests pass |
| Desktop browser | Actual keyboard actions, name entry, gate entry and QTE/recovery passed earlier in the pass. Later recaptures failed at Chrome pointer lock; final desktop appearance was not recaptured |
| Final touch browser | 844x390 gameplay and 667x375 title layout passed; alias privacy, gate entry, fresh STAB taps, eye contact/recoil, landing, recovery, retry and portrait pause; zero browser errors |
| Shared game client | Ran unchanged through the existing Playwright adapter; screenshot/state inspected. This preceded the final close-light clamp |
| Rendered review | Final phone gun, clean grip, eye contact, recoil, nightmare and small title images inspected. Corrected title overlap, above-socket eyes and washed-out gun hand |
| Scope review | Prior weather simulation/audio and input/control selection hashes preserved; dependency lock unchanged; diff whitespace check clean |

Evidence is in `output/hands-corn/`: baseline and focused logs, `full-tests.log`,
`check.log`, `build.log`, `browser/report.json`, screenshots, the shared-client
capture, `source-review.json` and `FIX_RECEIPT.json`. Test aliases are synthetic.

## Coverage and remaining acceptance

N01-N20 are connected in the local implementation. This is not a claim that all
74 handoff cases or all 14 visual targets have individually passed.

- Pending by user choice: matched before/after performance measurement, final
  desktop recapture, and the remaining extended browser scenarios. The prepared
  performance runner enforces the 10% p95 comparison instead of reporting a
  breached budget as passing. No FPS or performance-improvement claim is made.
- Remaining rendered coverage: three grime stages, missing/slow hand-asset
  fallback, a complete browser objective run incorporating corn/QTE, QTE failure
  and pause at every phase, long repeated lifecycle runs, and broad traversal of
  the new corn loops. Deterministic coverage is not substituted for these views.
- Human acceptance remains open: hand realism, convincing grip/face-up struggle,
  corn depth/readability, fear, sound balance, sensory comfort and physical-phone
  performance. The hands are an original lean mesh, not a purchased photoreal rig.
- The prior E-triggered pocket mechanism was identified in the saved code and
  replaced. The exact location shown in the original user screenshot was not
  independently reproduced; no screenshot-only claim is used as proof.

## Ownership and rollback

`corn-world.js` owns topology and shared physical gates; `corn-view.js` reads it
into five instanced batches. `hiding.js` owns crossing/stillness/noise. `hands.js`
owns the optional mesh, grip transforms and dirt. `horror-presentation.js` derives
visual state without advancing gameplay. The weather simulation remains separate.

The current npm browser commands point to `tests/hands-corn-browser.mjs`.
Pocket-era browser scripts remain historical references. The matching pre-update
source snapshot is `/Volumes/Samsung USB/Cornfields-update-backups/2026-09-30-hands-corn-022319`.
Restore only this update's changed files from that snapshot and remove only its
new modules/assets if rollback is requested; retain the earlier weather work and
unrelated untracked files. Rebuild afterwards. For a published release, use the
previous successful deployment commit recorded in the release receipt and the
rollback procedure in DEPLOYMENT.md.
