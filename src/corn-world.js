// Fixed-coordinate corn lanes and gate geometry shared by collision, sight and routing.
// The original coarse map still owns landmarks and forward progression.
const dirs=[[1,0],[-1,0],[0,1],[0,-1]];
const pair=(a,b)=>a<b?`${a}:${b}`:`${b}:${a}`;
const xy=(world,id)=>({x:(id%world.width+.5)*world.size,z:(Math.floor(id/world.width)+.5)*world.size});
export const cornNode=(world,p)=>Math.floor(p.z/world.size)*world.width+Math.floor(p.x/world.size);
const sqDistance=(p,a,b)=>{
  const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz||1)));
  return (p.x-a.x-t*dx)**2+(p.z-a.z-t*dz)**2;
};

export function buildCornWorld(maze,CELL,WIDTH,HEIGHT){
  const width=WIDTH*3,height=HEIGHT*3,size=CELL/3,total=width*height;
  const world={width,height,size,walk:new Uint8Array(total),corn:new Uint8Array(total),
    owner:new Int16Array(total).fill(-1),edges:new Set(),edgeDoors:new Map(),segments:[],buckets:new Map(),doors:[],doorBuckets:new Map(),exclusions:[]};
  const coarseOwner=new Int16Array(WIDTH*HEIGHT).fill(-1),cuts=new Set([maze.door,...maze.checkpoints.map(p=>({x:Math.floor(p.x/CELL),z:Math.floor(p.z/CELL)})),maze.gate].map(p=>p.z*WIDTH+p.x));
  let owner=0;
  for(let z=0;z<HEIGHT;z++)for(let x=0;x<WIDTH;x++){
    const id=z*WIDTH+x;if(maze.grid[z][x]||cuts.has(id)||coarseOwner[id]>=0)continue;
    const queue=[id];coarseOwner[id]=owner;
    for(let i=0;i<queue.length;i++)for(const [dx,dz] of dirs){
      const nx=queue[i]%WIDTH+dx,nz=Math.floor(queue[i]/WIDTH)+dz,n=nz*WIDTH+nx;
      if(nx<0||nx>=WIDTH||nz<0||nz>=HEIGHT||maze.grid[nz][nx]||cuts.has(n)||coarseOwner[n]>=0)continue;
      coarseOwner[n]=owner;queue.push(n);
    }
    owner++;
  }
  for(const id of cuts)coarseOwner[id]=owner++;
  world.coarseOwner=coarseOwner;
  for(let z=0;z<height;z++)for(let x=0;x<width;x++){
    const id=z*width+x,cx=Math.floor(x/3),cz=Math.floor(z/3);
    if(!maze.grid[cz][cx]){world.walk[id]=1;world.owner[id]=coarseOwner[cz*WIDTH+cx];}
  }
  const seeds=[];
  for(let z=0;z<HEIGHT;z++)for(let x=0;x<WIDTH;x++){
    if(maze.grid[z][x])continue;
    for(const [nx,nz] of dirs){
      const wx=x+nx,wz=z+nz;if(maze.grid[wz]?.[wx]!==1)continue;
      const id=`gate-${x}-${z}-${nx}-${nz}`;
      if(wx<1||wx>=WIDTH-1||wz<1||wz>=HEIGHT-1){world.exclusions.push({id,reason:'outer containment'});continue;}
      const fx=x*3+1+nx*2,fz=z*3+1+nz*2,node=fz*width+fx;
      const corridor=(z*3+1+nz)*width+(x*3+1+nx);
      const stage=coarseOwner[(x===15&&z===30?31:z===18&&x===17?19:z)*WIDTH+x];
      const center={x:(x+.5)*CELL+nx*CELL/2,z:(z+.5)*CELL+nz*CELL/2};
      const door={id,index:world.doors.length,stage,normal:{x:nx,z:nz},tangent:{x:-nz,z:nx},
        x:center.x,z:center.z,width:size-.06,hinge:{x:center.x+nz*(size-.06)/2,z:center.z-nx*(size-.06)/2},
        corridorNode:corridor,cornNode:node,corridorCell:{x,z},cornSide:{x:nx,z:nz},
        pocket:xy(world,node),entryYaw:Math.atan2(-nx,-nz),walkable:true};
      world.doors.push(door);world.edgeDoors.set(pair(node,corridor),door.index);
      world.owner[node]=stage;seeds.push(node);
    }
  }
  // Partition first, then carve: different progression sections never share a lane.
  for(let i=0;i<seeds.length;i++)for(const [dx,dz] of dirs){
    const x=seeds[i]%width+dx,z=Math.floor(seeds[i]/width)+dz,id=z*width+x;
    if(x<3||x>=width-3||z<3||z>=height-3||world.owner[id]>=0||!maze.grid[Math.floor(z/3)][Math.floor(x/3)])continue;
    world.owner[id]=world.owner[seeds[i]];seeds.push(id);
  }
  for(const id of seeds){
    const x=id%width,z=Math.floor(id/width);
    // Dense islands produce small rings connected into longer circuits.
    if(x%3===1&&z%3===1)continue;
    world.walk[id]=1;world.corn[id]=1;
  }
  function segment(a,b){
    const i=world.segments.length;world.segments.push({a,b});
    for(let z=Math.floor(Math.min(a.z,b.z)/size)-1;z<=Math.floor(Math.max(a.z,b.z)/size)+1;z++)for(let x=Math.floor(Math.min(a.x,b.x)/size)-1;x<=Math.floor(Math.max(a.x,b.x)/size)+1;x++){
      const id=z*width+x;if(!world.buckets.has(id))world.buckets.set(id,[]);world.buckets.get(id).push(i);
    }
  }
  for(let z=0;z<height;z++)for(let x=0;x<width;x++){
    const a=z*width+x;if(!world.walk[a])continue;
    for(const [dx,dz] of [[1,0],[0,1]]){
      const b=(z+dz)*width+x+dx;if(!world.walk[b])continue;
      const edge=pair(a,b);
      if(world.edgeDoors.has(edge))continue;
      if((world.corn[a]||world.corn[b])&&(world.owner[a]!==world.owner[b]||world.corn[a]!==world.corn[b])){
        world.edges.add(edge);
        segment(dx?{x:(x+1)*size,z:z*size}:{x:x*size,z:(z+1)*size},dx?{x:(x+1)*size,z:(z+1)*size}:{x:(x+1)*size,z:(z+1)*size});
      }
    }
  }
  for(const door of world.doors){
    for(let z=Math.floor((door.z-size*1.5)/size);z<=Math.floor((door.z+size*1.5)/size);z++)for(let x=Math.floor((door.x-size*1.5)/size);x<=Math.floor((door.x+size*1.5)/size);x++){
      const id=z*width+x;if(!world.doorBuckets.has(id))world.doorBuckets.set(id,[]);world.doorBuckets.get(id).push(door.index);
    }
  }
  return world;
}

