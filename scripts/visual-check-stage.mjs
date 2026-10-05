import {readFile,writeFile,mkdir,rename,rm,cp,access}from'node:fs/promises';import{resolve}from'node:path';
const [raw,game]=process.argv.slice(2),root=resolve(raw||'.');
const projects={cornfields:'appgprj_6ac027123b188191b34cb1475ffc1ab2','rainbow-knight':'appgprj_6ac00ed8e2a48191bad1ec932be48224'};
if(!projects[game])throw new Error('Specify the existing cornfields or rainbow-knight Site.');
const manifest=JSON.parse(await readFile(resolve(root,'.openai/hosting.json'),'utf8'));if(manifest.project_id!==projects[game])throw new Error('Existing Site project ID mismatch; refusing replacement.');
const source=await readFile(resolve(root,'src/visual-check-build.js'),'utf8'),release=source.match(/VISUAL_CHECK_RELEASE='([a-f0-9]{24})'/)?.[1];if(!release)throw new Error('Stamp the exact merged source before building.');
await access(resolve(root,'dist/index.html'));try{await access(resolve(root,'dist/client'));throw new Error('Run the original clean frontend build before staging.');}catch(e){if(e.code!=='ENOENT')throw e;}
const holding=resolve(root,'.visual-check-frontend');await access(holding).then(()=>{throw new Error('Existing staging folder; inspect before proceeding.');},e=>{if(e.code!=='ENOENT')throw e;});
await rename(resolve(root,'dist'),holding);await mkdir(resolve(root,'dist/server'),{recursive:true});await rename(holding,resolve(root,'dist/client'));
const hosting={...manifest,d1:manifest.d1??null,r2:'CAPTURES'};delete hosting.static;await mkdir(resolve(root,'dist/.openai'),{recursive:true});await writeFile(resolve(root,'.openai/hosting.json'),JSON.stringify(hosting,null,2)+'\n');await writeFile(resolve(root,'dist/.openai/hosting.json'),JSON.stringify(hosting,null,2)+'\n');
await cp(resolve(root,'worker/visual-check-worker.js'),resolve(root,'dist/server/visual-check-worker.js'));
let limits={runs:32,runsPerDay:24,runsPerHour:8};try{limits={...limits,...JSON.parse(await readFile(resolve(root,'visual-check-limits.json'),'utf8'))};}catch(e){if(e.code!=='ENOENT')throw e;}
const config={game,release,ownerPrivate:true,limits};await writeFile(resolve(root,'dist/server/index.js'),`import {createVisualCheckAPI} from './visual-check-worker.js';\nconst api=createVisualCheckAPI(${JSON.stringify(config)});\nexport default {async fetch(request,env){const answer=await api(request,env);if(answer)return answer;return env.ASSETS?.fetch?env.ASSETS.fetch(request):new Response('Not found',{status:404});}};\n`);
await writeFile(resolve(root,'dist/server/wrangler.json'),JSON.stringify({main:'index.js',compatibility_date:'2026-10-02',assets:{directory:'../client',binding:'ASSETS',run_worker_first:['/api/visual-check/*']}}));
console.log(JSON.stringify({game,release,project_id:hosting.project_id,r2:hosting.r2,limits,maxImageBytes:limits.runs*12*6*1024*1024,warning:'Publish only after confirming this existing Site is still owner-private. No access settings are changed here.'}));
