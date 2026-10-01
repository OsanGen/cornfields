import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, writeFile, rm, symlink, readdir} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build, collectRuntimeFiles, moduleImports, resolveModule, runtimeAssets, versionRuntimeFiles} from '../scripts/build.mjs';
import {normalizeBasePath, resolvePreviewFile} from '../scripts/preview-dist.mjs';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cornfield-package-'));
  t.after(() => rm(root, {recursive:true, force:true}));
  const files = {
    'index.html':'<link rel="stylesheet" href="./src/style.css"><script type="importmap">{"imports":{"three":"./node_modules/three/build/three.module.js","three/addons/":"./node_modules/three/examples/jsm/"}}</script><script type="module" src="./src/main.js"></script>',
    'src/main.js':"import * as THREE from 'three';\nimport {load} from 'three/addons/loaders/Loader.js';\nimport './input.js';",
    'src/input.js':'export const input = {};',
    'src/style.css':'body { margin: 0; }',
    'node_modules/three/build/three.module.js':"export {value} from './three.core.js';",
    'node_modules/three/build/three.core.js':'export const value = 1;',
    'node_modules/three/examples/jsm/loaders/Loader.js':"import {helper} from '../utils/Helper.js';\nexport const load = helper;",
    'node_modules/three/examples/jsm/utils/Helper.js':"import {value} from 'three';\nexport const helper = value;",
    'node_modules/three/LICENSE':'Three.js fixture license',
    'node_modules/three/examples/jsm/unused.js':'unused',
    'src/unused.js':'unused',
    'src/._main.js':'metadata',
    'art/private.txt':'not a runtime asset',
    'tests/private.txt':'not a runtime asset',
    'dist/stale.txt':'old build',
    ...Object.fromEntries(runtimeAssets.map(file => [file, 'asset fixture'])),
  };
  for (const [file, contents] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, file)), {recursive:true});
    await writeFile(path.join(root, file), contents);
  }
  return root;
}

test('package follows runtime and vendor imports, includes credits, and replaces stale output', async t => {
  const root = await fixture(t);
  const result = await build(root);
  const files = result.files.map(file => file.startsWith(result.releasePath) ? file.slice(result.releasePath.length) : file);
  assert(files.includes('src/input.js'));
  assert(files.includes('vendor/three/build/three.core.js'));
  assert(files.includes('vendor/three/examples/jsm/utils/Helper.js'));
  assert(files.includes('vendor/three/LICENSE'));
  assert(files.includes('assets/field/LICENSES.md'));
  assert(files.includes('assets/audio/distress.wav'));
  assert(files.includes('assets/audio/scream.wav'));
  assert(files.includes('assets/audio/sources.json'));
  for(const file of ['rain.mp3','thunder.mp3','splash-1.mp3','splash-2.mp3','weather-sources.json','LICENSES.md']) {
    assert(files.includes(`assets/audio/${file}`));
  }
  assert(result.files.includes('.nojekyll'));
  assert(!result.files.some(file => /(?:node_modules|private|unused|stale|\._)/.test(file)));
  assert(!((await readdir(result.directory)).includes('stale.txt')));
  const html = await readFile(path.join(result.directory, 'index.html'), 'utf8');
  assert(html.includes(`./${result.releasePath}vendor/three/build/three.module.js`));
  assert(!html.includes('node_modules'));
});

test('package rejects source escapes and keeps an existing build on validation failure', async t => {
  const root = await fixture(t);
  await writeFile(path.join(root, 'src/main.js'), "import '../art/private.js';");
  await assert.rejects(build(root), /outside runtime allowlist/);
  assert.equal(await readFile(path.join(root, 'dist/stale.txt'), 'utf8'), 'old build');
});

test('preview resolves a project prefix and rejects traversal, hidden paths, and symlink escape', async t => {
  const root = await fixture(t);
  const {directory, releasePath} = await build(root);
  assert.equal(normalizeBasePath('/cornfields'), '/cornfields/');
  assert.throws(() => normalizeBasePath('/../'), /simple project path/);
  assert.equal(await resolvePreviewFile(directory, '/cornfields/?play=1', '/cornfields/'), path.join(directory, 'index.html'));
  assert.equal(await resolvePreviewFile(directory, `/cornfields/${releasePath}src/main.js`, '/cornfields/'), path.join(directory, releasePath, 'src/main.js'));
  await symlink(path.join(root, 'art/private.txt'), path.join(directory, 'outside.txt'));
  for (const url of ['/src/main.js', '/cornfields/%2e%2e/art/private.txt', '/cornfields/.secret', '/cornfields/src%5cmain.js', '/cornfields/outside.txt']) {
    await assert.rejects(resolvePreviewFile(directory, url, '/cornfields/'));
  }
});

