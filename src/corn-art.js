import * as THREE from 'three';

const randomFrom=seed=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const clamp=(x,a=0,b=1)=>Math.min(b,Math.max(a,x));
export const CORN_ART_VERSION='rooted-corn-visual-overhaul-v3';

/** Original kit refinement: shared silhouette/height family, stable origin and UV strips.
 * Geometry is authored once, never rebuilt by a frame, and never used for collision.
 */
export function createCornGeometry(variant=0,{far=false}={}){
  const positions=[],uvs=[],weights=[],indices=[],random=randomFrom(719+variant);
  const height=[2.95,3.18,2.78][variant%3],lean=[.075,-.11,.14][variant%3];
  function vertex(x,y,z,u,v,flex=0){const i=positions.length/3;positions.push(x,Math.max(0,y),z);uvs.push(u,v);weights.push(flex);return i;}
  function tube(a,b,r,sides=5,rings=1,strip=2){
    const axis=new THREE.Vector3(...b).sub(new THREE.Vector3(...a)).normalize();
    const side=new THREE.Vector3(0,0,1).cross(axis).normalize(),up=axis.clone().cross(side).normalize(),start=positions.length/3;
    for(let j=0;j<=rings;j++)for(let k=0;k<=sides;k++){
      const t=j/rings,angle=k/sides*Math.PI*2,rr=r*(1-.5*t),p=new THREE.Vector3(...a).lerp(new THREE.Vector3(...b),t).addScaledVector(side,Math.cos(angle)*rr).addScaledVector(up,Math.sin(angle)*rr);
      vertex(p.x,p.y,p.z,(strip+.035+.93*k/sides)/4,.02+.96*t);
    }
    for(let j=0;j<rings;j++)for(let k=0;k<sides;k++){const a=start+j*(sides+1)+k,b=a+sides+1;indices.push(a,b,a+1,a+1,b,b+1);}
  }
  function blade(y,angle,length,width,rise,droop,strip,phase,segments=far?4:14){
    const start=positions.length/3,columns=far?2:4;
    for(let j=0;j<=segments;j++){
      const t=j/segments,sine=Math.sin(Math.PI*t),tipCurl=Math.max(0,(t-.72)/.28);
      const reach=length*(t-.055*tipCurl*tipCurl),cy=Math.max(.04,y+rise*Math.sin(t*Math.PI*.86)-droop*t*t-.11*tipCurl*tipCurl);
      const centerX=lean*y/height+Math.sin(angle)*reach,centerZ=Math.cos(angle)*reach;
      for(let k=0;k<=columns;k++){
        const q=k/columns*2-1,edge=Math.abs(q),asymmetry=1+.10*Math.sin(t*20+phase+q*2),ragged=far?1:1-edge*.16*Math.pow(Math.max(0,Math.sin(t*47+phase+q*3)),10),half=width*.5*Math.pow(Math.max(0,sine),.72)*asymmetry*ragged+.0008;
        // A proud central rib, V-shaped blade, uneven margins and rolled final tip.
        const fold=-Math.pow(edge,.6)*half*.38+Math.sin(t*12+phase)*edge*half*.14;
        const twist=q*(.027*Math.sin(t*Math.PI)+.075*tipCurl*tipCurl)*Math.sin(phase);
        vertex(centerX+Math.cos(angle)*q*half,Math.max(.018,cy+fold+twist),centerZ-Math.sin(angle)*q*half,(strip+.018+.964*k/columns)/4,.015+.97*t,t*t);
      }
    }
    for(let j=0;j<segments;j++)for(let k=0;k<columns;k++){const a=start+j*(columns+1)+k,b=a+columns+1;indices.push(a,b,a+1,a+1,b,b+1);}
  }
  // A low soil/contact collar survives the runtime replacement of the Blender kit.
  // The instance base is planted slightly below the shared terrain height.
  tube([0,.004,0],[0,.042,0],.095,far?4:6,1,1);
  tube([0,0,0],[lean,height,0],.026,far?4:5,far?2:6);
  // Same leaf attachment heights in both LODs. The far kit drops only the smallest
  // interior leaves, retaining the upper silhouette and the same gameplay cover.
  for(let leaf=0;leaf<11;leaf++){
    const f=leaf/10,y=.24+f*(height-.65),angle=leaf*2.43+variant*.71+(random()-.5)*.6;
    const length=.56+.30*Math.sin(f*Math.PI)+random()*.14,width=.14+random()*.075,phase=random()*Math.PI*2;
    if(far&&[1,4,7,9].includes(leaf))continue;
    blade(y,angle,length,width,.21+f*.15,leaf<3?.30:.14,leaf<2?1:0,phase);
  }
  tube([lean,height-.07,0],[lean+.035,height+.33,0],.009,3,1,3);
  for(let branch=0;branch<(far?3:6);branch++){
    const a=branch*2.4; tube([lean,height+.04,0],[lean+Math.cos(a)*.16,height+.22,Math.sin(a)*.16],.006,3,1,3);
  }
  if(!far){
    // Leaf-node collars and the grain-bearing tassel belong to the original plant.
    // They read close to the camera, so the far model deliberately omits them.
    for(let node=1;node<9;node++){
      const y=node*height/10,r=.026*(1-.5*y/height)*1.18;
      tube([lean*(y-.013)/height,y-.013,0],[lean*(y+.013)/height,y+.013,0],r,5,1,2);
    }
    for(let branch=0;branch<6;branch++)for(let grain=0;grain<2;grain++){
      if(grain===1&&[2,5].includes(branch))continue; // Reallocate twelve close-detail triangles to rooted soil contact.
      const a=branch*2.4,f=.5+grain*.3,x=lean+Math.cos(a)*.16*f,z=Math.sin(a)*.16*f,y=height+.04+.18*f;
      tube([x,y,z],[x+Math.cos(a+.7)*.025,y+.052,z+Math.sin(a+.7)*.025],.005,3,1,3);
    }
    tube([lean*.55,1.3,0],[lean*.55+.13,1.65,0],.047,5,2,3);blade(1.3,.15,.28,.09,.26,.03,1,.8,3);}
  const geometry=new THREE.BufferGeometry();geometry.name=`corn_${far?'far':'near'}_${variant}`;
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  geometry.setAttribute('cornFlex',new THREE.Float32BufferAttribute(weights,1));geometry.setIndex(indices);geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();
  geometry.userData={artVersion:CORN_ART_VERSION,lod:far?'far':'near',variant,triangles:indices.length/3};return geometry;
}

