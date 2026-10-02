"""Offline licensed asset conversion. Run Blender with --disable-autoexec."""
import bpy,json,math,hashlib,shutil
from pathlib import Path
from mathutils import Matrix,Vector
ROOT=Path(__file__).resolve().parents[1]
SRC=ROOT/'art/reference/intro-gameplay';OUT=ROOT/'assets/intro';OUT.mkdir(parents=True,exist_ok=True)
report={}
def export(path,animations=False):
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',export_animations=animations,
      export_animation_mode='ACTIONS',export_force_sampling=True,export_frame_step=2,
      export_cameras=False,export_lights=False,export_image_format='JPEG',export_jpeg_quality=85,
      export_extras=True,export_def_bones=False)
    report[path.name]={'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}
def pbr(name,color=(.2,.2,.2,1),metal=0,rough=.7,image=None):
    mat=bpy.data.materials.new(name);mat.use_nodes=True;bsdf=mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value=color;bsdf.inputs['Metallic'].default_value=metal;bsdf.inputs['Roughness'].default_value=rough
    if image:
        im=bpy.data.images.load(str(image),check_existing=True);im.pack();tex=mat.node_tree.nodes.new('ShaderNodeTexImage');tex.image=im;mat.node_tree.links.new(tex.outputs['Color'],bsdf.inputs['Base Color'])
    return mat

# Preserve the car's named interior, door and wheel parts, simplify exterior.
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(SRC/'car.glb'))
orient=Matrix.Diagonal((1,1,1.25,1))@Matrix.Rotation(math.pi,4,'Z')
for obj in list(bpy.context.scene.objects):
    if obj.parent is None:obj.matrix_world=orient@obj.matrix_world
bpy.context.view_layer.update()
for obj in list(bpy.context.scene.objects):
    if obj.name in ['InteriorSteeringEmblem','License Plate','Engine','Axles'] or 'HoodInterior' in obj.name or obj.name=='BodyHoodUnder':
        bpy.data.objects.remove(obj,do_unlink=True);continue
    if obj.type!='MESH':continue
    if len(obj.data.polygons)>600:
        mod=obj.modifiers.new('Mobile mesh','DECIMATE');mod.ratio=.45 if not obj.name.startswith('Interior') else .72
        bpy.context.view_layer.objects.active=obj;bpy.ops.object.modifier_apply(modifier=mod.name)
    for poly in obj.data.polygons:poly.use_smooth=True
    for slot in obj.material_slots:
        mat=slot.material
        if not mat:continue
        if 'Paint' in mat.name:slot.material=pbr('Cruiser charcoal',(.055,.07,.085,1),.45,.32)
        elif mat.name in ['Dashboard','License']:slot.material=pbr('Muted instrument panel',(.023,.035,.028,1),.05,.48)
        elif 'Glass' in mat.name:
            slot.material=pbr('Clear window',(.12,.18,.19,.09),.05,.18);slot.material.surface_render_method='DITHERED';slot.material.node_tree.nodes.get('Principled BSDF').inputs['Alpha'].default_value=.09
        elif 'Interior 3' in mat.name:slot.material=pbr('Worn dark upholstery',(.047,.055,.06,1),0,.82)
for image in bpy.data.images:
    if image.size[0]>1024 or image.size[1]>1024:image.scale(min(image.size[0],1024),min(image.size[1],1024))
    if image.size[0]:image.pack()
bpy.context.view_layer.update()
report['carParts']={o.name:{'position':list(o.matrix_world.translation),'bounds':[list(o.matrix_world@Vector(v)) for v in o.bound_box]} for o in bpy.context.scene.objects if o.name in ['InteriorSteeringWheel01','InteriorSeatsColor1','BodyRoofPanel','BodyWindshield','BodyDoorLColor1','BodyDoorRColor1']}
export(OUT/'cruiser.glb')

