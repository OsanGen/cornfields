#!/usr/bin/env python3
"""Narrow, local v3 asset authoring. Never rebuilds pistol/projector/cruiser.
Run with Blender 4.3.2 --background --disable-autoexec --python this-file --
--baseline-dir PATH. Baseline inputs must be the verified v13 GLBs.
The binary-preserving arm recovery uses the existing rig's exact skin matrices;
Blender retains an editable import of each final authored surface.
"""
import bpy, bmesh, json, math, struct, hashlib, argparse, sys, subprocess
from pathlib import Path
import numpy as np
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1]
DT={5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}
WIDTH={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}
class GLB:
 def __init__(self,path):
  raw=Path(path).read_bytes();n=struct.unpack_from('<I',raw,12)[0];self.j=json.loads(raw[20:20+n]);self.b=bytearray(raw[28+n:]);self.original_sha=hashlib.sha256(raw).hexdigest()
 def array(self,idx):
  a=self.j['accessors'][idx];v=self.j['bufferViews'][a['bufferView']];dt=np.dtype(DT[a['componentType']]);w=WIDTH[a['type']];start=v.get('byteOffset',0)+a.get('byteOffset',0)
  return np.ndarray((a['count'],w),dtype=dt,buffer=self.b,offset=start,strides=(v.get('byteStride',dt.itemsize*w),dt.itemsize)).copy()
 def add_array(self,data,kind,ctype=5126):
  data=np.asarray(data,dtype=DT[ctype]);self.b+=b'\0'*((-len(self.b))%4);start=len(self.b);self.b+=data.tobytes();vi=len(self.j['bufferViews']);self.j['bufferViews'].append({'buffer':0,'byteOffset':start,'byteLength':data.nbytes});a={'bufferView':vi,'componentType':ctype,'count':len(data),'type':kind}
  if kind=='VEC3':a.update(min=data.min(0).tolist(),max=data.max(0).tolist())
  ai=len(self.j['accessors']);self.j['accessors'].append(a);return ai
 def save(self,path,extras=None):
  if extras:self.j.setdefault('asset',{}).setdefault('extras',{}).update(extras)
  self.j['buffers'][0]['byteLength']=len(self.b);self.b+=b'\0'*((-len(self.b))%4);j=json.dumps(self.j,separators=(',',':')).encode();j+=b' '*((-len(j))%4)
  raw=struct.pack('<III',0x46546c67,2,28+len(j)+len(self.b))+struct.pack('<II',len(j),0x4e4f534a)+j+struct.pack('<II',len(self.b),0x004e4942)+self.b;Path(path).write_bytes(raw)
  return {'file':str(Path(path).relative_to(ROOT)),'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest(),'triangles':sum(self.j['accessors'][p['indices']]['count']//3 for m in self.j['meshes'] for p in m['primitives']),'draws':sum(len(m['primitives'])for m in self.j['meshes'])}
 def primitive(self,node):return self.j['meshes'][next(n['mesh']for n in self.j['nodes']if n.get('name')==node)]['primitives'][0]

def largest_component(pos,tri):
 key={};c=[]
 for p in pos:
  k=tuple(np.round(p,6));key.setdefault(k,len(key));c.append(key[k])
 parent=list(range(len(key)))
 def find(x):
  while parent[x]!=x:parent[x]=parent[parent[x]];x=parent[x]
  return x
 for t in tri:
  a=find(c[t[0]])
  for k in t[1:]:parent[find(c[k])]=a
 groups={}
 for i,t in enumerate(tri):groups.setdefault(find(c[t[0]]),[]).append(i)
 return max(groups.values(),key=len)

def repair_mike(source):
 g=GLB(source);assert g.original_sha=='1231ff700b2b42417618d0fe9963f4fb7f3aad37e1ca162e184635b4bd4dcf6c';p=g.primitive('shirt');attrs={k:g.array(v)for k,v in p['attributes'].items()};pos=attrs['POSITION'];tris=g.array(p['indices']).reshape(-1,3);triangles=tris[largest_component(pos,tris)]
 joints=g.j['skins'][0]['joints'];joint={g.j['nodes'][id]['name'].replace('.',''):i for i,id in enumerate(joints)}
 shoulders=[np.array([.352541669,2.711306128,-.004230703]),np.array([-.307531591,2.699267032,-.001349861])];elbows=[np.array([.868216593,2.559078174,-.011348042]),np.array([-.822892171,2.588308823,.008366238])];axes=[(e-s)/np.linalg.norm(e-s)for s,e in zip(shoulders,elbows)];lengths=[np.linalg.norm(e-s)for s,e in zip(shoulders,elbows)]
 def blend(a,b,t):
  v={k:a[k]*(1-t)+b[k]*t for k in a if k not in ['JOINTS_0','WEIGHTS_0']};weights={}
  for q,f in [(a,1-t),(b,t)]:
   for id,w in zip(q['JOINTS_0'],q['WEIGHTS_0']):weights[int(id)]=weights.get(int(id),0)+float(w)*f
  top=sorted(weights.items(),key=lambda x:-x[1])[:4];total=sum(w for _,w in top);v['JOINTS_0']=np.array([id for id,_ in top]+[0]*(4-len(top)));v['WEIGHTS_0']=np.array([w/total for _,w in top]+[0]*(4-len(top)));return v
 def clip(poly,center,axis,keep=True):
  out=[]
  for a,b in zip(poly,poly[1:]+poly[:1]):
   da=np.dot(a['POSITION']-center,axis);db=np.dot(b['POSITION']-center,axis);ia=da<=1e-8 if keep else da>=-1e-8;ib=db<=1e-8 if keep else db>=-1e-8
   if ia:out.append(a)
   if ia!=ib:out.append(blend(a,b,da/(da-db)))
  return out
 out=[];indices=[];skin_vertices=0
 for tri in triangles:
  poly=[{k:v[i].astype(float)for k,v in attrs.items()}for i in tri]
  for s,e,a in zip(shoulders,elbows,axes):poly=clip(poly,e+a*.012,a)
  if len(poly)<3:continue
  # Split the cloth/skin seam in geometry, not by a blurry painted gradient.
  sections=[(poly,False)]
  for s,a,l in zip(shoulders,axes,lengths):
   next_sections=[]
   for poly,is_skin in sections:
    inner=clip(poly,s+a*l*.43,a);outer=clip(poly,s+a*l*.43,a,False)
    if len(inner)>=3:next_sections.append((inner,is_skin))
    if len(outer)>=3:next_sections.append((outer,True))
   sections=next_sections
  for poly,is_skin in sections:
   for k in range(1,len(poly)-1):
    vtx=[poly[0],poly[k],poly[k+1]];start=len(out)
    for v in vtx:
     v={k:x.copy()for k,x in v.items()};p0=v['POSITION'];side=0 if p0[0]>=0 else 1;s=shoulders[side];a=axes[side];l=lengths[side];t=np.dot(p0-s,a)/l
     if t>0:
      center=s+a*l*t;radial=p0-center;radial-=a*np.dot(radial,a);tight=.79 if is_skin else .91;v['POSITION']=center+radial*tight
      if is_skin:
       lower=max(0,min(.18,(t-.82)/.18*.18));v['JOINTS_0']=np.array([joint['armup'+('L'if side==0 else'R')],joint['armlo'+('L'if side==0 else'R')],0,0]);v['WEIGHTS_0']=np.array([1-lower,lower,0,0]);skin_vertices+=1
     else:
      v['POSITION'][0]*=.955;v['POSITION'][2]*=.89
     # Matte cotton and upper-arm skin remain one draw through vertex colors.
     color=[.040,.046,.048,1] if not is_skin else [.39675523,.23839757,.16513219,1]
     v['COLOR_0']=np.array(color);out.append(v)
    indices.extend([start,start+1,start+2])
 # Smooth normals across UV/color duplicate positions without changing topology.
 xyz=np.array([v['POSITION']for v in out]);acc={}
 for a,b,c in np.array(indices).reshape(-1,3):
  n=np.cross(xyz[b]-xyz[a],xyz[c]-xyz[a]);
  for q in[a,b,c]:key=tuple(np.round(xyz[q],6));acc[key]=acc.get(key,np.zeros(3))+n
 for i,v in enumerate(out):
  n=acc[tuple(np.round(xyz[i],6))];v['NORMAL']=n/max(np.linalg.norm(n),1e-12)
 for k in out[0]:
  p['attributes'][k]=g.add_array([v[k]for v in out],{'POSITION':'VEC3','NORMAL':'VEC3','TEXCOORD_0':'VEC2','JOINTS_0':'VEC4','WEIGHTS_0':'VEC4','COLOR_0':'VEC4'}[k],5123 if k=='JOINTS_0'else 5126)
 p['indices']=g.add_array(np.array(indices).reshape(-1,1),'SCALAR',5125)
 g.j['materials'][p['material']]={'name':'Mike fitted cotton and continuous upper-arm skin','pbrMetallicRoughness':{'baseColorFactor':[1,1,1,1],'metallicFactor':0,'roughnessFactor':.82},'doubleSided':False}
 r=g.save(ROOT/'assets/intro/mike-body.glb',{'fittedUndershirtV3':True,'skinArmEndpoint':'elbow','originalLowerBodyUnchanged':True});r['removedUniformComponents']=10;r['upperArmSkinVertices']=skin_vertices;return r

ARM_RECOVERY_JS=r'''
import {load} from './scripts/load-glb-cpu.mjs';import{createStoryForearmFit}from'./src/hands.js';import * as T from'three';
const source=process.argv[1],gltf=await load(source),out={};
for(const side of ['R','L']){
 const arm=gltf.scene.getObjectByName(side==='R'?'RightArm':'LeftArm'),pivot=new T.Group();pivot.add(arm);createStoryForearmFit(arm,{side});arm.updateMatrixWorld(true);
 arm.traverse(mesh=>{if(!mesh.isSkinnedMesh)return;mesh.skeleton.update();const g=mesh.geometry,points=[];for(let i=0;i<g.attributes.position.count;i++)points.push(mesh.getVertexPosition(i,new T.Vector3()).applyMatrix4(mesh.matrixWorld));
 // Weld UV seams for boundary classification, then close only the cropped elbow rim.
 const ids=new Map(),canon=[],representative=[];points.forEach((p,i)=>{const key=p.toArray().map(v=>Math.round(v*1e6)).join(',');if(!ids.has(key)){ids.set(key,ids.size);representative.push(i);}canon[i]=ids.get(key);});
 const edges=new Map(),index=Array.from(g.index.array);for(let i=0;i<index.length;i+=3)for(const[a,b]of[[index[i],index[i+1]],[index[i+1],index[i+2]],[index[i+2],index[i]]]){const x=canon[a],y=canon[b],key=x<y?`${x},${y}`:`${y},${x}`;const e=edges.get(key)||{count:0,a,b};e.count++;edges.set(key,e);}
 const boundary=[...edges.values()].filter(e=>e.count===1&&points[e.a].z>.17&&points[e.b].z>.17),rim=[...new Set(boundary.flatMap(e=>[canon[e.a],canon[e.b]]))].map(i=>representative[i]);
 if(rim.length<3)throw Error('No anatomical elbow rim');const center=rim.reduce((a,i)=>a.add(points[i]),new T.Vector3()).multiplyScalar(1/rim.length);rim.sort((a,b)=>Math.atan2(points[a].y-center.y,points[a].x-center.x)-Math.atan2(points[b].y-center.y,points[b].x-center.x));
 for(let i=1;i<rim.length-1;i++)index.push(rim[0],rim[i],rim[i+1]);
 out[mesh.name]={position:Array.from(g.attributes.position.array),normal:Array.from(g.attributes.normal.array),indices:index,capVertices:rim.length,canonicalBounds:new T.Box3().setFromPoints(points)};
 });
}console.log(JSON.stringify(out));
'''
def repair_arms(source):
 g=GLB(source);assert g.original_sha=='ef42a6fb1aee866bec852bbe722acd9a5cea36a291baba939691c7ecf9690e54'
 result=subprocess.run(['node','--input-type=module','-e',ARM_RECOVERY_JS,str(source)],cwd=ROOT,capture_output=True,text=True,check=True);out=json.loads(result.stdout)
 for name,data in out.items():
  p=g.primitive(name);p['attributes']['POSITION']=g.add_array(np.array(data['position']).reshape(-1,3),'VEC3');p['attributes']['NORMAL']=g.add_array(np.array(data['normal']).reshape(-1,3),'VEC3');p['indices']=g.add_array(np.array(data['indices']).reshape(-1,1),'SCALAR',5125)
 for node in g.j['nodes']:
  if node.get('name')in['RightArm','LeftArm']:node.setdefault('extras',{})['anatomicalForearmV3']=True
 r=g.save(ROOT/'assets/field/player-arms.glb',{'anatomicalForearmV3':True,'forearmExtensionRemoved':8,'elbowCapsClosed':True});r['caps']={k:v['capVertices']for k,v in out.items()};return r

def retain_editable_assets(paths):
 bpy.ops.wm.read_factory_settings(use_empty=True)
 for path in paths:
  before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(path));collection=bpy.data.collections.new('V3 '+Path(path).stem);bpy.context.scene.collection.children.link(collection)
  for o in set(bpy.data.objects)-before:
   o['visualOverhaulAsset']=str(Path(path).relative_to(ROOT))
   for old_collection in list(o.users_collection):old_collection.objects.unlink(o)
   collection.objects.link(o)
  collection.hide_viewport=Path(path).stem!='roadside-set'
 bpy.context.scene['CandidateScope']='Local visual-overhaul-v3 asset authoring; toggle named V3 collections to inspect each asset.'
 bpy.context.scene['SourceBaseline']='3d8b872b987905f4726c4408d712e719369ce375'
 bpy.context.preferences.filepaths.save_version=0
 bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'art/working/visual-overhaul-v3.blend'))

