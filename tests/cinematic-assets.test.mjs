import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const hash = value => createHash('sha256').update(value).digest('hex');
function read(relative) {
  const raw = readFileSync(new URL(`../${relative}`, import.meta.url));
  assert.equal(raw.readUInt32LE(0), 0x46546c67);
  assert.equal(raw.readUInt32LE(8), raw.length);
  const length = raw.readUInt32LE(12);
  return {raw, json:JSON.parse(raw.subarray(20, 20 + length)), binary:raw.subarray(28 + length)};
}
function bytes(asset, index) {
  const a = asset.json.accessors[index], view = asset.json.bufferViews[a.bufferView];
  const width = {SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16}[a.type] * {5121:1,5123:2,5125:4,5126:4}[a.componentType];
  return Buffer.concat(Array.from({length:a.count}, (_, i) => {
    const start = (view.byteOffset || 0) + (a.byteOffset || 0) + i * (view.byteStride || width);
    return asset.binary.subarray(start, start + width);
  }));
}
function values(asset, index) {
  const a = asset.json.accessors[index], buffer = bytes(asset, index);
  const width = {SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16}[a.type];
  const size = {5121:1,5123:2,5125:4,5126:4}[a.componentType];
  const method = {5121:'readUInt8',5123:'readUInt16LE',5125:'readUInt32LE',5126:'readFloatLE'}[a.componentType];
  return Array.from({length:a.count}, (_, i) => Array.from({length:width}, (_, c) => buffer[method]((i * width + c) * size)));
}
const primitive = (asset, index) => asset.json.meshes[index].primitives[0];
const positions = (asset, index) => values(asset, primitive(asset, index).attributes.POSITION);
const triangleCount = a => a.json.meshes.reduce((sum, mesh) => sum + mesh.primitives.reduce((n,p) => n + a.json.accessors[p.indices].count / 3, 0), 0);
const animationHash = a => hash(Buffer.concat(a.json.animations.flatMap(clip => clip.samplers.flatMap(s => [bytes(a,s.input), bytes(a,s.output)]))));
const imageBytes = (asset, index, mimeType='image/jpeg') => {
  const image=asset.json.images[index], view=asset.json.bufferViews[image.bufferView];
  assert.equal(image.mimeType,mimeType); assert.equal(image.uri,undefined);
  assert.equal(view.buffer,0);assert(view.byteLength>0);
  assert((view.byteOffset || 0)>=0&&(view.byteOffset || 0)+view.byteLength<=asset.binary.length,'image is fully embedded');
  return asset.binary.subarray(view.byteOffset || 0,(view.byteOffset || 0) + view.byteLength);
};
function pngSize(b) {
  assert.deepEqual(b.subarray(0,8),Buffer.from([137,80,78,71,13,10,26,10]));
  assert.equal(b.readUInt32BE(8),13);assert.equal(b.subarray(12,16).toString(),'IHDR');
  return [b.readUInt32BE(16),b.readUInt32BE(20)];
}
function jpegSize(b) {
  assert.equal(b.readUInt16BE(0),0xffd8);
  let i=2;
  while(i < b.length) {
    while(b[i]===0xff)i++;
    const marker=b[i++], length=b.readUInt16BE(i);
    if([0xc0,0xc1,0xc2].includes(marker))return [b.readUInt16BE(i+5),b.readUInt16BE(i+3)];
    i+=length;
  }
  throw new Error('JPEG size marker missing');
}
const base=read('assets/intro/cast.glb');
const cast=['clarence','stanley'].map(role => ({role,asset:read(`assets/intro/cast-${role}.glb`)}));
const zombie=read('assets/field/zombie.glb');

