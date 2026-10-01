# Output 4 — score

Built by a fresh agent from Prompt 4; published at
https://claude.ai/artifact/FduLh7zCiu49KTphbo3zNu. I graded it myself from
the code and the builder's report, not from playing it. It has never run on a
GPU.

Process note: as in earlier rounds, the builder ran Node scripts that built
the world and simulated walks and puzzle logic, and said so.

| Requirement | | Note |
|---|---|---|
| Core brief | ✅ | Every beacon opens exactly one new island |
| Puzzles readable, not brute-forceable | ⚠️ | Observatory (120 combos), ship mirrors and lighthouse (144 combos) resist trying everything; village (progress shown) and monolith collars (5 positions each, independent) can be stepped through |
| Shipwreck: multi-step, carved positions, no sweeping | ✅ | Beam hidden until lamp lit and route set |
| Observatory aim marked | ✅ | Inlay and sighting stones give bearing |
| Village progress and reset | ✅ | |
| Monoliths use the hum | ✅ | Out-of-tune stones beat, heard and seen as a flicker at the same rate |
| Two clues in different places | ✅ | Observatory: bearing on the floor, elevation carved inside the fallen dome |
| No hidden inputs | ✅ | Click-through positions |
| Idle hint points to a place, not an answer | ✅ | Marks shorelines and causeway entrances |
| Switchback trail | ✅ | Rebuilt with hairpins, within 0.2 m of the path |
| Toppled observatory, lighthouse bands, cel fire, animations | ✅ | |
| Night fog, finale links and boats | ✅ | |
| Shadows, bloom, dense forest with paths | ✅ | 820 trees |
| Camera avoids terrain, buildings, trees, decks | ✅ | Canopies fade |
| Controller, vibration, glyphs | ✅ | |
| Sound from either device | ⚠️ | Same browser limit; fades in on first click or key |
| ≤300k triangles, ≤4 point lights | ⚠️ | 38k–209k estimated on screen; the lantern takes one of the 4 light slots, so only 3 beacons light the ground |
| Shaders precompile, with a timeout | ✅ | |
| Save, hold-to-restart, stats readout | ✅ | Readout ignores the shadow pass |
| Naming | ⚠️ | Browser tab says "Five Beacons" |

| Sub-score | |
|---|---|
| Atmosphere | 8 |
| Meeting the brief | 9 |
| Puzzle depth | 8 |
| Polish | 8 |
| Controls | 8.5 |
| **Overall** | **8.5 / 10** |

## Improvements for Prompt 5 (most important first)

1. The village order comes from a clue elsewhere, and a wrong step costs time, so reading is faster than guessing.
2. The monolith collars are linked: turning one shifts its neighbours, so the ring is tuned by listening to the whole chord.
3. Up to 4 beacons light the ground, plus the lantern as its own light.
4. The stats readout counts the shadow pass too.
5. The game is called Five Lights everywhere, including the browser tab.
6. The opening view frames the village and the first beacon, never a close-up of terrain.
