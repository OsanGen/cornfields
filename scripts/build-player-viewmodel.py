"""Offline CC0 player asset preparation. Run with Blender, auto-execution disabled.

Original FBX/glTF files remain in art/reference/player-viewmodel. Runtime output
contains one pistol variant and anatomically rigged arms, no source control rigs.
"""
import bpy, bmesh, json, math, hashlib, sys
from mathutils import Vector, Matrix, Quaternion
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'art/reference/player-viewmodel'
TRIAL='--meshopt-trial' in sys.argv
OUT=ROOT/('output/remaining-upgrade-2026-10-01/meshopt-trial' if TRIAL else 'assets/field')
OUT.mkdir(parents=True,exist_ok=True)

def export(name):
    bpy.ops.export_scene.gltf(filepath=str(OUT/name),export_format='GLB',export_animations=False,export_skins=True,export_rest_position_armature=False,export_yup=True,export_image_format='JPEG',export_jpeg_quality=88,export_extras=True,export_meshopt_compression_enable=TRIAL,export_meshopt_extension='EXT_meshopt_compression')

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(SOURCE/'pistol/service_pistol.gltf'))
root=bpy.data.objects.new('ServicePistol',None);bpy.context.collection.objects.link(root)
keep=['service_pistol_pistol_a','service_pistol_slide_a','service_pistol_hammer_a','service_pistol_trigger_a']
for obj in list(bpy.data.objects):
    if obj==root:continue
    if obj.name not in keep:bpy.data.objects.remove(obj,do_unlink=True);continue
    matrix=obj.matrix_world.copy();obj.parent=root;obj.matrix_world=matrix
    obj.name={'service_pistol_pistol_a':'PistolBody','service_pistol_slide_a':'PistolSlide','service_pistol_hammer_a':'PistolHammer','service_pistol_trigger_a':'PistolTrigger'}[obj.name]