test('cast variants preserve exact 56-joint rig, bind matrices and all source clip samples', () => {
  assert.equal(hash(base.raw),'739d9b6604511712ddab6c4bff76b12ea65b2b57b5ef18e6cc15b9519c27c096','baseline remains untouched');
  for(const {role,asset} of cast) {
    const expectedNodes=structuredClone(base.json.nodes);
    if(role==='clarence') {
      assert.equal(asset.json.asset.extras.authoredUniformV3,true);
      const names=['Authored uniform panels','Authored uniform seam flow','Authored uniform dark buttons','Authored uniform fictional badge'];
      const added=names.map((name,i)=>({name,mesh:base.json.meshes.length+i,skin:0,extras:{authoredUniformV3:true}}));
      expectedNodes[66].children.push(...added.map((_,i)=>base.json.nodes.length+i));
      expectedNodes.push(...added);
      assert.equal(asset.json.meshes.length,base.json.meshes.length+4,'only the four approved clothing meshes are appended');
      const shirt=positions(asset,8),low=[0,1,2].map(c=>Math.min(...shirt.map(p=>p[c]))),high=[0,1,2].map(c=>Math.max(...shirt.map(p=>p[c])));
      for(const node of added) {
        const mesh=asset.json.meshes[node.mesh];assert.equal(mesh.name,node.name);assert.equal(mesh.primitives.length,1);
        assert(positions(asset,node.mesh).every(p=>p.every((v,c)=>v>=low[c]&&v<=high[c])),'authored details stay within the shirt bounds');
        assert(values(asset,primitive(asset,node.mesh).attributes.JOINTS_0).flat().every(j=>Number.isInteger(j)&&j>=0&&j<56),'new clothing uses only the original rig');
      }
    }
    assert.deepEqual(asset.json.nodes,expectedNodes,role+' retains every original node and child in order, with only the approved clothing append');
    assert.deepEqual(asset.json.scenes,base.json.scenes);
    assert.deepEqual(asset.json.skins,base.json.skins);
    assert.equal(asset.json.skins[0].joints.length,56);
    assert.deepEqual(bytes(asset,asset.json.skins[0].inverseBindMatrices),bytes(base,base.json.skins[0].inverseBindMatrices));
    assert.deepEqual(asset.json.animations,base.json.animations);
    assert.equal(animationHash(asset),animationHash(base));
    assert(triangleCount(asset)>4843, 'rebuilt face topology exceeds the low-poly baseline');
    assert(triangleCount(asset)+384<=18000, 'approved whole-actor cap includes fitted lids');
    assert(asset.raw.length<=3*1048576, 'approved per-role download cap');
  }
});

test('Clarence v3 provenance pins the current asset and preserves the historical source chain',()=>{
  const source=JSON.parse(readFileSync(new URL('../assets/intro/sources.json',import.meta.url),'utf8'));
  const current=source.visualOverhaulV3.currentAssets['cast-clarence.glb'],clarence=cast.find(c=>c.role==='clarence').asset;
  assert.equal(current.sha256,hash(clarence.raw));assert.equal(current.bytes,clarence.raw.length);
  assert.equal(current.triangles,triangleCount(clarence));assert.equal(current.authoredUniformV3,clarence.json.asset.extras.authoredUniformV3);
  assert.equal(source.runtime['cast-clarence.glb'].sha256,'22f66118a0881ed8779952031e5f710b40569fc3ca894f1a022a911a68e80073');
  assert.equal(source.facesRadioV1.faces.clarence.sha256,'d1c31bb31b1a012d5e16ff32b4e6f484d9f2699c009bd553827973d238f0547e');
  assert.equal(current.sourceSha256,source.facesRadioV1.faces.clarence.sha256);
  assert.equal(current.sourceSha256,clarence.json.asset.extras.uniformBaselineSha256);
});

test('independent rebuilt faces retain distinct jaw planes, exact crown and protected neck', () => {
  const p0=positions(base,6), [clarence,stanley]=cast.map(({asset})=>positions(asset,6));
  const jaw=points=>points.filter(([x,y,z])=>y>2.93&&y<3.015&&z>.11);
  const width=points=>Math.max(...points.map(p=>p[0]))-Math.min(...points.map(p=>p[0]));
  assert(width(jaw(stanley))>width(jaw(clarence))*1.3,'distinct lower-face shape independent of color');
  for(const p of [clarence,stanley]) {
    assert(Math.abs(Math.max(...p.map(v=>v[1]))-Math.max(...p0.map(v=>v[1])))<1e-6,'no actor height-fitting change');
    const key=v=>v.map(n=>n.toFixed(6)).join(','), retained=new Set(p.map(key));
    for(const v of p0.filter(([,y])=>y<=2.86))assert(retained.has(key(v)),'exact source neck seam retained');
  }
});