test('actual runtime graph and HTML resolve entirely below a GitHub Pages project path', async () => {
  const files = await collectRuntimeFiles(projectRoot);
  const base = new URL('https://example.test/cornfields/');
  const html = files.get('index.html').toString();
  for (const match of html.matchAll(/\b(?:src|href)\s*=\s*['"](\.\/[^'"]+)['"]/g)) {
    const url = new URL(match[1], base);
    assert(url.pathname.startsWith(base.pathname));
    assert(files.has(url.pathname.slice(base.pathname.length)), `Missing HTML resource ${url}`);
  }
  for (const [file, contents] of files) {
    if (!file.endsWith('.js')) continue;
    const sourceFile = file.replace(/^vendor\/three\//, 'node_modules/three/');
    for (const specifier of moduleImports(contents.toString())) {
      const dependency = resolveModule(specifier, sourceFile).replace(/^node_modules\/three\//, 'vendor/three/');
      assert(files.has(dependency), `Missing dependency ${file}: ${specifier}`);
      assert(new URL(dependency, base).pathname.startsWith(base.pathname));
    }
  }
  for (const module of ['field-visuals', 'night-sky', 'zombie', 'prop-details', 'hands']) {
    const source = files.get(`src/${module}.js`).toString();
    assert(!/['"`]\/assets\//.test(source), `${module} still has a host-root asset URL`);
    assert(source.includes('import.meta.url'), `${module} must resolve assets beside its module`);
    for (const match of source.matchAll(/new URL\(['"`](\.\.\/assets\/field\/[^'"`]*)['"`],\s*import\.meta\.url\)/g)) {
      if (match[1].includes('${') || match[1].endsWith('/')) continue;
      const url = new URL(match[1], new URL(`src/${module}.js`, base));
      assert(files.has(url.pathname.slice(base.pathname.length)), `Missing module asset ${url}`);
    }
  }
  for(const module of ['EffectComposer','RenderPass','ShaderPass','OutputPass'])assert(files.has(`vendor/three/examples/jsm/postprocessing/${module}.js`));
  assert(!files.has('vendor/three/examples/jsm/postprocessing/GlitchPass.js'));
  assert(files.has('assets/fonts/barlow-condensed.ttf'));
  assert(files.has('assets/fonts/rubik-glitch.ttf'));
});

test('module closure recognizes multiline imports, reexports, side effects and lazy imports', () => {
  assert.deepEqual(moduleImports("import {\n thing\n} from './one.js';\nexport {thing} from './two.js';\nimport './three.js';\nconst later = import('./four.js');"), ['./one.js', './two.js', './three.js', './four.js']);
});

test('release URLs invalidate a cached entrypoint when a nested module changes', async t => {
  const root = await fixture(t);
  const entry = html => html.match(/type="module" src="([^"]+)"/)[1];
  const first = await build(root);
  const oldEntry = entry(await readFile(path.join(first.directory, 'index.html'), 'utf8'));
  // A nested change must invalidate the graph even when main.js is unchanged.
  await writeFile(path.join(root, 'src/input.js'), 'export const input = {intro: true};');
  const second = await build(root);
  const newEntry = entry(await readFile(path.join(second.directory, 'index.html'), 'utf8'));
  assert.notEqual(newEntry, oldEntry, 'A new page must not reuse its cached module graph');
  const base = new URL('https://example.test/cornfields/');
  const oldChild = new URL('./input.js', new URL(oldEntry, base));
  const newChild = new URL('./input.js', new URL(newEntry, base));
  assert.notEqual(newChild.href, oldChild.href, 'Nested modules also need a fresh URL');
  assert.equal(await readFile(path.join(second.directory, newChild.pathname.slice(base.pathname.length)), 'utf8'),
    'export const input = {intro: true};');
});

test('release identity is stable, changes with assets, and preserves relative runtime URLs', async t => {
  const root = await fixture(t);
  const runtime = await collectRuntimeFiles(root);
  const first = versionRuntimeFiles(runtime);
  assert.equal(versionRuntimeFiles(new Map([...runtime].reverse())).releasePath, first.releasePath);
  const changed = new Map(runtime);
  changed.set('assets/audio/rain.mp3', Buffer.from('updated rain'));
  assert.notEqual(versionRuntimeFiles(changed).releasePath, first.releasePath);

  for (const prefix of ['/', '/cornfields/']) {
    const base = new URL(`https://example.test${prefix}`);
    const html = first.files.get('index.html').toString();
    const imports = JSON.parse(html.match(/<script type="importmap">([^<]+)<\/script>/)[1]).imports;
    for (const match of html.matchAll(/\b(?:src|href)="(\.\/[^"]+)"/g)) {
      assert(first.files.has(new URL(match[1], base).pathname.slice(prefix.length)));
    }
    for (const [file, contents] of first.files) {
      if (!file.endsWith('.js')) continue;
      const importer = new URL(file, base);
      for (const specifier of moduleImports(contents.toString())) {
        const mapped = imports[specifier] || (specifier.startsWith('three/addons/')
          ? imports['three/addons/'] + specifier.slice('three/addons/'.length) : null);
        const url = new URL(mapped || specifier, mapped ? base : importer);
        assert(first.files.has(url.pathname.slice(prefix.length)), `Missing versioned dependency ${url}`);
      }
    }
    for (const [relative, importer] of [
      ['../assets/audio/rain.mp3', 'src/audio.js'],
      ['../assets/field/player-arms.glb', 'src/hands.js'],
      ['../assets/field/service-pistol.glb', 'src/hands.js'],
      ['../assets/fonts/rubik-glitch.ttf', 'src/style.css'],
    ]) {
      const url = new URL(relative, new URL(first.releasePath + importer, base));
      assert(first.files.has(url.pathname.slice(prefix.length)), `Missing versioned asset ${url}`);
    }
  }
});