# Original barrel points +X; the runtime barrel points -Z after glTF conversion.
root.rotation_euler.z=math.pi/2
export('service-pistol.glb')

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=str(SOURCE/'FPS ARMS RIG 1.fbx'))
rig=next(o for o in bpy.data.objects if o.type=='ARMATURE')
mesh=next(o for o in bpy.data.objects if o.type=='MESH')
texture=bpy.data.images.load(str(SOURCE/'new_diff.png'),check_existing=True)
material=bpy.data.materials.new('Anatomical skin');material.use_nodes=True
bsdf=material.node_tree.nodes.get('Principled BSDF');bsdf.inputs['Roughness'].default_value=.68
bsdf.inputs['Specular IOR Level'].default_value=.28
tex=material.node_tree.nodes.new('ShaderNodeTexImage');tex.image=texture
material.node_tree.links.new(tex.outputs['Color'],bsdf.inputs['Base Color'])
mesh.data.materials.clear();mesh.data.materials.append(material)
for side,sign,label in [('R',-1,'RightArm'),('L',1,'LeftArm')]:
    arm=rig.copy();arm.data=rig.data.copy();bpy.context.collection.objects.link(arm)
    body=mesh.copy();body.data=mesh.data.copy();bpy.context.collection.objects.link(body)
    body.parent=arm
    for modifier in body.modifiers:
        if modifier.type=='ARMATURE':modifier.object=arm
    # Keep one arm with its UVs, normals and vertex weights.
    bm=bmesh.new();bm.from_mesh(body.data)
    bmesh.ops.delete(bm,geom=[v for v in bm.verts if (body.matrix_world@v.co).x*sign<0],context='VERTS')
    bm.to_mesh(body.data);bm.free()
    hand=arm.data.bones['hand.'+side]
    middle=arm.data.bones['f_middle.01.'+side]
    index=arm.data.bones['f_index.01.'+side]
    pinky=arm.data.bones['f_pinky.01.'+side]
    forward=(middle.head_local-hand.head_local).normalized()
    across=index.head_local-pinky.head_local;across=(across-forward*across.dot(forward)).normalized()
    normal=forward.cross(across).normalized()
    basis=Matrix((normal,forward,across)).transposed()
    rotation=basis.transposed().to_4x4()
    wrist=arm.matrix_world@hand.head_local
    # A first-person view needs forearms, not shoulders occupying the camera.
    # Fit the forearm toward the lower screen edge without touching hand anatomy.
    transform=rotation@Matrix.Translation(-wrist)@body.matrix_world
    inverse=transform.inverted()
    bm=bmesh.new();bm.from_mesh(body.data)
    bmesh.ops.delete(bm,geom=[v for v in bm.verts if (transform@v.co).y<-.27],context='VERTS')
    for vertex in bm.verts:
        p=transform@vertex.co
        if p.y<-.025:
            t=min(1,(-p.y-.025)/.245)
            # Retain the cross-section instead of collapsing the cropped end to
            # a point. Extend that end below the QTE camera as well as the gun view.
            fit=.6*t
            p.x=p.x*(1-fit)+(-sign)*.055*fit
            p.z=p.z*(1-fit)-.17*fit
            p.y=-.025+(p.y+.025)*8
            vertex.co=inverse@p
    bm.to_mesh(body.data);bm.free();body.data.update()
    group=bpy.data.objects.new(label,None);bpy.context.collection.objects.link(group)
    world=arm.matrix_world.copy();arm.parent=group;arm.matrix_world=world
    group.matrix_world=rotation@Matrix.Translation(-wrist)
    # Finger joints curl toward the grip; the trigger finger stays less curled.
    for bone in arm.pose.bones:
        bone.rotation_mode='QUATERNION'
        if bone.name.endswith('.'+side) and bone.name.startswith('f_'):
            finger=bone.name.split('.')[0];segment=int(bone.name.split('.')[1])
            angles=[.85,1.22,.85] if finger!='f_index' else [.60,1.0,.65]
            local_axis=bone.bone.matrix_local.to_quaternion().inverted()@across
            bone.rotation_quaternion=Quaternion(local_axis,angles[segment-1]*(-sign))
        if bone.name in ['thumb.02.'+side,'thumb.03.'+side]:
            local_axis=bone.bone.matrix_local.to_quaternion().inverted()@across
            bone.rotation_quaternion=Quaternion(local_axis,.40*(-sign))
    # Remove the unused opposite arm bones after splitting the mesh.
    bpy.context.view_layer.objects.active=arm;arm.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    for bone in list(arm.data.edit_bones):
        if ('.L' if side=='R' else '.R') in bone.name:arm.data.edit_bones.remove(bone)
    bpy.ops.object.mode_set(mode='OBJECT');arm.select_set(False)
    arm.name=label+'Skeleton';body.name=label+'Skin'
    body['source']='para / MakeHuman, CC0';group['wristOrigin']=True
bpy.data.objects.remove(mesh,do_unlink=True);bpy.data.objects.remove(rig,do_unlink=True)
export('player-arms.glb')

manifest={'version':1,'units':'metres','forward':'-Z','armOrigin':'wrist','sources':[
    {'name':'Service Pistol','author':'Mateusz Sadek / Poly Haven','url':'https://polyhaven.com/a/service_pistol','license':'CC0-1.0','changes':'wood grip variant, loose magazines/bullets/alternate removed, 1K textures, barrel normalized to -Z'},
    {'name':'fps arms (rigged only)','author':'para; mesh and texture from MakeHuman','url':'https://opengameart.org/content/fps-arms-rigged-only','license':'CC0-1.0','archiveSha256':hashlib.sha256((SOURCE/'fps-arms.7z').read_bytes()).hexdigest(),'changes':'split left/right arms; wrist origins; finger grip poses; skin material; GLB export'},
], 'exporter':bpy.app.version_string,'meshoptTrial':TRIAL,'runtime':{}}
manifest['sources'][0]['sourceFiles']={str(p.relative_to(SOURCE/'pistol')):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted((SOURCE/'pistol').rglob('*')) if p.is_file() and not p.name.startswith('.')}
for name in ['service-pistol.glb','player-arms.glb']:
    data=(OUT/name).read_bytes();manifest['runtime'][name]={'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}
(OUT/'player-viewmodel-source.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps(manifest['runtime']))