test('cast maps are independent, embedded, bounded, and change only the approved Clarence wardrobe maps', () => {
  for(const {role,asset} of cast) {
    assert.equal(asset.json.asset.extras.cinematicCharacter,role);
    for(const i of [1,2,5])assert.notEqual(hash(imageBytes(asset,i)),hash(imageBytes(base,i)));
    for(const i of role==='clarence'?[0,3]:[0,3,4])assert.deepEqual(imageBytes(asset,i),imageBytes(base,i),'shoes, pants and Stanley shirt source maps stay exact');
    if(role==='clarence') {
      assert.notEqual(hash(imageBytes(asset,4,'image/png')),hash(imageBytes(base,4)),'approved navy cloth replaces only Clarence shirt color');
      for(const materialIndex of [8,10]) {
        const material=asset.json.materials[materialIndex],pbr=material.pbrMetallicRoughness;
        assert.equal(material.extras.authoredUniformV3,true);
        const maps=[pbr.baseColorTexture,material.normalTexture,pbr.metallicRoughnessTexture];
        assert(maps.every(Boolean),'shirt and new panels use all three authored cloth maps');
        assert.deepEqual(maps.map(t=>asset.json.textures[t.index].source),[4,8,9]);
        for(const t of maps)assert(pngSize(imageBytes(asset,asset.json.textures[t.index].source,'image/png')).every(n=>n>0&&n<=1024),'embedded authored cloth maps remain at most 1K');
      }
    }
    for(const i of [1,2])assert(jpegSize(imageBytes(asset,i)).every(n=>n<=1024));
    for(const i of [2,3]) {
      const uv=values(asset,primitive(asset,i).attributes.TEXCOORD_0),u0=i===2?.805:.905;
      for(const [u,v] of uv)assert(u>=u0-1e-6&&u<=u0+.075+1e-6&&v>=.03-1e-6&&v<=.49+1e-6,'ear owns a bounded, non-overlapping atlas island');
    }
    const head=asset.json.materials[6],pbr=head.pbrMetallicRoughness;
    for(const t of [pbr.baseColorTexture,head.normalTexture,pbr.metallicRoughnessTexture]) {
      assert(t, 'all three skin PBR maps exist');
      assert.deepEqual(jpegSize(imageBytes(asset,asset.json.textures[t.index].source)),[1024,1024]);
    }
    const intended=role==='clarence'?[.35,.205,.135]:[.67,.51,.435],linear=intended.map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);
    assert.deepEqual(asset.json.asset.extras.lidSkinColorLinear,linear,'runtime lids use the same sRGB-to-linear skin conversion as GLTFLoader');
    assert.equal(asset.json.asset.extras.normalBake,'Blender BVH CPU selected-to-active high-detail sculpt');
  }
  assert.notEqual(hash(imageBytes(cast[0].asset,1)),hash(imageBytes(cast[1].asset,1)));
  assert.notEqual(hash(imageBytes(cast[0].asset,2)),hash(imageBytes(cast[1].asset,2)));
});

test('elbow refinements preserve repaired ear and all cast hand/finger weights', () => {
  for(const {asset} of cast) {
    assert.deepEqual(bytes(asset,primitive(asset,9).attributes.WEIGHTS_0),bytes(base,primitive(base,9).attributes.WEIGHTS_0));
    for(const i of [2,3]) {
      const p=primitive(asset,i),ids=values(asset,p.attributes.JOINTS_0),w=values(asset,p.attributes.WEIGHTS_0),names=asset.json.skins[0].joints.map(j=>asset.json.nodes[j].name);
      for(let row=0;row<ids.length;row++)for(let c=0;c<4;c++)if(w[row][c]>0)assert(!/armup|eye|mouth/.test(names[ids[row][c]]),'retopology cannot reintroduce unrelated ear skinning');
    }
    assert.notDeepEqual(bytes(asset,primitive(asset,8).attributes.WEIGHTS_0),bytes(base,primitive(base,8).attributes.WEIGHTS_0),'local elbow blend exists');
    assert.notDeepEqual(bytes(asset,primitive(asset,8).attributes.POSITION),bytes(base,primitive(base,8).attributes.POSITION),'elbow volume refinement exists');
  }
});

test('all final skin weights and normals are finite and normalized', () => {
  for(const asset of [...cast.map(x=>x.asset),zombie])for(const mesh of asset.json.meshes)for(const p of mesh.primitives) {
    for(const row of values(asset,p.attributes.WEIGHTS_0)) {
      assert(row.every(v=>Number.isFinite(v)&&v>=0&&v<=1));
      assert(Math.abs(row.reduce((a,b)=>a+b,0)-1)<2e-7);
    }
    for(const row of values(asset,p.attributes.NORMAL))assert(Math.abs(Math.hypot(...row)-1)<2e-5);
    assert(values(asset,p.attributes.POSITION).flat().every(Number.isFinite));
  }
});

test('zombie preserves pinned skeleton, lurch samples, outfit topology and 2.32m runtime contract', () => {
  assert.equal(zombie.json.skins[0].joints.length,56);
  assert.equal(hash(JSON.stringify(zombie.json.nodes)),'7f8c8c9643f296b632b45b60c8c05c0130535ea6872224f751759a9d2c44f443');
  assert.equal(hash(bytes(zombie,zombie.json.skins[0].inverseBindMatrices)),'a63d17cb7c848e0b9d61dbfad64db04349a4f17bf1f50737fe1feab3e275c5db');
  assert.equal(animationHash(zombie),'d76776e5abe63cc114a5b608eccd40a6b8c33ed9c80be4bd6c90f162503401f9');
  assert.deepEqual(zombie.json.animations.map(a=>a.name),['Zombie Lurch']);
  assert.equal(triangleCount(zombie),3573);assert(triangleCount(zombie)<=6000);
  assert.equal(zombie.json.asset.extras.runtimeHeightMeters,2.32);
  assert.equal(zombie.json.asset.extras.headLocalEyes.length,2);
  assert.deepEqual(jpegSize(imageBytes(zombie,0)),[1024,1024]);
  assert.deepEqual(jpegSize(imageBytes(zombie,1)),[2048,2048]);
  assert.deepEqual(jpegSize(imageBytes(zombie,2)),[1024,1024]);
  const material=zombie.json.materials[0];assert(material.pbrMetallicRoughness.metallicRoughnessTexture);
  for(const [i,file] of [[0,'normal'],[1,'color'],[2,'roughness']])assert.deepEqual(imageBytes(zombie,i),readFileSync(new URL(`../assets/field/zombie-${file}.jpg`,import.meta.url)));
});

