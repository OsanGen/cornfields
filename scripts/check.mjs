import {spawnSync} from 'node:child_process';
import {readdir, readFile} from 'node:fs/promises';

let count = 0;
async function checkDirectory(directory) {
  for (const entry of await readdir(directory, {withFileTypes: true})) {
    if (entry.name.startsWith('.')) continue;
    const file = directory + '/' + entry.name;
    if (entry.isDirectory()) await checkDirectory(file);
    else if (entry.isFile() && /\.(mjs|js)$/.test(entry.name)) {
      const result = spawnSync(process.execPath, ['--check', file], {encoding: 'utf8'});
      if (result.status !== 0) {
        console.error(result.stderr);
        process.exit(1);
      }
      count++;
    }
  }
}
for (const root of ['src', 'scripts', 'tests']) await checkDirectory(root);
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
if (pkg.dependencies.three !== lock.packages['node_modules/three'].version) {
  throw new Error('Dependency lock mismatch');
}
console.log('Syntax valid: ' + count + ' modules. Three.js dependency lock matches.');