export function doorLeaf(door,amount=0){
  // Fold fully back against the boundary so an open leaf cannot cut a corn lane.
  const angle=amount*Math.PI,c=Math.cos(angle),s=Math.sin(angle),t=door.tangent;
  return {a:door.hinge,b:{x:door.hinge.x+door.width*(t.x*c+t.z*s),z:door.hinge.z+door.width*(-t.x*s+t.z*c)}};
}
const doorAmount=(blocks,index)=>blocks?.doors?.[index]?.amount??0;
function blockedNode(world,id,blocks){
  if(id<0||id>=world.walk.length||!world.walk[id])return true;
  const x=Math.floor((id%world.width)/3),z=Math.floor(Math.floor(id/world.width)/3);
  return blocks.some(b=>b.x===x&&b.z===z);
}
export function cornNeighbors(world,id,blocks=[],allowDoors=false,sound=false){
  const result=[],x=id%world.width,z=Math.floor(id/world.width);
  for(const [dx,dz] of dirs){
    const nx=x+dx,nz=z+dz,n=nz*world.width+nx;if(nx<0||nx>=world.width||nz<0||nz>=world.height||blockedNode(world,n,blocks))continue;
    const edge=pair(id,n),door=world.edgeDoors.get(edge);
    if(world.edges.has(edge)||(door!==undefined&&blocks.doors?.[door]?.locked&&!sound)||(!allowDoors&&door!==undefined&&doorAmount(blocks,door)<.96))continue;
    if(blocks.physical){
      const a=xy(world,id),b=xy(world,n);
      let clear=true;
      for(let i=0;i<=4;i++)if(!cornOccupy(world,a.x+(b.x-a.x)*i/4,a.z+(b.z-a.z)*i/4,blocks.radius??.25,blocks)){clear=false;break;}
      if(!clear)continue;
    }
    result.push(n);
  }
  return result;
}
export function cornPath(world,from,to,blocks=[],{allowDoors=false,sound=false,maxDistance=Infinity,radius=from.radius??.25}={}){
  if(world.openField){
    const length=Math.hypot(to.x-from.x,to.z-from.z);if(length>maxDistance)return [];
    const projected=allowDoors?Object.assign([],{doors:blocks.doors.map(s=>({...s,amount:s.locked&&!sound?s.amount:1}))}):blocks;
    const n=Math.max(1,Math.ceil(length/.2));for(let i=0;i<=n;i++)if(!cornOccupy(world,from.x+(to.x-from.x)*i/n,from.z+(to.z-from.z)*i/n,radius,projected))return [];
    return [{x:from.x,z:from.z},{x:to.x,z:to.z}];
  }
  const first=cornNode(world,from),last=cornNode(world,to);
  if(blockedNode(world,first,blocks)||blockedNode(world,last,blocks))return [];
  const physical=[...blocks];physical.physical=true;physical.radius=radius;
  physical.doors=allowDoors?(blocks.doors||world.doors.map(()=>({amount:0}))).map((s,i)=>({...s,amount:s.locked&&!sound?s.amount:1,swing:s.swing||((from.x-world.doors[i].x)*world.doors[i].normal.x+(from.z-world.doors[i].z)*world.doors[i].normal.z>0?-1:1)})):blocks.doors;
  if(!cornOccupy(world,from.x,from.z,radius,physical)||!cornOccupy(world,to.x,to.z,radius,physical))return [];
  const heap=[],previous=new Int32Array(world.walk.length).fill(-2),cost=new Float64Array(world.walk.length).fill(Infinity);
  const heuristic=id=>(Math.abs(id%world.width-last%world.width)+Math.abs(Math.floor(id/world.width)-Math.floor(last/world.width)))*world.size;
  const push=(id,g)=>{const v={id,g,f:g+heuristic(id)};let i=heap.length;heap.push(v);while(i>0){const p=(i-1)>>1;if(heap[p].f<=v.f)break;heap[i]=heap[p];i=p;}heap[i]=v;};
  const pop=()=>{const first=heap[0],v=heap.pop();if(heap.length){let i=0;while(i*2+1<heap.length){let c=i*2+1;if(c+1<heap.length&&heap[c+1].f<heap[c].f)c++;if(heap[c].f>=v.f)break;heap[i]=heap[c];i=c;}heap[i]=v;}return first;};
  previous[first]=-1;cost[first]=0;push(first,0);
  while(heap.length){
    const item=pop(),id=item.id;if(item.g!==cost[id])continue;if(id===last)break;
    for(const next of cornNeighbors(world,id,physical,allowDoors,sound)){
      const door=world.edgeDoors.get(pair(id,next));
      const d=cost[id]+world.size+(Number.isFinite(maxDistance)&&door!==undefined&&doorAmount(blocks,door)<.96?2:0);
      if(d>maxDistance||d>=cost[next])continue;cost[next]=d;previous[next]=id;push(next,d);
    }
  }
  if(previous[last]===-2)return [];
  const ids=[];for(let at=last;at!==-1;at=previous[at])ids.push(at);ids.reverse();
  // Center the first cell before turning so a body cannot cut its solid corner.
  const path=[{x:from.x,z:from.z},...ids.map(id=>xy(world,id))];
  if(Math.hypot(path.at(-1).x-to.x,path.at(-1).z-to.z)>.01)path.push({x:to.x,z:to.z});
  // Skip a redundant starting center only when the swept body clears the corner.
  if(path.length>2){
    const b=path[2],n=Math.max(1,Math.ceil(Math.hypot(b.x-from.x,b.z-from.z)/.08));
    let clear=true;
    for(let i=0;i<=n;i++)if(!cornOccupy(world,from.x+(b.x-from.x)*i/n,from.z+(b.z-from.z)*i/n,radius,physical)){clear=false;break;}
    if(clear)path.splice(1,1);
  }
  if(path.length===2&&Math.hypot(path[1].x-from.x,path[1].z-from.z)<.01)path.pop();
  return path;
}

