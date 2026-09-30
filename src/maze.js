export const CELL = 2.35;
export const WIDTH = 33;
export const HEIGHT = 35;
export const key = (x, z) => `${x},${z}`;
export const centerOf = (x, z) => ({ x: (x + .5) * CELL, z: (z + .5) * CELL });
export const cellOf = (p) => ({ x: Math.floor(p.x / CELL), z: Math.floor(p.z / CELL) });

// Explicitly authored polylines. This is a fixed level, not a maze generator.
const ROUTE = [[15,32],[15,29],[3,29],[3,3],[29,3],[29,27],[7,27],[7,7],[25,7],[25,23],[11,23],[11,11],[21,11],[21,19],[17,19],[17,17]];
const SIDE_PATHS = [
  [[9,29],[9,31],[5,31],[5,29]],
  [[3,23],[5,23],[5,17],[3,17]],
  [[3,11],[1,11],[1,7]],
  [[9,3],[9,5],[17,5],[17,3]],
  [[23,3],[23,1],[27,1]],
  [[29,11],[31,11],[31,17],[29,17]],
  [[29,23],[31,23],[31,29],[27,29]],
  [[17,27],[17,29],[23,29],[23,27]],
  [[7,21],[9,21],[9,17],[7,17]],
  [[7,13],[5,13],[5,9]],
  [[13,7],[13,9],[17,9],[17,7]],
  [[25,13],[27,13],[27,19],[25,19]],
  [[19,23],[19,25],[15,25],[15,23]],
];

export function createMaze() {
  const grid = Array.from({ length: HEIGHT }, () => Array(WIDTH).fill(1));
  const carve = (points) => {
    for (let i = 1; i < points.length; i++) {
      let [x,z] = points[i-1]; const [tx,tz] = points[i];
      grid[z][x] = 0;
      while (x !== tx || z !== tz) { x += Math.sign(tx-x); z += Math.sign(tz-z); grid[z][x] = 0; }
    }
  };
  carve(ROUTE); SIDE_PATHS.forEach(carve);
  for (let z=31; z<=33; z++) for (let x=13; x<=17; x++) grid[z][x]=0;
  for (let z=13; z<=17; z++) for (let x=13; x<=19; x++) grid[z][x]=0;
  // Only entrance to the center; the final escape is on its opposite side.
  grid[18][17]=0;
  const maze = { grid, spawn: centerOf(15,32), door: {x:15,z:30}, center: centerOf(16,15), exit: centerOf(13,14), gate: {x:17,z:18}, landmarks: [
    { id:'red', name:'THE RED LANTERN', ...centerOf(3,19), color:0xc15b38 },
    { id:'cross', name:'THE BROKEN WATCHMAN', ...centerOf(23,3), color:0xd2b984 },
    { id:'barrels', name:'THE WATER BARRELS', ...centerOf(7,15), color:0x8faaa3 },
  ] };
  maze.distances = flood(maze, cellOf(maze.spawn));
  maze.centerDistance = maze.distances.get(key(17,17));
  maze.daughter={...maze.center};
  maze.checkpoints=maze.landmarks.filter(l=>l.id==='cross'||l.id==='barrels').map((l,index)=>({...l,index}));
  // One local pocket per route section; the grid remains authoritative outside its ingress.
  maze.hideAnchors=[[3,23,-1,0],[17,3,0,-1],[29,19,1,0],[7,19,-1,0],[25,17,-1,0],[21,15,1,0]].map(([x,z,sx,sz],i)=>{
    const at=centerOf(x,z),cornSide={x:sx,z:sz};
    return {id:`hide-${i+1}`,...at,corridorCell:{x,z},cornSide,entryYaw:Math.atan2(sx,sz),pocket:{x:at.x+sx*1.65,z:at.z+sz*1.65}};
  });
  // Shallow corn bays keep an intact strip through every separating wall.
  // They add local walking space, never another connection between corridors.
  maze.landingZones=[];
  for(let z=1;z<30;z++)for(let x=1;x<WIDTH-1;x++){
    if(grid[z][x])continue;
    for(const [sx,sz] of [[1,0],[-1,0],[0,1],[0,-1]]){
      if(grid[z+sz]?.[x+sx]!==1)continue;
      const at=centerOf(x,z),cornSide={x:sx,z:sz};
      maze.landingZones.push({id:`corn-${x}-${z}-${sx}-${sz}`,...at,corridorCell:{x,z},cornSide,
        walkable:true,entryYaw:Math.atan2(sx,sz),pocket:{x:at.x+sx*1.72,z:at.z+sz*1.72}});
    }
  }
  maze.landingZoneCells=new Map();
  for(const a of maze.landingZones)for(const offset of [0,1]){
    const id=key(a.corridorCell.x+a.cornSide.x*offset,a.corridorCell.z+a.cornSide.z*offset);
    if(!maze.landingZoneCells.has(id))maze.landingZoneCells.set(id,[]);
    maze.landingZoneCells.get(id).push(a);
  }
  return maze;
}

