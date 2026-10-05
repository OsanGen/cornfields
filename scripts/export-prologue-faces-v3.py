#!/usr/bin/env python3
"""Approved Faces and radio v1: faces-only Blender sculpt, retopology and bakes.
Run with Blender -- --baseline PATH. No base cast, zombie, rig or clip rewrite.
"""
import argparse, hashlib, json, math, struct, sys
from pathlib import Path
import bpy,bmesh
import numpy as np
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1]
ap=argparse.ArgumentParser();ap.add_argument('--baseline',type=Path,required=True);ap.add_argument('--render',action='store_true');ap.add_argument('--render-only',action='store_true');ap.add_argument('--role',choices=['clarence','stanley']);ap.add_argument('--author-only',action='store_true');ap.add_argument('--reuse-normal',action='store_true');args=ap.parse_args(sys.argv[sys.argv.index('--')+1:])
E=ROOT/'verification/faces-radio-v1/faces';E.mkdir(parents=True,exist_ok=True)
# A 1e-5 source-unit weld joins float-roundoff UV splits (about 0.005 mm
# at runtime scale); 1e-7 falsely left hundreds of seams before subdivision.
# Reuse the existing reviewed binary-preserving writer without running its cast
# or zombie export. This script is intentionally faces-only.
saved=sys.argv;sys.argv=['blender','--','--baseline',str(args.baseline),'--evidence',str(E),'--render-only']
H={'__file__':str(ROOT/'scripts/export-cinematic-characters.py')};exec((ROOT/'scripts/export-cinematic-characters.py').read_text().split('if not args.render_only:')[0],H);sys.argv=saved
GLB=H['GLB'];jpg=H['jpg'];smooth=H['smooth'];gauss=H['gauss'];sha=H['sha'];reset=H['reset'];semantic=H['semantic_map']
def attr(g,values,kind,ctype=5126):
 a=np.array(values,dtype={5126:'<f4',5123:'<u2',5125:'<u4'}[ctype]);i=len(g.j['accessors']);d={'bufferView':g.blob(a.tobytes()),'componentType':ctype,'count':len(a),'type':kind}
 if kind=='VEC3':d.update(min=a.min(0).tolist(),max=a.max(0).tolist())
 g.j['accessors'].append(d);return i
def addtex(g,data,name):
 i=len(g.j['images']);g.j['images'].append({});g.image(i,data,name);t=len(g.j['textures']);g.j['textures'].append({'source':i,'sampler':0});return t

def sculpt(p,role):
 q=p.copy();x,y,z=p.T;a=abs(x);front=smooth(.055,.15,z);above=smooth(2.87,2.96,y)
 if role=='clarence':
  q[:,0]*=1+above*(.035*gauss(y,3.12,.13)-.075*gauss(y,2.96,.10));nose=gauss(y,3.082,.060)*gauss(x,0,.041)*front;q[:,0]*=1+.36*nose;q[:,2]-=.037*nose
  q[:,2]-=.012*gauss(a,.09,.04)*gauss(y,3.048,.052)*front;q[:,2]+=.010*gauss(x,0,.049)*gauss(y,2.984,.029)*front;q[:,2]+=.008*gauss(a,.053,.047)*gauss(y,3.170,.018)*front
 else:
  q[:,0]*=1+above*(.035*gauss(y,3.005,.11));q[:,2]-=.035*gauss(x,0,.055)*gauss(y,3.070,.058)*front;q[:,2]-=.012*gauss(a,.105,.034)*gauss(y,3.036,.065)*front;q[:,2]+=.010*gauss(a,.078,.045)*gauss(y,3.175,.022)*front;q[:,2]-=.004*gauss(a,.060,.041)*gauss(y,3.099,.013)*front;q[:,1]-=.005*gauss(a,.100,.034)*gauss(y,3.035,.059)*front
 q[:,2]+=(.009 if role=='clarence' else .004)*gauss(x,0,.052)*gauss(y,2.997,.008)*front;q[:,2]+=(.009 if role=='clarence' else .004)*gauss(x,0,.047)*gauss(y,2.975,.010)*front;q[:,2]-=.004*gauss(x,0,.009)*gauss(y,3.017,.014)*front;q[:,2]-=.004*gauss(x,0,.049)*gauss(y,2.951,.007)*front;q[:,2]+=.0018*np.sin(x*27+.3)*gauss(y,3.05,.12)*front
 return p+(q-p)*above[:,None]
