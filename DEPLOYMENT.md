# GitHub Pages playtest

The public repository is [OsanGen/cornfields](https://github.com/OsanGen/cornfields). The live game is [osangen.github.io/cornfields](https://osangen.github.io/cornfields/). The user authorized repository creation, the first push and publication on September 29, 2026.

The first release deployed commit `26952a98f6990504b6883df9f2ae51a75b7ab8d0`. [GitHub Actions run 36649088718](https://github.com/OsanGen/cornfields/actions/runs/36649088718) passed both build and deployment. Public HTML, runtime modules and assets matched the local package. The hosted game passed a complete Chromium touch-emulation run, with all art ready and no application errors or failed requests. Physical-phone frame rate and comfort remain user playtest checks.

## Prepare

The September 30 release packages the current weather/puddles, hands/QTE/physical-corn and psychedelic-intro work together. Its local verification passed 201 tests, syntax/lock checks, a 93-file build, and desktop/touch-emulated intro-to-gameplay browser checks. `INTRO_UPDATE.md` and `HANDS_CORN_UPDATE.md` retain the separate manual acceptance gaps.

The previous successful deployment observed before this publication is `d70e4c2f9fe807ba39e3aea54ddb099b87ea7ff3`, [Actions run 36654059021](https://github.com/OsanGen/cornfields/actions/runs/36654059021). Keep it as the release rollback baseline. The exact new deployed SHA, provider run and served-file verification belong in the release receipt after the workflow succeeds.

1. Run `npm ci`, `npm test`, `npm run check`, then `npm run build` with Node.js 22.
2. Run `CORNFIELD_BASE_PATH=/cornfields/ npm run preview` and test `http://127.0.0.1:4180/cornfields/`.
3. Run the desktop and mobile browser checks using an installed Playwright/browser. Mobile emulation is not physical-phone acceptance.
4. Review the source and asset list before the first commit. Include index.html, src/, assets/field/, assets/audio/, scripts/, tests/, package files, public docs and .github/. Exclude editable art, local output, caches, node_modules, generated dist, backups and local work logs.

For the horror/QTE release, also run `node tests/horror-browser.mjs` against the
packaged preview. It walks to a real hide, provokes an encounter, taps STAB through
the actual input adapter, verifies the throw and recovery, checks the red sky,
then verifies failure and retry. `CORNFIELD_DESKTOP=1` runs the same scenario with
mouse capture and Space key presses. No test bypasses pointer-lock permission.
`node tests/horror-performance.mjs` compares fixed views to the current committed
HEAD using the same assets; run it before committing the candidate. Retain its
baseline SHA and method alongside the result. Emulation and fixed-view timings
do not certify physical-device performance or subjective animation/audio quality.

## Publish after target confirmation

Create the repository, push the reviewed commit, and configure Pages with GitHub Actions as its source. Run `.github/workflows/pages.yml` manually. Its build job installs the pinned lockfile, tests, checks syntax, builds the artifact, then uploads only dist/. Its deployment job uses the github-pages environment with pages:write and id-token:write permissions.

Wait for the deployment job to succeed and record its actual page_url, workflow run URL and commit SHA. Verify the public page, JS, textures and models return successfully under the repository prefix. Open the actual URL on a phone in landscape; verify moving/looking/firing together, hide/exit, pause/resume, rotation, audio, death/retry and completing a run. Record real-device performance separately from desktop emulation.

The workflow is manual: pushing source alone does not deploy. Future updates require a reviewed commit and an explicit workflow run.

## Rollback

Before each update record the current successful deployment commit. Revert the faulty update with a new commit and rerun the manual workflow, then verify the same public URL. For this first release, local source snapshots outside the served root preserve the pre-mobile game. Removing a deployment or making the site unavailable requires a separate decision; do not delete the repository to roll back code.

## Published files

dist/ is generated from the runtime module graph, the explicit asset list in scripts/build.mjs and the required Three.js modules. Three.js's license and asset credits are included. No Node server, account system or runtime API is needed. The hosting provider can maintain its own access logs.

The page loads its scripts, styles and assets from `releases/<content-hash>/`.
The hash covers the entire published runtime, so changing a nested module also
changes the entrypoint URL. This prevents a fresh page from reusing an older
cached intro or game module. Relative module, font and media URLs stay together
under the same release directory. Use a fresh `?release=<commit>` page link when
announcing a deployment to bypass a previously cached HTML page as well. On a
normal launch, click **BEGIN** to play the intro; `?intro=off` deliberately skips it.
