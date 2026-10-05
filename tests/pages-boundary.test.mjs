import test from 'node:test';
import assert from 'node:assert/strict';
import {collectRuntimeFiles, versionRuntimeFiles} from '../scripts/build.mjs';

test('GitHub Pages runtime never installs or includes the private visual-upload client', async () => {
  const files = await collectRuntimeFiles();
  assert(!files.get('src/main.js').toString().includes('installCornfieldsVisualCheck'));
  assert(![...files.keys()].some(file => file.includes('visual-check')));
  for (const [file, content] of files) {
    if (file.endsWith('.js')) assert(!content.toString().includes('/api/visual-check/'), `${file} reaches the private uploader`);
  }
});

test('GitHub Pages distribution excludes private hosting, verification records, and authoring sources', async () => {
  const {files} = versionRuntimeFiles(await collectRuntimeFiles());
  for (const file of files.keys()) {
    assert(!/(^|\/)(?:\.openai|worker|server|verification|output|art|tests|scripts)(\/|$)/.test(file), `Private or authoring input packaged: ${file}`);
    assert(!/\.blend$/.test(file));
  }
});
