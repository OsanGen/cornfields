"""Blender-only authoring: a small corn/entrance kit, no rendering or simulation.

Run: Blender --background --factory-startup --threads 2 --python this_file.py
Writes one editable .blend and one game GLB on the external project volume.
"""
import bpy
import json
import math
import random
import hashlib
from pathlib import Path
from mathutils import Vector
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets' / 'field'
ART = ROOT / 'art'
OUT.mkdir(parents=True, exist_ok=True)
ART.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.context.scene.unit_settings.system = 'METRIC'


def texture(name, pixels, data=False):
    image = bpy.data.images.new(name, width=pixels.shape[1], height=pixels.shape[0], alpha=True)
    if data:
        image.colorspace_settings.name = 'Non-Color'
    image.pixels.foreach_set(pixels.astype(np.float32).ravel())
    image.filepath_raw = str(OUT / (name + '.png'))
    image.file_format = 'PNG'
    image.save()
    return image


# The material detail is evaluated once into a 1K atlas, never in a game shader.
# Four strips: green blade, dry blade, fibrous stalk, golden tassel/husk.
n = 1024
yy, xx = np.mgrid[0:n, 0:n].astype(np.float32)
u, v = (xx % 256) / 255, yy / 1023
rng = np.random.default_rng(719)
grain = rng.random((n, n)).astype(np.float32)
veins = np.sin(u * 180 + np.sin(v * 18) * .7)
ridge = np.exp(-((u - .5) / .025) ** 2)
tip = np.clip((v - .78) / .22, 0, 1)
patch = np.sin(v * 17 + u * 9) * np.sin(v * 51 - u * 8)
base = np.array([[.30,.36,.13],[.46,.36,.18],[.36,.38,.16],[.56,.45,.24]], dtype=np.float32)
rgb = base[(xx // 256).astype(int)]
rgb = rgb * (.89 + .12 * grain[...,None] + .10 * veins[...,None] + .13 * patch[...,None])
rgb += ridge[...,None] * np.array([.06,.055,.025])
rgb = rgb * (1 - tip[...,None] * .42) + tip[...,None] * np.array([.23,.135,.04])
rgba = np.concatenate((np.clip(rgb,0,1),np.ones((n,n,1),dtype=np.float32)),axis=2)
color = texture('corn_color',rgba)
normal = np.ones((n,n,4),dtype=np.float32)
normal[:,:,0] = .5 + .045 * np.cos(u * 180 + np.sin(v * 18) * .7)
normal[:,:,1] = .5 + .014 * np.sin(v * 150)
normal[:,:,2] = .995
normal_image = texture('corn_normal',normal,True)


def material(name, tint, roughness=1):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*tint, 1)
    bsdf.inputs['Roughness'].default_value = roughness
    return mat


corn = material('CornAtlas', (1,1,1), .92)
corn.use_backface_culling = False
nodes, links = corn.node_tree.nodes, corn.node_tree.links
bsdf = nodes.get('Principled BSDF')
tex = nodes.new('ShaderNodeTexImage'); tex.image = color
links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
tex = nodes.new('ShaderNodeTexImage'); tex.image = normal_image
normal_node = nodes.new('ShaderNodeNormalMap'); normal_node.inputs['Strength'].default_value = .55
links.new(tex.outputs['Color'], normal_node.inputs['Color'])
links.new(normal_node.outputs['Normal'], bsdf.inputs['Normal'])

# Entrance textures are assigned once in Three.js, shared by its two wood meshes.
wood = material('EntranceWood', (.43,.36,.25), .92)
iron = material('EntranceIron', (.17,.115,.072), .88)
iron.node_tree.nodes.get('Principled BSDF').inputs['Metallic'].default_value = .35


class MeshBuilder:
    def __init__(self):
        self.verts, self.faces, self.uv = [], [], []

    def vertex(self, point, uv):
        self.verts.append(tuple(point)); self.uv.append(uv)
        return len(self.verts)-1

    def blade(self, origin, angle, length, width, rise, droop, segments, strip=0, twist=0):
        origin = Vector(origin)
        direction = Vector((math.cos(angle),math.sin(angle),0))
        side = Vector((-math.sin(angle),math.cos(angle),0))
        start = len(self.verts)
        for j in range(segments+1):
            t = j/segments
            center = origin + direction*(length*t)
            center.z += rise*math.sin(t*math.pi*.85)-droop*t*t
            span = width * (math.sin(math.pi*t)**.65)*.5 + .001
            for k in range(3):
                p = center + side*((k-1)*span)
                p.z += (abs(k-1)*-.026 + (k-1)*twist*t)*math.sin(math.pi*t)
                self.vertex(p,((strip+.02+.96*k/2)/4, .015+.97*t))
        for j in range(segments):
            for k in range(2):
                a = start+j*3+k
                self.faces.append((a,a+1,a+4,a+3))

    def stem(self, start, end, radius, sides=5, rings=1, strip=2):
        start, end = Vector(start), Vector(end)
        axis = (end-start).normalized()
        a = axis.cross(Vector((0,1,0))).normalized()
        b = axis.cross(a).normalized()
        offset = len(self.verts)
        for j in range(rings+1):
            t = j/rings
            center = start.lerp(end,t)
            for k in range(sides+1):
                theta = k/sides*math.tau
                p = center + (a*math.cos(theta)+b*math.sin(theta))*radius*(1-.55*t)
                self.vertex(p,((strip+.03+.94*k/sides)/4,.02+.96*t))
        for j in range(rings):
            for k in range(sides):
                q = offset+j*(sides+1)+k
                self.faces.append((q,q+1,q+sides+2,q+sides+1))

    def finish(self, name, mat):
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(self.verts,[],self.faces); mesh.update()
        layer = mesh.uv_layers.new(name='UVMap')
        for loop in mesh.loops:
            layer.data[loop.index].uv = self.uv[loop.vertex_index]
        obj = bpy.data.objects.new(name,mesh)
        bpy.context.collection.objects.link(obj)
        obj.data.materials.append(mat)
        for polygon in mesh.polygons:
            polygon.use_smooth = True
        return obj


for variant in range(3):
    for far in [False,True]:
        rand = random.Random(719+variant)
        mesh = MeshBuilder()
        height = [2.95,3.18,2.78][variant]
        lean = [.075,-.11,.14][variant]
        mesh.stem((0,0,0),(lean,0,height),.025,4 if far else 5,3 if far else 6)
        count = 7 if far else 11
        for leaf in range(count):
            f = leaf/(count-1)
            h = .24+f*(height-.65)
            angle = leaf*2.43+variant*.71+rand.uniform(-.3,.3)
            length = .56+.30*math.sin(f*math.pi)+rand.random()*.14
            mesh.blade((lean*h/height,0,h),angle,length,.11+rand.random()*.075,
                       .21+f*.15,.27 if leaf<3 else .12,
                       3 if far else 6,1 if leaf<2 else 0,rand.uniform(-.09,.09))
        # Tassel has a central spike and splayed branches, not a corn cob on top.
        mesh.stem((lean,0,height-.07),(lean+.035,0,height+.33),.009,3,1,3)
        for branch in range(3 if far else 6):
            a = branch*2.4
            mesh.stem((lean,0,height+.04),(lean+math.cos(a)*.16,math.sin(a)*.16,height+.22),.006,3,1,3)
        if not far:
            # One narrow husked ear at a leaf joint.
            mesh.stem((lean*.55,0,1.3),(lean*.55+.13,0,1.65),.047,5,2,3)
            mesh.blade((0,0,1.3),.15,.28,.09,.26,.03,3,1)
        mesh.finish(f'corn_{"far" if far else "near"}_{variant}',corn)

for variant in range(2):
    mesh = MeshBuilder()
    mesh.blade((0,0,.018),variant*.7,.38+variant*.12,.095,.032,.015,5,1)
    mesh.finish(f'litter_{variant}',corn)


def box(name, center, size, mat, angle=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=center)
    obj = bpy.context.object; obj.name = name
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    obj.rotation_euler[1] = angle
    obj.data.materials.append(mat)
    bevel = obj.modifiers.new('Small worn edges','BEVEL'); bevel.width = .006; bevel.segments = 1
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    # Natural size UVs, rather than one full plank photograph on every small face.
    uv = obj.data.uv_layers.active or obj.data.uv_layers.new()
    for face in obj.data.polygons:
        for li in face.loop_indices:
            p = obj.data.vertices[obj.data.loops[li].vertex_index].co
            if abs(face.normal.z)>.5:
                uv.data[li].uv = (p.x/2+.23+center[0]*.23,p.y/2+.41)
            else:
                horizontal = p.x if abs(face.normal.y)>.5 else p.y
                uv.data[li].uv = (horizontal/2+.23+center[0]*.23,p.z/2+.41+center[2]*.17)
    return obj


def join(name, objects):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects: obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    obj = bpy.context.object; obj.name = name
    bpy.context.scene.cursor.location = (0,0,0)
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
    return obj


door = []
for i in range(7):
    door.append(box('Board',((i+.5)*2.35/7,0,1.375),(2.35/7-.006,.14,2.75-(i%3)*.012),wood))
for h in [.43,2.29]:
    door.append(box('Brace',(1.175,-.103,h),(2.31,.07,.125),wood))
door.append(box('Diagonal brace',(1.175,.108,1.38),(.12,.065,2.69),wood,-.73))
join('entrance_door',door)
frame = [box('Post',(x,0,1.66),(.20,.26,3.32),wood) for x in [-.10,2.45]]
frame.append(box('Lintel',(1.175,.01,2.91),(2.76,.27,.18),wood))
frame.append(box('Sign board',(1.175,-.015,3.26),(3.50,.12,.58),wood))
join('entrance_frame',frame)
hardware=[]
for h in [.45,2.28]:
    hardware.append(box('Hinge',( .25,-.152,h),(.50,.025,.076),iron))
    for x in [.08,.39]: hardware.append(box('Pin',(x,-.177,h),(.026,.025,.026),iron))
for z in [1.08,1.31]: hardware.append(box('Handle mount',(2.13,-.15,z),(.075,.10,.055),iron))
hardware.append(box('Handle',(2.13,-.204,1.195),(.037,.035,.24),iron))
join('entrance_hardware',hardware)

# All source geometry stays at its functional origin; the GLB is a kit, not a scene.
objects = list(bpy.context.scene.objects)
stats = {}
for obj in objects:
    if obj.type=='MESH':
        obj.data.calc_loop_triangles()
        stats[obj.name] = {'triangles':len(obj.data.loop_triangles),'vertices':len(obj.data.vertices)}
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(OUT/'cornfield-kit.glb'),export_format='GLB',
                          export_yup=True,export_apply=True,export_texcoords=True,
                          export_normals=True,export_materials='EXPORT',export_cameras=False,
                          export_lights=False)
