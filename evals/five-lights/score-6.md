# Output 6 — score

Built by a fresh agent from Prompt 6; published at
https://claude.ai/artifact/4GAzyF8rgnP6K2FYSjj9jn. I graded it myself from
the code and the builder's report, not from playing it. It has never run on a
GPU.

Process note: the builder built the scene graph in Node, stepped it for 60
frames and checked layout maths, and said so.

| Requirement | | Note |
|---|---|---|
| Core brief | ✅ | Each tide level opens exactly the next island |
| Guessing slower than reading | ✅ | Village 120 orders + 4 s lock; observatory 72 settings × 4.5 s; lighthouse levers × 7 s |
| Shipwreck multi-step, no sweeping | ✅ | Lamp, 3 mirrors × 4 notches, a decoy mirror, burnt-line route |
| Observatory two clues | ✅ | Floor inlay for bearing, gilded notch by the dome for elevation |
| Village order read elsewhere, progress and reset | ✅ | Buoys on a drying rack, anchor marks the start |
| Monoliths: hum, linked | ⚠️ | Linked and heard, but starts only 5 presses from solved |
| No hidden inputs | ✅ | |
| Hint waits during puzzles | ✅ | 16 s still, nothing touched in 30 s; marks landmarks only |
| Opening view, trail, observatory, bands, fire, animations, night, finale | ✅ | Gentlest trail and causeway ramps so far (≤0.33 grade) |
| Look and foliage shadows | ✅ | Grass casts none; tree shadows sway |
| Camera, controller, glyphs | ✅ | |
| Sound from either device | ⚠️ | Browser limit, as before |
| Positional sound | ✅ | Panners with distance fall-off |
| ≤300 draw calls | ⚠️ | Probably near the limit; the apprentice alone is ~28 meshes |
| Save, restart, readout, naming, no debug code | ✅ | |
| Ending | ⚠️ | Finale plays, then no closing moment |

| Sub-score | |
|---|---|
| Atmosphere | 8 |
| Meeting the brief | 9 |
| Puzzle depth | 8.5 |
| Polish | 8 |
| Controls | 8.5 |
| **Overall** | **8.5 / 10** |

## Improvements for Prompt 7 (most important first)

1. Each landmark teaches its rule first: a small, simple version of its puzzle sits beside the real one, as in The Witness.
2. Puzzles start far from solved, and no answer can be reached by repeating one action.
3. The apprentice and repeated props are merged meshes, so a character costs a draw call or two.
4. After the finale, a wordless closing moment (the five lights, the play time in numerals) before the world opens again.
