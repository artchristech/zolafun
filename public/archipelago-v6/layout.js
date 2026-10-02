// Five Lights — world layout. All landmark coordinates live here so terrain,
// foliage and puzzles agree. North is -z. Units are metres.

export const ISLANDS = [
  { id: 0, name: 'village', x: 0, z: 22, R: 44, H: 5, bump: 0.8, wob: 0.07, seed: 1.3 },
  { id: 1, name: 'ring', x: 100, z: -45, R: 38, H: 6, bump: 0.7, wob: 0.12, seed: 2.1 },
  { id: 2, name: 'forest', x: 70, z: -150, R: 44, H: 6, bump: 0.9, wob: 0.1, seed: 3.7 },
  { id: 3, name: 'peak', x: -60, z: -155, R: 62, H: 4.5, bump: 0.6, wob: 0.07, seed: 4.4, peak: 30, coneR: 38.5, plateauR: 12.5 },
  { id: 4, name: 'lighthouse', x: 0, z: -80, R: 26, H: 7, bump: 0, wob: 0.1, seed: 5.9 },
];

// Water level after n beacons are lit; causeway k (from island k to k+1)
// surfaces when beacon k is lit.
export const WATER_LEVELS = [2.0, 1.6, 1.2, 0.8, 0.4, 0.05];
export const CAUSE_TOPS = [1.75, 1.35, 0.95, 0.55];

const at = (i, lx, lz) => ({ x: ISLANDS[i].x + lx, z: ISLANDS[i].z + lz });

export const VILLAGE = {
  start: at(0, 4, 18),
  beacon: at(0, -16, -16),
  knoll: { ...at(0, -16, -16), h: 2.6, r: 7 },
  rack: at(0, 17, 9),
  // houses: centre, door-facing direction (ry), lantern post position
  houses: [
    { c: { x: -14, z: 74.5 }, ry: 0, post: { x: -12, z: 78.4 } },
    { c: { x: -14, z: 85.5 }, ry: Math.PI, post: { x: -12, z: 81.6 } },
    { c: { x: 14, z: 74.5 }, ry: 0, post: { x: 12, z: 78.4 } },
    { c: { x: 14, z: 85.5 }, ry: Math.PI, post: { x: 12, z: 81.6 } },
    { c: { x: 0, z: 94 }, ry: Math.PI, post: { x: 2.2, z: 89.6 } },
  ],
  // door colours, readable in the world (house trim + buoys on the drying rack)
  colors: [0xd8402f, 0xf2c335, 0x2fa3a0, 0xf4efe2, 0x7d4fb0],
  order: [2, 0, 3, 1, 0, 4],
  deck: 2.75,
};

export const RING = {
  c: at(1, 0, 0),
  r: 9,
  beacon: at(1, 12, -17),
  stones: 5,
};

export const FOREST = {
  beacon: at(2, 2, -2),
  lamp: at(2, -8, -16),
  ship: { ...at(2, -17, -21), ry: 0.12 },
  mirrors: [at(2, 14, -20), at(2, 20, 6), at(2, -10, 12)],
  decoy: at(2, -22, 9),
  paths: [
    [at(2, 9, 34), at(2, 6, 20), at(2, 2, 7), at(2, 2, -2), at(2, -3, -10), at(2, -8, -14)],
    [at(2, 2, 7), at(2, -10, 6), at(2, -22, 2), at(2, -36, -1)],
  ],
};

export const PEAK = {
  c: at(3, 0, 0),
  floor: { ...at(3, -3, 0), r: 6.5 },
  dome: at(3, -2, 10.5),
  beacon: at(3, 4, -7),
  // switchback trail control points in polar form (radius, angle) about the peak
  trailPolar: [[42, -0.02], [36.5, 0.62], [31, -0.56], [26, 0.6], [21, -0.5], [16.5, 0.45], [10.5, -0.5]],
  azSteps: 12, elSteps: 6, elStepDeg: 12,
  targetAz: 8, targetEl: 3,
};

export const LIGHT = {
  c: at(4, 0, 0),
  towerH: 26,
  brazier: at(4, 0, 4.6),
  leverR: 8.2,
};

export const BEACONS = [VILLAGE.beacon, RING.beacon, FOREST.beacon, PEAK.beacon, LIGHT.c];

// bearing from the lighthouse, 0 = north (-z), clockwise, in octants
export function octantFromLighthouse(p) {
  let b = Math.atan2(p.x - LIGHT.c.x, -(p.z - LIGHT.c.z));
  if (b < 0) b += Math.PI * 2;
  return Math.round(b / (Math.PI / 4)) % 8;
}

export const BOUNDS = { x0: -180, z0: -250, size: 360 };
export const DAY_LENGTH = 1200; // seconds of real time from golden hour to night
