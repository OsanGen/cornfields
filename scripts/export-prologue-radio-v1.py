#!/usr/bin/env python3
"""Original unbranded dispatch prop. Blender 4.3.2, no downloads/dependencies.
Run: blender -b -t 4 --python scripts/export-prologue-radio-v1.py -- --render
The working .blend retains named editable parts. Export merges the same parts
into one mesh with three material primitives. All textures are locally authored.
Render evidence reimports the exported GLB; it is never a runtime screenshot.
"""
import argparse, hashlib, json, math, struct, sys
from datetime import datetime, timezone
from pathlib import Path
import bpy
import numpy as np
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1]
ap=argparse.ArgumentParser();ap.add_argument('--render',action='store_true');ap.add_argument('--render-only',action='store_true');args=ap.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
E=ROOT/'verification/faces-radio-v1/radio';E.mkdir(parents=True,exist_ok=True)
ASSET=ROOT/'assets/intro/dispatch-radio.glb';SOURCE=ROOT/'art/working/prologue-radio-v1.blend'
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
parts=[]
def image(name,rgb,linear=False):
 h,w=rgb.shape[:2];im=bpy.data.images.new(name,width=w,height=h,alpha=False);im.colorspace_settings.name='Non-Color' if linear else 'sRGB';rgba=np.ones((h,w,4),np.float32);rgba[:,:,:3]=rgb;im.pixels.foreach_set(rgba[::-1].ravel());im.filepath_raw=str(E/(name+'.png'));im.file_format='PNG';im.save();im.pack();return im

def material(name,color,rough=.7):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True;m.use_backface_culling=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=rough;return m

def textured_materials():
 rng=np.random.default_rng(94051);h=w=256;y,x=np.mgrid[:h,:w];grain=rng.normal(0,.003,(h,w));grain+=.0008*np.sin(x*.43+y*.21)
 # Restrained original brushed/scuffed texture; deterministic and seamless noise.
 base=np.clip(.045+grain,0,1);color=np.stack([base*.87,base*.95,base],2)
 for _ in range(33):
  xx,yy=rng.integers(0,256,2);length=int(rng.integers(2,14));color[yy,(np.arange(length)+xx)%256]+=.007
 color=np.clip(color,0,1);rough=np.clip(.72+rng.normal(0,.023,(h,w)),.55,.86);surface=np.stack([np.ones_like(rough),rough,np.zeros_like(rough)],2)
 albedo=image('radio-original-polymer-256',color);orm=image('radio-original-surface-256',surface,True)
 shell=material('Original charcoal polymer',(.15,.17,.18));nodes=shell.node_tree.nodes;links=shell.node_tree.links;p=nodes.get('Principled BSDF');tex=nodes.new('ShaderNodeTexImage');tex.image=albedo;links.new(tex.outputs['Color'],p.inputs['Base Color']);s=nodes.new('ShaderNodeTexImage');s.image=orm;sep=nodes.new('ShaderNodeSeparateColor');links.new(s.outputs['Color'],sep.inputs[0]);links.new(sep.outputs['Green'],p.inputs['Roughness']);links.new(sep.outputs['Blue'],p.inputs['Metallic'])
 rubber=material('Soft dark rubber and recesses',(.008,.010,.011),.91)
 # Original LCD graphics, no manufacturer marks. Simple channel digit/battery.
 lcd=np.empty((128,256,3),np.float32);lcd[:]=[.36,.47,.32];lcd+=rng.normal(0,.002,(128,256,1));dark=[.045,.095,.05]
 def rect(x0,y0,x1,y1):lcd[y0:y1,x0:x1]=dark
 for r in [(35,24,71,30),(66,29,73,60),(35,59,69,65),(66,64,73,96),(35,95,71,101)]:rect(*r)
 for r in [(193,77,230,81),(193,100,230,104),(193,77,197,104),(226,77,230,104),(230,85,234,97),(200,85,206,97),(210,85,216,97),(220,85,224,97),(143,94,148,101),(152,88,157,101),(161,81,166,101)]:rect(*r)
 screen=material('Muted green LCD',(.4,.5,.35),.38);p=screen.node_tree.nodes.get('Principled BSDF');tex=screen.node_tree.nodes.new('ShaderNodeTexImage');tex.image=image('radio-original-lcd-256x128',lcd);screen.node_tree.links.new(tex.outputs['Color'],p.inputs['Base Color']);screen.node_tree.links.new(tex.outputs['Color'],p.inputs['Emission Color']);p.inputs['Emission Strength'].default_value=.12
 return shell,rubber,screen

