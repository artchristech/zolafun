// Positions of every landmark, beacon and puzzle part.
import { ISL, PEAK, TRAIL_TURNS } from './terrain.js';

const V = ISL.V, M = ISL.M, F = ISL.F, L = ISL.L;
const deg = Math.PI / 180;

export const START = { x: 3, z: 21, yaw: Math.PI * 0.85 };
export const TITLE_CAM = { pos: [14, 15, 80], look: [-6, 6, 10] };

// Beacons (index 0..4). Beacon 4 is the great lighthouse lamp.
export const BEACONS = [
  { x: -18, z: 4, tower: 5.5 },
  { x: M.x - 9, z: M.z + 9, tower: 5.5 },
  { x: F.x + 14, z: F.z - 24, tower: 5.5 },
  { x: PEAK.x + 6, z: PEAK.z + 5, tower: 4.5 },
  { x: L.x, z: L.z, tower: 31.5, great: true },
];

// --- village ----------------------------------------------------------------------
export const BOARD_H = 4.1;
export const HOUSES = [];
{
  const angs = [58, 74, 90, 106, 122];
  angs.forEach((a, i) => {
    const r = a * deg;
    const dir = { x: Math.cos(r), z: Math.sin(r) };
    HOUSES.push({
      i, a: r, dir,
      x: V.x + dir.x * 38.5, z: V.z + dir.z * 38.5,
      porch: { x: V.x + dir.x * 35, z: V.z + dir.z * 35 },
      bell: { x: V.x + dir.x * 35.2 + -dir.z * 1.0, z: V.z + dir.z * 35.2 + dir.x * 1.0 },
      yaw: Math.atan2(-dir.x, -dir.z), // faces the land
    });
  });
}
export const BOARDWALK = { r: 32.5, a0: 52 * deg, a1: 128 * deg, w: 2.4 };
export const PIERS = [70 * deg, 110 * deg];
// shapes: 0 ring, 1 triangle, 2 square, 3 diamond, 4 cross
export const HOUSE_SHAPES = [2, 0, 4, 1, 3];
export const VILLAGE_ORDER = [1, 4, 0, 3, 2]; // shapes, bottom to top on the totem
export const TOTEM = { x: 7, z: 12 };
export const V_TUT = { bells: [{ x: -12.5, z: 9, shape: 0 }, { x: -9.5, z: 10.5, shape: 1 }], totem: { x: -11.6, z: 12.6 }, order: [1, 0] };

// --- monolith ring --------------------------------------------------------------
export const RING = { x: M.x, z: M.z, r: 7, n: 6 };
export const RING_TUT = { x: M.x + 9.5, z: M.z + 6.5, n: 3, dir: { x: -0.56, z: 0.83 } };

// --- shipwreck -------------------------------------------------------------------------
const c = { x: F.x, z: F.z };
export const BEAM_Y = 6.5;
export const WRECK = {
  hull: { x: c.x - 21, z: c.z + 3 },
  lamp: { x: c.x - 12, z: c.z + 4, dir: [1, 0] },
  mirrors: [
    { x: c.x + 8, z: c.z + 4 },
    { x: c.x + 8, z: c.z - 12 },
    { x: c.x - 10, z: c.z - 12 },
    { x: c.x - 10, z: c.z - 24 },
  ],
  target: { x: BEACONS[2].x, z: BEACONS[2].z },
  // mirror positions are 0..3 = yaw 0,45,90,135 degrees.
  start: [0, 2, 0, 2],
  corridors: [
    [c.x - 12, c.z + 4, c.x + 8, c.z + 4],
    [c.x + 8, c.z + 4, c.x + 8, c.z - 12],
    [c.x + 8, c.z - 12, c.x - 10, c.z - 12],
    [c.x - 10, c.z - 12, c.x - 10, c.z - 24],
    [c.x - 10, c.z - 24, c.x + 14, c.z - 24],
    // dead ends
    [c.x + 8, c.z + 4, c.x + 8, c.z + 13],
    [c.x + 8, c.z - 12, c.x + 17, c.z - 12],
    [c.x - 10, c.z - 24, c.x - 19, c.z - 24],
    // walking paths
    [c.x + 2, c.z + 30, c.x - 4, c.z + 14],
    [c.x + 8, c.z + 2, c.x + 30, c.z - 2],
    [c.x + 14, c.z - 24, c.x + 26, c.z - 6],
  ],
  deadEnds: [[c.x + 8, c.z + 14], [c.x + 18, c.z - 12], [c.x - 20, c.z - 24]],
  clearing: { x: c.x - 8, z: c.z + 4, r: 15 },
};
export const WRECK_TUT = {
  lamp: { x: c.x - 9, z: c.z + 13 },
  mirror: { x: c.x - 3, z: c.z + 13 },
  lens: { x: c.x - 3, z: c.z + 17.5 },
  start: 0,
};

// --- observatory -------------------------------------------------------------------
export const OBS = {
  x: PEAK.x - 1, z: PEAK.z + 1,
  dome: { x: PEAK.x + 6.5, z: PEAK.z - 4.5 },
  azSteps: 16, elSteps: 5,
  azAnswer: 10, elAnswer: 3,
  azStart: 3, elStart: 0,
  // the tilt carving stands in the bend of a switchback, facing the climber
  carving: (() => {
    const t = TRAIL_TURNS[1];
    const d = t.rad + 1.3;
    const x = t.cx + t.tx * d, z = t.cz + t.tz * d;
    return { x, z, yaw: Math.atan2(t.cx - x, t.cz - z) };
  })(),
};
OBS.arch = (() => { const yaw = OBS.azAnswer * (Math.PI * 2 / 16); return { x: OBS.x + Math.sin(yaw) * 9.3, z: OBS.z + Math.cos(yaw) * 9.3, yaw }; })();
export const OBS_TUT = { x: PEAK.x - 7.5, z: PEAK.z + 1.5, steps: 8, answer: 0, start: 3 };
OBS_TUT.flag = (() => { const yaw = OBS_TUT.answer * (Math.PI * 2 / 8); return { x: OBS_TUT.x + Math.sin(yaw) * 5, z: OBS_TUT.z + Math.cos(yaw) * 5 }; })();

// --- lighthouse ----------------------------------------------------------------------
export const LIGHT = {
  x: L.x, z: L.z, shutterR: 7.5, n: 8,
  door: { x: L.x + 0.565 * 3.6, z: L.z - 0.825 * 3.6, yaw: Math.atan2(0.565, -0.825) },
  lever: { x: L.x + 0.565 * 4.2 + 0.825 * 1.6, z: L.z - 0.825 * 4.2 + 0.565 * 1.6 },
};
export const LIGHT_TUT = { x: L.x + 10, z: L.z - 3, n: 4 };
LIGHT_TUT.brazier = { x: LIGHT_TUT.x, z: LIGHT_TUT.z - 6.5 };
LIGHT_TUT.lever = { x: LIGHT_TUT.x + 1.6, z: LIGHT_TUT.z + 1.4 };

// angle (atan2(dz,dx)) of shutter k
export const shutterAngle = (k, n) => (k * Math.PI * 2) / n;
