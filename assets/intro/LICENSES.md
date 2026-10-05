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

## Human motion and roadside v2 local candidate, 5 October 2026

`roadside-set.glb` is original Cornfields geometry: a small weathered rural house
exterior, dark porch/windows, short driveway, fictional unnumbered mailbox and
streetlight shell. It contains no interior, household identity or dog. The embedded
512px timber color map is a downsample of the already shipped Wood Planks Dirt
map by Rob Tuytel / Poly Haven, CC0: https://polyhaven.com/a/wood_planks_dirt.
All other roadside materials are original. Existing cleared-map credits remain
unchanged; the asset's mesh permission does not replace texture attribution.

`projector.glb` is original Cornfields geometry and a locally authored 512px atlas:
housing, stand with grounded feet, reel supports, feed/take-up reels, guide rollers,
threaded perforated film, film gate, vents, focus ring and lens. It imports no
external model or texture. The two reels and film use the existing story clock.

`mike-body.glb` derives only body, trouser, shoe topology and the existing skeleton
from NPC male Steve by supersteve, CC0-1.0, via the pinned Clarence source. Original
midnight-blue fictional police-uniform pockets, shoulder details, buttons and duty
belt are added locally. No real police insignia, head or duplicate visible arms is
included. Source: https://opengameart.org/content/npc-male-steve and
https://creativecommons.org/publicdomain/zero/1.0/.

The fitted dashboard receiver, wheel refinement, slow restrained cruiser lamps and
bounded driveway light are original runtime work. Existing Car Concept CC BY 4.0
credits above still apply. No audio files, voices, external services or paid assets
are added by this props work.

Editable original parts, matching cabin authoring geometry and the imported Mike
body are in `art/working/human-roadside-v2.blend`. The modular repeatable producer
is `scripts/export-human-roadside-v2.py`; exact runtime hashes and separate texture
provenance are in `human-roadside-v2-source.json`. Asset inventory and CPU studio
stills are separate from browser QA, measured performance and owner acceptance.

## Visual overhaul v3 local candidate 2026-10-05

The revised Mike and Clarence assets reuse the existing NPC male Steve by supersteve, CC0-1.0, source https://opengameart.org/content/npc-male-steve . New cotton/skin fitting, navy uniform panels, fictional insignia and restrained face/material refinements are original project adaptations. Stanley is unchanged. The Level 1 house keeps the already-cleared Rob Tuytel / Poly Haven weathered timber maps under CC0 and adds original recessed apertures, porch lantern and graded drive geometry.

roadside-dog-v1.glb is original locally authored Blender geometry and vertex colors, with no external dog mesh or texture source. The collar/tether and sampled idle/bark mouth movement are original. A bark sound is not included pending approval. No new asset service, model installation, external AI or spending was used. Current hashes and historical provenance are recorded separately in human-roadside-v2-source.json and art/visual-overhaul-v3-sources.json.
