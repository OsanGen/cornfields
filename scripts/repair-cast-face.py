#!/usr/bin/env python3
"""Bounded binary-preserving repair of the already-shipped CC0 Steve cast.
Usage: python scripts/repair-cast-face.py SOURCE.glb OUTPUT.glb
The source hash is pinned; edits are only named UV/weight accessor bytes.
No topology, normals, bind matrices, nodes, skeleton, animation or image edits.
"""
import hashlib,json,struct,sys
from pathlib import Path
SOURCE_SHA='3b1bfcafb69fd33eac98e6767d5362b9f8ce512413e033dc95ac9964b1ee116d'
source,target=map(Path,sys.argv[1:3]);original=source.read_bytes()
assert hashlib.sha256(original).hexdigest()==SOURCE_SHA,'Use the unmodified pinned source'
data=bytearray(original);jsonlen=struct.unpack_from('<I',data,12)[0];j=json.loads(data[20:20+jsonlen]);binary=28+jsonlen
names=[j['nodes'][i]['name'] for i in j['skins'][0]['joints']]
size={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4};types={5126:'f',5123:'H',5121:'B'}
def accessor(index):
 a=j['accessors'][index];v=j['bufferViews'][a['bufferView']];fmt='<'+types[a['componentType']]*size[a['type']];stride=v.get('byteStride',struct.calcsize(fmt));offset=binary+v.get('byteOffset',0)+a.get('byteOffset',0);return a,fmt,stride,offset

def read(index):
 a,fmt,stride,offset=accessor(index);return [list(struct.unpack_from(fmt,data,offset+i*stride))for i in range(a['count'])]
def write(index,values):
 a,fmt,stride,offset=accessor(index);assert len(values)==a['count']
 for i,row in enumerate(values):struct.pack_into(fmt,data,offset+i*stride,*row)
report={'sourceSha256':SOURCE_SHA,'changes':[]}
for meshIndex,unrelated in [(2,{'armup.L','eye.L'}),(3,{'armup.R'}),(8,{'mouth'})]:
 p=j['meshes'][meshIndex]['primitives'][0];ids=read(p['attributes']['JOINTS_0']);weights=read(p['attributes']['WEIGHTS_0']);changed=0
 for indices,row in zip(ids,weights):
  bad=[k for k,i in enumerate(indices)if names[i]in unrelated and row[k]>0]
  if not bad:continue
  for k in bad:row[k]=0
  total=sum(row);assert total>0
  row[:]=[w/total for w in row];changed+=1
 write(p['attributes']['WEIGHTS_0'],weights)
 report['changes'].append({'mesh':j['meshes'][meshIndex]['name'],'removedInfluences':sorted(unrelated),'vertices':changed})
# Existing ears are extruded low-poly shells whose inherited UVs were scattered
# across the whole head atlas. Project their side planes onto the existing
# matching ear photograph in headHDmale512 (image 1, 512 x 512). Both retain
# this same already-shipped map. Mirrored shells use the same anatomical patch.
for meshIndex in [2,3]:
 p=j['meshes'][meshIndex]['primitives'][0];positions=read(p['attributes']['POSITION']);ys=[v[1]for v in positions];zs=[v[2]for v in positions];ymin,ymax=min(ys),max(ys);zmin,zmax=min(zs),max(zs)
 uv=[]
 for x,y,z in positions:
  # glTF's origin maps the image top row to v=0; no image pixel replacement.
  u=(120-(z-zmin)/(zmax-zmin)*53)/512
  v=(350+(ymax-y)/(ymax-ymin)*79)/512
  uv.append([u,v])
 write(p['attributes']['TEXCOORD_0'],uv)
 report['changes'].append({'mesh':j['meshes'][meshIndex]['name'],'uv':'side-plane fit to original atlas pixels x=67..120, y=350..429','vertices':len(uv)})
target.write_bytes(data);report['outputSha256']=hashlib.sha256(data).hexdigest();report['changedBytes']=sum(a!=b for a,b in zip(original,data));report['bytes']=len(data)
print(json.dumps(report,indent=2))
