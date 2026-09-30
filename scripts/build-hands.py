"""Original posed anatomical hands. Offline Blender authoring, one shared 1K atlas."""
import bpy, math, json, hashlib
import numpy as np
from mathutils import Vector
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'assets/field'
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
rng=np.random.default_rng(481)
n=1024; yy,xx=np.mgrid[0:n,0:n];u=xx/n;v=yy/n
grain=rng.random((n,n))
pores=np.sin(u*523)*np.cos(v*491)
mottle=np.sin(u*31+np.sin(v*22))*np.cos(v*45-u*12)
creases=np.exp(-(np.sin(v*math.pi*8+np.sin(u*11)*.25)/.055)**2)
dirt=np.clip(.18+.18*mottle+.28*creases+.15*(grain-.5),0,.68)
rgb=np.array([.53,.365,.27])[None,None,:]*(1-.52*dirt[:,:,None])
rgb=rgb*(.93+.10*grain[:,:,None]+.04*pores[:,:,None])
rgba=np.concatenate([np.clip(rgb,0,1),np.ones((n,n,1))],2).astype(np.float32)
image=bpy.data.images.new('Original rough skin atlas',width=n,height=n,alpha=True)
image.pixels.foreach_set(rgba.ravel());image.filepath_raw=str(OUT/'hands-color.png');image.file_format='PNG';image.save()
mat=bpy.data.materials.new('Rough dirt in skin creases');mat.use_nodes=True
nodes,links=mat.node_tree.nodes,mat.node_tree.links;bsdf=nodes.get('Principled BSDF')
bsdf.inputs['Roughness'].default_value=.87
tex=nodes.new('ShaderNodeTexImage');tex.image=image;links.new(tex.outputs['Color'],bsdf.inputs['Base Color'])

def mesh(name,verts,faces,uvs):
 data=bpy.data.meshes.new(name);data.from_pydata(verts,[],faces);data.update()
 obj=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(obj);data.materials.append(mat)
 uv=data.uv_layers.new()
 for poly in data.polygons:
  poly.use_smooth=True
  for li in poly.loop_indices:uv.data[li].uv=uvs[data.loops[li].vertex_index]
 return obj

def tube(name,points,radii,sides=12,flatten=1):
 verts=[];faces=[];uvs=[];pts=list(map(Vector,points))
 for j,p in enumerate(pts):
  tangent=(pts[min(j+1,len(pts)-1)]-pts[max(0,j-1)]).normalized()
  ref=Vector((0,0,1)) if abs(tangent.z)<.95 else Vector((0,1,0))
  side=tangent.cross(ref).normalized();up=tangent.cross(side).normalized()
  for k in range(sides):
   a=k*2*math.pi/sides;verts.append(p+side*(math.cos(a)*radii[j])+up*(math.sin(a)*radii[j]*flatten));uvs.append((k/sides,j/(len(pts)-1)))
 for j in range(len(pts)-1):
  for k in range(sides):faces.append((j*sides+k,j*sides+(k+1)%sides,(j+1)*sides+(k+1)%sides,(j+1)*sides+k))
 faces.extend([tuple(reversed(range(sides))),tuple(range((len(pts)-1)*sides,len(pts)*sides))])
 return mesh(name,verts,faces,uvs)

def ellipsoid(name,center,scale):
 verts=[];faces=[];uvs=[]
 for j in range(9):
  phi=math.pi*(j+.03)/8.06
  for k in range(16):
   theta=k*math.tau/16
   verts.append((center[0]+scale[0]*math.sin(phi)*math.cos(theta),center[1]+scale[1]*math.sin(phi)*math.sin(theta),center[2]+scale[2]*math.cos(phi)))
   uvs.append((k/16,j/8))
 for j in range(8):
  for k in range(16):faces.append((j*16+k,j*16+(k+1)%16,(j+1)*16+(k+1)%16,(j+1)*16+k))
 return mesh(name,verts,faces,uvs)

def hand(name,mirror=1):
 # Palm runs from tapered wrist to broad metacarpals, dorsal side towards +Z.
 parts=[]
 parts.append(ellipsoid('palm',(0,-.012,.031),(.043,.062,.022)))
 parts.append(ellipsoid('thumb pad',(-.03,-.025,.018),(.027,.036,.022)))
 parts.append(tube('tapered forearm',[(0,-.045,.04),(.006,-.081,.065),(.018,-.14,.11),(.025,-.23,.16)], [.031,.029,.038,.045],16,.72))
 # Four independent curled fingers around a vertical grip; length and knuckles differ.
 for i,(x,length,r) in enumerate([(-.030,.080,.0125),(-.010,.087,.013),(.012,.081,.012),(.032,.064,.0105)]):
  start=.039-(.009 if i==3 else 0)
  pts=[(x,start,.032),(x,start+length*.20,.013),(x,start+length*.26,-.011),(x,start+length*.10,-.033),(x,start-length*.17,-.035),(x,start-length*.36,-.018)]
  parts.append(tube('finger '+str(i),pts,[r*.95,r,r*.96,r*.83,r*.74,r*.52],12))
  parts.append(ellipsoid('knuckle '+str(i),(x,start+.004,.036),(r*1.06,r*.92,r*.65)))
  nail=ellipsoid('nail '+str(i),(x,start-length*.33,-.025),(r*.57,r*.65,.002))
  # Nails share atlas; lighter vertex color and flat surface keep them restrained.
  parts.append(nail)
 parts.append(tube('opposing thumb',[(-.042,-.018,.027),(-.064,.005,.01),(-.058,.030,-.015),(-.036,.042,-.029),(-.021,.040,-.029)],[.018,.0165,.0145,.012,.009],12))
 bpy.ops.object.select_all(action='DESELECT')
 for p in parts:p.select_set(True)
 bpy.context.view_layer.objects.active=parts[0];bpy.ops.object.join();obj=parts[0];obj.name=name
 for vert in obj.data.vertices:vert.co.x*=mirror
 if mirror<0:
  bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.flip_normals();bpy.ops.object.mode_set(mode='OBJECT')
 return obj

right=hand('hand_right');left=hand('hand_left',-1)
# glTF export converts Blender Z-up to Y-up. Author directly in desired game axes.
for obj in [right,left]:
 for vert in obj.data.vertices:
  x,y,z=vert.co;vert.co=(x,-z,y)
 obj.data.update()
triangles=0
for obj in [right,left]:obj.data.calc_loop_triangles();triangles+=len(obj.data.loop_triangles)
assert triangles<10000
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'art/hands.blend'))
bpy.ops.export_scene.gltf(filepath=str(OUT/'hands.glb'),export_format='GLB',export_animations=False,export_cameras=False,export_lights=False)
report={'name':'Cornfields original player hands','origin':'Original mesh and atlas authored for this project in scripts/build-hands.py','externalAssets':False,'triangles':triangles,'bytes':(OUT/'hands.glb').stat().st_size,'sha256':hashlib.sha256((OUT/'hands.glb').read_bytes()).hexdigest(),'poses':'One posed grip mirrored for left support; wrist transforms are presentation only.'}
(OUT/'hands-source.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
