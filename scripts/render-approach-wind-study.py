"""Actual geometry plus CPU wind-equation study, NOT browser/GPU/gameplay evidence."""
import bpy,json,math
from pathlib import Path
from mathutils import Vector
from PIL import Image,ImageDraw,ImageFont
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'verification/approach-wind'
payload=json.loads((OUT/'geometry-motion-study.json').read_text())
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=24;scene.cycles.use_denoising=False
scene.render.threads_mode='FIXED';scene.render.threads=2;scene.render.resolution_x=1200;scene.render.resolution_y=800;scene.render.resolution_percentage=100
scene.world.color=(.17,.17,.17);scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast'
mat=bpy.data.materials.new('Existing original runtime corn PBR atlas');mat.use_nodes=True
nodes=mat.node_tree.nodes;links=mat.node_tree.links;bsdf=nodes.get('Principled BSDF');bsdf.inputs['Roughness'].default_value=1
for key in ['map','normalMap','roughnessMap']:
    im=Image.frombytes('RGBA',(1024,1024),(OUT/(key+'.rgba')).read_bytes()).transpose(Image.Transpose.FLIP_TOP_BOTTOM);file=OUT/(key+'.png');im.save(file)
    tex=nodes.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(str(file))
    if key!='map':tex.image.colorspace_settings.name='Non-Color'
    if key=='normalMap':
        nm=nodes.new('ShaderNodeNormalMap');nm.inputs['Strength'].default_value=.72;links.new(tex.outputs['Color'],nm.inputs['Color']);links.new(nm.outputs['Normal'],bsdf.inputs['Normal'])
    else:links.new(tex.outputs['Color'],bsdf.inputs['Base Color' if key=='map' else 'Roughness'])
def verts(flat):return [(x,-z,y) for x,y,z in zip(flat[::3],flat[1::3],flat[2::3])]
faces=[tuple(payload['indices'][i:i+3]) for i in range(0,len(payload['indices']),3)]
def plant(name,positions,x):
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts(positions),[],faces);mesh.update();uv=mesh.uv_layers.new()
    for loop in mesh.loops:uv.data[loop.index].uv=payload['uv'][loop.vertex_index*2:loop.vertex_index*2+2]
    for f in mesh.polygons:f.use_smooth=True
    obj=bpy.data.objects.new(name,mesh);scene.collection.objects.link(obj);obj.location.x=x;mesh.materials.append(mat);return obj
baseline=plant('Static baseline same geometry + planted transform',payload['frames'][0]['base'],-1.55)
candidate=plant('CPU-reference wind candidate',payload['frames'][0]['positions'],1.55)
bpy.ops.mesh.primitive_plane_add(size=200);floor=bpy.context.object;floorMat=bpy.data.materials.new('Shared neutral inspection floor');floorMat.diffuse_color=(.13,.15,.17,1);floor.data.materials.append(floorMat)
def area(name,loc,power,size,color):
    d=bpy.data.lights.new(name,'AREA');d.energy=power;d.shape='DISK';d.size=size;d.color=color;o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);o.location=loc;o.rotation_euler=(Vector((0,0,1.4))-o.location).to_track_quat('-Z','Y').to_euler()
area('Shared soft key',(0,-4,6),850,5,(1,.92,.79));area('Shared cool rim',(0,3,5),1000,4,(.73,.84,1));area('Shared fill',(0,-5,2),180,5,(.91,.95,1))
d=bpy.data.cameras.new('Matched inspection camera');camera=bpy.data.objects.new('Matched inspection camera',d);scene.collection.objects.link(camera);camera.location=(0,-8,2.1);camera.rotation_euler=(Vector((0,0,1.6))-camera.location).to_track_quat('-Z','Y').to_euler();d.type='ORTHO';d.ortho_scale=6.5;scene.camera=camera
font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',21);small=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',16)
images=[]
for index,frame in enumerate(payload['frames']):
    for v,p in zip(candidate.data.vertices,verts(frame['positions'])):v.co=p
    candidate.data.update();file=OUT/f'offline-wind-{index:02d}.png';scene.render.filepath=str(file);bpy.ops.render.render(write_still=True)
    im=Image.open(file).convert('RGB');draw=ImageDraw.Draw(im);draw.rectangle((0,0,1200,91),fill=(21,27,34));draw.text((28,15),'STATIC BASELINE',font=font,fill=(225,231,234));draw.text((660,15),f'WIND CANDIDATE  |  t = {frame["time"]:.1f}s',font=font,fill=(225,231,234));draw.text((28,54),'OFFLINE CPU GEOMETRY STUDY  |  SAME CAMERA + LIGHTS  |  NOT GAMEPLAY / GPU EVIDENCE',font=small,fill=(172,190,199))
    draw.rectangle((0,740,1200,800),fill=(21,27,34));draw.text((28,752),'Actual runtime corn + PBR atlas; wind-equation reference. Root movement: 0.0 mm.',font=small,fill=(194,210,215));draw.text((28,778),'Natural-scale motion. No extra plants, geometry, texture maps or draw calls.',font=small,fill=(172,190,199));im.save(file);images.append(im)
images[2].save(OUT/'approach-wind-offline-comparison.png');images[0].save(OUT/'approach-wind-offline-animation.gif',save_all=True,append_images=images[1:],duration=500,loop=0)
print('OFFLINE_APPROACH_WIND_STUDY_COMPLETE')
