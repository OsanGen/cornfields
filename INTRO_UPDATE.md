# Psychedelic intro

Implementation of the corrected September 29 intro handoff. Deployment status and the published commit are tracked by the GitHub Pages workflow; see DEPLOYMENT.md.

## Flow

The existing alias menu offers Begin, Skip, volume, mute and reduced effects. Begin plays a 20-second opening; Skip and Escape go to a quiet title. Enter the Field is a separate user gesture. Gameplay and weather ticks stay frozen until core readiness and successful desktop mouse capture, or touch entry. Backgrounding pauses the intro and requires Continue. Retries bypass it; explicit replay returns to the invoking menu or pause screen with the run intact.

`src/intro.js` owns the pure timeline and cue ledger. `src/intro-visuals.js` borrows the existing renderer, stages three corn layers and independent eyes, and owns its composer. HTML credits remain readable above the effects. Shared corn resources are never disposed by intro cleanup. Procedural corn and a direct-render fallback keep missing optional assets usable.

Audio preparation is separate from gameplay ambience. A dedicated intro group uses existing synthesis and the approved distress recording, with isolated cue IDs and cancellation. Local Barlow Condensed and Rubik Glitch fonts have pinned sources and OFL notices in `assets/fonts/`. Font preparation is bounded to two seconds in the background; a run keeps its selected fallback if the fonts are late.

## Controls and rollback

- `?intro=off` restores direct entry. `INTRO_ENABLED` in `src/intro.js` is the default feature flag.
- `?introfx=off` selects direct rendering without the composer.
- Reduced effects removes warping, RGB fringes and moving tunnel effects immediately without changing the clock.
- Existing third-party notices and static production credits remain accessible.
- The pre-intro versions of touched files are preserved locally under `output/intro/before/`. Restore only this update's changes if rollback is requested; preserve the earlier weather/hands work. For the hosted build, use the release rollback procedure in DEPLOYMENT.md.

## Verification

- `npm run test:intro`: deterministic timing, copy, pause, stale cues, skip, input quarantine, loading/capture failure, replay, cancellation, audio ownership.
- `npm run test:intro:browser`: desktop and touch entry, readable frames, reduced/fallback, QTE after entry, repeated cleanup, layout and performance assertions.
- `npm test`, `npm run check`, `npm run build`: existing regression, syntax and portable package checks.
- Browser runtime uses the already installed Playwright and Chrome through `CORNFIELD_PLAYWRIGHT_MODULE` and `CORNFIELD_BROWSER_EXECUTABLE`; no browser install is required.

Budgets: 25 intro draw calls, at most three postprocessing draws, under 2 MB of added delivered assets, p95 intro frame time at most 33.3 ms, and at most 10 percent matched gameplay p95 regression. Browser results identify viewport, sampling and hardware context; phone emulation is not physical-phone acceptance. Audio peak/comfort and temporal flash review require rendered/audible evidence, not only unit tests.

Verified locally: all 201 tests passed; syntax/lock checks passed for 74 modules; the static build contains 93 runtime files. The browser suite passed with no reported errors, including desktop mouse capture, touch entry, snapshots at all six shots, reduced/fallback, QTE/recovery after entry, and five replay cleanups. Deterministic tests also cover portrait guidance and disabled replay. Credit screenshots were inspected, including the full creator role line at 320 CSS pixels.

Measured in Chrome on this Mac at 1280x720, DPR 1, with 30 warm frames and 120 samples at fixed state: intro p95 16.7 ms, seven draw calls including two postprocessing draws; post-intro gameplay p95 16.8 ms versus 16.7 ms with intro disabled (ratio 1.006). No intro rendering remains active after entry. This is a small local sample, not physical-phone performance acceptance. See `output/intro/browser/report.json`.

Remaining acceptance: full-speed temporal/flash review and measured audio mix peak/comfort, physical-phone playtest, and the separately deferred hands/corn checks. A post-verification sample showed swap above the machine-policy gate again, so no additional browser/media workload was launched. The loopback preview on port 4180 was confirmed reachable by a lightweight HTTP check. These are local implementation results; provider deployment proof is recorded separately.
