// World layout: islands, landmark spots, causeways, the switchback trail and forest paths.
import { lerp } from './util.js';

export const ISL = {
  V: { x: 48, z: 120, r: 36, h: 2.6 }, // fishing village (start)
  M: { x: -120, z: 40, r: 30, h: 5.2 }, // monolith ring
  O: { x: -72, z: -112, r: 56, h: 3.6 }, // observatory peak
  S: { x: 120, z: -48, r: 46, h: 3.0 }, // shipwreck forest
  L: { x: 0, z: 0, r: 22, h: 3.2 }, // great lighthouse
};
export const ORDER = ['V', 'M', 'O', 'S', 'L'];

// Tide: each lit beacon lowers the sea one step.
export const TIDE0 = 1.2;
export const TIDE_STEP = 0.45;
export const tideFor = (n) => TIDE0 - TIDE_STEP * n;

export const W = (key, lx, lz) => [ISL[key].x + lx, ISL[key].z + lz];

// Landmark spots (world xz)
export const SPOT = {
  villageSquare: W('V', 0, 0),
  beaconV: W('V', 2, 24),
  start: W('V', 5, -21),
  ring: W('M', 0, 0),
  ringTut: W('M', -14, 11),
  beaconM: W('M', -9, -13),
  summit: W('O', 0, 0),
  beaconO: W('O', 7, -7),
  clearing: W('S', 4, 4),
  beaconS: W('S', 26, -2),
  tower: W('L', 0, 0),
};

// Flattened pads: height targets blended into the terrain. mat 1 = paved stone.
export const PADS = [
  { x: SPOT.villageSquare[0], z: SPOT.villageSquare[1], r: 11, blend: 6, h: 2.85, mat: 1 },
  { x: SPOT.beaconV[0], z: SPOT.beaconV[1], r: 4.5, blend: 9, h: 5.2, mat: 1 },
  { x: ISL.V.x - 21, z: ISL.V.z + 11, r: 4.5, blend: 4, h: 2.7, mat: 0 },
  { x: SPOT.ring[0], z: SPOT.ring[1], r: 10.5, blend: 7, h: 7.2, mat: 1 },
  { x: SPOT.ringTut[0], z: SPOT.ringTut[1], r: 3.6, blend: 4, h: 6.0, mat: 1 },
  { x: SPOT.beaconM[0], z: SPOT.beaconM[1], r: 3.5, blend: 5, h: 5.8, mat: 1 },
  { x: SPOT.beaconO[0], z: SPOT.beaconO[1], r: 3.2, blend: 2, h: 40, mat: 1 },
  { x: SPOT.clearing[0], z: SPOT.clearing[1], r: 17, blend: 8, h: 3.3, mat: 0 },
  { x: SPOT.beaconS[0], z: SPOT.beaconS[1], r: 3.5, blend: 5, h: 4.0, mat: 1 },
  { x: SPOT.tower[0], z: SPOT.tower[1], r: 10, blend: 6, h: 3.6, mat: 1 },
];

// Causeway k is revealed when beacon k is lit (tide drops to tideFor(k+1)).
export const CAUSEWAY_DEFS = [
  { a: 'V', b: 'M', bend: 16 },
  { a: 'M', b: 'O', bend: -12 },
  { a: 'O', b: 'S', bend: 18 },
  { a: 'S', b: 'L', bend: -9 },
  { a: 'L', b: 'V', bend: 10 },
];
export const CAUSEWAY_HALF = 2.2;

function bez(a, c, b, t) {
  const u = 1 - t;
  return [u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]];
}

export const CAUSEWAYS = CAUSEWAY_DEFS.map((d, k) => {
  const A = ISL[d.a], B = ISL[d.b];
  const dx = B.x - A.x, dz = B.z - A.z;
  const len = Math.hypot(dx, dz);
  const ux = dx / len, uz = dz / len;
  const p0 = [A.x + ux * A.r * 0.62, A.z + uz * A.r * 0.62];
  const p2 = [B.x - ux * B.r * 0.62, B.z - uz * B.r * 0.62];
  const mid = [(p0[0] + p2[0]) / 2 - uz * d.bend, (p0[1] + p2[1]) / 2 + ux * d.bend];
  const pts = [];
  const N = 48;
  for (let i = 0; i <= N; i++) pts.push(bez(p0, mid, p2, i / N));
  const top = tideFor(k + 1) + 0.12; // 0.33 under water until its beacon is lit
  let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
  for (const p of pts) {
    minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]);
    minZ = Math.min(minZ, p[1]); maxZ = Math.max(maxZ, p[1]);
  }
  return { k, a: d.a, b: d.b, pts, top, bbox: [minX - 5, minZ - 5, maxX + 5, maxZ + 5] };
});

// Switchback trail up the observatory peak: (angle, radius, height) waypoints joined by arcs.
const TRAIL_WP = [
  [1.2, 49, 3.6],
  [0.62, 40, 9.5],
  [1.78, 34, 17],
  [0.66, 28, 24],
  [1.7, 22.5, 31],
  [0.85, 18, 36.2],
  [1.45, 13.6, 40],
];
export const TRAIL = [];
for (let i = 0; i < TRAIL_WP.length - 1; i++) {
  const [a0, r0, h0] = TRAIL_WP[i], [a1, r1, h1] = TRAIL_WP[i + 1];
  const steps = 26;
  for (let s = i === 0 ? 0 : 1; s <= steps; s++) {
    const t = s / steps;
    // ease the turns so the corners are rounded hairpins
    const a = lerp(a0, a1, t), r = lerp(r0, r1, t), h = lerp(h0, h1, t);
    TRAIL.push([ISL.O.x + Math.cos(a) * r, ISL.O.z + Math.sin(a) * r, h]);
  }
}
export const TRAIL_TURNS = TRAIL_WP.map(([a, r, h]) => [ISL.O.x + Math.cos(a) * r, ISL.O.z + Math.sin(a) * r, h]);
export const TRAIL_HALF = 1.7;

// Forest paths on the shipwreck island (local coords converted to world).
const SP = (pts) => pts.map(([x, z]) => W('S', x, z));
export const PATHS = [
  SP([[-40, -13], [-30, -10], [-22, -6], [-14, -2], [-6, 0]]), // from causeway 3 (west)
  SP([[-39, 16], [-30, 13], [-21, 10], [-12, 7]]), // to causeway 4 (west-north-west)
  SP([[14, -6], [20, -4], [26, -2]]), // to beacon
  SP([[-22, -6], [-20, -12], [-17, -15]]), // to tutorial glade
  SP([[-6, 10], [-10, 14], [-14, 12]]), // to prism E glade
  SP([[12, 14], [17, 17], [20, 18]]), // to prism D glade
];
export const PATH_HALF = 2.0;

// Sky: evening star the observatory telescope must find (azimuth index 11/16, elevation index 3/6)
export const AZ_STEPS = 16;
export const EL_STEPS = 6;
export const elAngle = (j) => ((8 + j * 9) * Math.PI) / 180;
export const azAngle = (i) => (i * Math.PI * 2) / AZ_STEPS;
export const STAR_AZ = 11;
export const STAR_EL = 3;
export const starDir = () => {
  const a = azAngle(STAR_AZ), e = elAngle(STAR_EL);
  return [Math.cos(e) * Math.cos(a), Math.sin(e), Math.cos(e) * Math.sin(a)];
};

export const DAY_LENGTH = 20 * 60; // seconds of real time from golden hour to night
