# Five Lights

A small browser game: a drowned archipelago at golden hour. You are a
lighthouse keeper's apprentice, relighting five dead beacons before nightfall.
Each lit beacon lowers the tide and brings a new stone causeway to the surface.

Play it at `/archipelago/index.html` when the app is running, or serve this
folder with any static server (`python3 -m http.server`). It has no build step
and no network dependencies: Three.js r170 is vendored (`three.module.min.js`,
MIT, see `THREE_LICENSE`) and all sound is synthesized with WebAudio.

- **Touch:** drag on the left half to walk, drag on the right half to look,
  tap the glowing button to interact.
- **Keyboard/mouse:** WASD or arrow keys to walk, drag to look, scroll to
  zoom, E, Space or Enter to interact.

The sun sets in real time over 20 minutes. Progress saves to `localStorage`.

| File | Contents |
| --- | --- |
| `world.js` | Terrain height, tide levels, causeways, walkable decks, colliders |
| `env.js` | Sky, clouds, sea shader, terrain mesh, the golden-hour-to-night palette, toon/outline helpers |
| `props.js` | The five landmarks and their puzzles, beacons, scatter, gulls, boats |
| `audio.js` | Synthesized sea, wind, stone hum, bells and pad |
| `game.js` | Renderer, player, input, camera, beacon/tide sequencing, save |