def retopo(g,mi,role):
 prim=g.j['meshes'][mi]['primitives'][0];a=prim['attributes'];pos=g.array(a['POSITION']);faces=g.array(prim['indices']).reshape(-1,3);me=bpy.data.meshes.new(f'{role} retopology {mi}');me.from_pydata(pos,[],faces);me.update();ob=bpy.data.objects.new(me.name,me);bpy.context.collection.objects.link(ob);uv=me.uv_layers.new(name='UVMap');old=g.array(a['TEXCOORD_0'])
 for loop in me.loops:uv.data[loop.index].uv=(old[loop.vertex_index][0],1-old[loop.vertex_index][1])
 ids=g.array(a['JOINTS_0']);weights=g.array(a['WEIGHTS_0'])
 for k in range(56):ob.vertex_groups.new(name=str(k))
 for vi in range(len(pos)):
  for k,w in zip(ids[vi],weights[vi]):
   if w>0:ob.vertex_groups[int(k)].add([vi],float(w),'REPLACE')
 bpy.ops.object.select_all(action='DESELECT');ob.select_set(True);bpy.context.view_layer.objects.active=ob
 bm=bmesh.new();bm.from_mesh(me);bmesh.ops.remove_doubles(bm,verts=bm.verts,dist=1e-5);bmesh.ops.join_triangles(bm,faces=list(bm.faces),angle_face_threshold=.9,angle_shape_threshold=.9,cmp_uvs=True);crease=bm.edges.layers.float.get('crease_edge') or bm.edges.layers.float.new('crease_edge')
 for edge in bm.edges:
  if edge.is_boundary:edge[crease]=1.0
 bm.to_mesh(me);bm.free()
 sub=ob.modifiers.new('Smooth facial animation loops','SUBSURF');sub.levels=2 if mi==6 else 1;bpy.ops.object.modifier_apply(modifier=sub.name)
 if mi==6:
  bm=bmesh.new();bm.from_mesh(ob.data);boundary={v.index for e in bm.edges if e.is_boundary for v in e.verts};bm.free()
  protected=ob.vertex_groups.new(name='Temporary retopology interior');protected.add([v.index for v in ob.data.vertices if v.index not in boundary],1.0,'REPLACE')
  dec=ob.modifiers.new('Budgeted head retopology','DECIMATE');dec.ratio=.65;dec.use_collapse_triangulate=True;dec.vertex_group=protected.name;dec.vertex_group_factor=1.0;bpy.ops.object.modifier_apply(modifier=dec.name)
  temporary=ob.vertex_groups.get('Temporary retopology interior')
  if temporary:ob.vertex_groups.remove(temporary)
 points=np.array([v.co[:] for v in ob.data.vertices]);new=sculpt(points,role)
 if mi==6:
  crown=float(pos[:,1].max());delta=crown-float(new[:,1].max());new[:,1]+=delta*smooth(3.26,3.35,new[:,1])
  # Keep every protected source neck point on the ONE retopologized surface.
  # Appending old triangles caused visible coplanar chin/neck patches.
  for source_index in np.flatnonzero(pos[:,1]<=2.86):
   original=pos[source_index];nearest=int(np.argmin(np.linalg.norm(new-original,axis=1)));assert np.linalg.norm(new[nearest]-original)<.035;new[nearest]=original
   for group in list(ob.data.vertices[nearest].groups):ob.vertex_groups[group.group].remove([nearest])
   for joint,weight in zip(ids[source_index],weights[source_index]):
    if weight>0:ob.vertex_groups[int(joint)].add([nearest],float(weight),'REPLACE')
 for v,q in zip(ob.data.vertices,new):v.co=q
 ob.data.update()
 # Independent non-overlapping atlas: head left, mouth lower right, ears upper right.
 # The inherited overlapping atlas is unsuitable after facial retopology.
 uv=ob.data.uv_layers.active;source_uv=ob.data.uv_layers.new(name='CC0 source albedo correspondence')
 for loop in ob.data.loops:source_uv.data[loop.index].uv=uv.data[loop.index].uv.copy()
 ob.data.uv_layers.active=uv
 points=np.array([v.co[:] for v in ob.data.vertices]);lower=points.min(0);span=np.maximum(points.max(0)-lower,1e-6)
 for poly in ob.data.polygons:
  coords=[]
  for li in poly.loop_indices:
   x,y,z=ob.data.vertices[ob.data.loops[li].vertex_index].co
   if mi==6:coords.append([.03+.70*(math.atan2(x,z-.025)/(2*math.pi)+.5),.02+.96*(y-2.6726808548)/(.7037999630)])
   elif mi==1:coords.append([.81+.17*(x-lower[0])/span[0],.02+.41*(y-lower[1])/span[1]])
   else:coords.append([(.805 if mi==2 else .905)+.075*(z-lower[2])/span[2],.51+.46*(y-lower[1])/span[1]])
  if mi==6 and max(t[0] for t in coords)-min(t[0] for t in coords)>.35:
   for t in coords:
    if t[0]<.38:t[0]+=.70
  for li,t in zip(poly.loop_indices,coords):uv.data[li].uv=t
 for poly in ob.data.polygons:poly.use_smooth=True
 ob['authoring']='Independent sculpted planes and subdivided facial loops; no external scan';return ob

