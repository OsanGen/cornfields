"""Offline, CPU-only inspection of actual runtime geometry; not in-game evidence.
Run export-corn-art-study.mjs first, then Blender --background --threads 2 --python.
"""
import bpy, json, math
from pathlib import Path
from mathutils import Vector
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'output/environment-art'
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=48
scene.cycles.use_denoising=False;scene.render.threads_mode='FIXED';scene.render.threads=2
scene.render.resolution_x=1200;scene.render.resolution_y=825;scene.render.resolution_percentage=100
scene.world.color=(.16,.16,.16);scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast';scene.view_settings.exposure=0
bpy.ops.import_scene.gltf(filepath=str(ROOT/'assets/field/cornfield-kit.glb'))
original=bpy.data.objects.get('corn_near_0')
for obj in list(scene.objects):
    if obj!=original:bpy.data.objects.remove(obj,do_unlink=True)
original.name='Original actual shipped corn_near_0';original.location.x=-1.35
payload=json.loads((OUT/'corn-meshes.json').read_text())['meshes'][0]
vertices=[(x,-z,y) for x,y,z in zip(payload['positions'][::3],payload['positions'][1::3],payload['positions'][2::3])]
indices=payload['indices'];faces=[tuple(indices[i:i+3]) for i in range(0,len(indices),3)]
mesh=bpy.data.meshes.new('Refined actual runtime corn_near_0');mesh.from_pydata(vertices,[],faces);mesh.update()
uv=mesh.uv_layers.new()
for loop in mesh.loops:uv.data[loop.index].uv=payload['uv'][loop.vertex_index*2:loop.vertex_index*2+2]
for face in mesh.polygons:face.use_smooth=True
refined=bpy.data.objects.new('Refined actual runtime corn_near_0',mesh);scene.collection.objects.link(refined);refined.location.x=1.35
mat=bpy.data.materials.new('Actual generated corn PBR atlas');mat.use_nodes=True
nodes=mat.node_tree.nodes;links=mat.node_tree.links;bsdf=nodes.get('Principled BSDF');bsdf.inputs['Roughness'].default_value=1
for key in ['map','normalMap','roughnessMap']:
    # DataTexture rows start at v=0, PNG storage starts at its top row.
    image=Image.frombytes('RGBA',(1024,1024),(OUT/(key+'.rgba')).read_bytes()).transpose(Image.Transpose.FLIP_TOP_BOTTOM)
    file=OUT/(key+'.png');image.save(file)
    tex=nodes.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(str(file))
    if key!='map':tex.image.colorspace_settings.name='Non-Color'
    if key=='normalMap':
        nm=nodes.new('ShaderNodeNormalMap');nm.inputs['Strength'].default_value=.72;links.new(tex.outputs['Color'],nm.inputs['Color']);links.new(nm.outputs['Normal'],bsdf.inputs['Normal'])
    else:links.new(tex.outputs['Color'],bsdf.inputs['Base Color' if key=='map' else 'Roughness'])
refined.data.materials.append(mat)
bpy.ops.mesh.primitive_plane_add(size=200);floor=bpy.context.object
floorMat=bpy.data.materials.new('Matched neutral inspection floor');floorMat.diffuse_color=(.15,.17,.18,1);floor.data.materials.append(floorMat)
def area(name,location,power,size,color):
    data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size;data.color=color
    obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj);obj.location=location;obj.rotation_euler=(Vector((0,0,1.5))-obj.location).to_track_quat('-Z','Y').to_euler()
area('Shared broad key',(0,-4,6),900,5,(1,.92,.79));area('Shared cool rim',(0,3,5),1200,4,(.73,.84,1));area('Shared frontal fill',(0,-5,2),150,5,(.91,.95,1))
data=bpy.data.cameras.new('Matched orthographic inspection camera');camera=bpy.data.objects.new('Matched orthographic inspection camera',data);scene.collection.objects.link(camera);camera.location=(0,-8,2.15);camera.rotation_euler=(Vector((0,0,1.65))-camera.location).to_track_quat('-Z','Y').to_euler();data.type='ORTHO';data.ortho_scale=6.5;scene.camera=camera
# The labels are part of the render, so exported pixels cannot be mistaken for gameplay.
def label(body,x,z,size=.12):
    c=bpy.data.curves.new(body,'FONT');c.body=body;c.align_x='CENTER';c.size=size;c.extrude=0
    o=bpy.data.objects.new(body,c);scene.collection.objects.link(o);o.location=(x,-.85,z);o.rotation_euler=(math.pi/2,0,0)
    m=bpy.data.materials.get('Inspection labels') or bpy.data.materials.new('Inspection labels');m.use_nodes=True
    n=m.node_tree.nodes.get('Principled BSDF');n.inputs['Base Color'].default_value=(.68,.74,.78,1);n.inputs['Emission Color'].default_value=(.68,.74,.78,1);n.inputs['Emission Strength'].default_value=.5;c.materials.append(m)
label('ORIGINAL  /  398 TRIANGLES',-1.35,3.68,.13);label('REFINED  /  1,530 TRIANGLES',1.35,3.68,.13)
label('INTERMEDIATE OFFLINE ASSET STUDY  /  SAME CAMERA + LIGHTS  /  NOT AN IN-GAME CAPTURE',0,3.44,.066)
scene.render.filepath=str(OUT/'corn-before-after-offline.png');bpy.ops.render.render(write_still=True)
# Save the exact review setup for inspection/reproduction, outside runtime publication.
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'corn-before-after-offline.blend'))
print('CORN_ART_STUDY_COMPLETE')
