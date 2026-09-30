# Output 2 — score

Built by a fresh agent from Prompt 2; published at
https://claude.ai/artifact/JUBC3PdnZQPhGuQU3UF1Yj. I (the orchestrating
session) graded it myself from the code and the builder's report, not from
playing it. The game has never run on a GPU, so nothing visual was seen.

Process note: the wrapper said "no playthroughs". The builder stayed out of the
browser but ran a scripted playthrough in Node with a stubbed renderer. That
likely made Output 2 more robust than a true blind one-shot.

| Requirement | | Note |
|---|---|---|
| Core brief (islands, causeways, tide, 5 landmarks, lighthouse last, 20-min sunset) | ✅ | All present |
| Puzzles readable from the world, not brute-forceable | ⚠️ | Village (fish board), monoliths (barnacle tide line), observatory (inlay + slot + carving), lighthouse (sighting tubes) are readable; shipwreck mirrors can be partly swept one at a time |
| Shipwreck takes more than one step | ✅ | Board, light stern lamp, route beam past trees with mirrors |
| Observatory aim marked in the world | ✅ | Three separate markings |
| Wordless idle hint | ✅ | Shimmer on the next target |
| Switchback trail up the peak | ✅ | Terraces joined by ramps |
| Toppled observatory reads clearly | ✅ | Fallen dome, telescope re-set |
| Hard-edged lighthouse bands | ✅ | Separate band geometry |
| Animated cel fire with embers | ✅ | |
| Walk, idle, lantern raise | ✅ | |
| Night fog closes in | ✅ | Fog range shrinks from ~700 to ~190 |
| Finale beams link, boats come home | ✅ | |
| Crisp shadows, bloom, dense trees and grass | ⚠️ | Custom bloom and shadows; forest thinned for walkability with bushes to compensate |
| WASD, pointer-lock mouse look, E | ✅ | |
| Camera never clips terrain or buildings | ✅ | Raycast against the world |
| Controller: sticks, A, vibration | ✅ | |
| Device-specific glyph prompts | ✅ | |
| Sound when starting from either device | ⚠️ | Controller-only start may stay muted until a click or key; a glyph asks for one |
| Gentle causeway edges | ✅ | Claimed by builder |
| Footsteps by surface, waves, gulls | ✅ | |
| Save and FPS toggle | ✅ | |
| No hidden mechanics (discovery without tutorials) | ❌ | Hold-to-turn, and reversing direction on each new press, is never taught |
| Runs well | ⚠️ | ~1M triangles and 8 always-on point lights; never compiled on a GPU |

| Sub-score | |
|---|---|
| Atmosphere | 8 |
| Meeting the brief | 9 |
| Puzzle depth | 7.5 |
| Polish | 6.5 |
| Controls | 7.5 |
| **Overall** | **8 / 10** |

## Improvements for Prompt 3 (most important first)

1. No hidden inputs: every mechanic is a single press with a visible result, or its motion shows while held; nothing depends on an untaught rule.
2. A performance budget: at most ~300k triangles on screen, instanced foliage, at most 4 point lights active at once (nearest beacons), 60 fps on a mid-range laptop.
3. Shaders compile during the title screen so play never hitches.
4. Shipwreck routing can't be swept: mirrors have a few carved positions and the beam only appears once the lamp is lit and the whole route is set.
5. The village bell tune shows progress: each correct bell lights its fish on the board, and a wrong bell dims them all.
6. A dense forest that stays walkable: clear paths through it, trees thick either side.
7. The controller-only start is designed around the browser rule: the title shows an A glyph and a click glyph together, and sound fades in on the first click or key without a muted warning.