export function inCornBay(zone,x,z,r=0){
  const dx=x-zone.x,dz=z-zone.z;
  const along=dx*zone.cornSide.x+dz*zone.cornSide.z;
  const across=dx*zone.cornSide.z-dz*zone.cornSide.x;
  return along>=-.7+r&&along<=2.05-r&&Math.abs(across)<=.78-r;
}
export function cornZoneAt(maze,p){
  if(!isWall(maze,cellOf(p).x,cellOf(p).z))return null;
  return maze.landingZoneCells?.get(key(cellOf(p).x,cellOf(p).z))?.find(zone=>inCornBay(zone,p.x,p.z))||null;
}

export function isWall(maze,x,z,blocks=[]) {
  return maze.grid[z]?.[x] !== 0 || blocks.some(b=>b.x===x && b.z===z);
}
export function neighbors(maze,c,blocks=[]) {
  return [[1,0],[-1,0],[0,1],[0,-1]].map(([x,z])=>({x:c.x+x,z:c.z+z})).filter(p=>!isWall(maze,p.x,p.z,blocks));
}
export function flood(maze, start, blocks=[]) {
  const result=new Map([[key(start.x,start.z),0]]), queue=[start];
  for(let i=0;i<queue.length;i++) for(const p of neighbors(maze,queue[i],blocks)) {
    const k=key(p.x,p.z); if(result.has(k))continue;
    result.set(k,result.get(key(queue[i].x,queue[i].z))+1); queue.push(p);
  }
  return result;
}
export function pathTo(maze,from,to,blocks=[]) {
  const fromBay=cornZoneAt(maze,from),toBay=cornZoneAt(maze,to);
  const start=fromBay?.corridorCell||cellOf(from), goal=toBay?.corridorCell||cellOf(to), first=key(start.x,start.z), last=key(goal.x,goal.z);
  if(isWall(maze,goal.x,goal.z,blocks))return [];
  const queue=[start], previous=new Map([[first,null]]);
  for(let i=0;i<queue.length;i++) {
    const c=queue[i]; if(key(c.x,c.z)===last)break;
    for(const n of neighbors(maze,c,blocks)) {const k=key(n.x,n.z);if(!previous.has(k)){previous.set(k,key(c.x,c.z));queue.push(n);}}
  }
  if(!previous.has(last))return [];
  const path=[];let cursor=last;
  while(cursor!==null){const [x,z]=cursor.split(',').map(Number);path.push(centerOf(x,z));cursor=previous.get(cursor);}
  path.reverse();
  if(fromBay)path.unshift({x:from.x,z:from.z});
  if(toBay)path.push({x:to.x,z:to.z});
  return path;
}
export function canOccupy(maze,x,z,r=.24,blocks=[]) {
  if(maze.landingZoneCells?.get(key(Math.floor(x/CELL),Math.floor(z/CELL)))?.some(zone=>inCornBay(zone,x,z,r))&&
      !blocks.some(b=>x+r>b.x*CELL&&x-r<(b.x+1)*CELL&&z+r>b.z*CELL&&z-r<(b.z+1)*CELL))return true;
  for(let gz=Math.floor((z-r)/CELL);gz<=Math.floor((z+r)/CELL);gz++)for(let gx=Math.floor((x-r)/CELL);gx<=Math.floor((x+r)/CELL);gx++){
    if(!isWall(maze,gx,gz,blocks))continue;
    const dx=x-Math.max(gx*CELL,Math.min(x,(gx+1)*CELL));
    const dz=z-Math.max(gz*CELL,Math.min(z,(gz+1)*CELL));
    if(dx*dx+dz*dz<r*r)return false;
  }
  return true;
}
export function moveBody(maze,body,dx,dz,blocks=[]) {
  const steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.12));
  for(let i=0;i<steps;i++){
    if(canOccupy(maze,body.x+dx/steps,body.z,body.radius,blocks))body.x+=dx/steps;
    if(canOccupy(maze,body.x,body.z+dz/steps,body.radius,blocks))body.z+=dz/steps;
  }
}
export function lineOfSight(maze,a,b,blocks=[]) {
  const steps=Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.18);
  for(let i=1;i<=steps;i++){const t=i/steps,c=cellOf({x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t});if(isWall(maze,c.x,c.z,blocks))return false;}
  return true;
}
