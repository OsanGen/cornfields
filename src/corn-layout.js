// A compact, reusable physical field. All three routes reconnect at the same
// northern junction. Coordinates never wrap and actors are never repositioned.
import {cornSight} from './corn-world.js';

export const SURVIVAL_LAYOUT = Object.freeze({size:6, x:36, z:116, columns:3, rows:3, maxSections:16});
export const SURVIVAL_VIEW_BOUNDS=Object.freeze({x:34,z:99,width:22,height:38});
const directions=[[0,-1],[1,0],[0,1],[-1,0]];
const pair=(a,b)=>a<b?`${a}:${b}`:`${b}:${a}`;
const point=(w,x,z)=>({x:(x+.5)*w.size,z:(z+.5)*w.size});

function extend(world, height) {
  for(const name of ['walk','corn','owner']) {
    const data=new world[name].constructor(world.width*height);
    if(name==='owner')data.fill(-1);
    data.set(world[name]);world[name]=data;
  }
  world.height=height;world.revision=0;
}
function carve(w,x,z,cover=false) {
  const id=z*w.width+x;w.walk[id]=1;w.corn[id]=cover?1:0;w.owner[id]=30000;
}
function line(w,a,b,cover=false) {
  let [x,z]=a;carve(w,x,z,cover);
  while(x!==b[0]||z!==b[1]){x+=Math.sign(b[0]-x);z+=Math.sign(b[1]-z);carve(w,x,z,cover);}
}
function gate(w,id,z) {
  const x=46,width=w.size*2-.06,at={x:46*w.size,z:z*w.size};
  const door={id,index:w.doors.length,stage:30000,...at,width,normal:{x:0,z:1},tangent:{x:-1,z:0},
    hinge:{x:at.x+width/2,z:at.z},corridorNode:(z-1)*w.width+x,cornNode:z*w.width+x,
    corridorCell:{x:15,z:Math.floor((z-1)/3)},cornSide:{x:0,z:1},pocket:point(w,x,z+1),entryYaw:Math.PI,walkable:true,survival:true};
  w.doors.push(door);
  for(const gx of [45,46])w.edgeDoors.set(pair((z-1)*w.width+gx,z*w.width+gx),door.index);
  for(let iz=z-3;iz<=z+3;iz++)for(let ix=43;ix<=49;ix++){
    const node=iz*w.width+ix;if(!w.doorBuckets.has(node))w.doorBuckets.set(node,[]);w.doorBuckets.get(node).push(door.index);
  }
  return door;
}

export function paintSection(world, section, variant) {
  const {x,z}=section,side=SURVIVAL_LAYOUT.size;
  for(let dz=0;dz<side;dz++)for(let dx=0;dx<side;dx++){
    const id=(z+dz)*world.width+x+dx;world.walk[id]=0;world.corn[id]=0;world.owner[id]=30000;
  }
  const hub=variant==='long'?[1,3]:[3,3];
  const ports=[[3,0],[5,3],[3,5],[0,3]];
  const localLine=(a,b,cover=false)=>line(world,[x+a[0],z+a[1]],[x+b[0],z+b[1]],cover);
  for(const direction of section.ports) {
    const end=ports[direction];
    if(variant==='long'&&direction===0){
      localLine(end,[3,1]);localLine([3,1],[1,1]);localLine([1,1],hub);continue;
    }
    const bend=direction%2?[hub[0],end[1]]:[end[0],hub[1]];
    localLine(end,bend);localLine(bend,hub);
  }
  // Two short, genuine concealment bays in every piece also provide QTE landings.
  if(variant==='long'){
    localLine(hub,[1,1]);localLine([1,1],[4,1]);localLine(hub,[1,4]);
    carve(world,x+4,z+1,true);carve(world,x+1,z+4,true);
  }else for(const bay of [[1,1],[4,4]]){
      localLine(hub,[bay[0],hub[1]]);localLine([bay[0],hub[1]],bay);
      carve(world,x+bay[0],z+bay[1],true);
      carve(world,x+bay[0],z+Math.max(1,Math.min(4,bay[1]+(bay[1]<hub[1]?1:-1))),true);
  }
  section.variant=variant;section.anchor=point(world,x+hub[0],z+hub[1]);
  section.generation++;section.id=`section-${section.slot}-${section.generation}`;
}

