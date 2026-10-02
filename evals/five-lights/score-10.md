# Output 10 — score

Built by a fresh agent from Prompt 10; published at
https://claude.ai/artifact/Pm2aiv5nWS29hnfNLncHkN. I graded it myself from
the code and the builder's report, not from playing it. It has never run on a
GPU.

Process note: the builder ran headless Node geometry and logic checks in a
scratch copy and said so.

| Requirement | | Note |
|---|---|---|
| Core brief | ✅ | Summit reachable only by the trail |
| Every landmark teaches first | ✅ | Tutorials are optional and gate nothing |
| Ring: thousands of arrangements, ≥8 presses from solved | ✅ | 7 stones × 4 pitches = 16,384; starts 9 presses away |
| Guessing slower than reading | ✅ | Locks and cooldowns on every wrong answer; lighthouse prisms start on empty sea |
| Shipwreck, observatory, village, two clues | ✅ | |
| No hidden inputs, hint behaviour | ✅ | |
| Lantern cel flame | ✅ | |
| World, finale, closing card | ✅ | |
| Shadows | ⚠️ | Terrain receives but doesn't cast shadows, so the peak throws no golden-hour shadow |
| Camera, controller, glyphs, positional sound | ✅ | |
| Sound from either device | ⚠️ | Browser limit, as before |
| Budgets | ⚠️ | Estimated, not measured |
| Save, single-press resume, wordless readout, naming, no debug code | ✅ | Controller Menu button also pauses |

| Sub-score | |
|---|---|
| Atmosphere | 8.5 |
| Meeting the brief | 9 |
| Puzzle depth | 9 |
| Polish | 9 |
| Controls | 8.5 |
| **Overall** | **9 / 10** |

## Improvements for Prompt 11 (most important first)

1. Terrain casts shadows too, so the peak and islands throw long golden-hour shadows, using a low-detail shadow copy to stay in budget.
2. A wordless built-in benchmark: holding a key flies a fixed camera path over every island and shows the average frame rate, so the budget can be checked on any machine.