# --- Clarence-only refinement, kept inside this narrow approved exporter. ---
"""Clarence-only approved uniform/face refinement. Blender 4.3.2 + numpy.
Immutable GLB rig, clips, bind matrices, hands, fingers, wrist vertices retained.
No network, external textures, installers, other actors or project edits.
Reusable entry point: refine_clarence(source_path, output_directory).
"""
import bpy, numpy as np, math, json, struct, hashlib, copy, sys
from pathlib import Path
from mathutils import Vector

def sha(b):return hashlib.sha256(b).hexdigest()
def smooth(a,b,x):
 t=np.clip((x-a)/(b-a),0,1);return t*t*(3-2*t)
def gauss(x,c,w):return np.exp(-((x-c)/w)**2)
DT={5126:'<f4',5123:'<u2',5121:'u1',5125:'<u4'}
NC={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}
class ClarenceGLB:
 def __init__(self,p):
  raw=Path(p).read_bytes();n=struct.unpack_from('<I',raw,12)[0];self.j=json.loads(raw[20:20+n]);self.b=bytearray(raw[28+n:]);self.source=sha(raw)
 def array(self,i):
  a=self.j['accessors'][i];v=self.j['bufferViews'][a['bufferView']];dt=np.dtype(DT[a['componentType']]);n=NC[a['type']];return np.ndarray((a['count'],n),dtype=dt,buffer=self.b,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',n*dt.itemsize),dt.itemsize)).copy()
 def put(self,i,values):
  a=self.j['accessors'][i];v=self.j['bufferViews'][a['bufferView']];dt=np.dtype(DT[a['componentType']]);n=NC[a['type']];out=np.ndarray((a['count'],n),dtype=dt,buffer=self.b,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',n*dt.itemsize),dt.itemsize));out[:]=values
  if 'min'in a:a['min']=out.min(0).tolist()
  if 'max'in a:a['max']=out.max(0).tolist()
 def blob(self,b):
  while len(self.b)%4:self.b.append(0)
  i=len(self.j['bufferViews']);self.j['bufferViews'].append({'buffer':0,'byteOffset':len(self.b),'byteLength':len(b)});self.b.extend(b);return i
 def attr(self,v,kind,ctype=5126):
  a=np.array(v,dtype=DT[ctype]);i=len(self.j['accessors']);d={'bufferView':self.blob(a.tobytes()),'componentType':ctype,'count':len(a),'type':kind}
  if kind=='VEC3':d.update(min=a.min(0).tolist(),max=a.max(0).tolist())
  self.j['accessors'].append(d);return i
 def texture(self,raw,name):
  i=len(self.j['images']);self.j['images'].append({'bufferView':self.blob(raw),'mimeType':'image/png','name':name});t=len(self.j['textures']);self.j['textures'].append({'source':i,'sampler':0});return t
 def image_replace(self,i,raw,name,mime='image/png'):self.j['images'][i]={'bufferView':self.blob(raw),'mimeType':mime,'name':name}
 def pixels(self,i,E):
  im=self.j['images'][i];v=self.j['bufferViews'][im['bufferView']];p=E/f'_baseline_image_{i}.bin';p.write_bytes(self.b[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']]);im=bpy.data.images.load(str(p));w,h=im.size;a=np.empty(w*h*4,np.float32);im.pixels.foreach_get(a);bpy.data.images.remove(im);return a.reshape(h,w,4)[::-1].copy()
 def save(self,path):
  used={a['bufferView'] for a in self.j['accessors']}|{i['bufferView'] for i in self.j['images']};packed=bytearray();views=[];remap={}
  for old in sorted(used):
   v=copy.deepcopy(self.j['bufferViews'][old]);start=v.get('byteOffset',0);raw=self.b[start:start+v['byteLength']]
   while len(packed)%4:packed.append(0)
   v['byteOffset']=len(packed);packed.extend(raw);remap[old]=len(views);views.append(v)
  for a in self.j['accessors']:a['bufferView']=remap[a['bufferView']]
  for i in self.j['images']:i['bufferView']=remap[i['bufferView']]
  self.j['bufferViews']=views;self.b=packed;self.j['buffers'][0]['byteLength']=len(packed)
  while len(packed)%4:packed.append(0)
  raw=json.dumps(self.j,separators=(',',':')).encode();raw+=b' '*((-len(raw))%4);payload=struct.pack('<III',0x46546c67,2,28+len(raw)+len(packed))+struct.pack('<II',len(raw),0x4e4f534a)+raw+struct.pack('<II',len(packed),0x004e4942)+packed;Path(path).write_bytes(payload)
  return {'sha256':sha(payload),'bytes':len(payload),'triangles':sum(self.j['accessors'][p['indices']]['count']//3 for m in self.j['meshes'] for p in m['primitives'])}

def png(a,path,linear=False):
 h,w=a.shape[:2];im=bpy.data.images.new(path.stem,width=w,height=h,alpha=False);im.colorspace_settings.name='Non-Color' if linear else 'sRGB';rgba=np.ones((h,w,4),np.float32);rgba[:,:,:3]=np.clip(a[:,:,:3],0,1);im.pixels.foreach_set(rgba[::-1].ravel());im.file_format='PNG';im.filepath_raw=str(path);im.save();bpy.data.images.remove(im);return path.read_bytes()

def jpg(a,path):
 h,w=a.shape[:2];im=bpy.data.images.new(path.stem,width=w,height=h,alpha=False);rgba=np.ones((h,w,4),np.float32);rgba[:,:,:3]=np.clip(a[:,:,:3],0,1);im.pixels.foreach_set(rgba[::-1].ravel());im.file_format='JPEG';im.filepath_raw=str(path);im.save();bpy.data.images.remove(im);return path.read_bytes()

def semantic(g,mi,w=1024,h=1024):
 p=g.j['meshes'][mi]['primitives'][0];pos=g.array(p['attributes']['POSITION']);uv=g.array(p['attributes']['TEXCOORD_0'])*[w,h];ids=g.array(p['indices']).reshape(-1,3);xyz=np.zeros((h,w,3));valid=np.zeros((h,w),bool)
 for idx in ids:
  tri=uv[idx];lo=np.maximum(np.floor(tri.min(0)).astype(int)-1,0);hi=np.minimum(np.ceil(tri.max(0)).astype(int)+1,[w-1,h-1])
  if np.any(hi<lo):continue
  xx,yy=np.meshgrid(np.arange(lo[0],hi[0]+1)+.5,np.arange(lo[1],hi[1]+1)+.5);a,b,c=tri;den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1])
  if abs(den)<1e-9:continue
  v=((b[1]-c[1])*(xx-c[0])+(c[0]-b[0])*(yy-c[1]))/den;u=((c[1]-a[1])*(xx-c[0])+(a[0]-c[0])*(yy-c[1]))/den;r=1-v-u;inside=(v>=-.001)&(u>=-.001)&(r>=-.001);sl=np.s_[lo[1]:hi[1]+1,lo[0]:hi[0]+1];xyz[sl][inside]=(v[:,:,None]*pos[idx[0]]+u[:,:,None]*pos[idx[1]]+r[:,:,None]*pos[idx[2]])[inside];valid[sl][inside]=True
 return xyz,valid

def transform_normals(p,n,fn):
 eps=1e-4;J=np.stack([(fn(p+np.eye(3)[i]*eps)-fn(p-np.eye(3)[i]*eps))/(2*eps) for i in range(3)],2);q=np.linalg.solve(J.transpose(0,2,1),n[:,:,None])[:,:,0];return q/np.maximum(np.linalg.norm(q,axis=1)[:,None],1e-12)

def face_refine(p):
 q=p.copy();x,y,z=p.T;front=smooth(.15,.22,z);mouth=gauss(x,0,.05)*front
 # Anatomical lip volume and soft nasolabial/neck transitions, never identity change.
 q[:,2]-=.009*mouth*gauss(y,2.997,.010)+.0055*mouth*gauss(y,2.978,.010)
 q[:,2]+=.0045*mouth*gauss(y,2.959,.006)+.0040*mouth*gauss(y,2.944,.007)
 q[:,2]+=.0016*gauss(abs(x),.087,.038)*gauss(y,3.047,.045)*front
 neck=gauss(y,2.81,.095)*(1-smooth(.10,.13,abs(x)))
 q[:,0]*=1+.024*neck;q[:,2]+=.0015*neck*smooth(-.03,.06,z)
 # Preserve the previously approved source lower-neck seam; blend above it.
 q=p+(q-p)*smooth(2.86,2.93,y)[:,None]
 q[y<=2.86]=p[y<=2.86]
 return q

def shirt_refine(p):
 q=p.copy();x,y,z=p.T;a=abs(x-.009331)
 # Taper only torso; source wrist/cuff positions are protected by the x mask.
 body=(1-smooth(.27,.43,a))*gauss(y,2.20,.48)
 q[:,0]=.009331+(x-.009331)*(1-.045*body)
 q[:,2]-=.006*body*smooth(.05,.15,z)
 # Quietly soften the square neck-to-shoulder transition and slope.
 shoulder=gauss(a,.285,.18)*smooth(2.57,2.73,y)*(1-smooth(2.85,2.92,y))
 q[:,1]-=.014*shoulder
 # Folded collar sits closer to the neck rather than flaring outward.
 collar=smooth(2.73,2.86,y)*(1-smooth(.15,.26,a))
 q[:,0]=.009331+(q[:,0]-.009331)*(1-.045*collar)
 q[:,2]+=.006*collar*smooth(.035,.12,z)
 q[abs(x)>.70]=p[abs(x)>.70]
 return q

def ear_refine(p,sign):
 q=p.copy();x,y,z=p.T;rim=gauss(y,3.066,.073)
 q[:,0]-=sign*.0033*rim*smooth(.115,.140,abs(x))
 q[:,2]+=.0032*gauss(y,3.02,.03)-.0015*gauss(y,3.10,.03)
 return q

class Detail:
 def __init__(self,g,cloth):
  self.g=g;self.mesh=cloth;self.pos=cloth['POSITION'];self.ind=cloth['indices'];self.ids=cloth['JOINTS_0'];self.w=cloth['WEIGHTS_0'];self.groups={}
 def surface(self,x,y):
  tri=self.pos[self.ind];a=tri[:,0,:2];b=tri[:,1,:2];c=tri[:,2,:2];den=(b[:,1]-c[:,1])*(a[:,0]-c[:,0])+(c[:,0]-b[:,0])*(a[:,1]-c[:,1]);ok=abs(den)>1e-10;den=np.where(ok,den,1)
  v=((b[:,1]-c[:,1])*(x-c[:,0])+(c[:,0]-b[:,0])*(y-c[:,1]))/den;u=((c[:,1]-a[:,1])*(x-c[:,0])+(a[:,0]-c[:,0])*(y-c[:,1]))/den;r=1-v-u;good=ok&(v>=-1e-6)&(u>=-1e-6)&(r>=-1e-6)
  iz=np.flatnonzero(good)
  if len(iz):
   zz=v*tri[:,0,2]+u*tri[:,1,2]+r*tri[:,2,2];k=iz[np.argmax(zz[iz])];ids=self.ind[k];bb=np.array([v[k],u[k],r[k]])
  else:
   k=np.argmin(((self.pos[:,0]-x)**2+(self.pos[:,1]-y)**2)+np.maximum(0,-self.pos[:,2])*.7);ids=np.array([k,k,k]);bb=np.array([1.,0,0]);zz=self.pos[k,2]
  weights={}
  for i,t in zip(ids,bb):
   for j,w in zip(self.ids[i],self.w[i]):weights[int(j)]=weights.get(int(j),0)+float(t*w)
  order=sorted(weights,key=weights.get,reverse=True)[:4];ww=np.array([max(0,weights[k]) for k in order]);ww/=ww.sum();order+=[0]*(4-len(order));ww=np.pad(ww,(0,4-len(ww)))
  z=float((bb@self.pos[ids])[2]);return z,order,ww
 def add(self,material,vertices,faces,uv=None,project=True,offset=.004):
  vertices=[list(v) for v in vertices];faces=[list(f) for f in faces]
  # Conforming tessellation keeps panels/plackets fitted over the curved chest.
  while True:
   edges={tuple(sorted((f[k],f[(k+1)%3]))) for f in faces for k in range(3)}
   edge=max(edges,key=lambda e:np.linalg.norm(np.array(vertices[e[0]])[:2]-np.array(vertices[e[1]])[:2]))
   if np.linalg.norm(np.array(vertices[edge[0]])[:2]-np.array(vertices[edge[1]])[:2])<=.050:break
   mid=len(vertices);vertices.append(((np.array(vertices[edge[0]])+np.array(vertices[edge[1]]))*.5).tolist());new=[]
   for f in faces:
    if edge[0] in f and edge[1] in f:
     for k in range(3):
      a,b,c=f[k],f[(k+1)%3],f[(k+2)%3]
      if {a,b}==set(edge):new.extend([[a,mid,c],[mid,b,c]]);break
    else:new.append(f)
   faces=new
  group=self.groups.setdefault(material,{'p':[],'f':[],'uv':[],'j':[],'w':[]});start=len(group['p'])
  for i,(x,y,z) in enumerate(vertices):
   surface,j,w=self.surface(x,y)
   if project:z=surface+z+offset
   group['p'].append([x,y,z]);group['j'].append(j);group['w'].append(w);group['uv'].append(uv[i] if uv else [x*1.4,y*1.4])
  group['f'] += [[start+a,start+b,start+c] for a,b,c in faces]
 def panel(self,mat,outline,depth=.004,offset=.005):
  # Front and thin bevel sides; projected individually onto the real shirt.
  c=np.array(outline).mean(0);n=len(outline);p=[[*v,depth] for v in outline]+[[*c,depth+.001]]+[[*v,0] for v in outline];f=[]
  for i in range(n):
   j=(i+1)%n;f += [[n,i,j],[i,i+n+1,j+n+1],[i,j+n+1,j]]
  self.add(mat,p,f,offset=offset)
 def ribbon(self,mat,points,width=.0015,offset=.005):
  p=[]
  for i,v in enumerate(points):
   a=np.array(points[max(0,i-1)]);b=np.array(points[min(len(points)-1,i+1)]);d=b-a;d=np.array([-d[1],d[0]])/(np.linalg.norm(d)+1e-12)*width
   p.extend([[v[0]-d[0],v[1]-d[1],0],[v[0]+d[0],v[1]+d[1],0]])
  f=[]
  for i in range(len(points)-1):a=2*i;f.extend([[a,a+1,a+2],[a+1,a+3,a+2]])
  self.add(mat,p,f,offset=offset)
 def button(self,mat,x,y,r=.007,offset=.008):
  p=[[x,y,.002]]+[[x+r*math.cos(a),y+r*math.sin(a),0] for a in np.linspace(0,2*math.pi,10,endpoint=False)];f=[[0,1+i,1+(i+1)%10] for i in range(10)];self.add(mat,p,f,offset=offset)
 def write(self):
  counts={}
  for mat,a in self.groups.items():
   p=np.array(a['p']);f=np.array(a['f']);cross=np.cross(p[f[:,1]]-p[f[:,0]],p[f[:,2]]-p[f[:,0]]);bad=cross[:,2]<0;f[bad]=f[bad][:,[0,2,1]];n=np.zeros_like(p);cross=np.cross(p[f[:,1]]-p[f[:,0]],p[f[:,2]]-p[f[:,0]])
   for k in range(3):np.add.at(n,f[:,k],cross)
   n/=np.maximum(np.linalg.norm(n,axis=1)[:,None],1e-12)
   # Front-facing details should face +Z in source glTF space.
   bad=n[:,2]<0;n[bad]*=-1
   attrs={'POSITION':self.g.attr(p,'VEC3'),'NORMAL':self.g.attr(n,'VEC3'),'TEXCOORD_0':self.g.attr(a['uv'],'VEC2'),'JOINTS_0':self.g.attr(a['j'],'VEC4',5123),'WEIGHTS_0':self.g.attr(a['w'],'VEC4')};mi=len(self.g.j['meshes']);name=['Authored uniform panels','Authored uniform seam flow','Authored uniform fictional badge','Authored uniform dark buttons'][mat-10] if mat>=10 else 'Uniform detail';self.g.j['meshes'].append({'name':name,'primitives':[{'attributes':attrs,'indices':self.g.attr(f.reshape(-1,1),'SCALAR',5123),'material':mat}]});ni=len(self.g.j['nodes']);self.g.j['nodes'].append({'name':name,'mesh':mi,'skin':0,'extras':{'authoredUniformV3':True}});self.g.j['nodes'][66]['children'].append(ni);counts[name]=len(f)
  return counts

def refine_clarence(source_path,output_directory):
 E=Path(output_directory);E.mkdir(parents=True,exist_ok=True);g=ClarenceGLB(source_path);original=ClarenceGLB(source_path);assert g.source=='d1c31bb31b1a012d5e16ff32b4e6f484d9f2699c009bd553827973d238f0547e','Use the immutable approved Clarence baseline';assert g.j['asset']['extras']['cinematicCharacter']=='clarence';report={'baselineSha256':g.source,'date':'2026-10-05','authoring':'Blender 4.3.2 / numpy, no external services or new dependencies'}
 for mi in [1,6,2,3,8]:
  pr=g.j['meshes'][mi]['primitives'][0];a=pr['attributes'];p=g.array(a['POSITION']);n=g.array(a['NORMAL']);fn=shirt_refine if mi==8 else (lambda p:ear_refine(p,1 if mi==2 else -1)) if mi in [2,3] else face_refine;q=fn(p);nn=transform_normals(p,n,fn)
  if mi in [1,6]:
   protected=p[:,1]<=2.86;q[protected]=p[protected];nn[protected]=n[protected]
  g.put(a['POSITION'],q);g.put(a['NORMAL'],nn)
 # Correct an inherited lip/albedo mismatch without changing the identity.
 face=g.pixels(1,E)[:,:,:3];normal_image=g.j['textures'][g.j['materials'][6]['normalTexture']['index']]['source'];normal=g.pixels(normal_image,E)[:,:,:3]
 for mi in [6,1]:
  xyz,valid=semantic(original,mi);x,y,z=xyz.transpose(2,0,1);front=smooth(.17,.22,z)*valid
  old=gauss(x,0,.058)*gauss(y,2.988,.025)*front
  # Clean only the misplaced old lip pigmentation and matching normal relief.
  base=np.array([.35,.205,.135]);face=face*(1-old[:,:,None]*.92)+base*old[:,:,None]*.92
  normal=normal*(1-old[:,:,None]*.85)+np.array([.5,.5,1])*old[:,:,None]*.85
  lip=np.clip(gauss(x,0,.049)*(gauss(y,2.959,.0050)+gauss(y,2.943,.0060))*front,0,1)
  color=np.array([.275,.135,.116]);face=face*(1-lip[:,:,None]*.82)+color*lip[:,:,None]*.82
 g.image_replace(1,jpg(face,E/'clarence-refined-skin-color-1024.jpg'),'Clarence corrected lip placement; medium-dark skin direction preserved','image/jpeg')
 g.image_replace(normal_image,jpg(normal,E/'clarence-refined-skin-normal-1024.jpg'),'Clarence inherited skin detail with corrected lip continuity','image/jpeg')
 # Woven matte navy surface replaces permanent photographic illumination.
 h=w=1024;v,u=np.mgrid[:h,:w];rng=np.random.default_rng(9017);weave=.5*np.sin(u*math.pi/2)*np.cos(v*math.pi/2)+.30*np.sin((u+v)*math.pi/4);fine=rng.normal(0,1,(h,w));rgb=np.ones((h,w,3))*np.array([.075,.13,.22]);rgb += (weave*.0007)[:,:,None]
 xyz,valid=semantic(g,8);x,y,z=xyz.transpose(2,0,1);front=smooth(.08,.17,z)*valid;center=.009331;placket=gauss(x,center,.016)*smooth(2.08,2.16,y)*(1-smooth(2.69,2.76,y))*front
 rgb*=1-.045*placket[:,:,None]
 relief=.000008*weave;relief+=.00011*placket
 # Quiet stitched yoke and small tension folds; only actual normal response.
 relief+=.000018*np.sin((abs(x)-.13)*180)*gauss(y,2.41,.18)*gauss(abs(x),.27,.06)*front
 gy,gx=np.gradient(relief);normal=np.stack([-gx*1024*2,-gy*1024*2,np.ones((h,w))],2);normal/=np.linalg.norm(normal,axis=2)[:,:,None];normal=normal*.5+.5
 rough=np.clip(.84+.012*weave-.035*placket,.77,.90);packed=np.stack([np.ones((h,w)),rough,np.zeros((h,w))],2)
 g.image_replace(4,png(rgb,E/'clarence-navy-cloth-color-1024.png'),'Clarence navy woven cloth 1024 sRGB');color=8;nt=g.texture(png(normal,E/'clarence-navy-cloth-normal-1024.png',True),'Clarence woven cloth tangent normal 1024 linear');rt=g.texture(png(packed,E/'clarence-navy-cloth-surface-1024.png',True),'Clarence matte cloth roughness 1024 linear')
 clothmat=g.j['materials'][8];clothmat['pbrMetallicRoughness'].update(baseColorTexture={'index':color},baseColorFactor=[1,1,1,1],metallicFactor=0,roughnessFactor=1,metallicRoughnessTexture={'index':rt});clothmat['normalTexture']={'index':nt,'scale':.6};clothmat['extras']={'authoredUniformV3':True,'colorSpaceContract':'color sRGB; normal/roughness linear; no painted highlights'}
 # Matching panel cloth, quiet thread, fictional brass and dark polymer buttons.
 panel=copy.deepcopy(clothmat);panel['name']='Clarence authored navy uniform panels';g.j['materials'].append(panel)
 g.j['materials'].append({'name':'Clarence restrained navy seams','doubleSided':True,'pbrMetallicRoughness':{'baseColorFactor':[.014,.020,.028,1],'metallicFactor':0,'roughnessFactor':.90},'extras':{'authoredUniformV3':True}})
 g.j['materials'].append({'name':'Clarence fictional brushed brass badge','doubleSided':True,'pbrMetallicRoughness':{'baseColorFactor':[.25,.205,.115,1],'metallicFactor':.70,'roughnessFactor':.48},'extras':{'fictionalInsignia':True,'authoredUniformV3':True}})
 g.j['materials'].append({'name':'Clarence matte navy buttons','doubleSided':True,'pbrMetallicRoughness':{'baseColorFactor':[.010,.014,.019,1],'metallicFactor':.05,'roughnessFactor':.73},'extras':{'authoredUniformV3':True}})
 pr=g.j['meshes'][8]['primitives'][0];data={k:g.array(v) for k,v in pr['attributes'].items()};data['indices']=g.array(pr['indices']).reshape(-1,3);d=Detail(g,data)
 # Flat tailored chest pockets with angled lower corners and restrained flaps.
 for side in [-1,1]:
  cx=center+side*.158
  outline=[(cx-.066,2.485),(cx-.066,2.366),(cx-.049,2.354),(cx+.049,2.354),(cx+.066,2.366),(cx+.066,2.485)]
  d.panel(10,outline,depth=.0030,offset=.0050)
  flap=[(cx-.072,2.501),(cx-.072,2.477),(cx,2.465),(cx+.072,2.477),(cx+.072,2.501)]
  d.panel(10,flap,depth=.003,offset=.012)
  d.ribbon(11,[(cx-.057,2.473),(cx-.057,2.371),(cx-.045,2.361),(cx+.045,2.361),(cx+.057,2.371),(cx+.057,2.473)],width=.00065,offset=.0095)
  d.button(13,cx,2.481,.0055,.019)
 # One real center placket and aligned dark buttons, fitted to chest surface.
 d.panel(10,[(center-.015,2.11),(center+.015,2.11),(center+.015,2.683),(center-.015,2.683)],depth=.0025,offset=.004)
 for xline in [center-.011,center+.011]:d.ribbon(11,[(xline,2.115),(xline,2.28),(xline,2.46),(xline,2.67)],width=.0005,offset=.008)
 for yy in [2.18,2.31,2.44,2.57,2.672]:d.button(13,center,yy,.0054,.010)
 # A small fictional shield and anonymous blank nameplate, no real logo/text.
 cx=center-.156;cy=2.595
 d.panel(12,[(cx-.027,cy+.035),(cx+.027,cy+.035),(cx+.028,cy+.001),(cx+.018,cy-.022),(cx,cy-.035),(cx-.018,cy-.022),(cx-.028,cy+.001)],depth=.003,offset=.006)
 d.panel(10,[(cx-.017,cy+.022),(cx+.017,cy+.022),(cx+.017,cy-.002),(cx,cy-.021),(cx-.017,cy-.002)],depth=.002,offset=.011)
 d.button(12,cx,cy+.002,.009,.015)
 d.panel(12,[(center+.108,2.607),(center+.202,2.607),(center+.202,2.619),(center+.108,2.619)],depth=.0018,offset=.005)
 report['detailTriangles']=d.write()
 g.j['asset']['extras'].update(authoredUniformV3=True,uniformRevision='visual-upgrade-v3-clarence-v1',uniformBaselineSha256=g.source,uniformMaterial='Matte navy cloth, original woven tangent normals and roughness, fictional shield and anonymous nameplate',uniformIntegration='Skip duplicated generated shirt details/insignia and extra shirt color multiplier; retain runtime belt/buckle and shirt hem/pants refit',faceRefinementV3='Subtle lips, cheek/neck transition and ear rim; original rig, identity, head bounds and eye surfaces retained')
 output=E/'clarence-uniform-v3-candidate.glb';report.update(g.save(output));report['runtimeLidTriangles']=384;report['wholeActorWithLids']=report['triangles']+384;assert report['wholeActorWithLids']<=18000
 cand=ClarenceGLB(output)
 # Preserve every old identity metadata key; animation/node binding contracts.
 assert all(cand.j['asset']['extras'][k]==v for k,v in original.j['asset']['extras'].items())
 assert cand.j['animations']==original.j['animations'];assert cand.j['skins']==original.j['skins'];assert cand.j['nodes'][:66]==original.j['nodes'][:66]
 unchanged=[]
 for mi in [0,4,5,7,9]:
  a=cand.j['meshes'][mi]['primitives'][0];b=original.j['meshes'][mi]['primitives'][0]
  assert all(np.array_equal(cand.array(a['attributes'][k]),original.array(v)) for k,v in b['attributes'].items());unchanged.append(mi)
 # All source weights, topology and UVs are immutable. Face index repairs remain.
 for mi in range(10):
  a=cand.j['meshes'][mi]['primitives'][0];b=original.j['meshes'][mi]['primitives'][0]
  for k in ['JOINTS_0','WEIGHTS_0','TEXCOORD_0']:assert np.array_equal(cand.array(a['attributes'][k]),original.array(b['attributes'][k]))
  assert np.array_equal(cand.array(a['indices']),original.array(b['indices']))
 for anim in original.j['animations']:
  for samp in anim['samplers']:
   for key in ['input','output']:assert np.array_equal(cand.array(samp[key]),original.array(samp[key]))
 assert np.array_equal(cand.array(cand.j['skins'][0]['inverseBindMatrices']),original.array(original.j['skins'][0]['inverseBindMatrices']))
 # Cuffs far outside the torso region remain byte-identical.
 cp=cand.array(cand.j['meshes'][8]['primitives'][0]['attributes']['POSITION']);op=original.array(original.j['meshes'][8]['primitives'][0]['attributes']['POSITION']);mask=abs(op[:,0])>.70;assert np.array_equal(cp[mask],op[mask])
 # Protected lower-neck rows and their complete influence tuples are exact.
 head=cand.j['meshes'][6]['primitives'][0]['attributes'];oldhead=original.j['meshes'][6]['primitives'][0]['attributes'];protected=original.array(oldhead['POSITION'])[:,1]<=2.86
 for key in ['POSITION','NORMAL','JOINTS_0','WEIGHTS_0']:assert np.array_equal(cand.array(head[key])[protected],original.array(oldhead[key])[protected])
 def image_bytes(model,i):
  view=model.j['bufferViews'][model.j['images'][i]['bufferView']];start=view.get('byteOffset',0);return bytes(model.b[start:start+view['byteLength']])
 report['originalWardrobeImages']={str(i):{'changed':image_bytes(cand,i)!=image_bytes(original,i),'sourceSha256':sha(image_bytes(original,i)),'candidateSha256':sha(image_bytes(cand,i)),'sourceMime':original.j['images'][i]['mimeType'],'candidateMime':cand.j['images'][i]['mimeType']} for i in [0,3,4]}
 report['verification']={'protectedLowerNeckRows':int(protected.sum()),'protectedLowerNeckPositionsNormalsInfluencesExact':True,'sourceExtrasPreserved':True,'joints':56,'clips':['Seated','Talk','Walk'],'allOriginalWeightsUVIndicesPreserved':True,'allAnimationAndBindBytesPreserved':True,'fullUnchangedMeshes':unchanged,'shirtCuffPositionsPreserved':int(mask.sum()),'imagesEmbedded':all('uri' not in i for i in cand.j['images']),'runtimeScreenshotsPlaytestPerformance':'not performed by asset-only task'}
 (E/'clarence-asset-report.json').write_text(json.dumps(report,indent=2)+'\n');return report


# --- The Level 1 house only; the projector and cabin originals are never exported. ---
def author_roadside_house():
 original=ROOT/'art/working/human-roadside-v2.blend'
 assert hashlib.sha256(original.read_bytes()).hexdigest()=='e79f9fd1cd28c66e676e7bd46e1dfa14c1b9ace141be0b307321d4216cac9d86'
 bpy.ops.wm.open_mainfile(filepath=str(original),load_ui=False)
 sources=[o for o in bpy.data.objects if o.get('asset')=='roadside-set']
 for o in list(bpy.data.objects):
  if o not in sources:bpy.data.objects.remove(o,do_unlink=True)
 for o in sources:o.hide_set(False);o.hide_render=False
 shell=next(o for o in sources if o.name.startswith('House closed weathered shell'));wood=shell.data.materials[0];shell_matrix=shell.matrix_world.copy()
 # Replace only the front wall with a gridded facade containing real apertures.
 bm=bmesh.new();bm.from_mesh(shell.data);faces=[f for f in bm.faces if f.normal.x<-.9];bmesh.ops.delete(bm,geom=faces,context='FACES');bm.to_mesh(shell.data);bm.free()
 def add_cube(name,dim,loc,mat,bevel=0):
  bpy.ops.mesh.primitive_cube_add(size=1,location=(loc[0],-loc[2],loc[1]));o=bpy.context.object;o.name=name;o.dimensions=(dim[0],dim[2],dim[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(mat)
  if bevel:
   q=o.modifiers.new('Authored soft edge','BEVEL');q.width=bevel;q.segments=1;bpy.ops.object.modifier_apply(modifier=q.name)
  bpy.context.view_layer.update()
  if mat==wood:
   uv=o.data.uv_layers.active or o.data.uv_layers.new(name='UVMap')
   for face in o.data.polygons:
    axis=max(range(3),key=lambda i:abs(face.normal[i]));axes=[i for i in range(3)if i!=axis]
    for li in face.loop_indices:
     v=o.matrix_world@o.data.vertices[o.data.loops[li].vertex_index].co;uv.data[li].uv=(v[axes[0]]/2,v[axes[1]]/2)
  sources.append(o);return o
 windows=[(5.05,1.56),(8.95,1.56),(5.05,3.65),(8.95,3.65)]
 holes=[(z-.415,z+.415,y-.55,y+.55)for z,y in windows]+[(6.54,7.46,.405,2.295)]
 zs=sorted(set([3.8,10.2]+[v for h in holes for v in h[:2]]));ys=sorted(set([.03,4.68]+[v for h in holes for v in h[2:]]))
 for za,zb in zip(zs,zs[1:]):
  for ya,yb in zip(ys,ys[1:]):
   z=(za+zb)/2;y=(ya+yb)/2
   if any(h[0]<z<h[1]and h[2]<y<h[3]for h in holes):continue
   add_cube('Recessed aperture weatherboard',( .07,yb-ya,zb-za),(7.28,y,z),wood)
 glass=bpy.data.materials.new('Warm recessed house window glass');glass.use_nodes=True;glass.diffuse_color=(.38,.22,.095,1);bsdf=glass.node_tree.nodes.get('Principled BSDF');bsdf.inputs['Base Color'].default_value=(.38,.22,.095,1);bsdf.inputs['Roughness'].default_value=.28;bsdf.inputs['Emission Color'].default_value=(1,.51,.15,1);bsdf.inputs['Emission Strength'].default_value=.70
 trim=next(o for o in sources if o.name.startswith('Window side frame')).data.materials[0];warm=next(o for o in sources if o.name.startswith('Streetlight warm underside')).data.materials[0]
 for o in sources:
  if o.name.startswith('Unlit house window'):
   o.location.x=7.365;o.name=o.name.replace('Unlit house window','Warm recessed window');o.data.materials.clear();o.data.materials.append(glass)
  elif o.name.startswith('Deep unlit porch door'):o.location.x=7.34;o.name='Recessed solid porch door'
 # Stop old siding seams at true window/door openings.
 for old in list(sources):
  if not old.name.startswith('Horizontal siding seam'):continue
  y=old.location.z;cuts=[3.85,10.15]
  for h in holes:
   if h[2]<y<h[3]:cuts.extend(h[:2])
  cuts=sorted(set(cuts));mat=old.data.materials[0];bpy.data.objects.remove(old,do_unlink=True);sources.remove(old)
  for za,zb in zip(cuts,cuts[1:]):
   if any(h[0]<(za+zb)/2<h[1]and h[2]<y<h[3]for h in holes):continue
   add_cube('Siding seam between apertures',(.018,.017,zb-za),(7.238,y,(za+zb)/2),mat)
 # Side reveals and sill depth make the window openings survive near inspection.
 for z,y in windows:
  for zz in [z-.43,z+.43]:add_cube('Window deep jamb',(.16,1.13,.03),(7.30,y,zz),trim)
  for yy in [y-.56,y+.56]:add_cube('Window deep reveal',(.16,.03,.90),(7.30,yy,z),trim)
  # Internal dark mullion/crosspiece avoids blank luminous rectangles.
  add_cube('Window inner cross',(.02,.036,.82),(7.35,y-.08,z),trim)
 add_cube('Porch lamp backplate',(.07,.23,.16),(7.16,2.40,7.75),trim,.014)
 add_cube('Porch warm lantern lens',(.19,.16,.13),(7.02,2.38,7.75),warm,.018)
 add_cube('Porch lantern hood',(.24,.045,.20),(7.015,2.50,7.75),trim,.009)
 # Break the rectangular gravel edge into a graded ribbon and two compressed ruts.
 drive=next(o for o in sources if o.name.startswith('Short driveway to road'));gravel=drive.data.materials[0];bpy.data.objects.remove(drive,do_unlink=True);sources.remove(drive);verts=[];faces=[]
 for j in range(25):
  t=j/24;x=-.94+6.22*t;center=5.3+1.70*t;width=1.1-.35*t+.05*math.sin(t*23)
  for i in range(9):
   q=i/4-1;z=center+q*width;y=-.018-.012*math.exp(-((abs(q)-.53)/.14)**2)+.003*math.sin(j*1.7+i*.9)
   verts.append((x,-z,y))
 for j in range(24):
  for i in range(8):a=j*9+i;faces.append((a,a+9,a+10,a+1))
 me=bpy.data.meshes.new('Graded driveway ruts');me.from_pydata(verts,[],faces);me.materials.append(gravel);me.update();o=bpy.data.objects.new('Graded driveway wheel ruts',me);bpy.context.collection.objects.link(o);sources.append(o)
 uv=me.uv_layers.new(name='UVMap')
 for loop in me.loops:
  p=me.vertices[loop.vertex_index].co;uv.data[loop.index].uv=(p.x/2,-p.y/2)
 # Export material-compatible batches; never includes the separate original projector.
 mats=[]
 for o in sources:
  for m in o.data.materials:
   if m not in mats:mats.append(m)
 exported=[]
 for mat in mats:
  copies=[]
  for o in sources:
   if mat not in list(o.data.materials):continue
   c=o.copy();c.data=o.data.copy();bpy.context.collection.objects.link(c);copies.append(c)
  bpy.context.view_layer.update()
  for c in copies:
   c.data.transform(c.matrix_world);c.matrix_world=Matrix.Identity(4)
  bpy.ops.object.select_all(action='DESELECT')
  for c in copies:c.select_set(True)
  bpy.context.view_layer.objects.active=copies[0];bpy.ops.object.join();o=bpy.context.object;o.name='Roadside v3 '+mat.name;exported.append(o)
 bpy.ops.object.select_all(action='DESELECT')
 for o in exported:o.select_set(True)
 target=ROOT/'assets/intro/roadside-set.glb';bpy.ops.export_scene.gltf(filepath=str(target),export_format='GLB',use_selection=True,export_animations=False,export_yup=True,export_extras=True,export_cameras=False,export_lights=False)
 return GLB(target).save(target,{'visualOverhaulV3':True,'litWindows':4,'recessedApertures':True,'gradedDriveway':True,'projectorUnchanged':True})

"""Original Cornfields roadside dog, authored procedurally in Blender 4.3.2.
No external data, textures, add-ons, dependencies or downloads.
Import build_roadside_dog into another Blender script; it never resets the scene.
Blender coordinates: +Y forward, +Z up. glTF export: -Z forward, +Y up.
"""
import bpy
import math
from mathutils import Vector, Matrix


def build_roadside_dog(collection_name='RoadsideDogAsset', location=(0, 0, 0)):
    """Return named root, body, head, jaw, tail, tether and owned objects.

    Asset coordinates are metres. Paw soles are fixed at ground level. Animate
    only DogHead, DogJaw and DogTail (all are local pivot empties), never DogRoot
    or DogBody for bark/idle. DogCollarTether is fixed to the collar on DogBody.
    Geometry is an original tapered surface model, union-remeshed then reduced.
    No existing object, collection, material or scene setting is modified.
    """
    collection = bpy.data.collections.new(collection_name)
    bpy.context.scene.collection.children.link(collection)
    owned = []

    def own(obj):
        for c in list(obj.users_collection):
            c.objects.unlink(obj)
        collection.objects.link(obj)
        owned.append(obj)
        return obj

    def activate(obj):
        for o in list(bpy.context.selected_objects):
            o.select_set(False)
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj

    def mesh(name, vertices, faces):
        data = bpy.data.meshes.new(name + 'Geometry')
        data.from_pydata(vertices, [], faces)
        data.update()
        obj = bpy.data.objects.new(name, data)
        collection.objects.link(obj)
        owned.append(obj)
        return obj

    def ellipsoid(name, loc, scale, segments=16, rings=10):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=loc)
        obj = own(bpy.context.object)
        obj.name = name
        obj.scale = scale
        activate(obj)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        return obj

    def tube(name, sections, sides=12):
        # Each entry is (center, radius_x, radius_in_path_plane).
        verts = []
        for i, (center, rx, rz) in enumerate(sections):
            c = Vector(center)
            if i == 0:
                tangent = Vector(sections[1][0]) - c
            elif i == len(sections)-1:
                tangent = c - Vector(sections[i-1][0])
            else:
                tangent = Vector(sections[i+1][0]) - Vector(sections[i-1][0])
            tangent.normalize()
            u = Vector((1, 0, 0))
            v = tangent.cross(u).normalized()
            for j in range(sides):
                a = 2*math.pi*j/sides
                verts.append(tuple(c + rx*math.cos(a)*u + rz*math.sin(a)*v))
        faces = []
        for i in range(len(sections)-1):
            for j in range(sides):
                a = i*sides+j
                b = i*sides+(j+1)%sides
                faces.append((a, b, b+sides, a+sides))
        # Surface windings will be normalized before union.
        verts.extend([sections[0][0], sections[-1][0]])
        for j in range(sides):
            faces.append((len(verts)-2, (j+1)%sides, j))
            k=(len(sections)-1)*sides
            faces.append((len(verts)-1, k+j, k+(j+1)%sides))
        return mesh(name, verts, faces)

    def combine(name, objects):
        if len(objects) == 1:
            objects[0].name = name
            return objects[0]
        for o in list(bpy.context.selected_objects):
            o.select_set(False)
        for o in objects:
            o.select_set(True)
        bpy.context.view_layer.objects.active = objects[0]
        bpy.ops.object.join()
        result = bpy.context.object
        result.name = name
        return result

    def organic(name, objects, voxel, target):
        obj = combine(name, objects)
        activate(obj)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        # Recalculate outward normals before a true connected voxel union.
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.mesh.normals_make_consistent(inside=False)
        bpy.ops.object.mode_set(mode='OBJECT')
        subd = obj.modifiers.new('AnatomicalProfileFairing', 'SUBSURF')
        subd.subdivision_type = 'CATMULL_CLARK'
        subd.levels = 1
        bpy.ops.object.modifier_apply(modifier=subd.name)
        remesh = obj.modifiers.new('OriginalConnectedSurface', 'REMESH')
        remesh.mode = 'VOXEL'
        remesh.voxel_size = voxel
        remesh.use_smooth_shade = True
        bpy.ops.object.modifier_apply(modifier=remesh.name)
        smooth = obj.modifiers.new('SoftAnatomicalTransitions', 'SMOOTH')
        smooth.factor = .60
        smooth.iterations = 3
        bpy.ops.object.modifier_apply(modifier=smooth.name)
        tri = obj.modifiers.new('TriangulatedAsset', 'TRIANGULATE')
        bpy.ops.object.modifier_apply(modifier=tri.name)
        if len(obj.data.polygons) > target:
            dec = obj.modifiers.new('BudgetedTopology', 'DECIMATE')
            dec.ratio = target / len(obj.data.polygons)
            bpy.ops.object.modifier_apply(modifier=dec.name)
        for p in obj.data.polygons:
            p.use_smooth = True
        return obj

    coat = bpy.data.materials.new('DogOriginalVertexCoat')
    coat.use_nodes = True
    bsdf = coat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Roughness'].default_value = .79
    bsdf.inputs['Specular IOR Level'].default_value = .22
    color = coat.node_tree.nodes.new('ShaderNodeVertexColor')
    color.layer_name = 'DogCoatColor'
    coat.node_tree.links.new(color.outputs['Color'], bsdf.inputs['Base Color'])
    coat.diffuse_color = (.18, .09, .041, 1)

    def paint(obj, color_fn):
        obj.data.materials.clear()
        obj.data.materials.append(coat)
        attr = obj.data.color_attributes.get('DogCoatColor')
        if attr:
            obj.data.color_attributes.remove(attr)
        attr = obj.data.color_attributes.new(name='DogCoatColor', type='BYTE_COLOR', domain='CORNER')
        for p in obj.data.polygons:
            p.material_index = 0
            p.use_smooth = True
            for li in p.loop_indices:
                vert = obj.data.vertices[obj.data.loops[li].vertex_index]
                pos = obj.matrix_world @ vert.co
                attr.data[li].color = tuple(color_fn(pos))[:3] + (1,)
        obj.data.color_attributes.active_color = attr
        return obj

    def fixed(rgb):
        return lambda p: rgb

    def mix(a,b,t):
        t=max(0,min(1,t))
        return tuple(a[i]*(1-t)+b[i]*t for i in range(3))

    def coat_body(p):
        x,y,z=p
        # Sable/tan lower coat, a softly feathered near-black saddle, dark hocks.
        tan=(.145, .066, .024)
        black=(.017, .015, .013)
        threshold=.477 + .035*math.sin(7*y) - .095*max(0,abs(x)-.04)
        saddle=max(0,min(1,(z-threshold)*25))
        if y>.22:
            saddle *= max(0,min(1,(z-.57)*20))
        variation=.97 + .055*math.sin(x*113+y*77+z*91)*math.sin(z*193+y*47)
        c=mix(tan, black, saddle)
        if z<.075:
            c=mix(c,(.077,.041,.024),.32)
        if abs(x)<.07 and y>.11 and .34<z<.47:
            c=mix(c,(.33,.225,.13),.35)
        return tuple(v*variation for v in c)

    def coat_head(p):
        x,y,z=p
        tan=(.145,.071,.029)
        dark=(.033,.027,.024)
        t=max(0,min(1,(z-.737)*25))*.83
        if y>.46:
            t=max(t, min(.9,(y-.45)*7))
        return mix(tan,dark,t)

    # A continuous ribcage, tucked abdomen, shoulder and ascending neck.
    sections=[
        ((0,-.378,.465),.037,.056),
        ((0,-.337,.478),.092,.115),
        ((0,-.257,.467),.111,.125),
        ((0,-.145,.455),.116,.113),
        ((0,-.025,.462),.124,.135),
        ((0,.092,.468),.127,.153),
        ((0,.171,.482),.108,.151),
        ((0,.223,.551),.096,.126),
        ((0,.266,.616),.078,.098),
        ((0,.300,.681),.062,.074),
        ((0,.323,.709),.052,.053),
    ]
    body_parts=[tube('DogTorsoNeck',sections,20)]
    for s in [-1,1]:
        x=s*.092
        body_parts.append(ellipsoid('DogShoulderMuscle',(s*.079,.087,.459),(.054,.074,.113),16,10))
        body_parts.append(tube('DogForeleg',[
            ((x,.103,.486),.052,.075),
            ((x,.104,.388),.041,.046),
            ((x,.095,.306),.026,.033),
            ((x,.121,.205),.021,.026),
            ((x,.139,.114),.022,.023),
            ((x,.155,.052),.025,.027),
        ],12))
        body_parts.append(ellipsoid('DogFrontPaw',(x,.190,.035),(.037,.063,.034),16,10))
        x=s*.098
        body_parts.append(ellipsoid('DogHipMuscle',(s*.085,-.269,.448),(.067,.097,.100),16,10))
        body_parts.append(tube('DogHindLeg',[
            ((x,-.266,.471),.064,.089),
            ((x,-.232,.383),.057,.073),
            ((x,-.168,.292),.039,.045),
            ((x,-.220,.227),.028,.031),
            ((x,-.280,.149),.021,.025),
            ((x,-.267,.087),.018,.021),
            ((x,-.251,.047),.023,.026),
        ],12))
        body_parts.append(ellipsoid('DogHindPaw',(x,-.218,.034),(.034,.059,.033),16,10))
    body=organic('DogBody',body_parts,.008,2300)
    # Keep all paws truly planted after smoothing, without moving leg groups.
    for v in body.data.vertices:
        p=body.matrix_world @ v.co
        if p.z<.015:
            v.co.z -= p.z
    paint(body,coat_body)

    skull=tube('DogCraniumMuzzle',[
        ((0,.255,.711),.046,.053),
        ((0,.298,.736),.074,.080),
        ((0,.364,.743),.078,.078),
        ((0,.410,.727),.068,.062),
        ((0,.448,.704),.050,.037),
        ((0,.519,.693),.040,.026),
        ((0,.580,.691),.035,.022),
        ((0,.596,.692),.028,.018),
    ],16)
    cheeks=[]
    for s in [-1,1]:
        cheeks.append(ellipsoid('DogCheek',(s*.042,.410,.690),(.028,.041,.030),12,8))
        # Brow ridge creates a natural eye socket rather than protruding eyes.
        cheeks.append(ellipsoid('DogBrow',(s*.060,.418,.756),(.018,.026,.006),12,8))
    head=organic('DogHeadMesh',[skull]+cheeks,.006,950)
    paint(head,coat_head)
    head_parts=[head]
    eye_frames=[]

    # Semi-pricked, forward-folded ears made as thin closed shaped leaves.
    for s in [-1,1]:
        verts=[
            (s*.045,.294,.785),(s*.093,.310,.787),(s*.097,.368,.789),(s*.052,.367,.797),
            (s*.093,.304,.860),(s*.125,.339,.839),(s*.117,.404,.767),
            (s*.051,.300,.777),(s*.090,.313,.779),(s*.092,.366,.781),(s*.053,.363,.789),
            (s*.094,.313,.851),(s*.115,.345,.833),(s*.111,.398,.767),
        ]
        faces=[(0,1,5,4),(1,2,6,5),(2,3,4,6),(3,0,4),(4,5,6),
               (7,11,12,8),(8,12,13,9),(9,13,11,10),(10,11,7),(11,13,12),
               (0,7,8,1),(1,8,9,2),(2,9,10,3),(3,10,7,0),(4,11,7,0),
               (5,12,11,4),(6,13,12,5),(3,10,11,4)]
        ear=mesh('DogEar',verts,faces)
        activate(ear)
        bevel=ear.modifiers.new('EarEdgeSoftness','BEVEL')
        bevel.width=.003
        bevel.segments=1
        bpy.ops.object.modifier_apply(modifier=bevel.name)
        paint(ear,lambda p: (.047,.031,.022) if p.y<.36 else (.076,.048,.030))
        head_parts.append(ear)
        # Place the eye directly on the actual skull surface, then make a
        # restrained almond-like eyelid annulus which follows that surface.
        hit, point, normal, face_index = head.ray_cast(
            Vector((s*.20,.435,.738)), Vector((-s,0,0)))
        if not hit:
            raise RuntimeError('Could not locate the authored eye surface')
        normal.normalize()
        horizontal = Vector((0,0,1)).cross(normal).normalized()
        vertical = normal.cross(horizontal).normalized()
        eye_frames.append((point.copy(), normal.copy(), horizontal.copy(), vertical.copy()))
        rim_verts=[]
        for outer in [True,False]:
            rx,rz=(.0110,.0075) if outer else (.0081,.0048)
            for j in range(16):
                angle=2*math.pi*j/16
                offset=horizontal*(rx*math.cos(angle))+vertical*(rz*math.sin(angle))
                sample=point+offset
                ok, surface, surface_normal, _=head.ray_cast(sample+normal*.035,-normal)
                if not ok:
                    surface=sample
                # Outer skin edge is virtually flush; upper/lower lid rises
                # only about one millimetre, instead of a protruding globe.
                lift=.0004 if outer else .0011
                rim_verts.append(tuple(surface+normal*lift))
        rim_faces=[(j,(j+1)%16,16+(j+1)%16,16+j) for j in range(16)]
        rim=mesh('DogEyeLids',rim_verts,rim_faces)
        paint(rim,fixed((.047,.024,.012)))
        rim_colors=rim.data.color_attributes['DogCoatColor']
        for loop in rim.data.loops:
            rgb=(.070,.033,.014) if loop.vertex_index<16 else (.018,.011,.007)
            rim_colors.data[loop.index].color=rgb+(1,)
        head_parts.append(rim)
    nose=ellipsoid('DogNose',(0,.602,.692),(.036,.015,.021),12,8)
    paint(nose,fixed((.014,.012,.011)))
    head_parts.append(nose)
    # Nostrils are authored geometry: two dark indent markers, restrained size.
    for s in [-1,1]:
        nostril=ellipsoid('DogNostril',(s*.022,.616,.696),(.006,.0025,.0045),8,6)
        paint(nostril,fixed((.0025,.002,.0015)))
        head_parts.append(nostril)
    head=combine('DogHeadMesh',head_parts)

    # Jaw hangs from an anatomically placed hinge, independent of fixed paws.
    jaw=tube('DogJawMesh',[
        ((0,.378,.674),.027,.022),
        ((0,.410,.664),.041,.023),
        ((0,.466,.663),.038,.016),
        ((0,.538,.669),.032,.012),
        ((0,.579,.672),.026,.010),
    ],12)
    jaw=organic('DogJawMesh',[jaw],.0045,350)
    paint(jaw,lambda p: mix((.19,.09,.038),(.027,.019,.014),max(0,min(1,(p.z-.663)*110))))
    mouth=ellipsoid('DogMouthInterior',(0,.493,.678),(.033,.090,.0055),12,6)
    paint(mouth,fixed((.030,.009,.008)))
    jaw=combine('DogJawMesh',[jaw,mouth])

    # Restrained eye sheen, a single separate material/mesh for both eyes.
    eye_mat=bpy.data.materials.new('DogWarmBrownEyes')
    eye_mat.use_nodes=True
    eye_bsdf=eye_mat.node_tree.nodes.get('Principled BSDF')
    eye_bsdf.inputs['Base Color'].default_value=(.012,.007,.003,1)
    eye_bsdf.inputs['Roughness'].default_value=.47
    eye_bsdf.inputs['Specular IOR Level'].default_value=.10
    eye_objs=[]
    for point,normal,horizontal,vertical in eye_frames:
        # Thin, nearly flush lens seated within the eyelid geometry. Its
        # shallow profile and smaller opening avoid a bead-like silhouette.
        eye=ellipsoid('DogEye',tuple(point+normal*.0010),(.0082,.0049,.0016),12,6)
        orientation=Matrix((horizontal,vertical,normal)).transposed()
        eye.rotation_euler=orientation.to_euler()
        eye.data.materials.append(eye_mat)
        for p in eye.data.polygons:
            p.use_smooth=True
        eye_objs.append(eye)
    eyes=combine('DogEyes',eye_objs)

    tail=tube('DogTailMesh',[
        ((0,-.340,.532),.033,.032),
        ((0,-.411,.511),.031,.030),
        ((.008,-.493,.464),.027,.026),
        ((.018,-.568,.399),.022,.023),
        ((.029,-.625,.345),.017,.019),
        ((.048,-.679,.330),.011,.013),
        ((.064,-.720,.342),.002,.003),
    ],12)
    # Three loop subdivision of profile isn't needed: smooth low-cost geometry.
    paint(tail,lambda p: mix((.033,.026,.021),(.111,.065,.031),max(0,min(1,(-p.y-.50)*3))))

    # Thick leather band around the ascending neck, with small buckle and ring.
    collar_center=Vector((0,.254,.619))
    axis=Vector((0,.60,.80))
    u=Vector((1,0,0))
    v=axis.cross(u)
    verts=[]
    for radius in [(0.079,.089),(.086,.096)]:
        for axial in [-.016,.016]:
            for i in range(32):
                a=2*math.pi*i/32
                verts.append(tuple(collar_center+axis*axial+u*(radius[0]*math.cos(a))+v*(radius[1]*math.sin(a))))
    faces=[]
    for i in range(32):
        j=(i+1)%32
        faces.extend([(i,j,32+j,32+i),(64+i,96+i,96+j,64+j),
                      (i,64+i,64+j,j),(32+i,32+j,96+j,96+i)])
    collar=mesh('DogLeatherCollar',verts,faces)
    paint(collar,fixed((.060,.024,.011)))
    body_detail=[body,collar]
    # Rounded brass buckle lies on the visible right side; no separate draw.
    for z in [.607,.632]:
        b=tube('DogCollarBuckle', [((.088,.236,z),.0032,.0032),((.088,.271,z),.0032,.0032)],8)
        paint(b,fixed((.34,.24,.106)))
        body_detail.append(b)
    for y in [.236,.271]:
        b=tube('DogCollarBuckle', [((.088,y,.607),.0032,.0032),((.088,y,.632),.0032,.0032)],8)
        paint(b,fixed((.34,.24,.106)))
        body_detail.append(b)
    # D-ring follows a closed circular curve with a constant round cross-section.
    tether_point=(.100,.255,.636)
    rv=[]; rf=[]
    for i in range(20):
        a=2*math.pi*i/20
        center=Vector((.097,.255+.010*math.cos(a),.638+.010*math.sin(a)))
        outward=Vector((0,math.cos(a),math.sin(a)))
        for j in range(6):
            b=2*math.pi*j/6
            rv.append(tuple(center+Vector((1,0,0))*(.0022*math.cos(b))+outward*(.0022*math.sin(b))))
    for i in range(20):
        for j in range(6):
            rf.append((i*6+j,i*6+(j+1)%6,((i+1)%20)*6+(j+1)%6,((i+1)%20)*6+j))
    ring=mesh('DogTetherRing',rv,rf)
    paint(ring,fixed((.35,.30,.21)))
    body_detail.append(ring)
    # Small, dark short nails support planted-paw readability at close range.
    for s in [-1,1]:
        for x,y in [(s*.092,.241),(s*.098,-.170)]:
            for dx in [-.014,.011]:
                nail=ellipsoid('DogClaw',(x+dx,y,.024),(.0045,.008,.0045),6,4)
                paint(nail,fixed((.034,.022,.015)))
                body_detail.append(nail)
    body=combine('DogBody',body_detail)

    def empty(name, loc):
        obj=bpy.data.objects.new(name,None)
        collection.objects.link(obj)
        owned.append(obj)
        obj.location=loc
        obj.empty_display_type='PLAIN_AXES'
        obj.empty_display_size=.05
        return obj

    def parent_at_world(obj, parent):
        world=obj.matrix_world.copy()
        obj.parent=parent
        obj.matrix_world=world

    root=empty('DogRoot',(0,0,0))
    head_pivot=empty('DogHead',(0,.278,.696))
    jaw_pivot=empty('DogJaw',(0,.391,.673))
    tail_pivot=empty('DogTail',(0,-.340,.532))
    tether=empty('DogCollarTether',tether_point)
    bpy.context.view_layer.update()
    for obj in [body,head_pivot,tail_pivot,tether]:
        parent_at_world(obj,root)
    for obj in [head,eyes,jaw_pivot]:
        parent_at_world(obj,head_pivot)
    parent_at_world(jaw,jaw_pivot)
    parent_at_world(tail,tail_pivot)
    root.location=location
    root['asset']='Original roadside farm dog v1'
    root['authoring']='Original procedural geometry in Blender 4.3.2; no external assets'
    root['forward_gltf']='-Z'
    root['up_gltf']='+Y'
    root['paw_animation']='None: DogBody stays planted'
    root['withers_m']=.62
    root['animation_notes']='DogHead X small pitch; DogJaw X -0.28 rad bark; DogTail Z +/-0.11 rad wag in Blender. glTF equivalent tail Y.'
    tether['purpose']='Runtime tether endpoint; read this node world position'
    tether['gltf_rest_local_position_m']=[.100,.636,-.255]
    owned=[o for o in collection.objects]
    return {'root':root,'body':body,'head':head_pivot,'jaw':jaw_pivot,
            'tail':tail_pivot,'tether':tether,'objects':owned,'collection':collection}


def export_roadside_dog(asset, filepath):
    """Export only this asset, then restore the caller's object selection."""
    selected=list(bpy.context.selected_objects)
    active=bpy.context.view_layer.objects.active
    try:
        for obj in selected:
            obj.select_set(False)
        for obj in asset['objects']:
            obj.select_set(True)
        bpy.context.view_layer.objects.active=asset['root']
        bpy.ops.export_scene.gltf(filepath=str(filepath),export_format='GLB',
            use_selection=True,export_yup=True,export_apply=True,
            export_animations=False,export_extras=True,export_cameras=False,
            export_lights=False,export_materials='EXPORT')
    finally:
        for obj in list(bpy.context.selected_objects):
            obj.select_set(False)
        for obj in selected:
            if obj.name in bpy.context.view_layer.objects:
                obj.select_set(True)
        bpy.context.view_layer.objects.active=active


def main():
 ap=argparse.ArgumentParser();ap.add_argument('--baseline-dir',required=True);ap.add_argument('--only',choices=['arms','mike','house','clarence','dog','all'],default='all');args=ap.parse_args(sys.argv[sys.argv.index('--')+1:]if'--'in sys.argv else[]);source=Path(args.baseline_dir).resolve();reports=[]
 if args.only in ['arms','all']:reports.append(repair_arms(source/'player-arms.glb'))
 if args.only in ['mike','all']:reports.append(repair_mike(source/'mike-body.glb'))
 if args.only in ['house','all']:reports.append(author_roadside_house())
 if args.only in ['clarence','all']:
  E=Path('/tmp/cornfields-v3-clarence-authoring');E.mkdir(exist_ok=True);r=refine_clarence(source/'cast-clarence.glb',E);p=ROOT/'assets/intro/cast-clarence.glb';p.write_bytes((E/'clarence-uniform-v3-candidate.glb').read_bytes());r['file']='assets/intro/cast-clarence.glb';reports.append(r)
 if args.only in ['dog','all']:
  bpy.ops.wm.read_factory_settings(use_empty=True);dog=build_roadside_dog();p=ROOT/'assets/intro/roadside-dog-v1.glb';export_roadside_dog(dog,p);reports.append(GLB(p).save(p))
 files=['assets/field/player-arms.glb','assets/intro/mike-body.glb','assets/intro/roadside-set.glb','assets/intro/cast-clarence.glb','assets/intro/roadside-dog-v1.glb'];retain_editable_assets([ROOT/f for f in files if(ROOT/f).exists()]);print(json.dumps(reports));(ROOT/'verification/visual-overhaul-v3/asset-report.json').write_text(json.dumps({'assets':reports,'evidence':'Asset structure only; browser appearance and motion unverified'},indent=2)+'\n')
if __name__=='__main__':main()
