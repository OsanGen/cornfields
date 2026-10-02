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
JPEG is loaded by the game. It also supplies the lightweight puddle reflection
map; it does not provide world lighting or a real-time reflection render.

Zombie model, textures and walk animation: Pixelhouse, CC BY 3.0.
Source: https://opengameart.org/content/zombie
License: https://creativecommons.org/licenses/by/3.0/
Original archive: https://opengameart.org/sites/default/files/zombie.zip
Modified in Blender: texture grading and resizing, material setup, GLB conversion.
Runtime adaptation: scale/ground alignment and removal of horizontal root motion.
Original local runtime choreography adds the articulated backward arch, curled
stagger/recovery, recoil, struggle and throw poses, plus head-attached eye geometry.
The Pixelhouse lurch is supplemented by Fury and Collapse clips from the same
source archive and license. Their sampled tracks and source hashes are recorded
in zombie-clips.json. No Denys, Mixamo or Quaternius files are included.
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
# Creature vocal recordings

`assets/audio/distress.wav` and `assets/audio/scream.wav` are selected, unmodified
recordings from artisticdude's [Zombies Sound Pack](https://opengameart.org/content/zombies-sound-pack),
released under CC0. Source filenames and SHA-256 hashes are in `assets/audio/sources.json`.
Playback gain, rate, spatial position and fade are controlled by the game.

# Original first-person hands (source reference)

`hands.glb` and its embedded 1K skin atlas are original procedural geometry and
texture work authored for CORNFIELDS with `scripts/build-hands.py`. This older
asset contains no downloaded model and is retained as source reference; the
current runtime uses the CC0 assets below. Its size, triangle count and hashes
are recorded in `hands-source.json`.
# Player viewmodel additions

- Service Pistol by Mateusz Sadek / Poly Haven: https://polyhaven.com/a/service_pistol, CC0 1.0. Wood grip variant, separate slide, reduced source inventory and 1K textures. License: https://polyhaven.com/license
- fps arms (rigged only) by para, using MakeHuman mesh and texture: https://opengameart.org/content/fps-arms-rigged-only, CC0 1.0. Split arms, grip poses, skin material and GLB export by this project.
- Source hashes, exporter and runtime hashes: `player-viewmodel-source.json`. The original procedural hands remain available as reference; the new assets replace the normal first-person presentation.

# Red return beacon

`beacon-mist.png` is the unchanged `PNG/White puff/whitePuff07.png` from [Smoke Particles](https://kenney.nl/assets/smoke-particles) by Kenney Vleugels, licensed [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). It is tinted red at runtime. See `beacon-source.json` for download provenance and hashes. The sky beam and muzzle-flash textures are generated by this project.
# Scarecrow checkpoint model

Scarecrow On Post (Halloween Slasher Street), by 3D Assets, is released under
CC0 1.0 Universal: https://creativecommons.org/publicdomain/zero/1.0/.
Source: https://3dassets.dev/assets/halloween-slasher-street-scarecrow-on-post-02cc268c.
The publisher discloses AI-assisted creation. Cornfields locally packages the
GLB and applies original liquid, emissive and fractal checkpoint treatments.
The model's original rigid sway is not played. `scarecrow-source.json` records
the original download, size and SHA256. Existing Hessian cloth maps retain their
Poly Haven credits in this file. Missing clothing UVs are generated locally, and
the warning cloth and head/hat reuse the existing Hessian maps with muted colors.