# Fence panels reuse the authored boards in the runtime. No opaque green backing
# or offline backing bake is part of the accepted fence direction.
# Keep photographed wood editable in the source .blend without duplicating those
# separately loaded runtime JPEGs inside the GLB.
nodes, links = wood.node_tree.nodes, wood.node_tree.links
bsdf = nodes.get('Principled BSDF')
for kind, socket in [('diff','Base Color'),('rough','Roughness'),('nor_gl',None)]:
    tex = nodes.new('ShaderNodeTexImage')
    tex.image = bpy.data.images.load(str(OUT/f'wood_planks_dirt_{kind}_1k.jpg'),check_existing=True)
    if kind!='diff': tex.image.colorspace_settings.name = 'Non-Color'
    if socket: links.new(tex.outputs['Color'],bsdf.inputs[socket])
    else:
        nm = nodes.new('ShaderNodeNormalMap'); nm.inputs['Strength'].default_value = .55
        links.new(tex.outputs['Color'],nm.inputs['Color']); links.new(nm.outputs['Normal'],bsdf.inputs['Normal'])
bpy.ops.wm.save_as_mainfile(filepath=str(ART/'cornfield-kit.blend'))
(OUT/'geometry.json').write_text(json.dumps({'blender':bpy.app.version_string,
    'generatorSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'objects':stats},indent=2)+'\n')
print('FIELD_ASSETS_COMPLETE '+json.dumps(stats))
