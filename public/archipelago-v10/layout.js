// World layout: every fixed position in the archipelago lives here.
export const D2R = Math.PI / 180;
export const pol = (deg, r, cx = 0, cz = 0) => ({ x: cx + Math.sin(deg * D2R) * r, z: cz + Math.cos(deg * D2R) * r });

export const RR = 125;
export const SEABED = -7;
export const EXTENT = 200;
export const DAY_LENGTH = 1200; // seconds of play until full night

const c1 = pol(72, RR), c2 = pol(144, RR), c3 = pol(216, RR);
export const ISLANDS = [
  { id: 0, x: 0, z: RR, R: 42, H: 4.2 }, // village
  { id: 1, x: c1.x, z: c1.z, R: 34, H: 6.0 }, // monolith ring
  { id: 2, x: c2.x, z: c2.z, R: 57, H: 8.5 }, // forest + wreck
  { id: 3, x: c3.x, z: c3.z, R: 55, H: 5.5 }, // peak + observatory
  { id: 4, x: 0, z: 0, R: 30, H: 5.0 }, // great lighthouse
];

// Water level for each count of lit beacons.
export const TIDE = [2.4, 1.8, 1.2, 0.6, 0.0, -0.35];
export const WADE = 0.3;

// beacon bearings from the lighthouse are exact multiples of 36 degrees
export const BEACON_BEARING = [0, 72, 144, 216];
export const BEACONS = [pol(0, 100), pol(72, 107), pol(144, 107), pol(216, 116), { x: 0, z: 0 }];

function causeway(a, b, top) {
  const A = ISLANDS[a], B = ISLANDS[b];
  const dx = B.x - A.x, dz = B.z - A.z, L = Math.hypot(dx, dz);
  const ux = dx / L, uz = dz / L;
  const s = A.R * 0.6, e = L - B.R * 0.6;
  return { a, b, top, x0: A.x + ux * s, z0: A.z + uz * s, ux, uz, len: e - s, hw: 2.2 };
}
export const CAUSEWAYS = [
  causeway(0, 1, TIDE[1] + 0.25),
  causeway(1, 2, TIDE[2] + 0.25),
  causeway(2, 3, TIDE[3] + 0.25),
  causeway(3, 4, TIDE[4] + 0.25),
];

// ---------------- Village ----------------
const V = ISLANDS[0];
export const DECK_H = 3.4;
export const COLORS = ['#c8352a', '#e8b52e', '#2f9e78', '#2f6cc0', '#f2ece0', '#8a4cb4'];
// house -> colour index
const HOUSE_COLOR = [3, 1, 5, 0, 4, 2];
export const HOUSES = [30, 80, 160, 215, 265, 320].map((ang, i) => {
  const p = pol(ang, 34, V.x, V.z);
  const yaw = Math.atan2(V.x - p.x, V.z - p.z);
  return { i, ang, x: p.x, z: p.z, yaw, color: HOUSE_COLOR[i] };
});
// order of colours on the tide pole, bottom to top
export const VILLAGE_SEQ = [3, 0, 4, 3, 1, 2];
export const TOTEM = { x: V.x + 2, z: V.z + 1 };
export const VTUT = { x: V.x + 6, z: V.z - 19 }; // little bell rack beside the beacon
export const VTUT_COLORS = [4, 0, 3]; // bells on the rack, left to right
export const VTUT_SEQ = [0, 3, 4];
export const PLAYER_START = { x: V.x, z: V.z + 14, yaw: Math.PI };

function local(x, z, yaw, lx, lz) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return { x: x + lx * c + lz * s, z: z - lx * s + lz * c };
}
export { local as localToWorld };

export const DECKS = [];
for (const h of HOUSES) {
  DECKS.push({ x: h.x, z: h.z, yaw: h.yaw, hx: 3.6, hz: 3.6, h: DECK_H });
  const w = local(h.x, h.z, h.yaw, 0, 10);
  DECKS.push({ x: w.x, z: w.z, yaw: h.yaw, hx: 1.25, hz: 6.6, h: DECK_H });
}

// ---------------- Monolith ring ----------------
const M = ISLANDS[1];
export const RING_C = { x: M.x + 4, z: M.z + 2 };
export const RING_R = 7.5;
export const RTUT = { x: M.x - 11, z: M.z + 11 };

// ---------------- Forest + wreck ----------------
const F = ISLANDS[2];
const FL = (lx, lz) => ({ x: F.x + lx, z: F.z + lz });
export const WRECK = {
  lamp: FL(6, -8),
  mirrors: [FL(20, 2), FL(6, 16), FL(-6, 2)],
  target: null, // beacon plate, filled below
  stern: FL(19, -21),
  tutLamp: FL(-1, -12),
  tutMirror: FL(-6, -19),
  tutTarget: FL(2, -24),
  clearing: FL(9, -14),
};
export const FOREST_PATHS = [
  [pol(18, 46, F.x, F.z), FL(10, 30), FL(6, 16), FL(3, 5), FL(8, -4), FL(9, -14)],
  [FL(3, 5), FL(-6, 2), FL(BEACONS[2].x - F.x, BEACONS[2].z - F.z)],
  [FL(-6, 2), FL(-22, -2), pol(270, 48, F.x, F.z)],
  [FL(9, -14), FL(-1, -12), FL(-6, -19)],
];