/** Baked-once original PBR atlas. No canvas, network asset, frame allocation or
 * alpha cards: actual mesh edges own the silhouette at every quality tier.
 */
export function createCornSurfaceAtlas(size=1024){
  if(size<32||size%4)throw new Error('Corn atlas size must be a multiple of four, at least 32');
  const color=new Uint8Array(size*size*4),normal=new Uint8Array(size*size*4),rough=new Uint8Array(size*size*4),random=randomFrom(719);
  const base=[[.30,.34,.145],[.47,.355,.205],[.30,.32,.15],[.53,.415,.23]];
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const strip=Math.floor(x/(size/4)),u=(x%(size/4))/(size/4-1),v=y/(size-1),edge=Math.abs(u-.5)*2,noise=random()-.5;
    const veinPhase=u*205+Math.sin(v*18)*.65,veins=Math.sin(veinPhase),midrib=Math.exp(-Math.pow((u-.5)/.025,2));
    const marbling=Math.sin(v*24+u*17)*Math.sin(v*61-u*13),lesion=clamp((marbling-.40)*2.4),dry=clamp((edge-.76)*3+Math.max(0,(v-.79)*3)+lesion*.28);
    const brightness=.88+noise*.10+veins*.075+marbling*.075+midrib*.22,at=(y*size+x)*4;
    for(let c=0;c<3;c++)color[at+c]=Math.round(255*clamp(base[strip][c]*brightness*(1-dry*.45)+[.43,.29,.135][c]*dry*.45));
    const nx=-Math.cos(veinPhase)*.14+((u-.5)/.025)*midrib*.36,ny=Math.cos(v*155+u*5)*.025,nz=1,n=Math.hypot(nx,ny,nz);
    normal[at]=Math.round((nx/n*.5+.5)*255);normal[at+1]=Math.round((ny/n*.5+.5)*255);normal[at+2]=Math.round((nz/n*.5+.5)*255);
    const wet=strip===0?clamp((.8-edge)*.24)*(1-lesion):.04,roughness=clamp(.86-wet+lesion*.11+noise*.04,.52,.98);
    rough[at]=rough[at+1]=rough[at+2]=Math.round(255*roughness);color[at+3]=normal[at+3]=rough[at+3]=255;
  }
  function texture(data,srgb=false){const t=new THREE.DataTexture(data,size,size);t.colorSpace=srgb?THREE.SRGBColorSpace:THREE.NoColorSpace;t.wrapS=t.wrapT=THREE.ClampToEdgeWrapping;t.magFilter=THREE.LinearFilter;t.minFilter=THREE.LinearMipmapLinearFilter;t.generateMipmaps=true;t.anisotropy=4;t.needsUpdate=true;return t;}
  return {map:texture(color,true),normalMap:texture(normal),roughnessMap:texture(rough),bytes:color.byteLength+normal.byteLength+rough.byteLength};
}

export function refineCornKit(kit){
  const atlas=createCornSurfaceAtlas(),materials=new Set();
  for(const lod of ['near','far'])for(let variant=0;variant<3;variant++){
    const mesh=kit[`corn_${lod}_${variant}`];mesh.geometry.dispose();mesh.geometry=createCornGeometry(variant,{far:lod==='far'});materials.add(mesh.material);
  }
  for(const material of materials){
    const old=[material.map,material.normalMap,material.roughnessMap];Object.assign(material,atlas);delete material.bytes;
    material.color.setHex(0xffffff);material.roughness=1;material.normalScale.set(.72,.72);material.side=THREE.DoubleSide;material.needsUpdate=true;
    material.userData.cornArt=CORN_ART_VERSION;for(const t of new Set(old.filter(Boolean)))t.dispose();
  }
  return {version:CORN_ART_VERSION,nearTriangles:kit.corn_near_0.geometry.userData.triangles,farTriangles:kit.corn_far_0.geometry.userData.triangles,atlasBytes:atlas.bytes,additionalDrawCalls:0};
}