export function installSurvivalLayout(maze) {
  const w=maze.cornWorld;extend(w,139);
  // The original route stays intact. A required side excursion begins south of
  // the existing forecourt, then returns here to unlock the original main door.
  for(let z=99;z<=110;z++)for(const x of [45,46])carve(w,x,z);
  for(let x=45;x<=50;x++)for(const z of [110,111])carve(w,x,z);
  for(let z=110;z<=115;z++)for(const x of [49,50])carve(w,x,z);
  for(let x=45;x<=50;x++)for(const z of [114,115])carve(w,x,z);
  for(let z=114;z<=119;z++)carve(w,45,z);
  // Remove old perimeter collision along the new physical forecourt connection.
  w.segments=w.segments.filter(s=>!(Math.max(s.a.z,s.b.z)>98*w.size&&Math.min(s.a.x,s.b.x)<48*w.size&&Math.max(s.a.x,s.b.x)>44*w.size));
  w.buckets=new Map();
  for(const [i,s] of w.segments.entries())for(let z=Math.floor(Math.min(s.a.z,s.b.z)/w.size)-1;z<=Math.floor(Math.max(s.a.z,s.b.z)/w.size)+1;z++)for(let x=Math.floor(Math.min(s.a.x,s.b.x)/w.size)-1;x<=Math.floor(Math.max(s.a.x,s.b.x)/w.size)+1;x++){
    const id=z*w.width+x;if(!w.buckets.has(id))w.buckets.set(id,[]);w.buckets.get(id).push(i);
  }
  const outer=gate(w,'survival-outer',103),inner=gate(w,'survival-inner',108);
  const sections=[];
  for(let row=0;row<3;row++)for(let col=0;col<3;col++){
    const slot=row*3+col,ports=[];
    for(let d=0;d<4;d++){
      const [dx,dz]=directions[d],c=col+dx,r=row+dz;
      if(c<0||c>2||r<0||r>2)continue;
      // Middle piece is a north/south reconnect, not a separate circular maze.
      if((slot===4||r*3+c===4)&&dx!==0)continue;
      ports.push(d);
    }
    if(slot===1)ports.push(0);
    const section={slot,id:'',x:36+col*6,z:116+row*6,ports,generation:0,variant:'short'};
    paintSection(w,section,'short');sections.push(section);
  }
  maze.cornRegions.set(30000,{id:'survival-cover',stage:30000,walkable:true});
  maze.cornDoors=w.doors;
  maze.survivalLayout={sections,outer:outer.index,inner:inner.index,
    seal:[113*w.width+49,113*w.width+50],sealOpen:true,returnFunnel:false,
    returnCuts:[119*w.width+42,119*w.width+47],
    bounds:Object.fromEntries(Object.entries(SURVIVAL_VIEW_BOUNDS).map(([key,value])=>[key,value*w.size])),
    enemySpawn:{...sections[8].anchor},entry:{x:46*w.size,z:102*w.size}};
  return maze;
}