# Independently verified orientation-preserving local diagonal repairs.
# The coordinate guard stops export if future topology invalidates the patch.
TOPOLOGY_REPAIR = {'clarence': [(510, [1530, 1531, 5775], [[0.10511521995067596, 2.8204543590545654, -0.01734881103038788], [0.10338424891233444, 2.846235513687134, -0.012081253342330456], [0.10452844202518463, 2.8476996421813965, -0.0034999691415578127]]), (961, [2885, 308, 2949], [[0.04453020542860031, 2.9533846378326416, 0.254921019077301], [0.0443573035299778, 2.9528512954711914, 0.255529522895813], [0.04924343526363373, 2.952658176422119, 0.24944360554218292]]), (986, [2885, 2949, 2888], [[0.04453020542860031, 2.9533846378326416, 0.254921019077301], [0.04924343526363373, 2.952658176422119, 0.24944360554218292], [0.04470960050821304, 2.9566266536712646, 0.25583478808403015]]), (1927, [1530, 5783, 1532], [[0.10511521995067596, 2.8204543590545654, -0.01734881103038788], [0.10523179173469543, 2.8047266006469727, -0.015935253351926804], [0.10342429578304291, 2.8095390796661377, -0.030896786600351334]]), (3129, [9395, 9386, 713], [[-0.044694747775793076, 2.9533846378326416, 0.25317782163619995], [-0.04415887966752052, 2.9568493366241455, 0.25497689843177795], [-0.049074433743953705, 2.952820062637329, 0.24805688858032227]]), (3158, [9395, 713, 712], [[-0.044694747775793076, 2.9533846378326416, 0.25317782163619995], [-0.049074433743953705, 2.952820062637329, 0.24805688858032227], [-0.04452187940478325, 2.9528512954711914, 0.25380638241767883]]), (5519, [2885, 2888, 2884], [[0.04453020542860031, 2.9533846378326416, 0.254921019077301], [0.04470960050821304, 2.9566266536712646, 0.25583478808403015], [0.043473463505506516, 2.955076217651367, 0.25689274072647095]]), (6466, [1530, 5775, 5783], [[0.10511521995067596, 2.8204543590545654, -0.01734881103038788], [0.10452844202518463, 2.8476996421813965, -0.0034999691415578127], [0.10523179173469543, 2.8047266006469727, -0.015935253351926804]]), (7664, [9395, 9387, 9386], [[-0.044694747775793076, 2.9533846378326416, 0.25317782163619995], [-0.0438854843378067, 2.954941987991333, 0.2547367513179779], [-0.04415887966752052, 2.9568493366241455, 0.25497689843177795]])], 'stanley': [(984, [2963, 2952, 2953], [[0.07824388891458511, 2.9632222652435303, 0.2652871310710907], [0.08524982631206512, 2.965092182159424, 0.25964006781578064], [0.07689449191093445, 2.9648728370666504, 0.2664256989955902]]), (987, [2963, 317, 2952], [[0.07824388891458511, 2.9632222652435303, 0.2652871310710907], [0.07787788659334183, 2.962818145751953, 0.2660214304924011], [0.08524982631206512, 2.965092182159424, 0.25964006781578064]]), (3199, [9602, 9598, 7034], [[-0.07853107899427414, 2.963214159011841, 0.26341938972473145], [-0.08502908051013947, 2.965341806411743, 0.2583138942718506], [-0.07816502451896667, 2.9628100395202637, 0.2641543447971344]]), (4060, [2588, 12109, 2533], [[-0.10807196795940399, 2.8018016815185547, 0.01938500814139843], [-0.10373742133378983, 2.7743871212005615, 0.016299471259117126], [-0.10661916434764862, 2.8247811794281006, 0.029149940237402916]]), (4295, [2255, 12826, 12859], [[0.10785895586013794, 2.8018016815185547, 0.01938500814139843], [0.10354086756706238, 2.773820400238037, 0.016353927552700043], [0.1051594465970993, 2.776254892349243, 0.004420251585543156]]), (7736, [9602, 9597, 9598], [[-0.07853107899427414, 2.963214159011841, 0.26341938972473145], [-0.07730448991060257, 2.964420795440674, 0.26439711451530457], [-0.08502908051013947, 2.965341806411743, 0.2583138942718506]]), (8569, [2588, 12168, 12109], [[-0.10807196795940399, 2.8018016815185547, 0.01938500814139843], [-0.10531390458345413, 2.7767982482910156, 0.004670877940952778], [-0.10373742133378983, 2.7743871212005615, 0.016299471259117126]]), (8801, [2255, 2285, 12826], [[0.10785895586013794, 2.8018016815185547, 0.01938500814139843], [0.10635653138160706, 2.8241844177246094, 0.028954854235053062], [0.10354086756706238, 2.773820400238037, 0.016353927552700043]])]}

