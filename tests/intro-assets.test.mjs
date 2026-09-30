import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {resolvePublicFile} from '../scripts/server-path.mjs';

test('local fonts match pinned provenance and the complete asset addition stays below 2 MB',async()=>{
  const root=path.resolve('assets/fonts'),manifest=JSON.parse(await readFile(path.join(root,'sources.json'),'utf8'));
  let total=0;
  for(const row of manifest){const data=await readFile(path.join(root,row.file));total+=data.length;
    assert.equal(createHash('sha256').update(data).digest('hex'),row.sha256);
    assert.match(row.source,/^https:\/\/raw\.githubusercontent\.com\/google\/fonts\/[a-f0-9]{40}\//);
    if(row.file.endsWith('.ttf'))assert.equal(data.readUInt32BE(0),0x00010000);
    else assert.match(data.toString(),/SIL OPEN FONT LICENSE Version 1.1/);
  }
  total+=(await stat(path.join(root,'LICENSES.md'))).size+(await stat(path.join(root,'sources.json'))).size;
  assert.ok(total<2000000);
});

test('source preview permits exact fonts and notices without exposing arbitrary files',async()=>{
  const root=process.cwd();
  for(const name of ['barlow-condensed.ttf','rubik-glitch.ttf','barlowcondensed-OFL.txt','rubikglitch-OFL.txt','LICENSES.md','sources.json'])assert.equal(await resolvePublicFile(root,`/assets/fonts/${name}`),path.join(root,'assets/fonts',name));
  for(const url of ['/assets/fonts/../../package.json','/assets/fonts/.secret','/assets/fonts/unknown.ttf','/assets/fonts/README.md','/assets/field/sources.json','/INTRO_UPDATE.md'])await assert.rejects(resolvePublicFile(root,url));
});