# Horizontal outline in X/Z, with smoothly joined rounded corners.
def outline(w,h,r,n=3):
 out=[]
 for cx,cz,start in [(w/2-r,h/2-r,0),(-w/2+r,h/2-r,90),(-w/2+r,-h/2+r,180),(w/2-r,-h/2+r,270)]:
  for i in range(n+1):
   a=math.radians(start+i*90/n);out.append((cx+r*math.cos(a),cz+r*math.sin(a)))
 return out

def mesh(name,verts,faces,mat,smooth=False,face_uv=False):
 me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.materials.append(mat);me.update();ob=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(ob);parts.append(ob)
 uv=me.uv_layers.new(name='Original local UV')
 if face_uv:
  xx=[v[0] for v in verts];zz=[v[2] for v in verts];lo=(min(xx),min(zz));span=(max(xx)-lo[0],max(zz)-lo[1])
 for poly in me.polygons:
  poly.use_smooth=smooth
  for li in poly.loop_indices:
   co=me.vertices[me.loops[li].vertex_index].co
   if face_uv:u,v=(co.x-lo[0])/span[0],(co.z-lo[1])/span[1]
   else:
    axis=max(range(3),key=lambda i:abs(poly.normal[i]));axes=[i for i in range(3) if i!=axis];u,v=(co[axes[0]]*20+.5)%1,(co[axes[1]]*20+.5)%1
   uv.data[li].uv=(u,v)
 return ob

def body_shell(shell,rubber):
 # 65 x 145 x 40 mm. Two molded halves with a 0.8 mm dark parting seam.
 profile=[(.057,.137,.004,.020),(.065,.145,.008,.016),(.065,.145,.008,.0028),(.065,.145,.008,.002),(.065,.145,.008,-.016),(.057,.137,.004,-.020),(.051,.125,.006,-.020),(.049,.123,.006,-.0178)]
 verts=[]
 for w,h,r,y in profile:verts.extend([(x,y,z) for x,z in outline(w,h,r)])
 n=16;faces=[];ids=[]
 faces.append(tuple(range(n-1,-1,-1)));ids.append(0)
 for k in range(len(profile)-1):
  for j in range(n):faces.append((k*n+j,k*n+(j+1)%n,(k+1)*n+(j+1)%n,(k+1)*n+j));ids.append(1 if k==2 else 0)
 faces.append(tuple(range((len(profile)-1)*n,len(profile)*n)));ids.append(0)
 ob=mesh('Housing — 65 x 145 x 40 mm with recessed face and seam',verts,faces,shell)
 ob.data.materials.append(rubber)
 for p,i in zip(ob.data.polygons,ids):p.material_index=i
 # Recalculate all face normals for a closed, consistently outward shell.
 bpy.context.view_layer.objects.active=ob;ob.select_set(True);bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.normals_make_consistent(inside=False);bpy.ops.object.mode_set(mode='OBJECT');ob.select_set(False)
 for p in ob.data.polygons:p.use_smooth=True
 ob.data.set_sharp_from_angle(angle=math.radians(50))
 normal=ob.modifiers.new('Weighted molded surface normals','WEIGHTED_NORMAL');normal.keep_sharp=True;normal.weight=50
 return ob