def exportmesh(g,mi,ob,role):
 me=ob.data;me.calc_loop_triangles();pos=[];nor=[];uv=[];ids=[];weights=[];ix=[]
 for tri in me.loop_triangles:
  for li in tri.loops:
   loop=me.loops[li];v=me.vertices[loop.vertex_index];pos.append(v.co[:]);nor.append(v.normal[:]);t=me.uv_layers.active.data[li].uv;uv.append([t.x,1-t.y]);rank=sorted([(x.group,x.weight) for x in v.groups],key=lambda x:-x[1])[:4];total=sum(w for _,w in rank) or 1;ids.append([k for k,_ in rank]+[0]*(4-len(rank)));weights.append([w/total for _,w in rank]+[0]*(4-len(rank)));ix.append(len(ix))
 if mi==6:
  for triangle,indices,expected in TOPOLOGY_REPAIR[role]:
   assert np.max(np.abs(np.array(pos)[indices]-expected))<1e-6,'Re-review topology repair after any geometry change'
   ix[triangle*3:triangle*3+3]=indices
 prim=g.j['meshes'][mi]['primitives'][0];prim['attributes']={'POSITION':attr(g,pos,'VEC3'),'NORMAL':attr(g,nor,'VEC3'),'TEXCOORD_0':attr(g,uv,'VEC2'),'JOINTS_0':attr(g,ids,'VEC4',5123),'WEIGHTS_0':attr(g,weights,'VEC4')};prim['indices']=attr(g,np.array(ix).reshape(-1,1),'SCALAR',5123);return len(ix)//3

