# Cinematic playtest voices

These are temporary synthetic performances of the CORNFIELDS prologue, generated
offline with Piper. Story by Jacob Nangle; approved fast interactive adaptation with retained, adapted, new, and user-wording
provenance is recorded in `src/prologue-script.js`.

Voice model: **en_US-libritts_r-medium**, distributed by the Rhasspy/Piper project.
[Model and model card](https://huggingface.co/rhasspy/piper-voices/tree/main/en/en_US/libritts_r/medium).
The card identifies the underlying LibriTTS-R dataset and license as **CC BY 4.0**.
[License](https://creativecommons.org/licenses/by/4.0/).

LibriTTS-R: Yuma Koizumi, Heiga Zen, Shigeki Karita, Yifan Ding, Kohei Yatabe,
Nobuyuki Morioka, Michiel Bacchiani, Yu Zhang, Wei Han and Ankur Bapna.
[Dataset and attribution](https://www.openslr.org/141/).
Original corpus recordings derive from LibriSpeech/LibriVox contributors.

Changes: newly generated scripted speech, normalization and mono MP3 compression. The fast interactive cues retain their
natural delivery rate; no tempo acceleration is applied. These fictional performances are synthetic;
the model/dataset contributors do not portray or endorse these characters.
`sources.json` records corpus voice IDs, model checksum and each output checksum.
Model weights, generation software and raw corpus recordings are not distributed
with the game. No live synthesis service or microphone is used.

Cast selection was informed by the speaker descriptions from LibriTTS-P,
Masaya Kawamura, Ryuichi Yamamoto, Yuma Shirahata, Takuya Hasumi, and Kentaro
Tachibana (Interspeech 2024), [CC BY 4.0](https://github.com/line/LibriTTS-P).
That research data is not included in the public runtime.


## Liquid-cinematic candidate audio, 4 October 2026
Original entertainment radio bed, mechanical switch click and low projector/static sound are synthesized locally by the existing Web Audio runtime. The hallucination reuses the bundled creature scream under assets/audio/LICENSES.md. By the owner's explicit decision on 4 October 2026, CAR-00 and UND-01 are intentionally subtitle-only for this candidate. No new spoken recordings were generated. They are excluded from the recorded-audio inventory and runtime fetches; all original recordings and their provenance remain unchanged. This deferral covers only those two cue IDs.


## Human Motion and Roadside v2, 5 October 2026
The short reaction horn is original local Web Audio synthesis (370/466 Hz), authored for this fictional cruiser. No sampled horn or bark recording was imported. Existing voice files remain byte-identical; the historical voice-provenance statements above are retained, not independently recertified in this outcome. CAR-00 and UND-01 remain subtitle-only. The owner approved the ordinary radio music below. No new dog bark was imported.


### Ordinary car-radio excerpt
“Cold Funk” Kevin MacLeod (incompetech.com)
Licensed under Creative Commons: By Attribution 4.0 License
https://creativecommons.org/licenses/by/4.0/
Source: https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1100499
Changes: excerpted 0:00–0:04.15, short boundary fades and volume adjustment; filtered at runtime for an in-game car radio. No artist endorsement is implied.


### Short CORNFIELDS title-reveal excerpt
“The House of Leaves” Kevin MacLeod (incompetech.com)
Licensed under Creative Commons: By Attribution 4.0 License
https://creativecommons.org/licenses/by/4.0/
Source: https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1100710
Changes: excerpted 0:22.0–0:24.2, short onset/ending fades and volume adjustment; mixed only into the brief CORNFIELDS title reveal. No artist endorsement is implied.

## Visual overhaul v3 revised excerpt (2026-10-05)

“Cold Funk” Kevin MacLeod (incompetech.com). Licensed under Creative Commons Attribution 4.0: https://creativecommons.org/licenses/by/4.0/ . Official source: https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1100499 . Revised local excerpt: 0:00–0:20, MP3 stereo 44.1 kHz 128 kbps. Trimmed for Cornfields; runtime bandpass/level treatment and a shared CAR-01 topic-start cut. Source and output hashes are in sources.json. No new speech. The earlier title excerpt is unchanged. Listening is unverified.

## Roadside dog bark — visual upgrade v3, 2026-10-05

“Dog barking mono” by Brandon Morris (uploaded by HaelDB), from https://opengameart.org/content/dog-barking-mono . Used under the offered CC0 1.0 option: https://creativecommons.org/publicdomain/zero/1.0/ . OpenGameArt permits selecting one offered license: https://opengameart.org/content/faq#q-multilicense .

Local file: `roadside-dog-bark.wav`. Original 179,848-byte mono PCM16 44.1 kHz file is unchanged, SHA-256 `bbd0f908b3514dd3bd7d2bc04dcf64f8d360a161e7f43cac5d6761e7add79451`. Runtime gain envelopes, distance attenuation, stereo panning and car lowpass are applied. No new voice, paid processing or spend. Attentive listening remains unverified.

## Realism and Liquid Sequence v1 short reaction edit, 5 October 2026

END-01.mp3 is a local edit of the existing synthetic Mike recording, with its original Piper/LibriTTS source attribution and license retained above. The earlier words were removed so the line is “Am I going crazy?” The original source hash, current output hash, edit and decoded duration are retained in sources.json. No new voice, external processing or spend.
