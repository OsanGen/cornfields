"""Blender 5.2.1: export original FBX actions for build-zombie-clips.mjs."""
import bpy
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
if len(args) != 1:
    raise RuntimeError('Pass one task scratch directory after --')
output = Path(args[0]).resolve()
output.mkdir(parents=True, exist_ok=True)
for name in ['walk', 'fury', 'dead']:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.wm.fbx_import(filepath=str(root / 'art/reference/zombie-source' / f'{name}.FBX'))
    for obj in bpy.context.scene.objects:
        if obj.type == 'MESH':
            obj.data.materials.clear()
    frames = [action.frame_range for action in bpy.data.actions]
    bpy.context.scene.frame_start = int(min(frame[0] for frame in frames))
    bpy.context.scene.frame_end = int(max(frame[1] for frame in frames))
    bpy.context.scene.render.fps = 30
    bpy.context.scene.frame_set(bpy.context.scene.frame_start)
    bpy.ops.export_scene.gltf(filepath=str(output / f'{name}.glb'), export_format='GLB',
        export_animations=True, export_frame_range=True, export_force_sampling=True,
        export_cameras=False, export_lights=False)