# Real textured human with original sit, idle, talk and walk clips.
bpy.ops.wm.open_mainfile(filepath=str(SRC/'steve/steve_npc1.blend'),load_ui=False,use_scripts=False)
rig=next(o for o in bpy.data.objects if o.type=='ARMATURE')
keep={'idol':'Idle','walk':'Walk','sit_idol':'Seated','talk1':'Talk'}
for action in list(bpy.data.actions):
    if action.name not in keep:bpy.data.actions.remove(action);continue
    name=action.name;action.name=keep[name];action.use_fake_user=True
    action.use_frame_range=True;action.frame_start=0;action.frame_end=min(90,int(action.frame_range[1]))
rig.animation_data_clear();rig.animation_data_create()
rig.animation_data.action=bpy.data.actions['Idle']
textures={'headHDmale':'headHDmale512.jpg','ear':'headHDmale512.jpg','cheek':'headHDmale512.jpg','eye':'myeye.jpg','shirt':'shirt.jpg','manpants':'cargopantsuv.jpg','super arms':'arms2.png','black fancy':'shoes!.png'}
for obj in list(bpy.data.objects):
    if obj.type not in {'ARMATURE','MESH'}:bpy.data.objects.remove(obj,do_unlink=True);continue
    if obj.type!='MESH':continue
    image=next((filename for key,filename in textures.items() if obj.name.startswith(key)),None)
    mat=pbr('Cast '+obj.name,rough=.78,image=SRC/'steve'/image if image else None)
    obj.data.materials.clear();obj.data.materials.append(mat)
    for poly in obj.data.polygons:poly.use_smooth=True
    # Recess oversized eyeballs into their sockets; keep source UVs and skinning.
    if obj.name.startswith('eye.'):
        center=sum((v.co for v in obj.data.vertices),Vector())/len(obj.data.vertices)
        for v in obj.data.vertices:v.co=center+(v.co-center)*.88
for image in bpy.data.images:
    if image.size[0]:
        if max(image.size)>1024:image.scale(min(image.size[0],1024),min(image.size[1],1024))
        image.pack()
bpy.context.scene.frame_set(0)
export(OUT/'cast.glb',True)

# Scanned torch with local -Z barrel, kept at real-world scale.
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(SRC/'torch/torch.gltf'))
for obj in bpy.context.scene.objects:
    if obj.type=='MESH':
        obj.name='HandheldFlashlight'
        mod=obj.modifiers.new('Mobile torch','DECIMATE');mod.ratio=.6;bpy.context.view_layer.objects.active=obj;bpy.ops.object.modifier_apply(modifier=mod.name)
for image in bpy.data.images:
    if image.size[0]:
        if max(image.size)>512:image.scale(min(image.size[0],512),min(image.size[1],512))
        image.pack()
export(ROOT/'assets/field/handheld-flashlight.glb')
for kind in ['diff','nor_gl','rough']:shutil.copyfile(SRC/f'asphalt_{kind}.jpg',OUT/f'asphalt_{kind}.jpg')
(OUT/'sources.json').write_text(json.dumps({'sources':[
 {'name':'Car Concept','author':'Darmstadt Graphics Group GmbH / Eric Chadwick; original Unity Fan','license':'CC-BY-4.0','url':'https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/CarConcept','changes':'Removed logo surfaces, reduced meshes and textures, charcoal cruiser materials, upright -Z orientation'},
 {'name':'NPC male Steve','author':'supersteve','license':'CC0-1.0','url':'https://opengameart.org/content/npc-male-steve','changes':'PBR conversion, bundled textures, seated/talk/walk clips, slightly recessed eyes'},
 {'name':'Small Plastic Torch','author':'Abiyyu Panggalih (Abiyyu_xyz) / Poly Haven','license':'CC0-1.0','url':'https://polyhaven.com/a/small_plastic_torch','changes':'512px textures, simplified mesh, GLB'},
 {'name':'Asphalt 03','author':'Charlotte Baglioni / Dario Barresi / Poly Haven','license':'CC0-1.0','url':'https://polyhaven.com/a/asphalt_03','changes':'1K color, OpenGL normal, roughness'},
 ],'runtime':report},indent=2)+'\n')
print('INTRO_ASSETS',json.dumps(report))