def bake_normal(objects,role):
 # One atlas bake avoids retaining several Cycles sessions in this bounded
 # cloud process. Copies keep the runtime retopology and weights untouched.
 bpy.ops.object.select_all(action='DESELECT');copies=[]
 for source in objects:
  ob=source.copy();ob.data=source.data.copy();bpy.context.collection.objects.link(ob);ob.select_set(True);copies.append(ob)
 bpy.context.view_layer.objects.active=copies[0];bpy.ops.object.join();low=bpy.context.object;low.name=role+' combined bake retopology'
 image=bpy.data.images.new(role+' tangent sculpt bake 1024',width=1024,height=1024,alpha=False);image.colorspace_settings.name='Non-Color';image.generated_color=(.5,.5,1,1)
 mat=bpy.data.materials.new(role+' bake target');mat.use_nodes=True;node=mat.node_tree.nodes.new('ShaderNodeTexImage');node.image=image;mat.node_tree.nodes.active=node;low.data.materials.clear();low.data.materials.append(mat)
 high=low.copy();high.data=low.data.copy();high.name=role+' high-detail sculpt';bpy.context.collection.objects.link(high);sub=high.modifiers.new('Dense sculpt surface','SUBSURF');sub.levels=1;sub.render_levels=1
 tex=bpy.data.textures.new(role+' pore relief','CLOUDS');tex.noise_scale=.0025;tex.noise_depth=2;disp=high.modifiers.new('Restrained original skin microrelief','DISPLACE');disp.texture=tex;disp.strength=.00055;disp.mid_level=.5
 # Local CPU selected-to-active normal bake. Cycles atlas baking was killed by
 # the cloud runtime; Blender's built-in BVH traces the same high-detail sculpt
 # onto this low-poly UV atlas without a new package or runtime shader.
 from mathutils.bvhtree import BVHTree
 deps=bpy.context.evaluated_depsgraph_get();hi=high.evaluated_get(deps).to_mesh();hi.calc_loop_triangles();hpos=[v.co.copy() for v in hi.vertices];htris=[tuple(t.vertices) for t in hi.loop_triangles];hnorm=[v.normal.copy() for v in hi.vertices];tree=BVHTree.FromPolygons(hpos,htris,all_triangles=True)
 low.data.calc_loop_triangles();normal=np.zeros((1024,1024,3),np.float32);normal[:]=[.5,.5,1];written=np.zeros((1024,1024),bool);hits=0;miss=0
 for tri in low.data.loop_triangles:
  p=np.array([low.data.vertices[i].co[:] for i in tri.vertices]);nn=np.array([low.data.vertices[i].normal[:] for i in tri.vertices]);uv=np.array([low.data.uv_layers.active.data[i].uv[:] for i in tri.loops]);t=uv*1024;lo=np.maximum(np.floor(t.min(0)).astype(int),0);up=np.minimum(np.ceil(t.max(0)).astype(int),[1023,1023])
  if np.any(up<lo):continue
  xx,yy=np.meshgrid(np.arange(lo[0],up[0]+1)+.5,np.arange(lo[1],up[1]+1)+.5);a,b,c=t;den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1])
  if abs(den)<1e-8:continue
  v=((b[1]-c[1])*(xx-c[0])+(c[0]-b[0])*(yy-c[1]))/den;u=((c[1]-a[1])*(xx-c[0])+(a[0]-c[0])*(yy-c[1]))/den;r=1-v-u;rows,cols=np.nonzero((v>=0)&(u>=0)&(r>=0));d1=p[1]-p[0];d2=p[2]-p[0];du1=uv[1]-uv[0];du2=uv[2]-uv[0];det=du1[0]*du2[1]-du1[1]*du2[0]
  if abs(det)<1e-12:continue
  tangent=(d1*du2[1]-d2*du1[1])/det;bitangent=(-d1*du2[0]+d2*du1[0])/det
  for row,col in zip(rows,cols):
   bar=np.array([v[row,col],u[row,col],r[row,col]]);pt=bar@p;n=bar@nn;n/=max(np.linalg.norm(n),1e-12);tangent1=tangent-n*np.dot(tangent,n);tangent1/=max(np.linalg.norm(tangent1),1e-12);bit=np.cross(n,tangent1)*(1 if np.dot(np.cross(n,tangent1),bitangent)>=0 else -1)
   location,_,index,_=tree.ray_cast(Vector(pt+n*.015),Vector(-n),.035)
   if index is None:miss+=1;continue
   ia,ib,ic=htris[index];aa=np.array(hpos[ia]);bb=np.array(hpos[ib]);cc=np.array(hpos[ic]);vv=np.array(location)-aa;ab=bb-aa;ac=cc-aa;d00=ab@ab;d01=ab@ac;d11=ac@ac;d20=vv@ab;d21=vv@ac;dd=d00*d11-d01*d01
   if abs(dd)<1e-20:continue
   bv=(d11*d20-d01*d21)/dd;bw=(d00*d21-d01*d20)/dd;bn=(1-bv-bw)*np.array(hnorm[ia])+bv*np.array(hnorm[ib])+bw*np.array(hnorm[ic]);bn/=max(np.linalg.norm(bn),1e-12);rgb=np.array([bn@tangent1,bn@bit,bn@n])*.5+.5;yyi=lo[1]+row;xxi=lo[0]+col;normal[yyi,xxi]=rgb;written[yyi,xxi]=True;hits+=1
 for _ in range(8):
  old=written.copy()
  for dy,dx in [(0,1),(0,-1),(1,0),(-1,0)]:
   ok=np.roll(old,(dy,dx),(0,1))&~written;normal[ok]=np.roll(normal,(dy,dx),(0,1))[ok];written|=ok
 high.evaluated_get(deps).to_mesh_clear();high.hide_render=True;high.hide_set(True);low.hide_render=True;low.hide_set(True)
 (E/f'{role}-bake-report.json').write_text(json.dumps({'method':'Blender BVH CPU selected-to-active tangent normal bake','resolution':[1024,1024],'hitSamples':hits,'missSamples':miss,'highTriangles':len(htris),'marginPixels':8},indent=2));print('NORMAL_BAKED',role,hits,miss,flush=True)
 return jpg(normal[::-1],E/f'{role}-skin-normal-1024.jpg'),[high]

