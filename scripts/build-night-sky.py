"""Prepare a single 2K sky texture in Blender, without a render or simulation.

Source: Poly Haven Solitude Night, Andreas Mischok, CC0.
Run with Blender --background --factory-startup --threads 2 --python this_file.py.
The source HDR stays in art/reference; the browser receives only the small JPEG.
"""
import hashlib
import json
from pathlib import Path

import bpy
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'art/reference/solitude_night_2k.hdr'
OUTPUT = ROOT / 'assets/field/night-sky.jpg'
EXPECTED_SHA256 = '8dbd0abf5e9fbe19ecf0d6a1c461754a1b63713d96a0b99375dc56d7077749bb'

assert hashlib.sha256(SOURCE.read_bytes()).hexdigest() == EXPECTED_SHA256, 'Unexpected source HDR'
source = bpy.data.images.load(str(SOURCE), check_existing=False)
width, height = source.size
assert (width, height) == (2048, 1024), 'Expected the bounded 2K source'
pixels = np.empty(width * height * 4, dtype=np.float32)
source.pixels.foreach_get(pixels)
pixels = pixels.reshape(height, width, 4)
rgb = np.maximum(pixels[:, :, :3], 0)
assert np.isfinite(rgb).all(), 'Source contains invalid pixel values'

# Blender image buffers run bottom to top.
elevation = (np.arange(height, dtype=np.float32) + .5) / height * 180 - 90
luminance = rgb @ np.array([.2126, .7152, .0722], dtype=np.float32)
reference = float(np.percentile(luminance[elevation > 30], 90))
exposure = .085 / max(reference, 1e-6)
graded = rgb * exposure
lum = luminance[:, :, None] * exposure
# Preserve cloud detail and the photographed moon, with restrained blue-grey.
graded = (graded * .65 + lum * .35) * np.array([.64, .79, 1], dtype=np.float32)
graded /= 1 + lum * .65

# Clone adjacent clean sky over the three silhouettes that rise above the fog.
# Offline image preparation preserves the moon and cloud elevation, rather than
# stretching the whole panorama or raising the fog over most of the visible sky.
patches = [(735, 915, 30, 210), (1135, 1360, 34, -235), (1490, 1605, 27, 215)]
original = graded.copy()
for left, right, top_degrees, offset in patches:
    x = np.arange(left, right)
    feather_x = np.clip(np.minimum(x-left, right-1-x) / 18, 0, 1)
    feather_y = np.clip((top_degrees-elevation) / 3, 0, 1)
    mask = (feather_y[:, None] * feather_x[None, :])[:, :, None]
    graded[:, left:right] = original[:, left:right] * (1-mask) + original[:, x+offset] * mask

fog_srgb = np.array([0x11, 0x1d, 0x19], dtype=np.float32) / 255
fog_linear = np.where(fog_srgb <= .04045, fog_srgb / 12.92, ((fog_srgb + .055) / 1.055) ** 2.4)
blend = np.clip((elevation - 16) / 17, 0, 1)
blend = blend * blend * (3 - 2 * blend)
graded = fog_linear + (graded - fog_linear) * blend[:, None, None]
rgba = np.ones((height, width, 4), dtype=np.float32)
rgba[:, :, :3] = np.clip(graded, 0, 1)

scene = bpy.context.scene
scene.display_settings.display_device = 'sRGB'
scene.view_settings.view_transform = 'Standard'
scene.view_settings.look = 'None'
scene.view_settings.exposure = 0
scene.view_settings.gamma = 1
scene.render.image_settings.file_format = 'JPEG'
scene.render.image_settings.color_mode = 'RGB'
scene.render.image_settings.quality = 90
scene.render.dither_intensity = 0
sky = bpy.data.images.new('Cornfield Night Sky', width=width, height=height, alpha=False, float_buffer=True)
sky.pixels.foreach_set(rgba.ravel())
sky.save_render(str(OUTPUT), scene=scene)
assert OUTPUT.stat().st_size < 900_000, 'Sky exceeds the 900 KB transfer budget'

# Keep an editable Blender world alongside the original HDR. No other kit changes.
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
preview = bpy.data.images.load(str(OUTPUT), check_existing=False)
world = bpy.data.worlds.new('Cornfield Moonlit Sky')
world.use_nodes = True
scene.world = world
env = world.node_tree.nodes.new('ShaderNodeTexEnvironment')
env.image = preview
world.node_tree.links.new(env.outputs['Color'], world.node_tree.nodes.get('Background').inputs['Color'])
preview.pack()
bpy.data.images.remove(source)
bpy.data.images.remove(sky)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'art/night-sky.blend'))

manifest = {
    'asset': 'Solitude Night',
    'author': 'Andreas Mischok',
    'license': 'CC0-1.0',
    'source': 'https://polyhaven.com/a/solitude_night',
    'licenseUrl': 'https://polyhaven.com/license',
    'downloadUrl': 'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/2k/solitude_night_2k.hdr',
    'sourceFile': 'art/reference/solitude_night_2k.hdr',
    'sourceSha256': EXPECTED_SHA256,
    'generator': 'scripts/build-night-sky.py',
    'generatorSha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
    'blenderVersion': bpy.app.version_string,
    'outputFile': 'assets/field/night-sky.jpg',
    'outputSha256': hashlib.sha256(OUTPUT.read_bytes()).hexdigest(),
    'bytes': OUTPUT.stat().st_size,
    'width': width,
    'height': height,
    'horizonMaskDegrees': [16, 33],
    'retouchedSilhouettes': ['building', 'tree', 'sapling'],
    'referenceLuminance': reference,
    'exposureMultiplier': exposure,
    'runtime': 'One static unlit sphere; existing renderer tone mapping; no environment lighting'
}
(ROOT / 'assets/field/sky-source.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(json.dumps(manifest))
