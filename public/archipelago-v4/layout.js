// Every hand-placed coordinate in the archipelago lives here so terrain,
// foliage and landmarks agree with each other.
import { D2R } from './util.js';

// Water level after n beacons are lit.
export const TIDES = [2.4, 1.6, 0.8, 0.0, -0.8, -1.6];

// Island order is also beacon order: 0 observatory, 1 monoliths, 2 shipwreck, 3 village, 4 lighthouse
export const ISL = [
  { id: 'P', x: 0, z: 0, R: 62, ph: 0.4, res: 1.25 },
  { id: 'M', x: 130, z: 60, R: 38, ph: 2.1, res: 1.6 },
  { id: 'F', x: 200, z: -70, R: 60, ph: 4.0, res: 1.6 },
  { id: 'V', x: 95, z: -175, R: 42, ph: 1.3, res: 1.6 },
  { id: 'L', x: -30, z: -150, R: 34, ph: 5.2, res: 1.6 },
];
// causeway k (1..5) links LINKS[k-1]; it surfaces when beacon k-1 is lit
export const LINKS = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 0]];
export const CAUSEWAY_BEND = [10, -12, 9, -10, 12];

export const GRID = { minX: -115, minZ: -265, maxX: 295, maxZ: 130, step: 1 };

export const START = { x: 4, z: 57, yaw: Math.PI };

// --- Observatory (peak, island P) ---
export const OBS = {
  x: 0, z: 0, plateauR: 15.5,
  wallR: 9.5,
  azSteps: 24,                 // azimuth wheel: 24 carved clicks of 15 degrees
  elAngles: [4, 10, 16, 22, 28], // elevation wheel: 5 carved clicks
  starAzIndex: 13,             // 195 degrees: where the inlay and sighting stones point
  starElIndex: 3,              // 22 degrees: the notch inlaid with a star inside the fallen dome
  azStart: 4, elStart: 0,
  dome: { x: -7.6, z: 7.9, r: 4.6 },
  brazier: { x: 5.0, z: 4.4 },
  trail: [[90, 49.5], [140, 44], [40, 38], [140, 32.5], [40, 27], [140, 21.5], [90, 15.5]],
};
OBS.starAz = OBS.starAzIndex * (360 / OBS.azSteps) * D2R;
OBS.starEl = OBS.elAngles[OBS.starElIndex] * D2R;

// --- Monolith ring (island M) ---
export const MONO = {
  x: 130, z: 60, ringR: 9, n: 5,
  harmonics: [1, 1.5, 2, 2.5, 3],
  targets: [2, 0, 4, 1, 3],
  starts: [2, 3, 1, 4, 0],
  positions: 5,
  brazier: { x: 145, z: 66 },
};

// --- Shipwreck in the forest (island F) ---
export const SHIP = {
  x: 204, z: -66, yaw: 0.12, // hull runs roughly along z
  lamp: { x: 212, z: -62 },
  // route order: lamp -> A -> B -> C -> beacon ; D is a dead end
  mirrors: [
    { id: 'A', x: 231, z: -59, start: 2 },
    { id: 'B', x: 237, z: -80, start: 1 },
    { id: 'C', x: 222, z: -95, start: 3 },
    { id: 'D', x: 246, z: -95, start: 0 },
  ],
  route: [0, 1, 2],
  beacon: { x: 205, z: -104 },
  clearing: { x: 205, z: -67, r: 14 },
};
export const FOREST_PATHS = [
  { w: 2.0, pts: [{ x: 172, z: -20 }, { x: 180, z: -32 }, { x: 189, z: -44 }, { x: 197, z: -54 }] },
  { w: 1.9, pts: [{ x: 199, z: -80 }, { x: 202, z: -92 }, { x: 205, z: -104 }] },
  { w: 2.0, pts: [{ x: 205, z: -104 }, { x: 192, z: -108 }, { x: 178, z: -109 }, { x: 160, z: -110 }] },
];

// --- Stilt village (island V) ---
export const VILLAGE = {
  x: 95, z: -175, dirX: 0, dirZ: -1, deck: 2.6, pierLen: 46, pierHW: 1.5,
  houseAlong: [9, 17, 25, 33, 41],
  sides: [1, -1, 1, -1, 1],
  bells: [3, 1, 5, 2, 4],
};

// --- Great lighthouse (island L) ---
export const LIGHT = {
  x: -30, z: -150, towerH: 26, baseR: 4.2, topR: 3.2,
  rampR0: 4.45, rampR1: 6.45, turns: 3.25, a0: 90 * D2R,
  galleryR1: 6.45, cageR: 2.6,
  ringSteps: 12,
  starts: [4, 7],
};

export const BEACON_XZ = [
  { x: OBS.brazier.x, z: OBS.brazier.z },
  { x: MONO.brazier.x, z: MONO.brazier.z },
  { x: SHIP.beacon.x, z: SHIP.beacon.z },
  null, // village: pier end, computed
  { x: LIGHT.x, z: LIGHT.z },
];
