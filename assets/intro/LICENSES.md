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
