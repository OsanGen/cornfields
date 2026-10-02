// Shared by the carved passage, its visible glow and player transitions.
export const FIELD_PORTAL={widthCells:2,depthCells:2,planeOffset:.065};

export function fieldPortalCrossing(door,before,after,radius){
  const plane=door.z+FIELD_PORTAL.planeOffset;
  const half=door.clearWidth/2-radius;
  if(half<=0||after.z>plane||after.z>before.z||Math.hypot(after.x-before.x,after.z-before.z)<1e-8)return null;
  if(before.z>plane){
    const t=(before.z-plane)/(before.z-after.z),x=before.x+(after.x-before.x)*t;
    // Preserve the crossing point, even if a diagonal step ends past the frame.
    return Math.abs(x-door.x)<=half?{x,z:plane}:null;
  }
  // Recover movement within the wooden recess after a missed entry. The field
  // return uses the same bounded region, so distant field movement cannot enter.
  const back=door.z-door.captureDepth+radius;
  return before.z>=back&&after.z>=back&&Math.abs(after.x-door.x)<=half?{x:after.x,z:after.z}:null;
}