// The unchanged editable-Blender header/size test remains a required private-suite
// release gate. Editable sources are intentionally absent from this public repository.


test('all rebuilt triangles have valid indices, UVs and normalized tangent inputs', () => {
  for(const {asset} of cast)for(const mesh of asset.json.meshes)for(const p of mesh.primitives) {
    const a=asset.json.accessors[p.attributes.POSITION],indices=values(asset,p.indices).flat();
    assert.equal(indices.length%3,0);assert(indices.every(i=>Number.isInteger(i)&&i>=0&&i<a.count));
    for(const name of ['NORMAL','TEXCOORD_0','JOINTS_0','WEIGHTS_0'])assert.equal(asset.json.accessors[p.attributes[name]].count,a.count);
    assert(values(asset,p.attributes.TEXCOORD_0).flat().every(Number.isFinite));
  }
});


test('retopologized heads have one continuous skin surface without UV-split cracks or old neck overlays',()=>{
  for(const {asset} of cast){
    const p=primitive(asset,6),pos=values(asset,p.attributes.POSITION),keys=pos.map(v=>v.map(n=>n.toFixed(5)).join(',')),indices=values(asset,p.indices).flat(),edges=new Map();
    for(let i=0;i<indices.length;i+=3)for(const [a,b] of [[0,1],[1,2],[2,0]]){
      const key=[keys[indices[i+a]],keys[indices[i+b]]].sort().join('|');edges.set(key,(edges.get(key)||0)+1);
    }
    assert([...edges.values()].every(n=>n<=2),'no duplicated/nonmanifold skin edges');
    const boundary=[...edges].filter(([,n])=>n===1);assert.equal(boundary.length,112,'only the subdivided original lower-face/collar openings remain');
    assert(boundary.every(([key])=>key.split('|').every(v=>Number(v.split(',')[1])<2.97)),'forehead, nose, scalp and cheeks have no false split boundaries');
  }
});


test('protected source neck points retain their complete v10 joint influences under animation',()=>{
 const bp=primitive(base,6),p0=values(base,bp.attributes.POSITION),i0=values(base,bp.attributes.JOINTS_0),w0=values(base,bp.attributes.WEIGHTS_0),key=v=>v.map(n=>n.toFixed(6)).join(',');
 const influences=(ids,weights)=>{const out=Array(56).fill(0);ids.forEach((id,k)=>out[id]+=weights[k]);return out;};
 for(const {asset} of cast){
  const p=primitive(asset,6),pos=values(asset,p.attributes.POSITION),ids=values(asset,p.attributes.JOINTS_0),weights=values(asset,p.attributes.WEIGHTS_0),lookup=new Map();
  pos.forEach((v,k)=>lookup.set(key(v),influences(ids[k],weights[k])));
  p0.forEach((v,k)=>{if(v[1]>2.86)return;const actual=lookup.get(key(v)),expected=influences(i0[k],w0[k]);assert(actual,'neck point retained');expected.forEach((w,j)=>assert(Math.abs(actual[j]-w)<1e-7,'protected neck influence retained'));});
 }
});


test('head triangulation follows the authored vertex-normal hemisphere without local foldovers',()=>{
 for(const {asset} of cast){
  const p=primitive(asset,6),pos=values(asset,p.attributes.POSITION),norm=values(asset,p.attributes.NORMAL),ix=values(asset,p.indices).flat();
  for(let i=0;i<ix.length;i+=3){
   const ids=ix.slice(i,i+3),[a,b,c]=ids.map(k=>pos[k]),u=b.map((v,k)=>v-a[k]),v=c.map((v,k)=>v-a[k]),n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],average=[0,1,2].map(k=>ids.reduce((sum,j)=>sum+norm[j][k],0)),size=Math.hypot(...n)*Math.hypot(...average);
   if(size>1e-14)assert(n.reduce((sum,x,k)=>sum+x*average[k],0)/size>=-1e-5,'triangle orientation agrees with the local normal hemisphere');
  }
 }
});
