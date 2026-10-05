import{spawnSync}from'node:child_process';import{dirname,resolve}from'node:path';import{fileURLToPath}from'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),game=process.argv[2];if(!['cornfields','rainbow-knight'].includes(game))throw new Error('Expected game ID');
for(const [command,args]of [[process.execPath,['scripts/visual-check-stamp.mjs',root]],['npm',['run','build']],[process.execPath,['scripts/visual-check-stage.mjs',root,game]]]){const result=spawnSync(command,args,{cwd:root,stdio:'inherit'});if(result.status!==0)process.exit(result.status||1);}