def albedo_detail(objects,source):
 # Transfer existing licensed microdetail through the old UV correspondence.
 # Color, identity, hairline, stubble and macro shading remain locally authored.
 h=w=1024;out=np.ones((h,w),np.float32);lum=source[:,:,:3]@np.array([.2126,.7152,.0722]);blur=sum(np.roll(lum,(dy,dx),(0,1)) for dy,dx in [(0,4),(0,-4),(4,0),(-4,0),(3,3),(-3,-3)])/6;detail=np.clip((lum-blur)*2.5+.32*(lum-.48),-.28,.24)
 for ob in objects:
  me=ob.data;me.calc_loop_triangles();target=me.uv_layers['UVMap'];original=me.uv_layers['CC0 source albedo correspondence']
  for tri in me.loop_triangles:
   uv=np.array([target.data[i].uv[:] for i in tri.loops]);uv[:,1]=1-uv[:,1];t=uv*[w,h];old=np.array([original.data[i].uv[:] for i in tri.loops]);old[:,1]=1-old[:,1];lo=np.maximum(np.floor(t.min(0)).astype(int),0);hi=np.minimum(np.ceil(t.max(0)).astype(int),[w-1,h-1])
   if np.any(hi<lo):continue
   xx,yy=np.meshgrid(np.arange(lo[0],hi[0]+1)+.5,np.arange(lo[1],hi[1]+1)+.5);a,b,c=t;den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1])
   if abs(den)<1e-8:continue
   v=((b[1]-c[1])*(xx-c[0])+(c[0]-b[0])*(yy-c[1]))/den;u=((c[1]-a[1])*(xx-c[0])+(a[0]-c[0])*(yy-c[1]))/den;r=1-v-u;inside=(v>=-.01)&(u>=-.01)&(r>=-.01);sample=v[:,:,None]*old[0]+u[:,:,None]*old[1]+r[:,:,None]*old[2];sx=np.clip((sample[:,:,0]*source.shape[1]).astype(int),0,source.shape[1]-1);sy=np.clip((sample[:,:,1]*source.shape[0]).astype(int),0,source.shape[0]-1);region=np.s_[lo[1]:hi[1]+1,lo[0]:hi[0]+1];out[region][inside]=1+detail[sy,sx][inside]
 return out

def textures(g,role,objects):
 transferred=albedo_detail(objects,g.pixels(1))
 xyz,valid=semantic(g,[6,1,2,3],1024,1024);x,y,z=xyz.transpose(2,0,1);front=smooth(.04,.17,z);a=abs(x);rng=np.random.default_rng(381 if role=='clarence' else 963);fine=rng.normal(0,1,x.shape);grain=np.sin(x*290+y*147+np.sin(z*53))*np.sin(y*211-x*86)*.008+fine*.005
 base=np.array([.35,.205,.135] if role=='clarence' else [.67,.51,.435]);rgb=np.broadcast_to(base,(*x.shape,3)).copy()+grain[:,:,None];cheek=gauss(a,.092,.044)*gauss(y,3.07,.08)*front;rgb+=cheek[:,:,None]*[.024,-.007,-.009]
 socket=gauss(a,.06,.044)*gauss(y,3.128,.023)*front;rgb*=1-.10*socket[:,:,None];lower=gauss(y,3.098,.01)*gauss(a,.064,.04)*front;rgb*=1-(.07 if role=='clarence' else .15)*lower[:,:,None]
 lip=np.clip(gauss(x,0,.052)*(gauss(y,2.996,.009)+gauss(y,2.976,.010))*front,0,1);color=np.array([.265,.13,.12] if role=='clarence' else [.47,.30,.27]);rgb=rgb*(1-lip[:,:,None]*.8)+color*lip[:,:,None]*.8
 mouth=gauss(y,2.986,.0025)*gauss(x,0,.05)*front;rgb*=1-.43*mouth[:,:,None];nostril=gauss(a,.023 if role=='clarence' else .026,.009)*gauss(y,3.036,.005)*front;rgb*=1-.46*nostril[:,:,None]
 line=3.276+.014*np.cos(x*16) if role=='clarence' else 3.329-.058*smooth(.075,.137,a);hair=smooth(line-.006,line+.006,y);hair=np.maximum(hair,(1-smooth(-.045,.06,z))*smooth(3.12,3.18,y));haircolor=np.array([.025,.021,.018] if role=='clarence' else [.44,.43,.41]);fib=.80+.20*np.sin(x*1600+np.sin(y*351))*np.cos(y*1400+z*503);rgb=rgb*(1-hair[:,:,None])+haircolor*fib[:,:,None]*hair[:,:,None]
 browline=3.177-.032*smooth(.02,.11,a)+(.005 if role=='stanley' else 0);brows=gauss(y,browline,.006)*gauss(a,.059,.043)*front;rgb=rgb*(1-brows[:,:,None]*.86)+haircolor*brows[:,:,None]*.86
 beard=(1-smooth(3.015,3.07,y))*smooth(2.87,2.94,y)*front*gauss(x,0,.14);stubble=np.clip((fine+.2)*.22,0,.6)*beard*(.34 if role=='clarence' else .88);rgb=rgb*(1-stubble[:,:,None])+haircolor*stubble[:,:,None]
 for cy in [3.214,3.235,3.255]:
  crease=gauss(y,cy+.003*np.cos(x*34),.0017)*gauss(x,0,.1)*front*(.45 if role=='clarence' else 1);rgb*=1-.11*crease[:,:,None]
 fold=gauss(a,.039+.32*(3.06-y),.0025)*gauss(y,3.036,.041)*front;rgb*=1-(.055 if role=='clarence' else .13)*fold[:,:,None]
 rgb*=1+(transferred[:,:,None]-1)*(.18*front*(1-smooth(3.24,3.275,y))*(1-hair))[:,:,None]
 rough=np.clip(.56+.075*np.sin(x*41+y*27)+fine*.018-.07*gauss(x,0,.045)*gauss(y,3.11,.07)*front+.23*hair+.08*beard,.38,.89);g.image(1,jpg(rgb,E/f'{role}-skin-color-1024.jpg'),f'{role} locally authored skin color 1024 sRGB');st=addtex(g,jpg(np.stack([np.ones_like(rough),rough,np.zeros_like(rough)],2),E/f'{role}-skin-surface-1024.jpg'),role+' packed AO roughness metal 1024 linear')
 arm=g.pixels(5);rgb=arm[:,:,:3];lum=rgb.mean(2);skin=(rgb[:,:,0]>rgb[:,:,2]*1.06)&(lum>.20)&(lum<.90);rgb[skin]=np.clip(rgb[skin]*base/np.array([.65,.50,.38]),0,1);g.image(5,jpg(rgb,E/f'{role}-matching-hands-512.jpg'),role+' matched hand skin')
 return st