def panel(name,w,h,depth,center,mat,r=.002,bevel=.0006):
 # Three perimeter loops form a beveled face rather than a box.
 x,y,z=center;profiles=[(w,h,depth/2),(w,h,-depth/2+bevel),(w-2*bevel,h-2*bevel,-depth/2)]
 verts=[]
 for a,b,d in profiles:verts.extend([(xx+x,d+y,zz+z) for xx,zz in outline(a,b,min(r,a/3,b/3),2)])
 n=12;faces=[tuple(range(n-1,-1,-1))]
 for k in range(2):
  for i in range(n):faces.append((k*n+i,k*n+(i+1)%n,(k+1)*n+(i+1)%n,(k+1)*n+i))
 faces.append(tuple(range(2*n,3*n)));ob=mesh(name,verts,faces,mat)
 bpy.context.view_layer.objects.active=ob;ob.select_set(True);bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.normals_make_consistent(inside=False);bpy.ops.object.mode_set(mode='OBJECT');ob.select_set(False)
 return ob

def radial(name,cx,cy,profile,mat,n=12):
 verts=[(cx+r*math.cos(i*math.tau/n),cy+r*math.sin(i*math.tau/n),z) for z,r in profile for i in range(n)];faces=[tuple(range(n-1,-1,-1))]
 for k in range(len(profile)-1):
  for i in range(n):faces.append((k*n+i,k*n+(i+1)%n,(k+1)*n+(i+1)%n,(k+1)*n+i))
 faces.append(tuple(range((len(profile)-1)*n,len(profile)*n)));return mesh(name,verts,faces,mat,True)

def display_bezel(rubber):
 verts=[]
 for w,h,r,y in [(.051,.032,.003,-.019),(.051,.032,.003,-.0224),(.043,.023,.0018,-.0224),(.043,.023,.0018,-.0206)]:verts.extend([(x,y,z+.041) for x,z in outline(w,h,r,2)])
 n=12;faces=[]
 for k in range(3):
  for i in range(n):faces.append((k*n+i,k*n+(i+1)%n,(k+1)*n+(i+1)%n,(k+1)*n+i))
 ob=mesh('Open protective display bezel',verts,faces,rubber)
 # The lip's front-facing winding is reversed around the inward aperture.
 bpy.context.view_layer.objects.active=ob;ob.select_set(True);bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.normals_make_consistent(inside=False);bpy.ops.object.mode_set(mode='OBJECT');ob.select_set(False)

