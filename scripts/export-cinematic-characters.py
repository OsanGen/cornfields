#!/usr/bin/env python3
"""Bounded Stage B v2 authoring from the pinned, already-shipped GLBs.
Run with Blender 4.3.2: blender -b -t 4 --python scripts/export-cinematic-characters.py -- --baseline PATH --evidence PATH
No download, rig resampling, source overwrite or new package is performed. GLB
animation, bind and unaffected attribute bytes are copied exactly. The Blender
files contain imported final skinned meshes, maps and original animation actions.
"""
import argparse, hashlib, json, math, struct, sys
from pathlib import Path
import bpy
import numpy as np
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1]
ap=argparse.ArgumentParser();ap.add_argument('--baseline',type=Path,required=True);ap.add_argument('--evidence',type=Path,required=True);ap.add_argument('--render',action='store_true');ap.add_argument('--render-role',choices=['clarence','stanley','zombie']);ap.add_argument('--render-only',action='store_true');args=ap.parse_args(sys.argv[sys.argv.index('--')+1:])
E=args.evidence;E.mkdir(parents=True,exist_ok=True)
CAST_SHA='739d9b6604511712ddab6c4bff76b12ea65b2b57b5ef18e6cc15b9519c27c096'
ZOMBIE_SHA='6296c3f586e5695b0f3ddd52b3c1da135e56356a984a2b3896d3ab709b70ef74'
sha=lambda b:hashlib.sha256(b).hexdigest()
class GLB:
 def __init__(self,path,expected):
  raw=path.read_bytes();assert sha(raw)==expected, f'Pinned source mismatch: {path}'
  n=struct.unpack_from('<I',raw,12)[0];self.j=json.loads(raw[20:20+n]);self.b=bytearray(raw[28+n:]);self.source=sha(raw)
 def array(self,i):
  a=self.j['accessors'][i];v=self.j['bufferViews'][a['bufferView']];n={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']];dt=np.dtype({5126:'<f4',5123:'<u2',5121:'u1',5125:'<u4'}[a['componentType']]);return np.ndarray((a['count'],n),dtype=dt,buffer=self.b,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',n*dt.itemsize),dt.itemsize)).copy()
 def put(self,i,values):
  a=self.j['accessors'][i];v=self.j['bufferViews'][a['bufferView']];n=values.shape[1];dt=np.dtype({5126:'<f4',5123:'<u2',5121:'u1',5125:'<u4'}[a['componentType']]);target=np.ndarray((a['count'],n),dtype=dt,buffer=self.b,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',n*dt.itemsize),dt.itemsize));target[:]=values
  if 'min' in a:a['min']=values.astype(dt).min(axis=0).tolist()
  if 'max' in a:a['max']=values.astype(dt).max(axis=0).tolist()
 def blob(self,data):
  while len(self.b)%4:self.b.append(0)
  i=len(self.j['bufferViews']);self.j['bufferViews'].append({'buffer':0,'byteOffset':len(self.b),'byteLength':len(data)});self.b.extend(data);return i
 def image(self,i,data,name):
  self.j['images'][i]={'bufferView':self.blob(data),'mimeType':'image/jpeg','name':name}
 def save(self,path):
  self.j['buffers'][0]['byteLength']=len(self.b)
  # Discard obsolete image payloads: repack each referenced view, preserving all
  # animation/skin bytes exactly, instead of retaining duplicate source atlases.
  used={a['bufferView'] for a in self.j['accessors']}|{im['bufferView'] for im in self.j['images']};packed=bytearray();remap={}
  for old in sorted(used):
   v=self.j['bufferViews'][old];remap[old]=len(remap)
   while len(packed)%4:packed.append(0)
   start=v.get('byteOffset',0);copy=self.b[start:start+v['byteLength']];v['byteOffset']=len(packed);packed.extend(copy)
  views=[self.j['bufferViews'][i] for i in sorted(used)]
  for a in self.j['accessors']:a['bufferView']=remap[a['bufferView']]
  for im in self.j['images']:im['bufferView']=remap[im['bufferView']]
  self.j['bufferViews']=views;self.b=packed;self.j['buffers'][0]['byteLength']=len(packed)
  while len(packed)%4:packed.append(0)
  raw=json.dumps(self.j,separators=(',',':')).encode();raw+=b' '*((-len(raw))%4);payload=struct.pack('<III',0x46546c67,2,28+len(raw)+len(packed))+struct.pack('<II',len(raw),0x4e4f534a)+raw+struct.pack('<II',len(packed),0x004e4942)+packed;path.write_bytes(payload);return {'sha256':sha(payload),'bytes':len(payload),'triangles':sum(self.j['accessors'][p['indices']]['count']//3 for m in self.j['meshes'] for p in m['primitives'])}
 def pixels(self,i):
  v=self.j['bufferViews'][self.j['images'][i]['bufferView']];path=E/f'_source_{self.source[:8]}_{i}.jpg';path.write_bytes(self.b[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']]);im=bpy.data.images.load(str(path),check_existing=False);w,h=im.size;a=np.empty(w*h*4,dtype=np.float32);im.pixels.foreach_get(a);bpy.data.images.remove(im);return a.reshape(h,w,4)[::-1].copy()

def jpg(pixels,path):
 h,w=pixels.shape[:2];im=bpy.data.images.new(path.stem,width=w,height=h,alpha=False);rgba=np.ones((h,w,4),dtype=np.float32);rgba[:,:,:3]=np.clip(pixels[:,:,:3],0,1);im.pixels.foreach_set(rgba[::-1].ravel());im.file_format='JPEG';im.filepath_raw=str(path);im.save();bpy.data.images.remove(im);return path.read_bytes()
def smooth(a,b,x):
 t=np.clip((x-a)/(b-a),0,1);return t*t*(3-2*t)
def gauss(x,c,w):return np.exp(-((x-c)/w)**2)
def cast_shape(p,role):
 q=p.copy();x,y,z=p.T;a=np.abs(x);neck=smooth(2.86,2.96,y);front=smooth(.04,.15,z)
 if role=='clarence':
  q[:,0]*=1-neck*(.105+.075*gauss(y,2.99,.105))
  q[:,1]-=.014*gauss(y,2.94,.045)*front
  q[:,2]-=.028*gauss(a,.098,.04)*gauss(y,3.052,.058)*front
  q[:,2]+=.014*gauss(a,0,.042)*gauss(y,2.96,.04)*front
  nose=gauss(y,3.075,.068)*gauss(a,0,.043)*front
  q[:,0]*=1-.17*nose;q[:,2]+=.011*nose
  # Recess and reduce eye sockets together with eyeballs; keeps gaze pivots.
  eye=gauss(a,.069,.045)*gauss(y,3.128,.038)*front
  q[:,1]+=(3.128-y)*.28*eye;q[:,2]-=.011*eye
  q[:,2]+=.013*gauss(a,.067,.052)*gauss(y,3.177,.024)*front
 else:
  q[:,0]*=1+neck*(.145+.17*gauss(y,2.979,.092))
  q[:,2]+=.014*gauss(a,.101,.050)*gauss(y,3.023,.061)*front
  q[:,2]+=.022*gauss(a,0,.080)*gauss(y,2.944,.047)*front
  nose=gauss(y,3.072,.053)*gauss(a,0,.052)*front
  q[:,0]*=1+.28*nose;q[:,2]-=.006*nose
  eye=gauss(a,.069,.048)*gauss(y,3.128,.041)*front
  q[:,1]+=(3.124-y)*.36*eye;q[:,2]-=.015*eye
  q[:,2]+=.018*gauss(a,.07,.058)*gauss(y,3.172,.032)*front
 return p+(q-p)*smooth(2.86,2.95,y)[:,None]

def morph_normals(p,n,fn):
 step=1e-4;jac=np.stack([(fn(p+np.eye(3)[i]*step)-fn(p-np.eye(3)[i]*step))/(2*step) for i in range(3)],axis=2)
 out=np.linalg.solve(np.transpose(jac,(0,2,1)),n[:,:,None])[:,:,0];return out/np.maximum(np.linalg.norm(out,axis=1)[:,None],1e-12)

def semantic_map(glb,meshids,w,h):
 """Bake each existing UV triangle's anatomical position into atlas texels."""
 xyz=np.zeros((h,w,3),np.float32);mask=np.zeros((h,w),bool)
 for mi in meshids:
  p=glb.j['meshes'][mi]['primitives'][0];pos=glb.array(p['attributes']['POSITION']);uv=glb.array(p['attributes']['TEXCOORD_0'])*[w,h];ind=glb.array(p['indices']).ravel().reshape(-1,3)
  for ids in ind:
   t=uv[ids];lo=np.maximum(np.floor(t.min(0)).astype(int)-1,0);hi=np.minimum(np.ceil(t.max(0)).astype(int)+1,[w-1,h-1]);
   if np.any(hi<lo):continue
   xx,yy=np.meshgrid(np.arange(lo[0],hi[0]+1)+.5,np.arange(lo[1],hi[1]+1)+.5);a,b,c=t;den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1])
   if abs(den)<1e-6:continue
   v=((b[1]-c[1])*(xx-c[0])+(c[0]-b[0])*(yy-c[1]))/den;u=((c[1]-a[1])*(xx-c[0])+(a[0]-c[0])*(yy-c[1]))/den;r=1-v-u;inside=(v>=-.015)&(u>=-.015)&(r>=-.015);s=np.s_[lo[1]:hi[1]+1,lo[0]:hi[0]+1];coords=v[:,:,None]*pos[ids[0]]+u[:,:,None]*pos[ids[1]]+r[:,:,None]*pos[ids[2]];xyz[s][inside]=coords[inside];mask[s][inside]=True
 return xyz,mask

def face_texture(glb,role):
 src=glb.pixels(1);h,w=src.shape[:2];xyz,valid=semantic_map(glb,[6],w,h);
 # Pad each UV island's anatomical field to prevent hard mask edges.
 for _ in range(3):
  old=valid.copy()
  for dy,dx in [(0,1),(0,-1),(1,0),(-1,0)]:
   available=np.roll(old,(dy,dx),(0,1))&~valid;xyz[available]=np.roll(xyz,(dy,dx),(0,1))[available];valid|=available
 x,y,z=xyz.transpose(2,0,1);rgb=src[:,:,:3].copy();
 # Remove the old atlas registration crosses, never cloth/skin detail.
 bad=((rgb[:,:,1]>rgb[:,:,0]*1.22)|(rgb[:,:,2]>rgb[:,:,0]*1.16))&((rgb.max(2)-rgb.min(2))>.12)
 for _ in range(3):
  blur=sum(np.roll(rgb,(dy,dx),(0,1)) for dy,dx in [(0,1),(0,-1),(1,0),(-1,0)])/4;rgb[bad]=blur[bad]
 lum=rgb@np.array([.2126,.7152,.0722]);skin=(rgb[:,:,0]>rgb[:,:,2]*1.07)&(lum>.26);front=smooth(.11,.19,z);rng=np.random.default_rng(714 if role=='clarence' else 1031);grain=rng.normal(0,.009,(h,w));
 if role=='clarence':
  rgb[skin]*=np.array([.89,.91,.78]);rgb[skin]+=grain[skin,None]
  # Original brush field: deep-set eye shading, lean cheek contours, straight brows.
  socket=(gauss(np.abs(x),.068,.044)*gauss(y,3.128,.041)*front*valid);rgb*=1-.11*socket[:,:,None]
  brow=gauss(y,3.182,.008)*gauss(np.abs(x),.069,.034)*front*valid;rgb=rgb*(1-.48*brow[:,:,None])+np.array([.075,.060,.045])*(.48*brow[:,:,None])
  dark=(~skin)&valid&(y>3.21);rgb[dark]*=.66
 else:
  rgb[skin]=rgb[skin]*np.array([.94,.925,.89])+grain[skin,None]
  # Salt/pepper hair is a supporting surface cue; jaw/nose mesh differs separately.
  hair=(~skin)*valid*smooth(3.09,3.235,y);g=np.clip(lum*.65+.22+grain,0,1);rgb=rgb*(1-hair[:,:,None])+np.stack([g*1.015,g,g*.955],2)*hair[:,:,None]
  # Receding temple line painted from anatomical position, independent of UV islands.
  temples=gauss(np.abs(x),.111,.050)*gauss(y,3.282,.065)*front*valid;rgb=rgb*(1-.65*temples[:,:,None])+np.array([.66,.54,.47])*(.65*temples[:,:,None])
  beard=smooth(2.925,2.949,y)*(1-smooth(2.982,3.016,y))*gauss(x,0,.103)*front*valid
  moustache=gauss(y,3.012,.012)*gauss(x,0,.054)*front*valid
  hairs=np.clip(.40+grain*5,0,1);alpha=np.clip(beard*.23+moustache*.76,0,.8);rgb=rgb*(1-alpha[:,:,None])+np.stack([hairs*.69,hairs*.67,hairs*.63],2)*alpha[:,:,None]
  for height in [3.217,3.235,3.252]:
   wrinkle=gauss(y,height+.003*np.cos(x*32),.0018)*gauss(x,0,.092)*front*valid;rgb*=1-.12*wrinkle[:,:,None]
  fold=gauss(np.abs(x),.05+.25*(3.06-y),.0035)*gauss(y,3.035,.039)*front*valid;rgb*=1-.16*fold[:,:,None]
 return jpg(rgb,E/f'{role}-face-authored-512.jpg')

def eye_texture(role):
 h=w=256;v,u=np.mgrid[0:h,0:w];x=(u-w*.5)/(w*.43);y=(v-h*.5)/(h*.43);r=np.sqrt(x*x+y*y);ang=np.arctan2(y,x);rgb=np.zeros((h,w,3),float);rgb[:]=[.87,.84,.79];iris=np.array([.42,.245,.105] if role=='clarence' else [.32,.405,.445]);fiber=.9+.13*np.sin(ang*91+r*45)+.08*np.sin(ang*137-r*73);m=r<.56;rgb[m]=(iris[None,:]*fiber[m,None]);ring=(r>.51)&(r<.57);rgb[ring]*=.64;rgb[r<.145]=[.022,.020,.018];highlight=(x+.19)**2+(y+.21)**2<.002;rgb[highlight]=[.85,.87,.84];return jpg(rgb,E/f'{role}-iris-authored-256.jpg')

def arm_refine(g,meshids,zombie=False):
 names=[g.j['nodes'][i]['name'] for i in g.j['skins'][0]['joints']];inv=g.array(g.j['skins'][0]['inverseBindMatrices']).reshape(-1,4,4).transpose(0,2,1);report=[]
 for mi in meshids:
  p=g.j['meshes'][mi]['primitives'][0];p0=g.array(p['attributes']['POSITION']).astype(float);q=p0.copy();ids=g.array(p['attributes']['JOINTS_0']);weights=g.array(p['attributes']['WEIGHTS_0']);neww=weights.copy();changed=0
  for side in ['L','R']:
   upper=f'Bip01 {side} UpperArm' if zombie else f'armup.{side}';lower=f'Bip01 {side} Forearm' if zombie else f'armlo.{side}';hand=f'Bip01 {side} Hand' if zombie else f'hand.{side}'
   ui,li,hi=map(names.index,[upper,lower,hand]);ub,lb,hb=[np.linalg.inv(inv[k])[:3,3] for k in [ui,li,hi]];axis=hb-lb;length=np.linalg.norm(axis);axis/=length;delta=p0-lb;t=delta@axis;rad=delta-t[:,None]*axis;total=np.sum(weights*((ids==ui)|(ids==li)),1);protected=np.sum(weights*((ids==hi)|np.array([[('Finger' in names[i] or names[i].startswith('f')) for i in row] for row in ids])),1)>.01
   gate=(total>.88)&(~protected);band=np.exp(-(t/(length*.25))**2)*gate;radial=np.linalg.norm(rad,axis=1);band*=1-smooth(length*.22,length*.44,radial)
   # Preserve elbow volume and a gradual forearm taper without moving hand skin.
   q+=rad*(band*.075)[:,None]
   for vi in np.flatnonzero(band>.15):
    both=(ids[vi]==ui)|(ids[vi]==li)
    if not np.any(ids[vi]==ui) or not np.any(ids[vi]==li):continue
    mass=weights[vi,both].sum();target=smooth(-length*.13,length*.17,t[vi]);mix=.22*band[vi];oldlow=weights[vi,ids[vi]==li].sum()/mass;low=oldlow*(1-mix)+target*mix;neww[vi,ids[vi]==li]=mass*low;neww[vi,ids[vi]==ui]=mass*(1-low);changed+=1
  g.put(p['attributes']['POSITION'],q);g.put(p['attributes']['WEIGHTS_0'],neww);report.append({'mesh':mi,'movedVertices':int(np.sum(np.linalg.norm(q-p0,axis=1)>1e-8)),'blendedElbowVertices':changed,'handAndFingerWeights':'unchanged'})
  # Small volume adjustment: recompute area-weighted surface normals consistently
  # across split vertices, keeping the same index/UV/weight topology.
  if np.any(q!=p0):update_normals(g,p,q)
 return report

def update_normals(g,p,pos):
 indices=g.array(p['indices']).ravel().reshape(-1,3);fn=np.cross(pos[indices[:,1]]-pos[indices[:,0]],pos[indices[:,2]]-pos[indices[:,0]]);acc=np.zeros_like(pos)
 for c in range(3):np.add.at(acc,indices[:,c],fn)
 # UV islands share positions; weld only for normal averaging, never topology.
 keys=np.round(pos,6);_,ids=np.unique(keys,axis=0,return_inverse=True);out=np.zeros((ids.max()+1,3));np.add.at(out,ids,acc);n=out[ids];length=np.linalg.norm(n,axis=1);old=g.array(p['attributes']['NORMAL']);n=np.where((length>1e-10)[:,None],n/np.maximum(length[:,None],1e-10),old);g.put(p['attributes']['NORMAL'],n)

def build_cast(role):
 g=GLB(args.baseline/'assets/intro/cast.glb',CAST_SHA);face=face_texture(g,role);eye=eye_texture(role);arm=g.pixels(5);rgb=arm[:,:,:3];lum=rgb.mean(2);skin=(rgb[:,:,0]>rgb[:,:,2]*1.08)&(lum>.23)&(lum<.85);rgb[skin]*=np.array([.89,.91,.78] if role=='clarence' else [.94,.925,.89]);arms=jpg(rgb,E/f'{role}-arms-authored-512.jpg')
 g.image(1,face,f'{role} independent authored skin 512');g.image(2,eye,f'{role} independent authored iris 256');g.image(5,arms,f'{role} matching arm skin 512')
 for mi in [4,5]:
  p=g.j['meshes'][mi]['primitives'][0];v=g.array(p['attributes']['POSITION']);center=(v.min(0)+v.max(0))*.5;span=v.max(0)-v.min(0);uv=np.c_[.5+(v[:,0]-center[0])/span[0],.5-(v[:,1]-center[1])/span[1]];g.put(p['attributes']['TEXCOORD_0'],uv)
 for mi in [1,2,3,4,5,6]:
  p=g.j['meshes'][mi]['primitives'][0];pos=g.array(p['attributes']['POSITION']).astype(float);fn=lambda v:cast_shape(v,role);g.put(p['attributes']['POSITION'],fn(pos));g.put(p['attributes']['NORMAL'],morph_normals(pos,g.array(p['attributes']['NORMAL']),fn))
 arms=arm_refine(g,[8,9]);skin=[.60,.49,.37] if role=='clarence' else [.70,.58,.50]
 g.j['asset']['extras']={'cinematicCharacter':role,'revision':'cinematic-v2','sourceSha256':CAST_SHA,'heightPreserved':True,'lidSkinColorLinear':skin,'geometryIdentity':'narrow angular jaw, lean cheek and straight slender nose' if role=='clarence' else 'broad heavy jaw, full cheek and wide rounded nose','eyeColor':'brown' if role=='clarence' else 'gray-blue','runtimeEyelids':'fitted from actual eye bounds; 384 additional runtime triangles (four five-row strips)','armRefinement':arms}
 for mi in [1,2,3,4,5,6,9]:g.j['materials'][mi].setdefault('extras',{})['cinematicCharacter']=role
 result=g.save(ROOT/f'assets/intro/cast-{role}.glb');result.update({'sourceSha256':CAST_SHA,'identity':g.j['asset']['extras'],'headMapSize':[512,512],'eyeMapSize':[256,256],'joints':56,'runtimeLidTriangles':384,'totalWithLids':result['triangles']+384});return result

def zombie_shape(local):
 q=local.copy();u,v,w=local.T;side=w+.055;head=smooth(-.1,.35,u);front=smooth(.15,.95,v)
 # Same crown and neck bounds: length comes from narrowing cranial width,
 # hollow cheek planes and a longer pointed jaw within the original height.
 q[:,2]=-.055+side*(1-.10*head-.16*gauss(u,.63,.45)*front)
 q[:,1]-=.20*gauss(u,.86,.38)*gauss(np.abs(side),.62,.30)*front
 q[:,1]-=.16*gauss(u,1.23,.27)*gauss(side,0,.22)*front
 q[:,2]+=.10*gauss(u,.30,.40)*front
 q[:,0]-=.12*gauss(u,.34,.32)*front*gauss(side,0,.50)
 q[:,1]+=.12*gauss(u,1.75,.21)*front*(.60+.40*np.tanh(side*3))
 return q

def build_zombie():
 g=GLB(args.baseline/'assets/field/zombie.glb',ZOMBIE_SHA);p=g.j['meshes'][0]['primitives'][0];pos=g.array(p['attributes']['POSITION']).astype(float);ids=g.array(p['attributes']['JOINTS_0']);weights=g.array(p['attributes']['WEIGHTS_0']);names=[g.j['nodes'][i]['name'] for i in g.j['skins'][0]['joints']];hi=names.index('Bip01 Head');inv=g.array(g.j['skins'][0]['inverseBindMatrices']).reshape(-1,4,4).transpose(0,2,1)[hi].astype(float);bind=np.linalg.inv(inv);hw=np.sum(weights*(ids==hi),1);local=(np.c_[pos,np.ones(len(pos))]@inv.T)[:,:3];sh=zombie_shape(local);mix=smooth(.65,.97,hw);newlocal=local+(sh-local)*mix[:,None];newpos=(np.c_[newlocal,np.ones(len(pos))]@bind.T)[:,:3];newpos[hw<.65]=pos[hw<.65]
 # Keep exact source vertical extrema so the existing runtime 2.32m fitting is stable.
 newpos[:,1]=np.clip(newpos[:,1],pos[:,1].min(),pos[:,1].max());g.put(p['attributes']['POSITION'],newpos);update_normals(g,p,newpos);arms=arm_refine(g,[0],True)
 color=g.pixels(1);rgb=color[:,:,:3];lum=rgb@np.array([.2126,.7152,.0722]);rgb=np.clip((rgb-.18)*1.045+.18,0,1);rgb+=.025*np.clip((.19-lum)/.19,0,1)[:,:,None]
 # Existing licensed cloth, tears and wound layout is retained, with clearer midtones.
 colorpath=ROOT/'assets/field/zombie-color.jpg';data=jpg(rgb,colorpath);g.image(1,data,'zombie cinematic color 2048')
 normal=g.pixels(0);n=normal[:,:,:3]*2-1;n[:,:,:2]*=.88;n/=np.maximum(np.linalg.norm(n,axis=2)[:,:,None],1e-8);normalpath=ROOT/'assets/field/zombie-normal.jpg';data=jpg(n*.5+.5,normalpath);g.image(0,data,'zombie controlled normal 1024')
 # Authored roughness is at 1K, green glTF channel; dry fabric and mottled skin.
 l=lum[::2,::2];rough=np.clip(.70+.18*(1-l)+.022*np.sin(np.arange(1024)[None,:]*2.8),.68,.94);roughrgb=np.repeat(rough[:,:,None],3,axis=2);roughpath=ROOT/'assets/field/zombie-roughness.jpg';data=jpg(roughrgb,roughpath);imageid=len(g.j['images']);g.j['images'].append({'bufferView':g.blob(data),'mimeType':'image/jpeg','name':'zombie authored roughness 1024'});tid=len(g.j['textures']);g.j['textures'].append({'source':imageid,'sampler':0});mat=g.j['materials'][0];mat['pbrMetallicRoughness']['metallicRoughnessTexture']={'index':tid};mat['pbrMetallicRoughness']['roughnessFactor']=1;mat['normalTexture']['scale']=.78
 eyes=zombie_shape(np.array([[1.35,1.48,-.485],[1.35,1.48,.375]],float)).tolist()
 g.j['asset']['extras']={'cinematicCharacter':'zombie','revision':'cinematic-v2','sourceSha256':ZOMBIE_SHA,'geometryIdentity':'elongated narrow cranium, hollow cheeks, flattened nose and asymmetric pointed jaw','headLocalEyes':eyes,'headLocalEyeScale':[.085,.080,.117],'runtimeHeightMeters':2.32,'armRefinement':arms,'roughnessMap':'zombie-roughness.jpg'}
 result=g.save(ROOT/'assets/field/zombie.glb');result.update({'sourceSha256':ZOMBIE_SHA,'identity':g.j['asset']['extras'],'joints':56,'textures':{f.name:{'sha256':sha(f.read_bytes()),'bytes':f.stat().st_size} for f in [colorpath,normalpath,roughpath]}});return result

def reset():
 bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
 for c in list(bpy.data.collections):
  if c.name!='Collection' and not c.objects:bpy.data.collections.remove(c)

def import_role(role):
 before=set(bpy.context.scene.objects);path=ROOT/(f'assets/intro/cast-{role}.glb' if role!='zombie' else 'assets/field/zombie.glb');bpy.ops.import_scene.gltf(filepath=str(path));objects=list(set(bpy.context.scene.objects)-before);collection=bpy.data.collections.new(role.title()+' — exact cinematic-v2 asset');bpy.context.scene.collection.children.link(collection)
 for ob in objects:
  for c in list(ob.users_collection):c.objects.unlink(ob)
  collection.objects.link(ob)
  if ob.type=='ARMATURE':ob.data.pose_position='REST'
  # Blender importer creates a bone-display helper, not a source glTF mesh.
  if ob.name.startswith('Icosphere'):ob.hide_render=True;ob.hide_viewport=True
 collection['runtime_asset']=str(path.relative_to(ROOT));collection['runtime_sha256']=sha(path.read_bytes());return collection

def authoring():
 out=ROOT/'art/working';out.mkdir(parents=True,exist_ok=True);bpy.context.preferences.filepaths.save_version=0;reset();import_role('clarence');import_role('stanley');bpy.context.scene['notes']='Two independent exported skinned identities with 56-joint rigs, original Seated/Talk/Walk actions and embedded maps. Overlaid at original coordinates to preserve binding; solo a collection when editing. Runtime fitted lids are not baked. No source authoring file was available; reconstructed from exact candidate GLBs.';bpy.ops.wm.save_as_mainfile(filepath=str(out/'cast-distinct-v2.blend'));reset();import_role('zombie');bpy.context.scene['notes']='Exact candidate Pixelhouse-derived mesh with original 56-joint rig and Zombie Lurch action. Additional Fury/Collapse clips remain external and unchanged. Runtime eyes are not baked.';bpy.ops.wm.save_as_mainfile(filepath=str(out/'zombie-cinematic-v2.blend'))

def render_role(role):
 reset();collection=import_role(role);bpy.context.view_layer.update();meshes=[o for o in collection.objects if o.type=='MESH' and not o.hide_render];deps=bpy.context.evaluated_depsgraph_get();pts=[o.matrix_world@v.co for o in meshes for v in o.evaluated_get(deps).data.vertices];lo=Vector([min(v[i] for v in pts) for i in range(3)]);hi=Vector([max(v[i] for v in pts) for i in range(3)]);center=(lo+hi)*.5;height=hi.z-lo.z
 scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=False;scene.render.resolution_x=700;scene.render.resolution_y=800;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.world.color=(.32,.32,.32);scene.view_settings.view_transform='Standard';scene.view_settings.look='None';scene.render.film_transparent=False
 for pos,power,size in [((3,-4,6),600,5),((-3,-2,3),280,4),((1,3,4),400,3)]:
  pos=(pos[1],pos[0],pos[2]) if role=='zombie' else pos;bpy.ops.object.light_add(type='AREA',location=Vector(pos)*height/1.8);o=bpy.context.object;o.data.energy=power*(height/2.4)**2;o.data.shape='DISK';o.data.size=size*height/2.4;o.rotation_euler=(center-o.location).to_track_quat('-Z','Y').to_euler()
 bpy.ops.object.camera_add();cam=bpy.context.object;scene.camera=cam;cam.data.type='ORTHO';cam.data.ortho_scale=height*.245;target=Vector((center.x,center.y,hi.z-height*.095))
 for view,angle in [('front',0),('three-quarter',35),('profile',90)]:
  rad=math.radians(angle);offset=Vector((math.sin(rad),-math.cos(rad),.015))*height
  if role=='zombie':offset=Vector((-math.cos(rad),-math.sin(rad),.01))*height
  cam.location=target+offset;cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=str(E/f'{role}-{view}-isolated.png');bpy.ops.render.render(write_still=True)
  # Gray is compositor desaturation of the same render, without re-lighting.
  scene.use_nodes=True;nt=scene.node_tree;nt.nodes.clear();rl=nt.nodes.new('CompositorNodeRLayers');bw=nt.nodes.new('CompositorNodeRGBToBW');out=nt.nodes.new('CompositorNodeComposite');nt.links.new(rl.outputs['Image'],bw.inputs[0]);nt.links.new(bw.outputs[0],out.inputs[0]);scene.render.filepath=str(E/f'{role}-{view}-grayscale-isolated.png');bpy.ops.render.render(write_still=True);scene.use_nodes=False
 print('RENDER_COMPLETE',role)

if not args.render_only:
 report={'date':'2026-10-04','method':'binary-preserving authored geometry and maps; Blender 4.3.2 authoring and isolated render','baseline':str(args.baseline),'assets':{r:build_cast(r) for r in ['clarence','stanley']}};report['assets']['zombie']=build_zombie();(E/'cinematic-assets-report.json').write_text(json.dumps(report,indent=2)+'\n');authoring();print(json.dumps(report,indent=2))
if args.render or args.render_only:
 for r in ([args.render_role] if args.render_role else ['clarence','stanley','zombie']):render_role(r)