export function cornOccupy(world,x,z,r,blocks=[]){
  if(world.openField){
    if(!Number.isFinite(x)||!Number.isFinite(z))return false;
    const d=world.doors[world.activeDoor],leaf=doorLeaf(d,doorAmount(blocks,d.index)*(blocks.doors?.[d.index]?.swing||1));
    return sqDistance({x,z},leaf.a,leaf.b)>=(r+.035)**2;
  }
  if(x-r<0||z-r<0||x+r>=world.width*world.size||z+r>=world.height*world.size)return false;
  const size=world.size,p={x,z};
  for(let iz=Math.floor((z-r)/size);iz<=Math.floor((z+r)/size);iz++)for(let ix=Math.floor((x-r)/size);ix<=Math.floor((x+r)/size);ix++){
    if(!blockedNode(world,iz*world.width+ix,blocks))continue;
    const dx=x-Math.max(ix*size,Math.min(x,(ix+1)*size)),dz=z-Math.max(iz*size,Math.min(z,(iz+1)*size));
    if(dx*dx+dz*dz<r*r+1e-10)return false;
  }
  const id=cornNode(world,p);
  for(const index of world.buckets.get(id)||[]){const s=world.segments[index];if(sqDistance(p,s.a,s.b)<(r+.025)**2)return false;}
  for(const index of world.doorBuckets.get(id)||[]){const s=doorLeaf(world.doors[index],doorAmount(blocks,index)*(blocks.doors?.[index]?.swing||1));if(sqDistance(p,s.a,s.b)<(r+.035)**2)return false;}
  return true;
}

