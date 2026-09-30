import path from 'node:path';
import {realpath,stat} from 'node:fs/promises';

export async function resolvePublicFile(root,request){
  let name=decodeURIComponent(request.split(/[?#]/,1)[0]);
  if(name==='/')name='/index.html';
  if(name.split('/').some(part=>part.startsWith('.'))||name.includes('\\'))throw new Error('Not found');
  const allowed=/^\/(index\.html|src\/[\w./-]+\.(js|css)|assets\/field\/[\w-]+\.(glb|jpg|png)|assets\/(field|audio)\/LICENSES\.md|assets\/audio\/(distress|scream)\.wav|assets\/audio\/(rain|thunder|splash-1|splash-2)\.mp3|assets\/fonts\/(barlow-condensed\.ttf|rubik-glitch\.ttf|barlowcondensed-OFL\.txt|rubikglitch-OFL\.txt|LICENSES\.md|sources\.json)|node_modules\/three\/(build|examples\/jsm)\/[\w./-]+\.js)$/;
  if(!allowed.test(name))throw new Error('Not found');
  const target=await realpath(path.resolve(root,'.'+name));
  const relative=path.relative(root,target).split(path.sep).join('/');
  if(relative.split('/').some(part=>part.startsWith('.'))||!allowed.test('/'+relative)||(await stat(target)).isFile()===false)throw new Error('Not found');
  return target;
}