def model():
 shell,rubber,screen=textured_materials();body_shell(shell,rubber)
 display_bezel(rubber)
 # Recessed display face inside the protruding bezel: 1.1 mm behind its lip.
 vs=[(-.021,-.021,.030),(.021,-.021,.030),(.021,-.021,.052),(-.021,-.021,.052)];mesh('Original LCD face channel 3',vs,[(0,1,2,3)],screen,face_uv=True)
 # Raised shell ridges surrounding dark slots make a recessed grille cavity.
 panel('Recessed speaker bed',.049,.040,.001,(0,-.0185,-.003),rubber,r=.003,bevel=.00025)
 for i in range(5):panel('Speaker grille bridge %02d'%i,.047,.003,.0022,(0,-.0201,.015-i*.009),shell,r=.001,bevel=.00045)
 for x in [-.0195,.0195]:
  for z in [-.061,.061]:
   # Dark screw wells and small inset original screw heads, a shared rubber draw.
   ob=radial('Recessed screw well',x,-z,[(-.0203,.002),(-.0198,.002)],rubber,8);ob.rotation_euler.x=math.pi/2
   # Above transform puts circular axes perpendicular to front plane.
   ob.location=(0,-.0401,0)
 radial('Antenna collar',.021,.001,[(.0715,.007),(.075,.007),(.077,.006),(.087,.0057),(.089,.0048)],rubber)
 radial('Round tapered antenna',.021,.001,[(.087,.0048),(.093,.0048),(.097,.0040),(.196,.0034),(.210,.0032),(.214,.0028),(.215,.0016)],rubber)
 for x,r,h in [(-.017,.007,.088),(.0005,.005,.085)]:
  radial('Rotary control collar',x,0,[(.0715,r+.001),(.0745,r+.001),(.075,r)],shell)
  radial('Round ribbed control knob',x,0,[(.074,r),(.077,r),(.078,r*.9),(h-.002,r*.9),(h,r*.75)],rubber,12)
 # Push-to-talk on the thumb side, lower than the display to fit the existing arm.
 button=panel('Side push-to-talk surround',.019,.045,.003,(0,0,0),rubber,r=.003);button.rotation_euler.z=math.pi/2;button.location=(-.0325,0,.001)
 button=panel('Side push-to-talk key',.012,.032,.003,(0,0,0),shell,r=.002);button.rotation_euler.z=math.pi/2;button.location=(-.034,0,.001)
 for z in [-.008,-.003,.002,.007]:
  ob=panel('PTT tactile ridge',.012,.0018,.0014,(0,0,0),rubber,r=.0005,bevel=.00025);ob.rotation_euler.z=math.pi/2;ob.location=(-.0357,0,z)
 # Rear battery grip texture strip and a shallow clip mounting foot.
 panel('Rear battery latch',.026,.013,.002,(0,.020,-.047),rubber,r=.002)
 # Three immutable slots shared by all editable parts.
 bpy.context.scene['provenance']='Original local procedural geometry and texture authoring, 2026-10-04; unbranded; no external inputs.'
 bpy.context.scene['body_mm']='65 x 145 x 40';bpy.context.scene['runtime_budget']='2000 triangles / 3 material draws / 1048576 bytes'
 bpy.ops.object.select_all(action='DESELECT')
 for ob in parts:ob.select_set(True)
 SOURCE.parent.mkdir(parents=True,exist_ok=True);bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE))
 # Apply authoring modifiers and export one three-primitive mesh, with proper UVs.
 for ob in parts:
  bpy.context.view_layer.objects.active=ob
  for mod in list(ob.modifiers):bpy.ops.object.modifier_apply(modifier=mod.name)
 bpy.context.view_layer.objects.active=parts[0];bpy.ops.object.join();obj=bpy.context.object;obj.name='DispatchRadio'
 # Deduplicate repeated material slots introduced by joining the editable parts.
 old=list(obj.data.materials);assign=[old[p.material_index] for p in obj.data.polygons];obj.data.materials.clear()
 for m in (shell,rubber,screen):obj.data.materials.append(m)
 for p,m in zip(obj.data.polygons,assign):p.material_index=(shell,rubber,screen).index(m)
 tri=obj.modifiers.new('Explicit export triangulation','TRIANGULATE');bpy.ops.object.modifier_apply(modifier=tri.name)
 assert len(obj.data.polygons)<=2000, len(obj.data.polygons)
 bpy.ops.export_scene.gltf(filepath=str(ASSET),export_format='GLB',use_selection=True,export_animations=False,export_yup=True,export_materials='EXPORT',export_image_format='AUTO',export_extras=True)
 data=ASSET.read_bytes();n=struct.unpack_from('<I',data,12)[0];j=json.loads(data[20:20+n]);triangles=sum(j['accessors'][p['indices']]['count']//3 for m in j['meshes'] for p in m['primitives']);draws=sum(len(m['primitives']) for m in j['meshes']);assert triangles<=2000;assert draws<=3;assert len(data)<=1048576
 inv={'asset':'assets/intro/dispatch-radio.glb','sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data),'triangles':triangles,'materialDraws':draws,'materials':[m['name'] for m in j['materials']],'bodyDimensionsMm':[65,145,40],'provenance':'Original locally authored unbranded mesh and textures; no downloads.','textureCount':len(j.get('images',[])),'workingSource':'art/working/prologue-radio-v1.blend','evidenceClass':'Asset inventory; not runtime or performance evidence'};(E/'inventory.json').write_text(json.dumps(inv,indent=2)+'\n');print(json.dumps(inv))

def setup_render():
 bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);bpy.ops.import_scene.gltf(filepath=str(ASSET));scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=64;scene.cycles.use_denoising=False;scene.render.resolution_x=960;scene.render.resolution_y=1100;scene.render.resolution_percentage=100
 scene.world.color=(.13,.13,.13);scene.view_settings.view_transform='AgX';scene.render.image_settings.file_format='PNG';scene.render.film_transparent=False
 floor=material('Evidence only warm studio',(.2,.21,.20),.85);bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.073));bpy.context.object.data.materials.append(floor)
 for name,pos,power,size in [('Key',(-.3,-.3,.48),1.8,.3),('Rim',(.25,.18,.3),1.5,.18),('Fill',(.3,-.12,.14),.6,.25)]:
  bpy.ops.object.light_add(type='AREA',location=pos);o=bpy.context.object;o.name='Evidence '+name;o.data.energy=power;o.data.shape='DISK';o.data.size=size;o.rotation_euler=(Vector((0,0,.04))-o.location).to_track_quat('-Z','Y').to_euler()
 bpy.ops.object.camera_add();cam=bpy.context.object;scene.camera=cam;cam.data.type='ORTHO';cam.data.ortho_scale=.36;cam.data.lens=60
 return scene,cam