def eyes(g,role):
 h=w=512;v,u=np.mgrid[:h,:w];x=(u-w/2)/(w*.5);y=(v-h/2)/(h*.5);r=np.sqrt(x*x+y*y);a=np.arctan2(y,x);rgb=np.zeros((h,w,3));rgb[:]=[.69,.665,.625];iris=np.array([.19,.085,.028] if role=='clarence' else [.21,.285,.30]);fib=.91+.16*np.sin(a*119+r*83)+.08*np.sin(a*193-r*91);m=r<.48;rgb[m]=iris*fib[m,None];rgb[(r>.445)&(r<.50)]*=.45;rgb[r<.175]=[.012,.010,.010];g.image(2,jpg(rgb,E/f'{role}-iris-512.jpg'),role+' natural iris without painted catchlight 512')
 for mi in [4,5]:
  prim=g.j['meshes'][mi]['primitives'][0];src=g.array(prim['attributes']['POSITION']);c=(src.min(0)+src.max(0))*.5;rad=(src.max(0)-src.min(0))*.5*[1.06,1.04,1.17];c[2]-=.001;pos=[];uv=[];norm=[];ix=[];ids=[];weight=[]
  for iy in range(13):
   lat=-math.pi/2+iy*math.pi/12
   for i in range(25):
    t=i*2*math.pi/24;q=np.array([math.cos(lat)*math.sin(t),math.sin(lat),math.cos(lat)*math.cos(t)]);pos.append(c+q*rad);n=q/rad;norm.append(n/np.linalg.norm(n));uv.append([.5+q[0]*.5,.5-q[1]*.5]);ids.append([40 if mi==4 else 39,0,0,0]);weight.append([1,0,0,0])
  for iy in range(12):
   for i in range(24):
    a=iy*25+i;b=a+25
    if iy>0:ix.extend([a,a+1,b])
    if iy<11:ix.extend([a+1,b+1,b])
  prim['attributes']={'POSITION':attr(g,pos,'VEC3'),'NORMAL':attr(g,norm,'VEC3'),'TEXCOORD_0':attr(g,uv,'VEC2'),'JOINTS_0':attr(g,ids,'VEC4',5123),'WEIGHTS_0':attr(g,weight,'VEC4')};prim['indices']=attr(g,np.array(ix).reshape(-1,1),'SCALAR',5123);g.j['materials'][mi]['pbrMetallicRoughness']['roughnessFactor']=.20

