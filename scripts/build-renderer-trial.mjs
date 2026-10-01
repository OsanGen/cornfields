import {readFile,mkdir,writeFile,realpath,stat} from 'node:fs/promises';
import path from 'node:path';
import {moduleImports,resolveModule} from './build.mjs';

const root=await realpath('.'),out=process.env.CORNFIELD_RENDERER_OUTPUT||'output/remaining-upgrade-2026-10-01/renderer-trial',pending=['src/renderer-trial.js'],seen=new Set();
while(pending.length){
  const file=pending.pop();if(seen.has(file))continue;seen.add(file);
  if(!/^(src\/renderer-trial\.js|node_modules\/three\/(build|examples\/jsm)\/[\w./-]+\.js)$/.test(file)||file.split('/').includes('..'))throw new Error('Unsupported trial import '+file);
  if(await realpath(file)!==path.join(root,file))throw new Error('Symlinked trial source');
  const bytes=await readFile(file),target=path.join(out,file.replace('node_modules/three/','vendor/three/'));
  await mkdir(path.dirname(target),{recursive:true});await writeFile(target,bytes);
  for(const specifier of moduleImports(bytes.toString()))pending.push(resolveModule(specifier,file));
}
const meshoptAvailable=(await Promise.all(['player-arms.glb','service-pistol.glb'].map(name=>stat(`output/remaining-upgrade-2026-10-01/meshopt-trial/${name}`).then(s=>s.isFile()).catch(()=>false)))).every(Boolean);
for(const type of meshoptAvailable?['field','meshopt']:['field'])for(const name of ['player-arms.glb','service-pistol.glb']){
  const source=type==='field'?`assets/field/${name}`:`output/remaining-upgrade-2026-10-01/meshopt-trial/${name}`;
  await mkdir(`${out}/assets/${type}`,{recursive:true});await writeFile(`${out}/assets/${type}/${name}`,await readFile(source));
}
await writeFile(`${out}/trial-assets.json`,JSON.stringify({meshoptAvailable}));
await writeFile(out+'/index.html',`<!doctype html><html lang="en"><meta charset="utf-8"><title>Cornfields renderer trial</title><link rel="icon" href="data:,"><style>body{background:#101b16;color:#dce6c7;font:16px sans-serif}output{display:block;margin:20px}canvas{max-width:100%}</style><script type="importmap">{"imports":{"three":"./vendor/three/build/three.module.js","three/tsl":"./vendor/three/build/three.tsl.js","three/webgpu":"./vendor/three/build/three.webgpu.js","three/addons/":"./vendor/three/examples/jsm/"}}</script><output>Preparing isolated trial…</output><canvas></canvas><script type="module" src="./src/renderer-trial.js"></script></html>`);
console.log(`Built isolated renderer trial: ${seen.size} modules. Production entrypoint unchanged.`);
