# Output 7 — score

Built by a fresh agent from Prompt 7; published at
https://claude.ai/artifact/6xkghBhpa5rYqZooxBeDJx. I graded it myself from
the code and the builder's report, not from playing it. It has never run on a
GPU, though the builder validated all 58 generated shaders with glslang.

Process note: the builder ran headless Node checks (world build, reachability
at each tide, shader validation) and said so.

| Requirement | | Note |
|---|---|---|
| Core brief | ✅ | Wading capped at 0.15 m so islands can't be reached early |
| Each landmark teaches its rule with a small version | ⚠️ | Village (toy jetty), shipwreck (candle and two prisms), observatory (small telescope), lighthouse (four-shutter lantern); the monolith ring has none |
| Guessing slower than reading; far from solved; no single-action answers | ✅ | Wrong routes gutter the lamp; wrong shutters slam and the lever creeps back |
| Shipwreck multi-step, no sweeping | ✅ | Exactly one working route |
| Observatory two clues | ✅ | Floor inlay for azimuth, dome carving for elevation |
| Village order read elsewhere | ✅ | Sail emblems, shore to sea |
| Monoliths: hum, linked | ✅ | Collars level when tuned; the beating glow stops |
| No hidden inputs, hint behaviour | ✅ | |
| Opening view, trail, observatory, bands, fire, animations, night | ✅ | |
| Finale and wordless closing with play time | ✅ | Survives a reload mid-finale |
| Look, foliage shadows | ⚠️ | Shadow edges may shimmer while moving |
| Camera avoids terrain, buildings, trees | ⚠️ | Passes through bushes, barrels, crates and posts |
| Controller, glyphs, positional sound | ✅ | |
| Sound from either device | ⚠️ | Browser limit, as before |
| Performance budgets | ✅ | ~286k triangles even if everything were on screen |
| Save, restart, readout, naming, no debug code | ✅ | |

| Sub-score | |
|---|---|
| Atmosphere | 8.5 |
| Meeting the brief | 9 |
| Puzzle depth | 9 |
| Polish | 8.5 |
| Controls | 8.5 |
| **Overall** | **9 / 10** |

## Improvements for Prompt 8 (most important first)

1. Every landmark has its teaching version, the monolith ring included.
2. The camera never passes through anything solid: small props push it in or fade like canopies.
3. Shadows stay steady while moving: the shadow camera snaps to its texel grid.