def build(role):
 path=args.baseline/f'assets/intro/cast-{role}.glb';g=GLB(path,sha(path.read_bytes()));reset();objects=[];topology={}
 for mi in [1,2,3,6]:
  ob=retopo(g,mi,role);objects.append(ob);topology[str(mi)]=exportmesh(g,mi,ob,role)
 if args.reuse_normal:
  current_path=ROOT/f'assets/intro/cast-{role}.glb';current=GLB(current_path,sha(current_path.read_bytes()))
  for mesh_index in [1,2,3,6]:
   newp=g.j['meshes'][mesh_index]['primitives'][0];oldp=current.j['meshes'][mesh_index]['primitives'][0]
   for name in ['POSITION','NORMAL','TEXCOORD_0']:
    assert np.array_equal(g.array(newp['attributes'][name]),current.array(oldp['attributes'][name])),'Normal reuse requires identical face geometry, normals and UVs'
   assert np.array_equal(g.array(newp['indices']),current.array(oldp['indices'])),'Normal reuse requires identical repaired topology'
  texture=current.j['materials'][6]['normalTexture']['index'];image=current.j['textures'][texture]['source'];view=current.j['bufferViews'][current.j['images'][image]['bufferView']];start=view.get('byteOffset',0);normal=bytes(current.b[start:start+view['byteLength']]);highs=[]
 else:normal,highs=bake_normal(objects,role)
 nt=addtex(g,normal,role+' Blender sculpt tangent normal 1024 linear');eyes(g,role);st=textures(g,role,objects)
 for mi in [1,2,3,6]:
  mat=g.j['materials'][mi];mat['normalTexture']={'index':nt,'scale':.35};mat['pbrMetallicRoughness'].update(metallicRoughnessTexture={'index':st},roughnessFactor=1,metallicFactor=0);mat.setdefault('extras',{})['colorSpaceContract']='color sRGB; normal and surface linear'
 skin=[.35,.205,.135] if role=='clarence' else [.67,.51,.435];g.j['asset']['extras'].update(revision='faces-radio-v1',baselineRoleSha256=g.source,lidSkinColorLinear=[c/12.92 if c<=.04045 else ((c+.055)/1.055)**2.4 for c in skin],skinTone='medium-dark brown' if role=='clarence' else 'older fair warm',textureContract={'skinColor':[1024,1024],'skinNormal':[1024,1024],'skinSurface':[1024,1024]},normalBake='Blender BVH CPU selected-to-active high-detail sculpt',retopology='subdivided source facial loops, independent anatomical sculpt and budgeted head retopology')
 result=g.save(ROOT/f'assets/intro/cast-{role}.glb');result.update(topology=topology,joints=56,runtimeLidTriangles=384,totalWithLids=result['triangles']+384,sourceSha256=g.source);assert result['bytes']<=3*1048576,result;assert result['totalWithLids']<=18000,result
 # Keep editable sculpt/retopology components in evidence until combined into
 # the sole approved authoring deliverable.
 if not args.reuse_normal:
  bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(E/f'{role}-sculpt-checkpoint.blend'))
 return result

def authoring():
 reset();bpy.data.orphans_purge(do_recursive=True)
 for role in ['clarence','stanley']:
  coll=H['import_role'](role);coll.name=role.title()+' final skinned retopology';coll['revision']='faces-radio-v1'
  sculpt_collection=bpy.data.collections.new(role.title()+' editable high-detail sculpt');bpy.context.scene.collection.children.link(sculpt_collection)
  mapping=bpy.data.objects.new(role+' source-space detail coordinates',None);sculpt_collection.objects.link(mapping);mapping.rotation_euler.x=math.pi/2;mapping.hide_render=True;mapping.hide_set(True)
  for source in list(coll.objects):
   if source.type!='MESH' or not any(label in source.name for label in ['headHDmale','cheek','ear']):continue
   high=source.copy();high.data=source.data.copy();high.name=role+' high-detail '+source.name;sculpt_collection.objects.link(high);world=source.matrix_world.copy();high.parent=None;high.matrix_world=world
   for modifier in list(high.modifiers):high.modifiers.remove(modifier)
   sub=high.modifiers.new('Editable dense sculpt surface','SUBSURF');sub.levels=1;sub.render_levels=1
   tex=bpy.data.textures.new(high.name+' original skin microrelief','CLOUDS');tex.noise_scale=.0025;tex.noise_depth=2
   disp=high.modifiers.new('Original local microdetail recipe','DISPLACE');disp.texture=tex;disp.strength=.00055;disp.mid_level=.5;disp.texture_coords='OBJECT';disp.texture_coords_object=mapping
   high.hide_render=True;high.hide_set(True);high['authoring']='Editable high-detail recipe over final continuous retopology. Exact bake checkpoints are retained with the evidence.'
 bpy.context.scene['approval']='Faces and radio v1; local candidate only';bpy.context.scene['authoringGuide']='Imported skinned role collections are authoritative final editable retopology. Hidden high-detail sculpt collections preserve the local detail recipe in source coordinates. Solo a role when editing.';bpy.context.scene['evidenceLimit']='Offline asset inspection; runtime screenshots, playtest and performance remain independent';bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'art/working/prologue-faces-v3.blend'))
if args.author_only:authoring()
elif not args.render_only:
 reportpath=E/'asset-report.json';report=json.loads(reportpath.read_text()) if reportpath.exists() else {'timestampUTC':'2026-10-04','assets':{}}
 for role in ([args.role] if args.role else ['clarence','stanley']):
  reset();bpy.data.orphans_purge(do_recursive=True)
  report['assets'][role]=build(role);reportpath.write_text(json.dumps(report,indent=2));print(json.dumps(report['assets'][role]),flush=True)
 if not args.role:authoring()
if args.render or args.render_only:
 for role in ([args.role] if args.role else ['clarence','stanley']):H['render_role'](role)
