"""Convert Pixelhouse's CC-BY 3.0 zombie to a small, textured game GLB in Blender."""
import bpy
import numpy as np
import json
import hashlib
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
SRC=ROOT/'art/reference/zombie-source'
OUT=ROOT/'assets/field'
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.wm.fbx_import(filepath=str(SRC/'walk.FBX'))
for obj in list(bpy.context.scene.objects):
    if obj.type not in {'MESH','ARMATURE'}:
        bpy.data.objects.remove(obj,do_unlink=True)
scene=bpy.context.scene
scene.frame_start=1
scene.frame_end=44
scene.frame_set(1)
scene.render.fps=30
scene.view_settings.view_transform='Standard'
scene.view_settings.look='None'
scene.render.image_settings.file_format='JPEG'
scene.render.image_settings.color_mode='RGB'
scene.render.image_settings.quality=88

color=bpy.data.images.load(str(SRC/'difusse.jpg'))
color.scale(2048,2048)
pixels=np.empty(2048*2048*4,dtype=np.float32)
color.pixels.foreach_get(pixels)
pixels=pixels.reshape(2048,2048,4)
rgb=pixels[:,:,:3]
grey=rgb@np.array([.2126,.7152,.0722],dtype=np.float32)
pixels[:,:,:3]=np.clip((rgb*.72+grey[:,:,None]*.28)*np.array([.92,.96,.88]),0,1)
color.pixels.foreach_set(pixels.ravel())
color.filepath_raw=str(OUT/'zombie-color.jpg')
color.file_format='JPEG'
color.save()
normal=bpy.data.images.load(str(SRC/'normal.JPG'))
normal.colorspace_settings.name='Non-Color'
normal.scale(1024,1024)
normal.filepath_raw=str(OUT/'zombie-normal.jpg')
normal.file_format='JPEG'
normal.save()
mat=bpy.data.materials.new('Weathered undead skin and torn clothing')
mat.use_nodes=True
nodes,links=mat.node_tree.nodes,mat.node_tree.links
bsdf=nodes.get('Principled BSDF')
bsdf.inputs['Roughness'].default_value=.88
bsdf.inputs['Metallic'].default_value=0
tex=nodes.new('ShaderNodeTexImage');tex.image=color
links.new(tex.outputs['Color'],bsdf.inputs['Base Color'])
tex=nodes.new('ShaderNodeTexImage');tex.image=normal
n=nodes.new('ShaderNodeNormalMap');n.inputs['Strength'].default_value=.85
links.new(tex.outputs['Color'],n.inputs['Color'])
links.new(n.outputs['Normal'],bsdf.inputs['Normal'])
triangles=0
for obj in scene.objects:
    if obj.type=='MESH':
        obj.data.materials.clear();obj.data.materials.append(mat)
        obj.data.calc_loop_triangles();triangles+=len(obj.data.loop_triangles)
        for polygon in obj.data.polygons: polygon.use_smooth=True
assert triangles<18000, f'Unexpectedly large model: {triangles}'
for action in bpy.data.actions: action.name='Zombie Lurch'
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'art/zombie.blend'))
bpy.ops.export_scene.gltf(filepath=str(OUT/'zombie.glb'),export_format='GLB',export_animations=True,
    export_frame_range=True,export_force_sampling=True,export_cameras=False,export_lights=False)
report={'name':'Zombie','author':'Pixelhouse','license':'CC-BY-3.0',
    'source':'https://opengameart.org/content/zombie','licenseUrl':'https://creativecommons.org/licenses/by/3.0/',
    'download':'https://opengameart.org/sites/default/files/zombie.zip',
    'sourceSha256':hashlib.sha256((ROOT/'art/reference/zombie.zip').read_bytes()).hexdigest(),
    'changes':'Blender conversion, desaturated sickly texture grade, 2K color and 1K normal, walk animation',
    'triangles':triangles,'bytes':(OUT/'zombie.glb').stat().st_size,
    'sha256':hashlib.sha256((OUT/'zombie.glb').read_bytes()).hexdigest()}
(OUT/'zombie-source.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report))
