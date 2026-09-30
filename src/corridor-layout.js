// Fixed sockets, wide authored interiors, and permanent doors. Runtime changes
// replace only occluded, unoccupied sections; logical entry points never move.
import {cornSight} from './corn-world.js';
const SIZE=24, X=12, Z=9, dirs=[[0,-1],[1,0],[0,1],[-1,0]];
const pair=(a,b)=>a<b?`${a}:${b}`:`${b}:${a}`;
const pt=(w,x,z)=>({x:x*w.size,z:z*w.size});
function rect(w,x,z,dx,dz){for(let j=z;j<z+dz;j++)for(let i=x;i<x+dx;i++)if(i>=0&&j>=0&&i<w.width&&j<w.height){w.walk[j*w.width+i]=1;w.owner[j*w.width+i]=0;}}
function stroke(w,s,a,b){
  let [x,z]=a;
  for(;;){for(let j=z-2;j<z+2;j++)for(let i=x-2;i<x+2;i++)if(i>=0&&j>=0&&i<SIZE&&j<SIZE)rect(w,s.x+i,s.z+j,1,1);
    if(x===b[0]&&z===b[1])break;x+=Math.sign(b[0]-x);z+=Math.sign(b[1]-z);}
}
export function paintCorridor(w,s,variant){
  for(let z=s.z;z<s.z+SIZE;z++)w.walk.fill(0,z*w.width+s.x,z*w.width+s.x+SIZE);
  const hub=[12,12];
  for(const d of s.ports){
    const end=[[12,0],[23,12],[12,23],[0,12]][d];
    if(variant&&d===1){stroke(w,s,hub,[12,17]);stroke(w,s,[12,17],[20,17]);stroke(w,s,[20,17],[20,12]);stroke(w,s,[20,12],end);}
    else stroke(w,s,hub,end);
  }
  // A permanent recess branches from the north/south spine in every section.
  stroke(w,s,hub,[12,6]);stroke(w,s,[12,6],[16,6]);
  rect(w,s.x+15,s.z+2,2,3);
  s.variant=variant;s.anchor=pt(w,s.x+12,s.z+12);
}
function gate(w,id,x,z,width,extra={}){
  const door={id,index:w.doors.length,...pt(w,x,z),width,normal:{x:0,z:1},tangent:{x:-1,z:0},
    hinge:pt(w,x+width/w.size/2,z),stage:0,cornSide:{x:0,z:-1},entryYaw:Math.PI,walkable:true,...extra};
  door.pocket={x:door.x,z:door.z-1.2};door.corridorCell={x:Math.floor(door.x/(w.size*3)),z:Math.floor((door.z+1)/(w.size*3))};
  w.doors.push(door);
  const left=Math.round(x-width/w.size/2),right=Math.round(x+width/w.size/2);
  for(let i=left;i<right;i++)w.edgeDoors.set(pair((z-1)*w.width+i,z*w.width+i),door.index);
  for(let j=z-4;j<=z+4;j++)for(let i=Math.floor(x)-5;i<=x+5;i++){
    const n=j*w.width+i;if(!w.doorBuckets.has(n))w.doorBuckets.set(n,[]);w.doorBuckets.get(n).push(door.index);
  }
  return door;
}
export function installCorridorLayout(maze){
  const prior=maze.cornWorld,total=prior.width*prior.height;
  const w={width:prior.width,height:prior.height,size:prior.size,walk:new Uint8Array(total),corn:new Uint8Array(total),
    owner:new Int16Array(total).fill(-1),edges:new Set(),edgeDoors:new Map(),segments:[],buckets:new Map(),doors:[],doorBuckets:new Map(),exclusions:[],revision:0};
  const sections=[];
  for(let row=0;row<3;row++)for(let col=0;col<3;col++){
    const s={slot:row*3+col,x:X+col*SIZE,z:Z+row*SIZE,ports:[]};
    for(let d=0;d<4;d++){const [dx,dz]=dirs[d];if(col+dx>=0&&col+dx<3&&row+dz>=0&&row+dz<3)s.ports.push(d);}
    if(s.slot===1)s.ports.push(0);if(s.slot===7)s.ports.push(2);
    paintCorridor(w,s,0);sections.push(s);
  }
  rect(w,46,1,4,9);rect(w,46,80,4,18);rect(w,43,94,10,7);
  const entrance=gate(w,'main-entrance',48,5,w.size*4-.06);
  for(const s of sections)gate(w,`field-door-${s.slot}`,s.x+16,s.z+4,w.size*2-.06,{fieldEntrance:true,slot:s.slot,crossDirection:-1});
  const exit=gate(w,'daughter-approach',48,84,w.size*4-.06,{finalExit:true});
  maze.cornWorld=w;maze.cornDoors=w.doors;maze.cornRegions=new Map();maze.hideAnchors=w.doors.filter(d=>d.fieldEntrance);maze.landingZones=[];
  maze.spawn=pt(w,48,2);maze.door={x:16,z:1};maze.daughter=pt(w,48,97);maze.center={...maze.daughter};maze.gate={x:16,z:28};
  maze.landmarks=[{id:'red',name:'THE RED LANTERN',...sections[0].anchor,color:0xc15b38},
    {id:'cross',name:'THE BROKEN WATCHMAN',...sections[4].anchor,color:0xd2b984},
    {id:'barrels',name:'THE WATER BARRELS',...sections[7].anchor,color:0x8faaa3}];
  maze.checkpoints=maze.landmarks.slice(1).map((p,index)=>({...p,index}));
  maze.corridorLayout={sections,entrance:entrance.index,exit:exit.index,clearWidth:4*w.size,enemySpawn:sections[0].anchor};
  maze.grid=maze.grid.map((row,z)=>row.map((_,x)=>w.walk[(z*3+1)*w.width+x*3+1]?0:1));
  return maze;
}
export function cloneCorridorMaze(maze){
  if(!maze.corridorLayout)return maze;
  return {...maze,cornWorld:{...maze.cornWorld,walk:maze.cornWorld.walk.slice(),owner:maze.cornWorld.owner.slice()},
    corridorLayout:{...maze.corridorLayout,sections:maze.corridorLayout.sections.map(s=>({...s,ports:[...s.ports]}))}};
}
export function corridorSection(maze,p){const w=maze.cornWorld;return maze.corridorLayout.sections.find(s=>p.x>=s.x*w.size&&p.x<(s.x+SIZE)*w.size&&p.z>=s.z*w.size&&p.z<(s.z+SIZE)*w.size);}
export function recycleCorridor(game,dt){
  const run=game.corridorRun;if(!run||run.ready||game.interaction||game.fieldTrip.active)return;
  run.recycleWait-=dt;if(run.recycleWait>0)return;run.recycleWait=1;
  const maze=game.maze,w=maze.cornWorld,sections=maze.corridorLayout.sections;
  const reservations=[game.player,...game.enemies.filter(e=>e.active&&e.zone==='corridor')];
  for(const e of game.enemies.filter(e=>e.active&&e.zone==='corridor'))reservations.push(...e.path,e.target,e.memory.lastKnown,...(e.state==='predictive_search'?e.searchCells:[]));
  reservations.push(...game.evidence.filter(e=>game.elapsed-e.at<1).map(e=>e.position));
  const used=new Set(reservations.filter(Boolean).map(p=>corridorSection(maze,p)?.slot));
  for(let n=0;n<9;n++){
    const s=sections[(run.cursor+n)%9];if(used.has(s.slot)||s.slot===4||s.slot===7)continue;
    const expanded={x:(s.x-2)*w.size,z:(s.z-2)*w.size,maxX:(s.x+SIZE+2)*w.size,maxZ:(s.z+SIZE+2)*w.size};
    if(reservations.filter(Boolean).some(p=>p.x>=expanded.x&&p.x<=expanded.maxX&&p.z>=expanded.z&&p.z<=expanded.maxZ))continue;
    let seen=false;
    for(let z=s.z;z<s.z+SIZE&&!seen;z+=2)for(let x=s.x;x<s.x+SIZE;x+=2)if(cornSight(w,game.player,pt(w,x+.5,z+.5),game.blocks)){seen=true;break;}
    if(seen)continue;
    paintCorridor(w,s,1-s.variant);w.revision++;run.cursor=(s.slot+1)%9;run.recycles++;break;
  }
}

export function prepareCorridorExit(game){
  const w=game.maze.cornWorld,run=game.corridorRun;
  run.returnCuts??=[];
  const reservations=[game.player,...game.enemies.filter(e=>e.active&&e.zone==='corridor')];
  for(const e of game.enemies.filter(e=>e.active&&e.zone==='corridor'))reservations.push(e.target,...e.path);
  // Remove outer vertical cross-links to leave a connected tree. Its central
  // spine always reaches the daughter approach; no branch becomes an island.
  for(const z of [Z+SIZE,Z+SIZE*2])for(const x of [X+12,X+SIZE*2+12]){
    const id=`${x}:${z}`;if(run.returnCuts.includes(id))continue;
    const center=pt(w,x,z);
    if(reservations.filter(Boolean).some(p=>Math.hypot(p.x-center.x,p.z-center.z)<4))continue;
    const visible=[-.51,.51].some(dz=>[-1.5,-.5,.5,1.5].some(dx=>cornSight(w,game.player,pt(w,x+dx,z+dz),game.blocks)));
    if(visible)continue;
    for(let dx=-2;dx<2;dx++)w.walk[z*w.width+x+dx]=0;
    run.returnCuts.push(id);w.revision++;
  }
  return run.returnCuts.length===4;
}
