# Audio sources

- Footsteps: **Fantozzi** (sliced and shared by qubodup), [Fantozzi's Footsteps (Grass/Sand & Stone)](https://opengameart.org/content/fantozzis-footsteps-grasssand-stone), [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). Twelve SandL/R and StoneL/R recordings converted to mono 44.1 kHz MP3 at 96 kbps, peak adjusted, edge silence trimmed and a 2 ms attack fade applied. Runtime files and processing hashes: `footsteps/sources.json`. Both gameplay and cinematic use the same recordings; wet steps layer the existing rubberduck splashes.

Runtime recordings are hosted locally with the game. Creature and weather recordings are CC0-1.0; the pistol recording uses CC BY 3.0 as noted below.

- Pistol shot: **Michel Baradari**, [Chaingun, pistol, rifle, shotgun shots](https://opengameart.org/content/chaingun-pistol-rifle-shotgun-shots), [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). Original `shots/pistol.wav`. Converted to mono PCM16 at 44.1 kHz, trimmed to 0.9 seconds and faded out over the last 0.1 seconds. Runtime: `pistol-shot.wav`. See `weapon-source.json` for source and runtime hashes. Original credit: Sounds (c) by Michel Baradari, apollo-music.de.

- Creature vocals: artisticdude, [Zombies Sound Pack](https://opengameart.org/content/zombies-sound-pack). See `sources.json` for original filenames and hashes.
- Stalking growl: Joseph SARDIN, [Zombie #6](https://bigsoundbank.com/zombie-6-s2111.html), CC0 1.0. Attack roars: Darsycho, [Big scary troll sounds](https://opengameart.org/content/big-scary-troll-sounds), CC0 1.0. Selected phrases, filtered and faded, mono 44.1 kHz MP3 at 96 kbps. See `creature-sources.json` for exact trims, processing and hashes. Runtime pitch varies modestly; previous vocals remain as fallback and pain responses.
- Rain: Ylmir, [Rain (loopable)](https://opengameart.org/content/rain-loopable), original `2.mp3`.
- Thunder: rubberduck, [100 CC0 SFX #2](https://opengameart.org/content/100-cc0-sfx-2), original `sfx100v2_thunder_01.ogg`.
- Splashes: rubberduck, [40 CC0 water / splash / slime SFX](https://opengameart.org/content/40-cc0-water-splash-slime-sfx), originals `splash_09.ogg` and `splash_10.ogg`.

Rain retains the original loopable MP3. Thunder and splashes were converted to mono 44.1 kHz, 96 kbps MP3. See `weather-sources.json` for exact provenance, processing and SHA-256 hashes. The sound mixer limits splash playback to short footstep cues.

Creature and weather license: <https://creativecommons.org/publicdomain/zero/1.0/>
