// World layout: every fixed coordinate of Five Lights lives here so terrain,
// foliage and landmarks agree with each other.
export const W0 = -160;          // terrain grid origin (x and z)
export const N = 321;            // grid vertices per side, 1 m spacing
export const TIDE = [2.6, 1.9, 1.2, 0.5, -0.2, -0.6]; // water level after n beacons
export const CW_TOP = [2.1, 1.4, 0.7, 0.0];           // causeway tops, k links island k -> k+1
export const CW_HALF = 2.0;
export const CW_SLOPE = 0.7;
export const BLOCK_DEPTH = 0.35;  // deeper water than this stops the apprentice

// Islands in beacon order: village, monolith ring, forest wreck, peak, lighthouse.
export const ISL = [
  { id: 'V', x: 0, z: 100, hp: 4.4, r0: 14, r1: 34, r2: 50, rough: 0.4, warp: 5, seed: 1.3 },
  { id: 'M', x: -99, z: 14, hp: 6, r0: 14, r1: 32, r2: 44, rough: 0.7, warp: 5, seed: 7.1 },
  { id: 'F', x: -50, z: -86.6, hp: 8, r0: 24, r1: 46, r2: 60, rough: 1.3, warp: 6, seed: 3.7 },
  { id: 'P', x: 70.7, z: -70.7, hp: 4.5, r0: 38, r1: 54, r2: 64, rough: 0.5, warp: 4, seed: 5.2, cone: { hp: 40, r0: 14, r1: 44 } },
  { id: 'L', x: 0, z: 0, hp: 5, r0: 12, r1: 30, r2: 42, rough: 0.3, warp: 4, seed: 9.9 },
];

// Beacons sit at exact compass bearings from the lighthouse (90, 180, 225, 315 deg)
export const BEACON_XZ = [[0, 84], [-107, 0], [-60, -60], [78.2, -78.2], [0, 0]];

export const VILLAGE = {
  c: [0, 100],
  houseAngles: [-15, 25, 60, 120, 155, 195],
  houseR: 29,
  deckY: 4.0,
  colors: [0xd9483b, 0xf2c14e, 0x5fa35a, 0x3f7cc4, 0x8a5bb5, 0xf4efe4],
  pips: [2, 6, 4, 1, 5, 3],
  bellNotes: [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5],
  teach: [-5, 103],
  teachColors: [0xd9483b, 0x3f7cc4, 0xf2c14e],
  teachPips: [2, 3, 1],
  spawn: [3, 110],
  pierZ0: 117, pierZ1: 144,
};

export const RING = { c: [-99, 14], r: 7.5, teach: [-89.5, 21.5] };

export const WRECK = {
  hull: [-50, -93], len: 17, beam: 5.4,
  lamp: [-42.6, -93],
  mirrors: [[-28, -82], [-36, -64], [-66, -70]],
  mirrorCorrect: [1, 3, 0],
  teachLamp: [-60, -103], teachMirror: [-67, -110], teachTarget: [-56, -114], teachCorrect: 2,
};

export const OBS = {
  c: [70.7, -70.7], y: 40,
  teach: [77.2, -64.2], cairn: [77.2, -59.7],
  dome: [60.7, -69.2],
  azCorrect: 3,   // 135 deg, toward the great lighthouse
  elCorrect: 3,   // 55 deg
  elAngles: [10, 25, 40, 55, 70],
};

export const LIGHT = { c: [0, 0], hut: [10.2, -4.2], lit: [10.2, -10.2], dead: [16.2, -4.2], correct: [2, 4, 5, 7] };

// Circles where grass must not grow (floors, plinths).
export const GRASS_EXCL = [
  [70.7, -70.7, 6.6], [0, 0, 5.8], [10.2, -4.2, 2.2], [77.2, -64.2, 1.6],
  ...BEACON_XZ.map(([x, z]) => [x, z, 1.8]),
];

// Walking paths (dirt) given the computed causeway endpoints cw[k] = {ax,az,bx,bz}
export function makePaths(cw) {
  return [
    // village
    [[2, 96], [0, 90], [0, 86.5]],
    [[-4, 96], [cw[0].ax, cw[0].az]],
    // ring island
    [[cw[0].bx, cw[0].bz], [-92, 19], [-97, 15]],
    [[-100, 9], [-104, 4], [-107, 1.5]],
    [[-101, 8], [cw[1].ax, cw[1].az]],
    // forest
    [[cw[1].bx, cw[1].bz], [-60.5, -62.5], [-64, -68], [-60, -79], [-52, -85]],
    [[-50, -86], [-48.5, -81.5], [-40, -81.5], [-29, -83.5], [-19, -82], [cw[2].ax, cw[2].az]],
    [[-50, -86], [-58, -87], [-62.5, -93], [-61.5, -101], [-62, -108]],
    // lighthouse island
    [[cw[3].bx, cw[3].bz], [11, -11], [4.5, -4.5]],
  ];
}