export function cornSight(world,a,b,blocks=[]){
  const distance=Math.hypot(b.x-a.x,b.z-a.z),steps=Math.max(1,Math.ceil(distance/.035));
  if(world.openField&&distance>5)return false;
  let foliage=0;
  for(let i=1;i<=steps;i++){
    const p={x:a.x+(b.x-a.x)*i/steps,z:a.z+(b.z-a.z)*i/steps};
    if(!cornOccupy(world,p.x,p.z,.005,blocks))return false;
    if(!world.openField&&world.corn[cornNode(world,p)])foliage+=distance/steps;
    if(foliage>2.8)return false;
  }
  return true;
}

export function gateAt(game){
  const p=game.player,w=game.maze.cornWorld,blocks=game.blocks||[];
  let chosen=null,best=Infinity;
  for(const door of w.doors){
    if(w.openField&&door.index!==w.activeDoor)continue;
    const dx=door.x-p.x,dz=door.z-p.z,d=Math.hypot(dx,dz);
    if(d>1.55||d<.02||(-Math.sin(p.yaw)*dx-Math.cos(p.yaw)*dz)/d<.45)continue;
    const near={x:door.x-dx/d*.13,z:door.z-dz/d*.13};
    if(d<best&&cornSight(w,p,near,blocks)){best=d;chosen=door;}
  }
  return chosen;
}

export function safeDoorSwing(door,bodies,preferred=1){
  const clear=swing=>Array.from({length:24},(_,i)=>(i+1)/24).every(amount=>{
    const leaf=doorLeaf(door,amount*swing);
    return bodies.every(p=>sqDistance(p,leaf.a,leaf.b)>=(p.radius+.05)**2);
  });
  return clear(preferred)?preferred:clear(-preferred)?-preferred:0;
}
export function requestDoor(game,door,open,actor='player'){
  if(!door||game.mode!=='playing'||(actor==='enemy'&&game.interaction?.phase==='recovery'))return false;
  const state=game.cornDoors[door.index];
  if(state.locked)return false;
  if(open&&state.amount<.01){
    const body=actor==='enemy'?game.enemy:game.player;
    const preferred=(body.x-door.x)*door.normal.x+(body.z-door.z)*door.normal.z>0?-1:1;
    const bodies=game.enemies?[...(game.player.zone===body.zone?[game.player]:[]),...game.enemies.filter(e=>e.active&&e.zone===body.zone)]:[game.player,game.enemy];
    state.swing=game.interaction?.landing?.swings?.[door.index]||safeDoorSwing(door,bodies,preferred)||preferred;
  }
  state.target=open?1:0;state.requestedBy=actor;return true;
}

export function advanceDoors(game,dt){
  const world=game.maze.cornWorld;
  for(const index of game.movingDoors){
    const state=game.cornDoors[index],door=world.doors[index];
    if(state.requestedBy==='enemy'&&game.interaction?.phase==='recovery')continue;
    if(state.amount===state.target){game.movingDoors.delete(index);continue;}
    const amount=state.amount+Math.sign(state.target-state.amount)*Math.min(dt*3,Math.abs(state.target-state.amount));
    if(world.openField&&index!==world.activeDoor)continue;
    const leaf=doorLeaf(door,amount*(state.swing||1)),blocked=[game.player,...(game.enemies?.filter(e=>e.active&&e.zone===game.player.zone)||[game.enemy])].some(body=>
      sqDistance(body,leaf.a,leaf.b)<(body.radius+.05)**2);
    if(blocked){state.target=state.amount;game.movingDoors.delete(index);continue;}
    const was=state.amount>=.96;state.amount=amount;
    if(was!==(amount>=.96))game.doorRevision++;
  }
}

export function openDoor(game,door,actor='enemy'){
  if(requestDoor(game,door,true,actor))game.movingDoors.add(door.index);
}
export function toggleDoor(game,door){
  const state=game.cornDoors[door.index];
  if(requestDoor(game,door,state.target<.5))game.movingDoors.add(door.index);
}
