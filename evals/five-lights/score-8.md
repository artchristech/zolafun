# Output 8 — score

Built by a fresh agent from Prompt 8; published at
https://claude.ai/artifact/Wcoqi81xiXRq6ZHRW1wkmH. I graded it myself from
the code and the builder's report, not from playing it. It has never run on a
GPU.

Process note: the builder ran headless Node checks (world build, walking test
with the real movement code, reachability flood fill, solving every puzzle
through its interactables) and said so.

| Requirement | | Note |
|---|---|---|
| Core brief | ✅ | First causeway blocks at the starting tide, opens after one beacon |
| Every landmark teaches its rule first, ring included | ✅ | Ring teaching version needs 3 presses |
| Guessing slower than reading; far from solved; no single-action answers | ✅ | Ring start states can no longer be solved by pressing one stone |
| Shipwreck, observatory, village, monoliths, two clues | ✅ | |
| No hidden inputs, hint behaviour | ✅ | |
| Opening view, trail, observatory, bands, fire, animations, night | ✅ | Trail climb ~56 s; natural ground capped at 45°, so no shortcuts up the cliff |
| Finale and closing moment | ✅ | |
| Look, foliage shadows | ✅ | ~500 trees plus bushes |
| Steady shadows | ✅ | Shadow camera snapped to texels |
| Camera never passes through solids | ✅ | |
| Controller, glyphs, positional sound | ✅ | |
| Sound from either device | ⚠️ | Browser limit, as before |
| Budgets | ⚠️ | 236k triangles in the whole scene; draw calls estimated at 150–250, not measured |
| Save | ⚠️ | Beacons, time and position persist; half-set puzzles reset on reload |
| Wordless everywhere | ⚠️ | The stats readout uses short text labels |
| Pause | ⚠️ | Releasing pointer lock shows a click glyph but the world, and the 20-minute sun, keep running |

| Sub-score | |
|---|---|
| Atmosphere | 8.5 |
| Meeting the brief | 9 |
| Puzzle depth | 9 |
| Polish | 8.5 |
| Controls | 8.5 |
| **Overall** | **9 / 10** |

## Improvements for Prompt 9 (most important first)

1. Saving keeps half-finished puzzles exactly as the player left them.
2. The world pauses, sun and tide included, when pointer lock is released or the window loses focus; a wordless glyph resumes.
3. The stats readout uses icons and numerals, no words.
