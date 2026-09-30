# Field visual sources

The Brown Mud, Wood Planks Dirt and Rusty Metal 02 maps are by Rob Tuytel / Poly Haven.
Wood Planks is by Amal Kumar / Poly Haven. All these texture assets are
licensed CC0-1.0. Commercial use and redistribution are permitted.

- https://polyhaven.com/a/brown_mud
- https://polyhaven.com/a/wood_planks_dirt
- https://polyhaven.com/a/wood_planks
- https://polyhaven.com/a/rusty_metal_02
- https://polyhaven.com/license

`sources.json` records exact downloaded files, sizes, URLs and SHA-256 hashes.
Only 1K color, OpenGL normal and roughness maps are used. No displacement maps.

Corn meshes, corn surface textures, fallen leaves and entrance geometry are
original assets generated in Blender by `scripts/build-field-assets.py`.
No BlendSwap model, paid assets, add-ons or external fonts are included.

JamesWhite's CC0 Barbed Wire asset was evaluated as a reference:
https://opengameart.org/content/barbed-wire
Its original archive is retained under art/reference, outside the served paths.
The asset uses a 128px texture and its horizontal mesh has 896 triangles; the
runtime uses original 264-triangle geometric wire/barbs per panel instead, with
the Poly Haven rust texture. The third-party wire mesh/texture is not shipped to
the browser.

The photographic sky uses Solitude Night by Andreas Mischok / Poly Haven,
licensed CC0-1.0: https://polyhaven.com/a/solitude_night
The original 2K HDR is retained in art/reference, outside the served paths.
scripts/build-night-sky.py prepares the cropped/graded 2K JPEG in Blender and
records its provenance, source and output hashes in sky-source.json. Only that
JPEG is loaded by the game; it does not provide scene lighting or reflections.

Zombie model, textures and walk animation: Pixelhouse, CC BY 3.0.
Source: https://opengameart.org/content/zombie
License: https://creativecommons.org/licenses/by/3.0/
Original archive: https://opengameart.org/sites/default/files/zombie.zip
Modified in Blender: texture grading and resizing, material setup, GLB conversion.
Runtime adaptation: scale/ground alignment and removal of horizontal root motion.
Attribution is also linked on the game's title screen. Exact source and output
hashes, asset size and geometry count are recorded in zombie-source.json.

Additional CC0-1.0 prop surfaces from Poly Haven:
- Hessian 380: Rico Cilliers (processing), colormass (photography).
  https://polyhaven.com/a/hessian_380
- Blue Metal Plate: Rob Tuytel.
  https://polyhaven.com/a/blue_metal_plate

Only four 1K JPEGs are used: hessian color/normal and blue metal color/roughness.
Exact files, source URLs, sizes and SHA-256 hashes are in prop-sources.json.
Timber props, barrel bands and entrance iron reuse the existing field materials.