export function cloneSurvivalMaze(maze) {
  if(!maze.survivalLayout)return maze;
  const w=maze.cornWorld;
  return {...maze,cornWorld:{...w,walk:w.walk.slice(),corn:w.corn.slice(),owner:w.owner.slice()},
    survivalLayout:{...maze.survivalLayout,sections:maze.survivalLayout.sections.map(s=>({...s,ports:[...s.ports],anchor:{...s.anchor}}))}};
}
export function sectionAt(maze,p) {
  if(!maze.survivalLayout)return null;
  const w=maze.cornWorld,x=Math.floor(p.x/w.size),z=Math.floor(p.z/w.size);
  return maze.survivalLayout.sections.find(s=>x>=s.x&&x<s.x+6&&z>=s.z&&z<s.z+6)||null;
}
export function setReturnOpen(maze,open) {
  const layout=maze.survivalLayout;if(layout.sealOpen===open&&(!open||layout.returnFunnel))return false;
  for(const id of layout.seal)maze.cornWorld.walk[id]=open?1:0;
  if(open){
    // Remove the two cross-connections at the unseen northern junction. All
    // three branches remain connected through the south, and now form a tree
    // leading back through its center branch to the one original entrance.
    for(const id of layout.returnCuts)maze.cornWorld.walk[id]=0;
    layout.sections[1].ports=[0,2];
    layout.sections[0].ports=layout.sections[0].ports.filter(p=>p!==1);
    layout.sections[2].ports=layout.sections[2].ports.filter(p=>p!==3);
    layout.returnFunnel=true;
  }
  layout.sealOpen=open;maze.cornWorld.revision++;return true;
}
export function protectedSections(game) {
  const layout=game.maze.survivalLayout,reasons=new Map();
  const add=(p,reason,neighbors=false)=>{
    const s=p&&sectionAt(game.maze,p);if(!s)return;
    const slots=[s.slot];
    if(neighbors)for(const d of s.ports){const [dx,dz]=directions[d],slot=s.slot+dx+dz*3;if(slot>=0&&slot<9)slots.push(slot);}
    for(const slot of slots){if(!reasons.has(slot))reasons.set(slot,new Set());reasons.get(slot).add(reason);}
  };
  add(game.player,'player',true);add(game.enemy,'zombie',true);
  add(game.enemy.target,'active target');add(game.enemy.memory.lastKnown,'observation');
  for(const p of game.enemy.path||[])add(p,'active route');
  if(game.enemy.state==='predictive_search')for(const p of game.enemy.searchCells||[])add(p,'active search');
  for(const e of game.evidence)if(game.elapsed-e.at<=1)add(e.position,'fresh sound');
  if(game.interaction){
    for(const p of game.interaction.landing.route)add(p,'throw');
    add(game.interaction.enemyContact,'tackle');add(game.interaction.enemyOrigin,'tackle');
  }
  if(layout.returnFunnel)for(const s of layout.sections){if(!reasons.has(s.slot))reasons.set(s.slot,new Set());reasons.get(s.slot).add('return route');}
  return reasons;
}
function unseen(game,section) {
  const w=game.maze.cornWorld;
  for(let z=section.z;z<section.z+6;z++)for(let x=section.x;x<section.x+6;x++){
    const p=point(w,x,z);
    // Include the exposed faces of solid cells, not only corridor centers.
    for(const [dx,dz] of [[0,0],[.51,0],[-.51,0],[0,.51],[0,-.51]]){
      if(cornSight(w,game.player,{x:p.x+dx*w.size,z:p.z+dz*w.size},game.blocks||[]))return false;
    }
  }
  return true;
}
export function streamSections(game,dt) {
  const state=game.cornSurvival;if(state.state!=='active_survival'||state.exitReady||game.interaction)return;
  state.streamWait-=dt;if(state.streamWait>0)return;state.streamWait=.5;
  const sections=game.maze.survivalLayout.sections,pins=protectedSections(game);
  for(let n=0;n<sections.length;n++){
    const section=sections[(state.cursor+n)%sections.length];
    if(pins.has(section.slot)||!unseen(game,section))continue;
    state.rng=(Math.imul(state.rng,1664525)+1013904223)>>>0;
    const chasing=['chase','rage_chase','corn_rush'].includes(game.enemy.state);
    const variant=chasing||game.player.health<35?'short':state.rng/4294967296<.6?'long':'short';
    state.cursor=(section.slot+1)%sections.length;
    if(variant===section.variant)continue;
    paintSection(game.maze.cornWorld,section,variant);
    // Historical search penalties refer to old geometry; active observations and
    // targets are protected above and never wiped to make recycling possible.
    game.enemy.memory.searchedCells=game.enemy.memory.searchedCells.filter(id=>{
      const [x,z]=id.split(',').map(Number);
      return x<Math.floor(section.x/3)||x>Math.floor((section.x+5)/3)||z<Math.floor(section.z/3)||z>Math.floor((section.z+5)/3);
    });
    game.maze.cornWorld.revision++;state.commits++;return;
  }
}
export function canChangeReturn(game) {
  const w=game.maze.cornWorld;
  const opening=game.cornSurvival.exitReady;
  if(opening){
    if(protectedSections(game).has(1)||!unseen(game,game.maze.survivalLayout.sections[1]))return false;
  }
  for(const id of game.maze.survivalLayout.seal){
    const p=point(w,id%w.width,Math.floor(id/w.width));
    if(!opening){
      if([game.player,game.enemy].some(a=>a.z<p.z+2))return false;
      if([game.enemy.target,...game.enemy.path].some(a=>a&&Math.hypot(a.x-p.x,a.z-p.z)<2))return false;
    }
    if([game.player,game.enemy].some(a=>Math.hypot(a.x-p.x,a.z-p.z)<2))return false;
    if(game.interaction?.landing.route.some(a=>Math.hypot(a.x-p.x,a.z-p.z)<2))return false;
    // Sample just in front of the cap so a currently solid cap cannot hide itself.
    if(cornSight(w,game.player,{x:p.x,z:p.z+w.size},game.blocks||[]))return false;
  }
  return true;
}
