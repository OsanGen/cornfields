# GitHub Pages playtest

The approved target is the public repository `OsanGen/cornfields`, with the expected project URL `https://osangen.github.io/cornfields/`. Confirm the actual URL from the successful GitHub Pages deployment. The user authorized repository creation, the first push and publication on September 29, 2026.

## Prepare

1. Run `npm ci`, `npm test`, `npm run check`, then `npm run build` with Node.js 22.
2. Run `CORNFIELD_BASE_PATH=/cornfields/ npm run preview` and test `http://127.0.0.1:4180/cornfields/`.
3. Run the desktop and mobile browser checks using an installed Playwright/browser. Mobile emulation is not physical-phone acceptance.
4. Review the source and asset list before the first commit. Include index.html, src/, assets/field/, scripts/, tests/, package files, public docs and .github/. Exclude editable art, local output, caches, node_modules, generated dist, backups and local work logs.

## Publish after target confirmation

Create the repository, push the reviewed commit, and configure Pages with GitHub Actions as its source. Run `.github/workflows/pages.yml` manually. Its build job installs the pinned lockfile, tests, checks syntax, builds the artifact, then uploads only dist/. Its deployment job uses the github-pages environment with pages:write and id-token:write permissions.

Wait for the deployment job to succeed and record its actual page_url, workflow run URL and commit SHA. Verify the public page, JS, textures and models return successfully under the repository prefix. Open the actual URL on a phone in landscape; verify moving/looking/firing together, hide/exit, pause/resume, rotation, audio, death/retry and completing a run. Record real-device performance separately from desktop emulation.

The workflow is manual: pushing source alone does not deploy. Future updates require a reviewed commit and an explicit workflow run.

## Rollback

Before each update record the current successful deployment commit. Revert the faulty update with a new commit and rerun the manual workflow, then verify the same public URL. For this first release, local source snapshots outside the served root preserve the pre-mobile game. Removing a deployment or making the site unavailable requires a separate decision; do not delete the repository to roll back code.

## Published files

dist/ is generated from the runtime module graph, the explicit asset list in scripts/build.mjs and the required Three.js modules. Three.js's license and asset credits are included. No Node server, account system or runtime API is needed. The hosting provider can maintain its own access logs.
