# Output 5 — score

Built by a fresh agent from Prompt 5; published at
https://claude.ai/artifact/7PHHDnZfCAGq1ukwYV9JBs. I graded it myself from
the code and the builder's report, not from playing it. It has never run on a
GPU.

Process note: as in earlier rounds, the builder drove the game's own modules
from Node scripts (reachability, puzzle logic, trail climb, finale) and said so.

| Requirement | | Note |
|---|---|---|
| Core brief | ✅ | Tide opens each island only after the previous beacon |
| Puzzles readable, not brute-forceable | ⚠️ | All readable; village (24 orders) and observatory (48 aims) can still be tried exhaustively at a time cost |
| Shipwreck multi-step, no sweeping | ✅ | Lamp, then 3 mirrors × 3 notches; flagstones show the route |
| Observatory aim marked, two clues | ✅ | Inlay + wall gap give bearing; tablet on the trail gives elevation |
| Village progress, reset with cost, order read elsewhere | ✅ | Tide-pole bands; wrong press drops the floats and locks input 4 s |
| Monoliths: hum, linked stones | ✅ | Pressing one raises its neighbours; glowing veins show the link; beats heard and seen |
| Second two-clue puzzle | ✅ | Lighthouse plinths carved with landmarks |
| No hidden inputs | ✅ | |
| Hint points to places only | ⚠️ | Can fire while the player stands still listening at the ring or reading the tablet |
| Opening frames village and first beacon | ✅ | Spawn facing set from layout |
| Trail, observatory, bands, fire, animations, night, finale | ✅ | |
| Look: shadows, bloom, dense foliage, swaying shadows handled | ✅ | Foliage casts no shadow; trunks do; canopies dither out |
| Camera never clips (terrain, buildings, trees, decks) | ✅ | |
| Controller, vibration, glyphs, gentle causeways | ✅ | |
| Sound from either device | ⚠️ | Browser limit, as before |
| Footsteps, waves, gulls | ✅ | Little spatial placement or distance fall-off |
| Performance budget | ⚠️ | ~230k triangles worst case including shadows, but ~650 meshes before culling |
| Save, restart, readout, naming | ✅ | A leftover debug export remains |

| Sub-score | |
|---|---|
| Atmosphere | 8 |
| Meeting the brief | 9 |
| Puzzle depth | 8.5 |
| Polish | 8 |
| Controls | 8.5 |
| **Overall** | **8.5 / 10** |

## Improvements for Prompt 6 (most important first)

1. A draw-call budget: at most about 300 draw calls a frame, with static scenery merged.
2. The idle hint waits while the player is at a puzzle or has interacted recently.
3. Guessing is never cheaper than reading: puzzles have enough possible answers, and wrong answers cost enough time, that trying everything takes far longer than solving.
4. Sounds come from places: gulls, waves, fire and the stones' hum are positioned in the world and fade with distance.
5. No debug code or debug exports ship.
