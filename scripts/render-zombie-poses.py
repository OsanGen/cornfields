"""Render the bounded static silhouette proof produced by preview-zombie-poses.mjs."""
import bpy
import json
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'output/horror-update'
samples = json.loads((OUT / 'zombie-pose-samples.json').read_text())
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for index, sample in enumerate(samples):
    for item in sample['meshes']:
        mesh = bpy.data.meshes.new(item['name'])
        mesh.from_pydata(item['vertices'], [], item['faces'])
        mesh.update()
        obj = bpy.data.objects.new(item['name'], mesh)
        bpy.context.collection.objects.link(obj)
        obj.location.x = (index - 2) * 2.6
        mat = bpy.data.materials.new(item['name'])
        mat.diffuse_color = (*item['color'], 1) if item['eye'] else (.38, .43, .32, 1)
        obj.data.materials.append(mat)
        for polygon in mesh.polygons:
            polygon.use_smooth = True
    bpy.ops.object.text_add(location=((index - 2) * 2.6 - .7, -.1, -.12), rotation=(1.5708, 0, 0))
    text = bpy.context.object
    text.data.body = sample['name'].upper()
    text.data.size = .19
bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, -.04))
plane = bpy.context.object
mat = bpy.data.materials.new('Ground')
mat.diffuse_color = (.10, .13, .12, 1)
plane.data.materials.append(mat)
bpy.ops.object.camera_add(location=(5, -14, 6))
camera = bpy.context.object
camera.rotation_euler = (Vector((0, 0, .8)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
camera.data.type = 'ORTHO'
camera.data.ortho_scale = 14.7
scene = bpy.context.scene
scene.camera = camera
scene.render.engine = 'BLENDER_WORKBENCH'
scene.display.shading.light = 'STUDIO'
scene.display.shading.studio_light = 'paint.sl'
scene.display.shading.color_type = 'MATERIAL'
scene.display.shading.show_shadows = True
scene.display.shading.show_cavity = True
scene.display.shading.background_type = 'WORLD'
scene.world.color = (.035, .045, .045)
scene.render.resolution_x = 1800
scene.render.resolution_y = 640
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.filepath = str(OUT / 'zombie-pose-proof.png')
bpy.ops.render.render(write_still=True)
