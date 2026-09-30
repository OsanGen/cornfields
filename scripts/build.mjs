import {mkdir, readFile, realpath, rm, writeFile, lstat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));

// Deliberate publication boundary: no art sources, scripts, tests, or local output.
export const runtimeAssets = [
  'cornfield-kit.glb', 'corn_color.png', 'corn_normal.png',
  'zombie.glb', 'zombie-color.jpg', 'zombie-normal.jpg', 'night-sky.jpg',
  'hands.glb', 'hands-source.json',
  'brown_mud_diff_1k.jpg', 'brown_mud_nor_gl_1k.jpg', 'brown_mud_rough_1k.jpg',
  'wood_planks_dirt_diff_1k.jpg', 'wood_planks_dirt_nor_gl_1k.jpg', 'wood_planks_dirt_rough_1k.jpg',
  'wood_planks_diff_1k.jpg', 'wood_planks_nor_gl_1k.jpg', 'wood_planks_rough_1k.jpg',
  'rusty_metal_02_diff_1k.jpg',
  'hessian_380_diff_1k.jpg', 'hessian_380_nor_gl_1k.jpg',
  'blue_metal_plate_diff_1k.jpg', 'blue_metal_plate_rough_1k.jpg',
  'LICENSES.md', 'sources.json', 'sky-source.json', 'zombie-source.json', 'prop-sources.json',
].map(name => `assets/field/${name}`).concat(['distress.wav','scream.wav','sources.json',
  'rain.mp3','thunder.mp3','splash-1.mp3','splash-2.mp3','weather-sources.json','LICENSES.md',
].map(name=>`assets/audio/${name}`)).concat([
  'barlow-condensed.ttf','rubik-glitch.ttf','barlowcondensed-OFL.txt','rubikglitch-OFL.txt','LICENSES.md','sources.json',
].map(name=>`assets/fonts/${name}`));

// The game's static ES-module imports, including multiline import/export lists.
export function moduleImports(source) {
  const imports = new Set();
  const statements = /(?:^|\n)\s*(?:import\s+(?:[^;'"`]*?\s+from\s+)?|export\s+[^;'"`]*?\s+from\s+)['"]([^'"]+)['"]/g;
  for (const match of source.matchAll(statements)) imports.add(match[1]);
  for (const match of source.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) imports.add(match[1]);
  return [...imports];
}

export function resolveModule(specifier, importer) {
  if (specifier === 'three') return 'node_modules/three/build/three.module.js';
  if (specifier.startsWith('three/addons/')) {
    return `node_modules/three/examples/jsm/${specifier.slice('three/addons/'.length)}`;
  }
  if (!specifier.startsWith('./') && !specifier.startsWith('../')) {
    throw new Error(`Unsupported runtime import: ${specifier}`);
  }
  return path.posix.normalize(path.posix.join(path.posix.dirname(importer), specifier));
}

function publicPath(file) {
  return file.replace(/^node_modules\/three\//, 'vendor/three/');
}

async function safeRead(root, file) {
  const absolute = path.resolve(root, file);
  if (!absolute.startsWith(root + path.sep) || await realpath(absolute) !== absolute) {
    throw new Error(`Runtime path escapes its source boundary: ${file}`);
  }
  if (!(await lstat(absolute)).isFile()) throw new Error(`Expected a runtime file: ${file}`);
  return readFile(absolute);
}

export async function collectRuntimeFiles(root = projectRoot) {
  root = await realpath(root);
  const files = new Map();
  const pending = ['src/main.js'];
  const visited = new Set();
  while (pending.length) {
    const file = pending.pop();
    if (visited.has(file)) continue;
    visited.add(file);
    if (!/^(?:src\/[\w-]+\.js|node_modules\/three\/(?:build|examples\/jsm)\/[\w./-]+\.js)$/.test(file)
      || file.split('/').includes('..')) throw new Error(`Module outside runtime allowlist: ${file}`);
    const contents = await safeRead(root, file);
    files.set(publicPath(file), contents);
    for (const specifier of moduleImports(contents.toString())) pending.push(resolveModule(specifier, file));
  }
  for (const file of ['src/style.css', ...runtimeAssets, 'node_modules/three/LICENSE']) {
    files.set(publicPath(file), await safeRead(root, file));
  }
  let html = (await safeRead(root, 'index.html')).toString();
  html = html.replaceAll('./node_modules/three/', './vendor/three/');
  if (/\b(?:src|href)\s*=\s*['"]\/(?!\/)/i.test(html) || /['"]\/node_modules\//.test(html)) {
    throw new Error('index.html must use project-relative runtime URLs');
  }
  if (!html.includes('./vendor/three/build/three.module.js') || !html.includes('./vendor/three/examples/jsm/')) {
    throw new Error('Missing portable Three.js import map');
  }
  files.set('index.html', Buffer.from(html));
  files.set('.nojekyll', Buffer.from(''));
  return files;
}

// A query on index.html does not invalidate cached ES-module dependencies.
// Keep the whole graph together so relative imports and asset URLs stay intact.
export function versionRuntimeFiles(files) {
  const hash = createHash('sha256');
  for (const [file, contents] of [...files].sort(([a], [b]) => a.localeCompare(b))) {
    hash.update(`${file}\0${contents.length}\0`).update(contents);
  }
  const releasePath = `releases/${hash.digest('hex').slice(0, 16)}/`;
  let html = files.get('index.html').toString();
  for (const directory of ['src', 'vendor', 'assets']) {
    html = html.replaceAll(`./${directory}/`, `./${releasePath}${directory}/`);
  }
  const versioned = new Map([['index.html', Buffer.from(html)], ['.nojekyll', Buffer.from('')]]);
  for (const [file, contents] of files) {
    if (file !== 'index.html' && file !== '.nojekyll') versioned.set(releasePath + file, contents);
  }
  return {files: versioned, releasePath};
}

export async function build(root = projectRoot) {
  root = await realpath(root);
  // Collect and validate everything before replacing the generated directory.
  const {files, releasePath} = versionRuntimeFiles(await collectRuntimeFiles(root));
  const dist = path.join(root, 'dist');
  const existing = await lstat(dist).catch(error => {
    if (error.code !== 'ENOENT') throw error;
    return null;
  });
  if (existing?.isSymbolicLink()) throw new Error('Refusing a symlinked dist directory');
  await rm(dist, {recursive: true, force: true});
  for (const [file, contents] of files) {
    const target = path.join(dist, file);
    await mkdir(path.dirname(target), {recursive: true});
    await writeFile(target, contents);
  }
  return {directory: dist, files: [...files.keys()].sort(), releasePath};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await build();
  console.log(`Built ${result.files.length} runtime files in dist/`);
}
