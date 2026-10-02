import path from 'node:path';
import {realpath,stat} from 'node:fs/promises';
import {runtimeAssets} from './build.mjs';

const assets=new Set(runtimeAssets.filter(file=>!file.endsWith('.json')||file==='assets/field/zombie-clips.json'||file==='assets/fonts/sources.json').map(file=>'/'+file));
const allowed=name=>assets.has(name)||/^\/(index\.html|src\/[\w./-]+\.(js|css)|node_modules\/three\/(build|examples\/jsm)\/[\w./-]+\.js)$/.test(name);

export async function resolvePublicFile(root,request){
  let name=decodeURIComponent(request.split(/[?#]/,1)[0]);
  if(name==='/')name='/index.html';
  if(name.split('/').some(part=>part.startsWith('.'))||name.includes('\\'))throw new Error('Not found');
  if(!allowed(name))throw new Error('Not found');
  const target=await realpath(path.resolve(root,'.'+name));
  const relative=path.relative(root,target).split(path.sep).join('/');
  if(relative.split('/').some(part=>part.startsWith('.'))||!allowed('/'+relative)||(await stat(target)).isFile()===false)throw new Error('Not found');
  return target;
}
