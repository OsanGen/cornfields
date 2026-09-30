import http from 'node:http';
import {readFile,realpath} from 'node:fs/promises';
import {resolvePublicFile} from './server-path.mjs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=await realpath(fileURLToPath(new URL('../',import.meta.url)));
const port=Number(process.env.PORT||4173);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.glb':'model/gltf-binary','.svg':'image/svg+xml','.ttf':'font/ttf','.txt':'text/plain; charset=utf-8','.md':'text/plain; charset=utf-8','.wav':'audio/wav','.mp3':'audio/mpeg'};
const server=http.createServer(async(req,res)=>{
  try{
    const target=await resolvePublicFile(root,req.url);
    res.writeHead(200,{'Content-Type':types[path.extname(target)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});res.end(await readFile(target));
  }catch{res.writeHead(404,{'Content-Type':'text/plain'});res.end('Not found');}
});
server.listen(port,'127.0.0.1',()=>console.log(`CORNFIELD local preview: http://127.0.0.1:${port}`));
server.on('error',e=>{console.error(e.message);process.exitCode=1;});
// A bounded preview process. Relaunch with npm start for another session.
const ttl=Number(process.env.CORNFIELD_SESSION_SECONDS||3600);
const timer=setTimeout(()=>{console.log('Preview session ended. Run npm start to reopen.');server.close();},Math.max(60,Math.min(ttl,14400))*1000);timer.unref();
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{clearTimeout(timer);server.close();});
