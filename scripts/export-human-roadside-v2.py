#!/usr/bin/env python3
"""Approved v2 original roadside and projector. No downloads or new dependencies.
Run with installed Blender: blender -b -t 4 --python scripts/export-human-roadside-v2.py
Editable objects are retained; exports join material-compatible static parts.
Coordinates below are Three.js metres (X right, Y up, -Z forward).
"""
import bpy, math, json, hashlib, struct, sys, argparse
import numpy as np
from pathlib import Path
from datetime import datetime, timezone
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1]
E=ROOT/'verification/human-roadside-v2/props';E.mkdir(parents=True,exist_ok=True)
ap=argparse.ArgumentParser();ap.add_argument('--render',action='store_true');ap.add_argument('--import-mike',action='store_true');ap.add_argument('--build-mike',action='store_true');args=ap.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
parts=[]
def point(v):return Vector((v[0],-v[2],v[1]))
def material(name,color,rough=.7,metal=0):
 m=bpy.data.materials.new(name);m.use_nodes=True;m.diffuse_color=(*color,1);p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal;return m

def select(obs):
 bpy.ops.object.select_all(action='DESELECT')
 for o in obs:o.select_set(True)
 if obs:bpy.context.view_layer.objects.active=obs[0]

def cube(name,dim,loc,mat,bevel=0):
 bpy.ops.mesh.primitive_cube_add(size=1,location=point(loc));o=bpy.context.object;o.name=name;o.dimensions=(dim[0],dim[2],dim[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(mat)
 if bevel:
  mod=o.modifiers.new('Small silhouette bevel','BEVEL');mod.width=bevel;mod.segments=1;bpy.ops.object.modifier_apply(modifier=mod.name)
 parts.append(o);return o

def rod(name,a,b,r,mat,n=12):
 d=point(b)-point(a);bpy.ops.mesh.primitive_cylinder_add(vertices=n,radius=r,depth=d.length,location=(point(a)+point(b))/2);o=bpy.context.object;o.name=name;o.rotation_euler=d.to_track_quat('Z','Y').to_euler();bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(mat);parts.append(o);return o

def surface(name,verts,faces,mat):
 me=bpy.data.meshes.new(name);me.from_pydata([point(v) for v in verts],[],faces);me.materials.append(mat);me.update();o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o)
 uv=me.uv_layers.new(name='UVMap')
 for poly in me.polygons:
  axis=max(range(3),key=lambda i:abs(poly.normal[i]));axes=[i for i in range(3) if i!=axis]
  for li in poly.loop_indices:
   v=me.vertices[me.loops[li].vertex_index].co;uv.data[li].uv=(v[axes[0]]/3,v[axes[1]]/3)
 parts.append(o);return o

def tile_uv(o,tile):
 uv=o.data.uv_layers.active or o.data.uv_layers.new(name='UVMap');uv.name='UVMap'
 for poly in o.data.polygons:
  axis=max(range(3),key=lambda i:abs(poly.normal[i]));axes=[i for i in range(3) if i!=axis];coords=[o.data.vertices[o.data.loops[i].vertex_index].co for i in poly.loop_indices];lo=[min(v[a] for v in coords) for a in axes];span=[max(v[a] for v in coords)-lo[n] for n,a in enumerate(axes)]
  for li in poly.loop_indices:
   v=o.data.vertices[o.data.loops[li].vertex_index].co;u=[(v[a]-lo[n])/max(span[n],1e-6) for n,a in enumerate(axes)];uv.data[li].uv=((tile%4+.035+u[0]*.93)/4,(tile//4+.035+u[1]*.93)/4)

def join_copy(obs,name,origin=(0,0,0)):
 copies=[]
 for ob in obs:
  c=ob.copy();c.data=ob.data.copy();bpy.context.collection.objects.link(c);copies.append(c)
 select(copies);bpy.ops.object.join();o=bpy.context.object;o.name=name;bpy.context.scene.cursor.location=point(origin);bpy.ops.object.origin_set(type='ORIGIN_CURSOR');return o

def export(obs,file):
 select(obs);bpy.ops.export_scene.gltf(filepath=str(ROOT/'assets/intro'/file),export_format='GLB',use_selection=True,export_animations=False,export_yup=True,export_materials='EXPORT',export_extras=True,export_cameras=False,export_lights=False)
 data=(ROOT/'assets/intro'/file).read_bytes();j=json.loads(data[20:20+struct.unpack_from('<I',data,12)[0]]);tris=sum(j['accessors'][p['indices']]['count']//3 for m in j.get('meshes',[]) for p in m['primitives']);draws=sum(len(m['primitives']) for m in j.get('meshes',[]));return {'file':'assets/intro/'+file,'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data),'triangles':tris,'materialDraws':draws,'nodes':[n.get('name') for n in j.get('nodes',[])],'images':len(j.get('images',[]))}

def make_roadside():
 global parts;parts=[]
 wood=material('Cleared Poly Haven weathered timber',(.55,.53,.47),.94)
 tex=bpy.data.images.load(str(ROOT/'assets/field/wood_planks_dirt_diff_1k.jpg'),check_existing=True);tex.scale(512,512);tex.pack();node=wood.node_tree.nodes.new('ShaderNodeTexImage');node.image=tex;wood.node_tree.links.new(node.outputs['Color'],wood.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
 roof=material('Original weathered slate and chimney',(.055,.073,.072),.91);trim=material('Original faded porch trim',(.22,.24,.20),.9);dark=material('Original dark windows and recessed door',(.013,.021,.023),.56);metal=material('Original unmarked mailbox and pole',(.08,.11,.11),.66,.4);warm=material('Original warm streetlight lens',(.76,.53,.25),.43);p=warm.node_tree.nodes.get('Principled BSDF');p.inputs['Emission Color'].default_value=(1,.61,.26,1);p.inputs['Emission Strength'].default_value=.4
 gravel=material('Original driveway gravel',(.135,.139,.12),.98)
 # Small rural shell, no interior, behind and right of the cruiser in the reference.
 cube('House closed weathered shell',(5.9,4.65,6.4),(10.2,2.355,7),wood)
 cube('Foundation sill',(6.1,.18,6.6),(10.2,.09,7),roof)
 # Gables at the road-facing and rear facades; roof ridge follows X.
 for x in [7.245,13.155]:surface('Gable weathered siding',[(x,4.68,3.8),(x,6.36,7),(x,4.68,10.2)],[(0,1,2)] if x>10 else [(2,1,0)],wood)
 for sign in [-1,1]:
  surface('Pitched roof',[(6.95,4.58,7+sign*3.55),(13.45,4.58,7+sign*3.55),(13.45,6.42,7),(6.95,6.42,7)],[(0,1,2,3)] if sign>0 else [(3,2,1,0)],roof)
  rod('Roof eave trim',(6.94,4.58,7+sign*3.55),(13.46,4.58,7+sign*3.55),.065,trim,6)
 cube('Unlit chimney',(.58,1.3,.64),(11.7,6.05,7.9),roof);cube('Chimney coping',(.67,.12,.73),(11.7,6.71,7.9),trim)
 # Porch roof, uneven original pickets and deep doorway: no lit rooms.
 cube('Porch deck',(1.56,.22,4.6),(6.53,.22,7),wood);porchRoof=cube('Dark porch roof',(1.94,.16,4.98),(6.35,2.76,7),roof);porchRoof.rotation_euler.y=-.045
 for z in [4.9,9.1]:
  cube('Weathered porch column',(.15,2.43,.15),(5.86,1.59,z),trim)
  cube('Porch side handrail',(1.25,.07,.08),(6.47,1.1,z),trim)
  for i in range(5):
   if z>7 and i==2:continue
   o=cube('Uneven porch picket',(.045,.63,.05),(5.93+i*.25,.735,z),trim);o.rotation_euler.y=math.sin(i*2.3)*.025
 for i in range(3):cube('Porch worn entrance step',(.35,.08*(i+1),1.34),(5.1+i*.29,.04*(i+1),7),wood)
 cube('Deep unlit porch door',(.022,1.89,.92),(7.235,1.35,7),dark)
 for z in [6.5,7.5]:cube('Door jamb',(.07,1.98,.07),(7.18,1.35,z),trim)
 cube('Door lintel',(.07,.08,1.08),(7.18,2.37,7),trim)
 for z in [5.05,8.95]:
  for y in [1.56,3.65]:
   cube('Unlit house window',(.027,1.1,.83),(7.23,y,z),dark)
   for zz in [z-.46,z+.46]:cube('Window side frame',(.055,1.23,.07),(7.19,y,zz),trim)
   for yy in [y-.58,y+.58]:cube('Window sill',(.08,.075,1.03),(7.17,yy,z),trim)
   cube('Window center mullion',(.055,1.1,.034),(7.17,y,z),trim);cube('Window cross sash',(.055,.034,.83),(7.17,y-.08,z),trim)
 # Narrow siding seams keep readable age at a distance without many materials.
 for y in [i*.3 for i in range(1,16)]:cube('Horizontal siding seam',(.018,.017,6.3),(7.238,y+.03,7),trim)
 # Drive meets the road edge x=-.95 and stops at porch; it never crosses routes.
 surface('Short driveway to road',[(-.94,.002,4.2),(-.94,.002,6.4),(5.28,.002,7.75),(5.28,.002,6.25)],[(3,2,1,0)],gravel)
 # Fictional unnumbered mailbox, road-facing opening and raised flag omitted.
 cube('Unnumbered mailbox post',(.12,1.09,.12),(1.62,.545,4.14),wood)
 cube('Mailbox cross support',(.48,.07,.10),(1.58,1.08,4.14),trim)
 cube('Unnumbered rural mailbox body',(.48,.25,.30),(1.57,1.23,4.14),metal,.035)
 cube('Mailbox closed unmarked door',(.017,.20,.265),(1.321,1.225,4.14),metal,.018)
 cube('Mailbox latch',(.033,.025,.058),(1.3,1.322,4.14),trim)
 # One bounded runtime lamp; only its physical shell is exported.
 rod('Driveway streetlight pole',(3.02,0,3.75),(3.02,4.48,3.75),.068,metal,12)
 rod('Streetlight outreach',(3.02,4.45,3.75),(3.02,4.54,4.53),.055,metal,10)
 cube('Streetlight hood',(.42,.13,.60),(3.02,4.50,4.61),metal,.045)
 cube('Streetlight warm underside',(.31,.02,.47),(3.02,4.427,4.61),warm,.01)
 # Cube UVs are retained for wood. Group every material to cap draw count at 7.
 source=list(parts);out=[]
 for mat in [wood,roof,trim,dark,metal,warm,gravel]:out.append(join_copy([o for o in source if o.data.materials[0]==mat],'Roadside '+mat.name))
 result=export(out,'roadside-set.glb')
 for o in out:bpy.data.objects.remove(o,do_unlink=True)
 for o in source:o['asset']='roadside-set';o.hide_set(True)
 return result,source

def projector_atlas():
 rng=np.random.default_rng(37081);a=np.ones((512,512,4),np.float32);colors=[(.14,.17,.17),(.018,.026,.025),(.48,.51,.47),(.24,.19,.115),(.65,.46,.30),(.045,.055,.05)]
 for i in range(16):
  y,x=divmod(i,4);rgb=np.array(colors[min(i,5)]);noise=rng.normal(0,.007,(128,128,1));a[y*128:(y+1)*128,x*128:(x+1)*128,:3]=np.clip(rgb+noise,0,1)
 # Film tile 15: perforation and frame divisions scroll inside this tile at runtime.
 a[384:512,384:512,:3]=(.08,.058,.027)
 for y in range(384,512,16):
  a[y:y+6,388:399,:3]=(.59,.51,.34);a[y:y+6,497:508,:3]=(.59,.51,.34);a[y+12:y+14,403:493,:3]=(.018,.014,.008)
 im=bpy.data.images.new('Original projector metal-film atlas 512',width=512,height=512,alpha=False);im.pixels.foreach_set(a.ravel());im.filepath_raw=str(E/'projector-original-atlas.png');im.file_format='PNG';im.save();im.pack()
 m=material('Original shared projector atlas',(.3,.32,.3),.63,.3);node=m.node_tree.nodes.new('ShaderNodeTexImage');node.image=im;m.node_tree.links.new(node.outputs['Color'],m.node_tree.nodes.get('Principled BSDF').inputs['Base Color']);return m

def make_projector():
 global parts;parts=[];mat=projector_atlas()
 def c(name,d,p,tile=0,bevel=0):o=cube(name,d,p,mat,bevel);tile_uv(o,tile);return o
 def r(name,a,b,radius,tile=2,n=16):o=rod(name,a,b,radius,mat,n);tile_uv(o,tile);return o
 c('Beveled projector motor housing',(.43,.245,.37),(0,0,0),0,.021)
 c('Recessed side access plate',(.012,.177,.255),(.222,.0,.017),1,.01)
 c('Projector side panel',(.015,.157,.235),(.231,.0,.017),0,.013)
 c('Projector top handle crossbar',(.31,.024,.035),(0,.177,.02),1,.01)
 for x in [-.144,.144]:c('Projector handle support',(.023,.05,.035),(x,.145,.02),2)
 c('Original plain identification plate',(.008,.037,.071),(.244,-.025,.078),3)
 for i in range(7):c('Projector recessed cooling vent',(.007,.066,.009),(.244,.025,-.072+i*.019),1)
 c('Projector level stand plate',(.58,.045,.48),(0,-.17,0),0,.008)
 c('Projector stand neck',(.23,.07,.24),(0,-.132,0),1)
 for x in [-.20,.20]:
  for z in [-.17,.17]:
   r('Projector grounded stand leg',(x,-.19,z),(x*1.12,-.96,z*1.14),.019,0,8)
   c('Projector rubber floor foot',(.074,.02,.072),(x*1.12,-.97,z*1.14),1,.006)
 # Barrel centerline ends at the existing beam origin and aims at the wall image.
 lens=Vector((0,0,-.28));direction=Vector((.88,.78,-4.785)).normalized()
 for name,near,far,rad,tile in [('Lens housing',-.115,-.045,.066,0),('Lens focus ring',-.058,-.014,.069,2),('Lens outer lip',-.019,0,.061,1),('Projector lens glass',-.003,.001,.051,4)]:r(name,lens+direction*near,lens+direction*far,rad,tile,20)
 c('Film gate housing',(.035,.106,.055),(.253,.028,-.136),2,.008)
 for z in [-.135,.08]:r('Film guide roller',(.25,.142,z),(.29,.142,z),.018,2,12)
 # Continuous short film path on camera-facing side with original perforation atlas.
 for a,b in [((.271,.33,.20),(.271,.142,.08)),((.271,.142,.08),(.271,.082,-.137)),((.271,.082,-.137),(.271,-.013,-.137)),((.271,-.013,-.137),(.271,.32,-.25))]:
  v=Vector(b)-Vector(a);side=Vector((0,-v.z,v.y)).normalized()*.014;o=surface('Threaded moving film strip',[Vector(a)-side,Vector(b)-side,Vector(b)+side,Vector(a)+side],[(0,1,2,3)],mat);tile_uv(o,15)
  for poly in o.data.polygons:
   for li,uv in zip(poly.loop_indices,[(.75875,.75875),(.75875,.99125),(.99125,.99125),(.99125,.75875)]):o.data.uv_layers.active.data[li].uv=uv
 for y,z in [(.33,.20),(.32,-.25)]:r('Projector fold-out reel support arm',(.205,.067,z*.43),(.218,y,z),.019,0,8)
 static=list(parts);reels=[]
 for name,y,z,rad in [('Feed reel',.33,.20,.154),('Takeup reel',.32,-.25,.146)]:
  before=len(parts)
  r(name+' axle',(.215,y,z),(.29,y,z),.023,2,12)
  # Ring faces plus spokes create true open reels, not painted solid discs.
  for x in [.286,.271]:
   verts=[]
   for radius in [rad,rad-.018]:
    for i in range(32):verts.append((x,y+radius*math.sin(i*math.tau/32),z+radius*math.cos(i*math.tau/32)))
   o=surface(name+' open rim',verts,[(i,(i+1)%32,(i+1)%32+32,i+32) for i in range(32)],mat);tile_uv(o,2)
   for i in range(6):
    angle=i*math.tau/6;r(name+' spoke',(x,y+math.sin(angle)*.023,z+math.cos(angle)*.023),(x,y+math.sin(angle)*(rad-.014),z+math.cos(angle)*(rad-.014)),.009,2,6)
  r(name+' wound film core',(.279,y,z),(.273,y,z),rad*.64,1,24)
  reels.append((name,parts[before:],(.278,y,z)))
 source=list(parts);staticOut=join_copy(static,'Projector housing and threaded film');out=[staticOut]
 for name,obs,origin in reels:out.append(join_copy(obs,name,origin))
 result=export(out,'projector.glb')
 for o in out:bpy.data.objects.remove(o,do_unlink=True)
 for o in source:o['asset']='projector';o.hide_set(True)
 return result,source

def make_cabin_sources():
 """Editable original cabin shapes matching the runtime anchors and dimensions.
 These are authoring references; runtime builds the same bounded primitive fit.
 """
 global parts;parts=[]
 shell=material('Original dashboard receiver charcoal',(.023,.033,.028),.68,.24);metal=material('Original receiver knob brushed metal',(.30,.34,.30),.47,.45);screen=material('Original muted receiver display',(.27,.37,.25),.45)
 origin=Vector((.08,.83,-.705))
 def c(name,d,p,mat=shell):return cube(name,d,origin+Vector(p),mat)
 c('Radio back chassis',(.35,.12,.046),(0,0,-.0145))
 for y in [-.054,.054]:c('Radio fascia horizontal rim',(.35,.012,.04),(0,y,.022))
 for x in [-.1675,.1675]:c('Radio fascia side rim',(.015,.096,.04),(x,0,.022))
 c('Radio knob panel',(.077,.084,.039),(.1245,0,.0205));c('Radio display inner edge',(.014,.084,.039),(.078,0,.0205))
 c('Recessed tuning scale glass',(.225,.057,.001),(-.039,.014,.034),screen)
 for i in range(5):c('Radio preset button',(.027,.012,.008),(-.115+i*.038,-.031,.039))
 rod('Radio tactile knob',origin+Vector((.125,0,.0405)),origin+Vector((.125,0,.0655)),.024,metal,24)
 # Wheel source orientation retains cabin center, tilt and rim contact radius.
 center=point((-.45,.905,-.435));bpy.ops.mesh.primitive_torus_add(major_radius=.190,minor_radius=.021,major_segments=64,minor_segments=12,location=center)
 rim=bpy.context.object;rim.name='Wheel exact shared leather rim';rim.rotation_euler.x=math.pi/2-.35;rim.data.materials.append(shell);parts.append(rim)
 # Runtime hub/spokes are represented in their same tilted steering plane.
 def wheel_point(v):
  x,y,z=v;return (-.45+x,.905+y*math.cos(-.35)-z*math.sin(-.35),-.435+y*math.sin(-.35)+z*math.cos(-.35))
 rod('Wheel original padded hub',wheel_point((0,0,-.026)),wheel_point((0,0,.026)),.06,shell,24)
 for angle in [math.pi/2,-math.pi/2,math.pi]:rod('Wheel refined spoke',wheel_point((math.sin(angle)*.042,math.cos(angle)*.042,-.008)),wheel_point((math.sin(angle)*.182,math.cos(angle)*.182,-.008)),.014,metal,8)
 for o in parts:o['asset']='cabin-runtime-authoring-reference';o.hide_set(True)

def build_mike_body():
 """Optional repeatable same-rig body-only producer; leaves other source objects intact."""
 E=ROOT/'verification/human-roadside-v2/body';E.mkdir(parents=True,exist_ok=True)
 before=set(bpy.data.objects)
 bpy.ops.import_scene.gltf(filepath=str(ROOT/'assets/intro/cast-clarence.glb'))
 for ob in list(bpy.data.objects):
  if ob not in before and ob.type=='MESH' and ob.name not in ['black fancy shoes','manpants','shirt']:bpy.data.objects.remove(ob,do_unlink=True)
 rig=next(o for o in bpy.data.objects if o not in before and o.type=='ARMATURE')
 print('BONES',[(b.name,tuple(b.head_local)) for b in rig.data.bones if b.name in ['torso','neck','head']])
 shirt=bpy.data.objects.get('shirt');pants=bpy.data.objects.get('manpants');boots=bpy.data.objects.get('black fancy shoes')
 # Reuse the cleared body topology and skin; give the two officers an original
 # midnight-blue generic uniform, rather than any real force's insignia.
 for ob,color,rough in [(shirt,(.042,.063,.092,1),.82),(pants,(.022,.030,.043,1),.88),(boots,(.013,.016,.020,1),.58)]:
  mat=bpy.data.materials.new('Mike uniform '+ob.name);mat.use_nodes=True;mat.diffuse_color=color;p=mat.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=color;p.inputs['Roughness'].default_value=rough
  ob.data.materials.clear();ob.data.materials.append(mat)
  for poly in ob.data.polygons:poly.use_smooth=True
 # Preserve the source bones and clips. Authored details use the same shirt slot
 # and torso bone, so the packaged body remains three material draws.
 def detail(name,location,scale,target,bevel=0):
  bpy.ops.mesh.primitive_cube_add(size=2,location=location);o=bpy.context.object;o.name=name;o.scale=scale;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
  if bevel:
   m=o.modifiers.new('Uniform edge bevel','BEVEL');m.width=bevel;m.segments=1;bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=m.name)
  o.data.materials.append(target.data.materials[0]);vg=o.vertex_groups.new(name='torso');vg.add(list(range(len(o.data.vertices))),1,'REPLACE');mod=o.modifiers.new('Existing cleared rig','ARMATURE');mod.object=rig
  # Convert world coordinates to the target's existing object-local coordinates.
  bpy.context.view_layer.update();o.matrix_world=target.matrix_world@o.matrix_world
  bpy.ops.object.select_all(action='DESELECT');target.select_set(True);o.select_set(True);bpy.context.view_layer.objects.active=target;bpy.ops.object.join()
 # Imported Blender axes are X right, Y rear, Z up. Measurements retain source scale.
 for sign in [-1,1]:
  detail('Uniform breast pocket', (sign*.16,-.227,2.29),(.115,.017,.112),shirt,.012)
  detail('Pocket flap', (sign*.16,-.248,2.40),(.123,.012,.025),shirt,.007)
  detail('Generic shoulder epaulette',(sign*.33,-.030,2.65),(.11,.11,.020),shirt,.01)
 # Five original small shirt buttons and unbranded rectangular nameplate.
 for z in [2.05,2.18,2.31,2.44]:detail('Uniform placket button',(0,-.252,z),(.009,.006,.009),shirt,.002)
 detail('Generic duty belt',(0,-.003,1.66),(.36,.205,.045),pants,.015)
 for sign in [-1,1]:detail('Duty belt pouch',(sign*.34,-.10,1.65),(.065,.080,.13),pants,.02)
 # Avoid exporting all duplicate joint material slots produced by joining.
 for ob in [shirt,pants,boots]:
  mat=ob.data.materials[0];ob.data.materials.clear();ob.data.materials.append(mat)
  for p in ob.data.polygons:p.material_index=0
 bpy.context.scene['MikeBodyProvenance']='Body, trouser, boot topology and skeleton derived from NPC male Steve by supersteve CC0, via pinned cast-clarence.glb. Original fictional midnight-blue uniform details; no head, no skin-arm duplicate, no imported new assets.'
 rig['sourceFullBodyHeight']=3.374371126294136
 bpy.ops.object.select_all(action='DESELECT')
 for ob in [rig,shirt,pants,boots]:ob.select_set(True)
 bpy.context.view_layer.objects.active=rig
 bpy.ops.export_scene.gltf(filepath=str(ROOT/'assets/intro/mike-body.glb'),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='ACTIONS',export_force_sampling=False,export_cameras=False,export_lights=False,export_yup=True,export_extras=True)
 b= (ROOT/'assets/intro/mike-body.glb').read_bytes();n=struct.unpack_from('<I',b,12)[0];j=json.loads(b[20:20+n]);tris=sum(j['accessors'][p['indices']]['count']//3 for m in j['meshes'] for p in m['primitives']);draws=sum(len(m['primitives']) for m in j['meshes']);r={'triangles':tris,'draws':draws,'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest(),'sourceHeight':3.374371126294136,'animations':[a['name'] for a in j.get('animations',[])],'class':'Asset inventory, not screenshot or browser QA'};assert tris<=6000 and draws<=3;r['meshNames']=[m['name'] for m in j['meshes']];(E/'asset-report.json').write_text(json.dumps(r,indent=2));print(json.dumps(r))
 
 for ob in set(bpy.data.objects)-before:ob['asset']='mike-body';ob.hide_set(True)

def stamp_mike_metadata():
 path=ROOT/'assets/intro/mike-body.glb'
 b=path.read_bytes();n=struct.unpack_from('<I',b,12)[0];j=json.loads(b[20:20+n]);j.setdefault('asset',{}).setdefault('extras',{}).update({'cinematicCharacter':'mike','assetId':'mike-body.glb','sourceFullBodyHeight':3.374371126294136})
 encoded=json.dumps(j,separators=(',',':')).encode();encoded+=b' '*((-len(encoded))%4);binary=b[20+n:];out=struct.pack('<III',0x46546c67,2,20+len(encoded)+len(binary))+struct.pack('<II',len(encoded),0x4e4f534a)+encoded+binary;path.write_bytes(out)
 reportPath=ROOT/'verification/human-roadside-v2/body/asset-report.json';report=json.loads(reportPath.read_text()) if reportPath.exists() else {};report.update({'bytes':len(out),'sha256':hashlib.sha256(out).hexdigest(),'assetExtras':j['asset']['extras']});reportPath.write_text(json.dumps(report,indent=2)+'\n');return report

def import_mike():
 if not args.import_mike or args.build_mike:return
 target=ROOT/'assets/intro/mike-body.glb'
 if not target.exists():raise RuntimeError('Requested Mike import is missing')
 bpy.ops.import_scene.gltf(filepath=str(target));
 for o in bpy.context.selected_objects:o['asset']='mike-body';o.hide_set(True)

if args.build_mike:build_mike_body()
if args.import_mike or args.build_mike:mikeReport=stamp_mike_metadata()
roadside,houseSource=make_roadside();projector,projectorSource=make_projector();make_cabin_sources();import_mike()
assert roadside['triangles']<=12000 and roadside['materialDraws']<=8
assert projector['triangles']<=5000 and projector['materialDraws']<=3 and projector['bytes']<=1048576
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'art/working/human-roadside-v2.blend'))
report={'createdAt':datetime.now(timezone.utc).isoformat(),'baseline':'d6192dc8582d9792b262957c2cb5f6ab80db85d5','evidenceType':'asset structure, not rendered performance','assets':[roadside,projector],'roadsidePlacement':{'houseCenter':[10.2,0,7],'mailbox':[1.62,0,4.14],'streetlight':[3.02,4.42,4.61]},'newExternalAssets':False,'newSpendUSD':0}
(E/'asset-budgets.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report))
if args.render:
 # Studio evidence reimports the actual exports, not source objects.
 for old in list(bpy.data.objects):bpy.data.objects.remove(old,do_unlink=True)
 bpy.ops.import_scene.gltf(filepath=str(ROOT/'assets/intro/projector.glb'));scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=16;scene.cycles.use_denoising=False;scene.render.resolution_x=1100;scene.render.resolution_y=900;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.world.color=(.18,.18,.18)
 floor=material('Studio floor',(.13,.145,.15));cube('Studio floor',(5,.025,5),(0,-.992,0),floor)
 for pos,energy,size in [((-2,3,-3),600,4),((3,2,2),450,3)]:
  bpy.ops.object.light_add(type='AREA',location=point(pos));o=bpy.context.object;o.data.energy=energy;o.data.shape='DISK';o.data.size=size;o.rotation_euler=(point((0,-.15,0))-o.location).to_track_quat('-Z','Y').to_euler()
 bpy.ops.object.camera_add();cam=bpy.context.object;scene.camera=cam;cam.data.type='ORTHO';cam.data.ortho_scale=2.1
 for label,pos in [('front',(.8,.3,-2)),('side',(2,.35,0)),('three-quarter',(1.5,.55,1.7))]:
  cam.location=point(pos);cam.rotation_euler=(point((0,-.24,0))-cam.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=str(E/('projector-studio-'+label+'.png'));bpy.ops.render.render(write_still=True)

 if args.render:
  for old in list(bpy.data.objects):bpy.data.objects.remove(old,do_unlink=True)
  bpy.ops.import_scene.gltf(filepath=str(ROOT/'assets/intro/roadside-set.glb'))
  cube('Roadside studio ground',(35,.025,35),(7,-.023,7),floor)
  for pos,energy,size in [((-3,9,1),1800,8),((15,8,16),900,7)]:
   bpy.ops.object.light_add(type='AREA',location=point(pos));o=bpy.context.object;o.data.energy=energy;o.data.size=size;o.rotation_euler=(point((8,2.4,7))-o.location).to_track_quat('-Z','Y').to_euler()
  bpy.ops.object.camera_add();cam=bpy.context.object;scene.camera=cam;cam.data.type='ORTHO';cam.data.ortho_scale=20;cam.location=point((-12,9,-7));cam.rotation_euler=(point((6.9,2.0,6.8))-cam.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=str(E/'roadside-studio-composition.png');bpy.ops.render.render(write_still=True)
