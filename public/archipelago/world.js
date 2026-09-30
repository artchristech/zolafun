// Pure world description: terrain height, walkable surfaces, colliders.
// No three.js here so it can be reasoned about (and tested) on its own.

export const BOUNDS = { min: -170, size: 340 };
export const SEAFLOOR = -9;

// Water level before any beacon is lit, then after each of the five.
export const TIDE = [2.0, 0.9, -0.3, -1.6, -2.9, -4.4];
// How deep the apprentice may wade before the sea turns them back.
export const WADE = 0.45;
export const STEP_UP = 1.0;
export const STEP_DOWN = 1.6;

export const DAY_SECONDS = 20 * 60;

const ss = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
export const smoothstep = ss;

function hash(x, z) {
  const h = Math.sin(x * 127.1 + z * 311.7) * 43758.5453123;
  return h - Math.floor(h);
}
export function noise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z);
  const xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, z) {
  return (
    noise(x, z) * 0.5 +
    noise(x * 2.03 + 5.3, z * 2.03 - 1.7) * 0.25 +
    noise(x * 4.11 - 3.1, z * 4.11 + 7.7) * 0.125
  ) / 0.875;
}

// Deterministic PRNG so every player sees the same archipelago.
export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Islands. Order is the order of the beacons.
export const ISLANDS = [
  { key: "village", x: 0, z: 62, r: 22, peak: 6, k: 1.3 },
  { key: "forest", x: -72, z: 8, r: 30, peak: 9, k: 1.2 },
  { key: "ring", x: -28, z: -62, r: 24, peak: 5, k: 0.7 },
  { key: "peak", x: 52, z: -40, r: 34, peak: 30, k: 0.85, plateau: 24, craggy: 5 },
  { key: "light", x: 84, z: 40, r: 15, peak: 5, k: 1.4 },
];

function islandH(I, x, z) {
  const dx = x - I.x, dz = z - I.z;
  const dist = Math.hypot(dx, dz);
  if (dist > I.r * 1.9) return SEAFLOOR;
  const warp = 1 + 0.2 * (fbm(x * 0.035 + I.x * 0.1, z * 0.035 + I.z * 0.1) - 0.5);
  const d = dist / (I.r * warp);
  let h = 2.6 - 7.6 * ss(0.7, 1.15, d) - 4 * ss(1.1, 1.55, d);
  h += (I.peak - 2.6) * Math.pow(1 - ss(0, 0.74, d), I.k);
  const land = 1 - ss(0.55, 0.95, d);
  h += (fbm(x * 0.13, z * 0.13) - 0.5) * 1.1 * land;
  if (I.craggy) h += (fbm(x * 0.07 + 9, z * 0.07 - 4) - 0.5) * I.craggy * ss(0.18, 0.35, d) * (1 - ss(0.6, 0.85, d));
  if (I.plateau !== undefined) {
    const p = I.plateau + (fbm(x * 0.3, z * 0.3) - 0.5) * 0.15;
    if (h > p) h = p;
  }
  return Math.max(h, SEAFLOOR);
}

export function terrainH(x, z) {
  let h = SEAFLOOR + (noise(x * 0.05, z * 0.05) - 0.5) * 1.2;
  for (const I of ISLANDS) {
    const v = islandH(I, x, z);
    if (v > h) h = v;
  }
  return h;
}

export function islandPoint(i, ang, frac) {
  const I = ISLANDS[i];
  return { x: I.x + Math.cos(ang) * I.r * frac, z: I.z + Math.sin(ang) * I.r * frac };
}

// ---------------------------------------------------------------------------
// Walkable decks: straight strips (causeways, boardwalks) and rings (gallery).
export const decks = [];
export const rings = [];
export const colliders = [];

export function addDeck(ax, az, bx, bz, hw, top, tag) {
  const d = { ax, az, bx, bz, hw, top, tag };
  const dx = bx - ax, dz = bz - az;
  d.len2 = dx * dx + dz * dz;
  decks.push(d);
  return d;
}
export function addRing(x, z, r0, r1, top) {
  const r = { x, z, r0, r1, top };
  rings.push(r);
  return r;
}
export function addCollider(x, z, r, y0 = -50, y1 = 500) {
  const c = { x, z, r, y0, y1 };
  colliders.push(c);
  return c;
}

export function onDeck(d, x, z) {
  const t = Math.max(0, Math.min(1, ((x - d.ax) * (d.bx - d.ax) + (z - d.az) * (d.bz - d.az)) / d.len2));
  const px = d.ax + (d.bx - d.ax) * t, pz = d.az + (d.bz - d.az) * t;
  return (x - px) ** 2 + (z - pz) ** 2 <= d.hw * d.hw;
}

// Highest surface under (x,z) that someone standing at refY could be on.
export function groundAt(x, z, refY = Infinity) {
  let g = terrainH(x, z);
  const lim = refY + STEP_UP;
  for (const d of decks) {
    if (d.top > g && d.top <= lim && onDeck(d, x, z)) g = d.top;
  }
  for (const r of rings) {
    if (r.top > g && r.top <= lim) {
      const q = Math.hypot(x - r.x, z - r.z);
      if (q >= r.r0 && q <= r.r1) g = r.top;
    }
  }
  return g;
}

// ---------------------------------------------------------------------------
// Causeways between consecutive islands. Each one surfaces when the beacon
// before it is lit: top sits between the tide before and after.
export const CAUSEWAY_TOPS = [1.25, 0.05, -1.25, -2.55];
export const causeways = [];
for (let i = 0; i < 4; i++) {
  const A = ISLANDS[i], B = ISLANDS[i + 1];
  const dx = B.x - A.x, dz = B.z - A.z;
  const L = Math.hypot(dx, dz);
  const ux = dx / L, uz = dz / L;
  const fa = i === 3 ? 0.62 : 0.55, fb = 0.55;
  const ax = A.x + ux * A.r * fa, az = A.z + uz * A.r * fa;
  const bx = B.x - ux * B.r * fb, bz = B.z - uz * B.r * fb;
  const top = CAUSEWAY_TOPS[i];
  const deck = addDeck(ax, az, bx, bz, 1.9, top, "causeway" + i);
  causeways.push({ i, ax, az, bx, bz, ux, uz, top, deck, mx: (ax + bx) / 2, mz: (az + bz) / 2 });
}

export function nearCauseway(x, z, pad) {
  for (const c of causeways) {
    const d = c.deck;
    const t = Math.max(0, Math.min(1, ((x - d.ax) * (d.bx - d.ax) + (z - d.az) * (d.bz - d.az)) / d.len2));
    if (Math.hypot(x - (d.ax + (d.bx - d.ax) * t), z - (d.az + (d.bz - d.az) * t)) < d.hw + pad) return true;
  }
  return false;
}

// Height the sea "sees" (terrain plus causeway stone), for shoreline foam.
export function seabedH(x, z) {
  let h = terrainH(x, z);
  for (const c of causeways) {
    if (c.top > h && onDeck(c.deck, x, z)) h = c.top - 0.05;
  }
  return h;
}

export function blockedByCollider(x, z, y, pr) {
  for (const c of colliders) {
    if (y < c.y0 || y > c.y1) continue;
    const dx = x - c.x, dz = z - c.z;
    const rr = c.r + pr;
    if (dx * dx + dz * dz < rr * rr) return c;
  }
  return null;
}