// ---------------- Peak + observatory ----------------
const P = ISLANDS[3];
export const PEAK_TOP = 44;
export const PLAT_R = 13;
export const MT_R = 46;
const PL = (lx, lz) => ({ x: P.x + lx, z: P.z + lz });
export const OBS = {
  center: PL(-3, -1),
  floorR: 5.5,
  dome: PL(-9, 6.5),
  slab: PL(-4.5, 10.2),
  tut: PL(5, -6),
};
export function mountainH(d) {
  if (d <= PLAT_R) return PEAK_TOP;
  if (d >= MT_R) return -50;
  const t = (d - PLAT_R) / (MT_R - PLAT_R);
  return PEAK_TOP * (1 - Math.pow(t, 1.3));
}
function mountainR(h) {
  return PLAT_R + (MT_R - PLAT_R) * Math.pow(Math.max(0, 1 - h / PEAK_TOP), 1 / 1.3);
}
// switchback trail up the east face: legs along the contour, joined by flat-ish hairpin turns
export const TRAIL = (() => {
  const pts = [];
  const A0 = 100, A1 = 168, g = 0.19;
  const span = (A1 - A0) * D2R;
  const push = (a, r, h) => pts.push({ ...pol(a, r, P.x, P.z), h, a, r });
  // lead-in from the shore ring
  push(A0 - 5, 47, 2.6);
  let h = 4.2, a = A0, dir = 1;
  const legR = (hs, extra) => {
    let r = 40;
    for (let i = 0; i < 20; i++) r = mountainR(Math.min(PEAK_TOP, hs + extra + (r * span * g) / 2));
    return r;
  };
  let r = legR(h, 0);
  push(a, r, h);
  for (let leg = 0; leg < 12; leg++) {
    // walk the leg at constant radius
    const L = r * span;
    const n = Math.max(4, Math.ceil(L / 1.5));
    for (let i = 1; i <= n; i++) {
      a += (dir * (A1 - A0)) / n;
      h += (g * L) / n;
      push(a, r, h);
    }
    // next leg radius
    let rn = r;
    for (let i = 0; i < 20; i++) {
      const turnLen = (Math.PI * (r - rn)) / 2;
      rn = legR(h, turnLen * g);
    }
    if (rn < PLAT_R + 3 || h > PEAK_TOP - 4) break;
    // hairpin: a half circle bulging past the end of the leg
    const rho = (r - rn) / 2, rc = (r + rn) / 2;
    const C = pol(a, rc, P.x, P.z);
    const U = { x: Math.sin(a * D2R), z: Math.cos(a * D2R) };
    const T = { x: Math.cos(a * D2R) * dir, z: -Math.sin(a * D2R) * dir };
    const turnLen = Math.PI * rho;
    const m = Math.max(6, Math.ceil(turnLen / 1.2));
    for (let i = 1; i <= m; i++) {
      const th = (i / m) * Math.PI;
      const x = C.x + U.x * rho * Math.cos(th) + T.x * rho * Math.sin(th);
      const z = C.z + U.z * rho * Math.cos(th) + T.z * rho * Math.sin(th);
      h += (g * turnLen) / m;
      const dx = x - P.x, dz = z - P.z;
      pts.push({ x, z, h, a: Math.atan2(dx, dz) / D2R, r: Math.hypot(dx, dz) });
    }
    r = rn;
    dir = -dir;
  }
  // final climb straight onto the summit
  const last = pts[pts.length - 1];
  const steps = Math.ceil((last.r - (PLAT_R - 3)) / 1.2);
  for (let i = 1; i <= steps; i++) {
    const rr = last.r - ((last.r - (PLAT_R - 3)) * i) / steps;
    push(a, rr, Math.min(PEAK_TOP, last.h + ((PEAK_TOP - last.h) * Math.min(1, (last.r - rr) / Math.max(1, last.r - PLAT_R)))));
  }
  return pts;
})();

// ---------------- Lighthouse ----------------
export const LH = {
  terraceH: 5.2,
  terraceR: 13.5,
  doorBearing: 216,
  prismBearings: [20, 100, 160, 300],
  prismR: 10,
  lever: pol(198, 7.2),
  brazier: pol(216, 6.4),
  tutPrism: pol(246, 9.6),
  tutLamp: pol(256, 11.2),
  tutLever: pol(236, 10.6),
  topY: 0, // set at build
};

// ---------------- Flattened areas ----------------
// h: null means "use the natural height at the centre"
export const FLATS = [
  { x: V.x, z: V.z, r: 10, blend: 5, h: 4.2, surf: 4 },
  { x: BEACONS[0].x, z: BEACONS[0].z, r: 4, blend: 3, h: 3.35, surf: 2 },
  { x: VTUT.x, z: VTUT.z, r: 2.5, blend: 2.5, h: null, surf: 4 },
  { x: RING_C.x, z: RING_C.z, r: 11, blend: 5, h: null, surf: 1 },
  { x: BEACONS[1].x, z: BEACONS[1].z, r: 3.5, blend: 3, h: null, surf: 2 },
  { x: WRECK.clearing.x, z: WRECK.clearing.z, r: 13, blend: 6, h: null, surf: null },
  { x: BEACONS[2].x, z: BEACONS[2].z, r: 3.5, blend: 3, h: null, surf: 2 },
  { x: OBS.center.x, z: OBS.center.z, r: OBS.floorR, blend: 0.6, h: PEAK_TOP, surf: 2 },
  { x: 0, z: 0, r: LH.terraceR, blend: 4, h: LH.terraceH, surf: 2 },
];

export const SURF = { SAND: 0, GRASS: 1, STONE: 2, WOOD: 3, DIRT: 4 };

export function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const qx = ax + dx * t - px, qz = az + dz * t - pz;
  return { d: Math.sqrt(qx * qx + qz * qz), t };
}
export function polyDist(px, pz, pts) {
  let best = 1e9;
  for (let i = 0; i < pts.length - 1; i++) {
    const r = segDist(px, pz, pts[i].x, pts[i].z, pts[i + 1].x, pts[i + 1].z);
    if (r.d < best) best = r.d;
  }
  return best;
}
