# Prompt 7

```
A drowned archipelago at golden hour: five islands linked by half-sunken stone
causeways. You're a lighthouse keeper's apprentice relighting the five dead
beacons before nightfall — each lit beacon brings the tide down and reveals a new
causeway. Landmarks: a toppled observatory on the highest peak, a ring of
barnacled monoliths that hum when you stand inside, a shipwreck beached in a
forest, a fishing village of stilt houses, the great lighthouse last. Sun sinks
in real time over 20 minutes; the world goes blue and the beacons become the
only light. Honor Myst and The Witness (discovery without text tutorials) and
Wind Waker (sea, color, silhouette). Played with keyboard and mouse or a game
controller.

Puzzles
- Every beacon is earned by a puzzle at its landmark. Each landmark first
  teaches its rule with a small, simple version of the puzzle beside the real
  one, as in The Witness. Each puzzle's rule is read from the world; none can be solved by simply trying
  every option: each has enough possible answers, and wrong answers cost
  enough time, that trying everything takes far longer than reading the
  clues. Puzzles start far from solved, and no answer can be reached by
  repeating one action. The shipwreck puzzle takes more than one step; its mirrors
  click between a few carved positions, and the beam only appears once the
  lamp is lit and the whole route is set, so it can't be swept. At the
  observatory, the direction to aim is marked in the world (an inlay, a
  sightline, a carving) so it is read, not guessed. In the village, a
  sequence puzzle shows progress: each correct step lights up in the world,
  and a wrong step visibly resets it and costs a few seconds, while the
  correct order can be read from a clue elsewhere in the village. The monolith ring's puzzle uses its
  hum: the rule is heard and seen together, never a symbol copied from a
  key. The stones are linked, so changing one shifts its neighbours and the
  ring is tuned by listening to the whole chord. At least one puzzle combines two clues found in different places.
- No hidden inputs. Every interaction is a single press with a visible
  result, or its motion is shown while the button is held. Nothing depends on
  a rule the player was never shown.
- An optional hint with no words: if the player stands still for a while, the
  next place to go shimmers. It never reveals a step of a puzzle's answer, and
  it waits while the player is at a puzzle or has interacted recently.

World
- The game opens on a view that frames the village and the first beacon,
  never a close-up of terrain.
- A readable switchback trail climbs the highest peak.
- The observatory reads clearly as a toppled observatory: a fallen dome beside
  a telescope that has been re-set on its mount.
- The great lighthouse has hard-edged red and white bands.
- Fire is animated and cel-shaded, with rising embers — never static shapes.
- The apprentice has a walk cycle, an idle animation, and raises the lantern
  when lighting something.
- Night is felt, not just seen: fog closes in, and the lantern and lit beacons
  are what the player navigates by.
- Finale: when the great lighthouse is lit, beams from all five beacons link
  across the sky, then boats with lanterns come home. A wordless closing
  moment follows (the five lights and the play time in numerals) before the
  world opens again.
- High-end desktop look: crisp shadows, a bloom glow on flames at night, dense
  trees and grass. The forest is thick, with clear walkable paths through it.
  Foliage shadows move with the foliage, or foliage casts none.

Controls
- Keyboard and mouse: WASD to walk, mouse look with pointer lock, E to
  interact. The camera is smoothed and never clips through terrain,
  buildings or trees: trunks push it in, and canopies fade when they come
  between the camera and the player.
- Controller (standard mapping, e.g. Xbox): left stick walks, right stick
  looks, A interacts. The controller vibrates when a beacon lights.
- On-screen prompts show the glyph for the device in use (E or A), with no
  words.
- Starting the game from either device produces sound. Browsers only unlock
  audio on a click or key press: the title shows the A glyph and a click glyph
  side by side, and sound fades in on the first click or key, with no muted
  warning.
- Stepping on and off causeways is gentle, never a ledge.

Sound
- Footsteps change on sand, wood and stone. Waves wash over causeways as they
  surface. Gulls call now and then. Gulls, waves, fire and the stones' hum
  come from their places in the world and fade with distance.

Performance
- Runs at 60 fps on a mid-range laptop: at most about 300k triangles on
  screen, instanced foliage, and no more than 5 point lights at once: the 4
  nearest lit beacons plus the lantern. At most about 300 draw calls a frame,
  with static scenery merged. The apprentice and repeated props are merged
  meshes, so a character costs a draw call or two.
- All shaders compile while the title screen is up, so play never hitches.

Also
- Progress saves, so a reload continues where the player left off. Holding a
  glyph on the title screen starts over, with no words.
- A key toggles a small readout of frame rate, triangles, draw calls and
  active lights, counting the shadow pass too.
- The game is called Five Lights everywhere, including the browser tab.
- No debug code or debug exports ship.
```
