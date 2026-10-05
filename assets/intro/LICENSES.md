# Intro and handheld asset credits

These local runtime assets are modified versions of the sources below. Inclusion
does not imply endorsement by their original authors. Source records, conversion
notes and available runtime hashes are in [sources.json](sources.json).

## Car Concept

- Runtime file: `cruiser.glb`.
- Attribution: **Car Concept**, Darmstadt Graphics Group GmbH and Eric Chadwick,
  derived from the original model by **Unity Fan**.
- Copyright © 2024, Darmstadt Graphics Group GmbH.
- Source: [Khronos glTF Sample Assets, Car Concept](https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/CarConcept).
- License for the distributed Car Concept adaptation: [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/).
- The original Unity Fan model was released under CC0. The downloaded adaptation
  is credited under CC BY 4.0, with this attribution retained in the runtime package.
- Cornfields changes: removed logo surfaces, simplified meshes and textures,
  charcoal cruiser materials, and upright orientation with the car facing -Z.

## NPC male Steve

- Runtime file: `cast.glb`.
- Author: **supersteve**.
- Source: [NPC male Steve on OpenGameArt](https://opengameart.org/content/npc-male-steve).
- License: [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/).
- Cornfields changes: PBR material conversion, bundled textures, seated, talk and
  walk clips, and slightly recessed eyes. Standing uses a planted walking pose.

## Asphalt 03

- Runtime files: `asphalt_diff.jpg`, `asphalt_nor_gl.jpg`, `asphalt_rough.jpg`.
- Authors: **Charlotte Baglioni** and **Dario Barresi**, via Poly Haven.
- Source: [Asphalt 03](https://polyhaven.com/a/asphalt_03).
- License: [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/).
- Cornfields changes: local 1K color, OpenGL normal and roughness texture variants.

## Small Plastic Torch

- Runtime file: `../field/handheld-flashlight.glb`.
- Author: **Abiyyu Panggalih (Abiyyu_xyz)**, via Poly Haven.
- Source: [Small Plastic Torch](https://polyhaven.com/a/small_plastic_torch).
- License: [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/).
- Cornfields changes: simplified mesh, reduced texture resolution and GLB export;
  runtime hand placement turns the source bulb toward the player's view.

Existing first-person arms and service pistol keep the credits in
`../field/LICENSES.md` and `../field/player-viewmodel-source.json`. Roadside mist
reuses the CC0 texture credited in `../field/beacon-source.json`. Its placement,
the authored driving path and runtime hand poses are original Cornfields code.

## Cinematic character identities, 4 October 2026

`cast-clarence.glb` and `cast-stanley.glb` are separate, locally authored
adaptations of supersteve's CC0 NPC male Steve. Clarence's narrow angular jaw,
lean cheeks and slender straight nose differ geometrically from Stanley's broad
heavy jaw, fuller cheeks and rounded wide nose. Each owns its embedded 512px skin,
256px iris and matching 512px arm map. Original wardrobe map bytes are retained.
The skin maps derive from the credited CC0 atlas, with original role-specific
painting; concept artwork is not used as a runtime texture.

Local elbow silhouette and normalized skin-weight refinements retain the repaired
hands, ear UVs, 56-joint rig and all source clip samples. Original `cast.glb` stays
unchanged. Editable reconstructed Blender sources are in
`art/working/cast-distinct-v2.blend`; repeatable bounded export is in
`scripts/export-cinematic-characters.py`. The authoring file is reconstructed from
shipped GLBs, not a recovered original authoring file. Isolated render evidence
is asset inspection, not a browser screenshot or performance measurement.


## Faces and radio v1 candidate, 4 October 2026

The current `cast-clarence.glb` and `cast-stanley.glb` remain locally authored
adaptations of supersteve's CC0 NPC male Steve. They now use independently
sculpted facial planes, welded/subdivided facial loops and budgeted retopology.
Clarence has medium-dark brown skin, cropped hair and brown eyes; Stanley has a
broader older face, receding gray hair and restrained stubble. The 1K face color maps combine locally authored color/identity fields with
reprojected microdetail from the credited CC0 role atlas. Packed surface maps
are original local procedural artwork at 1K. Normal maps
are baked from editable local high-detail geometry with Blender's CPU BVH.
The 512px irises have no painted catchlight; exposed skin is matched locally.
No personal scan, outside face service or generated concept image is embedded.

Existing wardrobe image bytes, body geometry, 56-joint rigs, clip samples, base
`cast.glb`, original v2 authoring files and other game assets remain unchanged.
Sources: `art/working/prologue-faces-v3.blend` and
`scripts/export-prologue-faces-v3.py`. The authoring file contains imported final
skinned assets and separate editable retopology/high-detail sculpt collections.

`dispatch-radio.glb` is original Cornfields project artwork, created locally
with Blender. Its unbranded housing, antenna, knobs, PTT, open LCD bezel, grille
and original polymer/surface/display textures contain no downloaded asset.
Sources: `art/working/prologue-radio-v1.blend` and
`scripts/export-prologue-radio-v1.py`. Proposal concepts were direction only.

These are local candidate changes. Offline studio/CPU-pose renders do not
certify actual game lighting, continuous playtesting or measured performance.


## Local liquid-cinematic candidate additions, 4 October 2026
Original local presentation code and geometry: unbranded POLICE markings, entertainment radio, sedan trim, projector reel/stand details, anonymous analytic face, connected liquid ribbons and transition veil. Created by RKNIGHT at the project owner's direction. Existing Car Concept, cast, Poly Haven and Pixelhouse credits remain applicable and unchanged. No new external artwork or services were introduced. The Pixelhouse zombie is reused under its existing CC BY 3.0 record in assets/field/LICENSES.md.
