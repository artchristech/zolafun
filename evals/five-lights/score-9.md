# Output 9 — score

Built by a fresh agent from Prompt 9; published at
https://claude.ai/artifact/6WUZ7WQhMueEPmDdiAzuAG. I graded it myself from
the code and the builder's report, not from playing it. It has never run on a
GPU.

Process notes:
- The builder ran headless Node checks (world build, tide gating, trail-only
  summit, all ten puzzles pressed through, save round trip) and said so.
- One scratch copy wrote through a leftover symlink onto
  `public/archipelago-v2/three.module.min.js`. The bytes were identical, git
  shows no change to v2, and the builder reported it.

| Requirement | | Note |
|---|---|---|
| Core brief | ✅ | Summit reachable only by the trail |
| Every landmark teaches first | ✅ | Five practice puzzles beside five real ones |
| Guessing slower than reading; far from solved | ⚠️ | Ring: only 256 reachable arrangements, five presses from solved |
| Shipwreck, observatory, village, monoliths, two clues | ✅ | |
| No hidden inputs, hint behaviour | ✅ | |
| World, finale, closing moment | ✅ | A reload during the finale restores it as finished |
| Lantern | ⚠️ | Glows and lights, but no flame or embers |
| Look, steady shadows, foliage | ✅ | Moon light no longer switches on early |
| Camera | ✅ | Boardwalks now stop it too |
| Controller, glyphs, positional sound | ✅ | Apprentice is one skinned mesh |
| Sound from either device | ⚠️ | Browser limit, as before |
| Budgets | ✅ | ~162k triangles and ~156 objects before culling |
| Save with half-finished puzzles | ✅ | |
| Pause | ⚠️ | Pauses correctly, but resuming can take two clicks, and Esc doesn't resume |
| Wordless readout, naming, no debug code | ✅ | |

| Sub-score | |
|---|---|
| Atmosphere | 8.5 |
| Meeting the brief | 9 |
| Puzzle depth | 8.5 |
| Polish | 9 |
| Controls | 8.5 |
| **Overall** | **9 / 10** |

## Improvements for Prompt 10 (most important first)

1. The monolith ring is a real reasoning puzzle: thousands of reachable arrangements, starting at least eight presses from solved.
2. The apprentice's lantern has a small animated cel flame, still within the character's one or two draw calls.
3. Resuming from pause takes a single click or a single A press, which also re-locks the pointer.
