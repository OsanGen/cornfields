# GitHub Pages playtest

The public repository is [OsanGen/cornfields](https://github.com/OsanGen/cornfields). The live game is [osangen.github.io/cornfields](https://osangen.github.io/cornfields/). The user authorized repository creation, the first push and publication on September 29, 2026.

The first release deployed commit `26952a98f6990504b6883df9f2ae51a75b7ab8d0`. [GitHub Actions run 36649088718](https://github.com/OsanGen/cornfields/actions/runs/36649088718) passed both build and deployment. Public HTML, runtime modules and assets matched the local package. The hosted game passed a complete Chromium touch-emulation run, with all art ready and no application errors or failed requests. Physical-phone frame rate and comfort remain user playtest checks.

## Prepare

The October 1 progressive upgrade adds graphics tiers, foliage motion, animation blending, lifecycle and AI fixes, CC0 pistol/arms and environment detail. Local verification passed 263 tests, syntax/lock checks, a 109-file build, desktop/touch-emulated gameplay and intro checks. `UPGRADE.md` records the implementation, experiments and physical-device acceptance gaps.

The successful deployment verified before this publication is `b234a99e23c12e8034b5199e8294876a0ebf71e3`, [Actions run 36742247493](https://github.com/OsanGen/cornfields/actions/runs/36742247493), Pages deployment 6764333670. Keep it as the rollback baseline. The exact new deployed SHA, provider run and served-file verification belong in the release receipt after the workflow succeeds.

1. Run `npm ci`, `npm test`, `npm run check`, then `npm run build` with Node.js 22.
2. Run `CORNFIELD_BASE_PATH=/cornfields/ npm run preview` and test `http://127.0.0.1:4180/cornfields/`.
3. Run the desktop and mobile browser checks using an installed Playwright/browser. Mobile emulation is not physical-phone acceptance.
4. Review the source and asset list before the first commit. Include index.html, src/, assets/field/, assets/audio/, scripts/, tests/, package files, public docs and .github/. Exclude editable art, local output, caches, node_modules, generated dist, backups and local work logs.

The workflow runs `tests/corridor-field-browser.mjs` for desktop/touch door, field,
return, QTE and qualification behavior, then `npm run test:player:browser` for the
pistol/arms and optional-asset fallback. It also runs the shared game client through
real input and retains browser evidence. For matched presentation and lifecycle
checks, use `npm run test:upgrade` with the retained baseline package. Emulation
and fixed-view timings do not certify physical-device performance or subjective
animation/audio quality.

The Ubuntu 24.04 worker uses its preinstalled Google Chrome through the browser
runtime adapter and logs the browser version. Playwright stays isolated and pinned;
the workflow does not download another browser or install operating-system packages.
Captures wait for GPU completion and retain diagnostics if screenshot capture fails.

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
