import assert from 'node:assert/strict';
import {readFile,readdir,lstat} from 'node:fs/promises';
import {resolve,relative} from 'node:path';
import {pathToFileURL} from 'node:url';
import {VISUAL_CHECK_RELEASE} from '../src/visual-check-build.js';

const root=resolve(new URL('..',import.meta.url).pathname),client=resolve(root,'dist/client');
const hosting=JSON.parse(await readFile(resolve(root,'.openai/hosting.json')));
const built=JSON.parse(await readFile(resolve(root,'dist/.openai/hosting.json')));
assert.deepEqual(built,hosting);
assert.equal(hosting.project_id,'appgprj_6ac027123b188191b34cb1475ffc1ab2');
assert.equal(hosting.r2,'CAPTURES');assert.equal(hosting.d1,null);assert.equal(hosting.static,undefined);
const config=JSON.parse(await readFile(resolve(root,'dist/server/wrangler.json')));
assert.equal(config.main,'index.js');assert.equal(config.assets.directory,'../client');
assert.equal(config.assets.binding,'ASSETS');assert.deepEqual(config.assets.run_worker_first,['/api/visual-check/*']);
const files=[];
async function walk(dir){for(const name of await readdir(dir)){const p=resolve(dir,name),s=await lstat(p);assert(!s.isSymbolicLink());if(s.isDirectory())await walk(p);else files.push(relative(client,p));}}
await walk(client);assert(files.length>=237);
assert(!files.some(p=>/(?:^|\/)(?:tests|scripts|worker|integration|deliverables|art|\.openai)(?:\/|$)/.test(p)));
const html=await readFile(resolve(client,'index.html'),'utf8');
const runtime=html.match(/\.\/(releases\/[a-f0-9]{16}\/)/)?.[1];assert(runtime,'content-addressed production import graph');
const stamped=await readFile(resolve(client,runtime,'src/visual-check-build.js'),'utf8');
assert(stamped.includes(VISUAL_CHECK_RELEASE));
const {default:worker}=await import(pathToFileURL(resolve(root,'dist/server/index.js')));
assert.equal(typeof worker.fetch,'function');
let assetRequests=0;
const env={CAPTURES:{},ASSETS:{
  async fetch(request){
    assetRequests++;
    const path=new URL(request.url).pathname;
    const file=resolve(client,path==='/'?'index.html':'.'+path);
    assert(file.startsWith(client+'/'));
    try{return new Response(await readFile(file));}
    catch{return new Response('Not found',{status:404});}
  },
}};
for(const path of ['/','/'+runtime+'src/main.js','/'+runtime+'assets/intro/cruiser.glb','/'+runtime+'vendor/three/build/three.module.js']){
  const response=await worker.fetch(new Request('https://test.invalid'+path),env);assert.equal(response.status,200,path);assert((await response.arrayBuffer()).byteLength>0);
}
assert.equal(assetRequests,4);
const response=await worker.fetch(new Request('https://test.invalid/api/visual-check/config'),env);
assert.equal(response.status,200);const api=await response.json();assert.equal(api.game,'cornfields');assert.equal(api.release,VISUAL_CHECK_RELEASE);assert.equal(assetRequests,4);
const rejected=await worker.fetch(new Request('https://test.invalid/api/visual-check/config',{headers:{origin:'https://other.invalid'}}),env);
assert.equal(rejected.status,403);
console.log(JSON.stringify({status:'passed',clientFiles:files.length,release:VISUAL_CHECK_RELEASE,staticResponses:assetRequests,workerFetch:true,scope:'Local packaging and routing contract; platform authentication, R2 and GPU remain unverified.'}));
