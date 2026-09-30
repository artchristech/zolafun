# Output 3 — score

Built by a fresh agent from Prompt 3 (the third attempt: the first stopped on
the weekly usage limit and the second was lost to a container restart; both
partial folders were deleted before restarting). Published at
https://claude.ai/artifact/AWamupBGFWz9X1L6HmAxAa. I graded it myself from
the code and the builder's report, not from playing it. It has never run on a
GPU.

Process note: as in round 1, the builder stayed out of the browser but ran
Node scripts that built the world, walked the player and pressed every
interactable.

| Requirement | | Note |
|---|---|---|
| Core brief | ✅ | All landmarks, tide and causeways (0.6 m under, 0.3 m over) |
| Puzzles readable, not brute-forceable | ⚠️ | Shipwreck, village, observatory, lighthouse are readable; the ring is a symbol match copied from a key slab, readable but shallow |
| Shipwreck: multi-step, carved positions, no sweeping | ✅ | Lamp, then 3 mirrors × 3 carved positions; beam only when all set |
| Observatory aim marked | ✅ | Floor line and sighting ring |
| Village sequence shows progress, wrong step resets | ✅ | Pole bands light; wrong house snuffs all |
| No hidden inputs | ✅ | Hold-to-crank shows motion while held |
| Idle hint | ⚠️ | Works, but in the ring and village it gives away part of the answer |
| Switchback trail | ✅ | Hairpins smoothed so every leg is walkable |
| Toppled observatory | ✅ | |
| Hard-edged lighthouse bands | ✅ | |
| Cel fire with embers | ✅ | |
| Walk, idle, lantern raise | ✅ | |
| Night fog closes in | ✅ | |
| Finale links and boats | ✅ | |
| Shadows, bloom, dense forest with paths | ✅ | 1,245 trees, 7 m paths, 23k grass tufts; swaying foliage casts still shadows |
| Pointer lock, WASD, E | ✅ | |
| Camera never clips | ⚠️ | Avoids terrain and buildings, not trees |
| Controller, vibration, glyphs | ✅ | |
| Sound from either device | ✅ | A and click glyphs; fades in on first click or key, no warning |
| Gentle causeway edges | ✅ | |
| Footsteps, waves, gulls | ✅ | |
| ≤300k triangles on screen, ≤4 point lights | ⚠️ | 431k total, estimated under 300k on screen; not measured |
| Shaders precompile on title | ✅ | |
| Save and FPS toggle | ✅ | No way to reset progress |

| Sub-score | |
|---|---|
| Atmosphere | 8 |
| Meeting the brief | 9 |
| Puzzle depth | 7.5 |
| Polish | 7.5 |
| Controls | 8.5 |
| **Overall** | **8.5 / 10** |

## Improvements for Prompt 4 (most important first)

1. The monolith puzzle uses the hum: its rule is heard and seen together, never a symbol copied from a key.
2. At least one puzzle combines two clues found in different places.
3. The idle hint points to the next place to go, never to the next answer.
4. The camera also avoids trees: trunks push it in, canopies fade when between camera and player.
5. A wordless way to start over from the title (a held glyph).
6. Foliage shadows move with the foliage, or foliage casts none.
7. The frame-rate readout also shows triangles on screen, draw calls and active lights, so the budget can be checked.