def renders():
 scene,cam=setup_render()
 for name,pos in [('front',(.20,-.43,.19)),('thumb-side',(-.25,-.36,.16)),('rear',(.20,.38,.16))]:
  cam.location=pos;cam.rotation_euler=(Vector((0,0,.071))-cam.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=str(E/('radio-studio-'+name+'.png'));bpy.ops.render.render(write_still=True)
def grip_renders():
 record=E/'grip.json'
 if not record.exists():return
 scene,cam=setup_render();radio=bpy.data.objects.get('DispatchRadio');d=json.loads(record.read_text());p=d['radioPosition'];radio.location=(p[0],-p[2],p[1])
 skin=material('Existing Mike hand — CPU pose evidence',(.43,.27,.18),.7);tex=skin.node_tree.nodes.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(str(next(E.glob('grip-source-skin.*'))));skin.node_tree.links.new(tex.outputs['Color'],skin.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
 for src in d['meshes']:
  verts=[(p[0],-p[2],p[1]) for p in src['positions']];indices=src['indices'];faces=[indices[i:i+3] for i in range(0,len(indices),3)];o=mesh('Existing Mike posed hand',verts,faces,skin,True)
  for poly in o.data.polygons:
   for li in poly.loop_indices:
    i=o.data.loops[li].vertex_index;o.data.uv_layers[0].data[li].uv=(src['uv'][2*i],1-src['uv'][2*i+1])
 cam.data.ortho_scale=.38
 for name,pos in [('front',(.21,-.40,.17)),('thumb-side',(-.27,-.30,.16)),('back',(.18,.42,.14))]:
  cam.location=pos;cam.rotation_euler=(Vector((-.019,.07,.045))-cam.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=str(E/('radio-grip-'+name+'.png'));bpy.ops.render.render(write_still=True)
if not args.render_only:model()
if args.render or args.render_only:
 renders();grip_renders()
 (E/'render-manifest.json').write_text(json.dumps({'timestampUtc':datetime.now(timezone.utc).isoformat(),'assetSha256':hashlib.sha256(ASSET.read_bytes()).hexdigest(),'evidenceClass':'Offline Blender Cycles studio and actual CPU-posed Mike hand geometry; not browser screenshots, continuous playtest or measured performance','handMaterial':'Unchanged shipped player-arm base-color texture; glTF V coordinate converted for Blender','renderer':'Blender 4.3.2 Cycles CPU; 64 samples; no denoiser; 960x1100','completedImages':['radio-studio-'+x+'.png' for x in ['front','thumb-side','rear']]+(['radio-grip-'+x+'.png' for x in ['front','thumb-side','back']] if (E/'grip.json').exists() else []),'runtimeAcceptance':'Open; must verify radio raised/lowered, grip, restart, motion, actual lighting and performance separately'},indent=2)+'\n')
