// World layout, height field, walkable surfaces and collision. Pure JS (no three.js).
import { clamp, lerp, smoothstep, fbm, wrapAngle, segDist } from './math.js';

export const SEA_FLOOR = -9;
export const TIDE_STEP = 1.0; // water drops this much per lit beacon
export const state = { waterY: 0 };

export const ISLANDS = {
  village: { x: -120, z: 40, R: 42, top: 2.6, tb: 0.72, tp: 0.35, seed: 1.7, shape: 0.13, bump: 0.5 },
  ring: { x: -60, z: 150, R: 38, top: 6.0, tb: 0.7, tp: 0.3, seed: 5.3, shape: 0.13, bump: 1.0 },
  forest: { x: 70, z: 140, R: 54, top: 8.0, tb: 0.74, tp: 0.34, seed: 9.1, shape: 0.13, bump: 1.4 },
  peak: { x: 165, z: -5, R: 86, top: 5.0, tb: 0.74, tp: 0.66, seed: 3.9, shape: 0.06, bump: 1.0 },
  light: { x: 60, z: -125, R: 40, top: 7.0, tb: 0.68, tp: 0.35, seed: 7.7, shape: 0.13, bump: 0.8 },
};
export const ISLAND_ORDER = ['village', 'ring', 'forest', 'peak', 'light'];

// ---- The peak: concentric terraces joined by switchback ramps ----
export const PEAK = { x: 165, z: -5 };
export const PEAK_LEVELS = [5, 14, 23, 32, 41];
export const PEAK_RADII = [48, 39, 30, 21];
export const SUMMIT_Y = 41;
const RAMP_LEN = 36;
export const RAMPS = (() => {
  const out = [];
  let a = (105 * Math.PI) / 180;
  let dir = -1;
  for (let k = 0; k < 4; k++) {
    const R = PEAK_RADII[k];
    const span = RAMP_LEN / R;
    out.push({ k, R, A: a, dir, span, len: RAMP_LEN });
    a = a + dir * span;
    dir = -dir;
  }
  return out;
})();

// ---- flatten zones and bumps ----
const FLATTEN = [
  { x: -108, z: 40, r0: 10, r1: 17, h: 2.2 }, // village square
  { x: -60, z: 150, r0: 15, r1: 23, h: 6.0 }, // monolith plateau
  { x: 70, z: 141, r0: 24, r1: 34, h: 7.5 }, // shipwreck clearing
  { x: 49, z: 146, r0: 11, r1: 18, h: 7.5 }, // the bow of the wreck
  { x: 60, z: -130, r0: 15, r1: 23, h: 7.0 }, // lighthouse headland
];
const BUMPS = [
  { x: 92, z: 146, r: 9, add: 2.2 }, // forest beacon knoll
];

// ---- key positions ----
export const BEACONS = [
  { x: -100.3, z: 36.5 }, // village
  { x: -60, z: 164 }, // monolith ring
  { x: 92, z: 146 }, // forest knoll
  { x: 177.2, z: -0.55 }, // summit
  { x: 60, z: -123.2 }, // before the lighthouse door (fuse brazier)
];
export const SPAWN = { x: -116, z: 40, yaw: -Math.PI / 2 };

function islandProfile(isl, x, z) {
  const dx = x - isl.x, dz = z - isl.z;
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d > isl.R * 1.5) return -99;
  const n = fbm(x * 0.017 + isl.seed, z * 0.017 - isl.seed, 3);
  const Re = isl.R * (1 + isl.shape * n * 1.6);
  const t = d / Re;
  let h;
  if (t >= 1.25) h = SEA_FLOOR;
  else if (t >= 1.0) h = lerp(-5.5, SEA_FLOOR, smoothstep(1.0, 1.25, t));
  else if (t >= isl.tb) {
    const s = (t - isl.tb) / (1 - isl.tb);
    h = 1.0 - 6.5 * Math.pow(s, 1.2);
  } else h = 1.0 + (isl.top - 1.0) * smoothstep(isl.tb, isl.tp, t);
  if (h > 1.2) h += fbm(x * 0.045 + 3.1, z * 0.045, 3) * isl.bump * smoothstep(1.2, 3.0, h);
  return h;
}

function peakTerraces(x, z, base) {
  const dx = x - PEAK.x, dz = z - PEAK.z;
  const r = Math.sqrt(dx * dx + dz * dz);
  if (r > 57) return base;
  let h = lerp(base, PEAK_LEVELS[0], 1 - smoothstep(51, 57, r));
  for (let k = 0; k < 4; k++) h += 9 * smoothstep(PEAK_RADII[k] + 1.2, PEAK_RADII[k] - 1.2, r);
  const th = Math.atan2(dz, dx);
  for (const rp of RAMPS) {
    const band = Math.abs(r - rp.R);
    if (band > 3.2) continue;
    const a = wrapAngle(th - rp.A) * rp.dir * rp.R;
    if (a < -3 || a > rp.len + 3) continue;
    const u = clamp(a / rp.len, 0, 1);
    const hr = lerp(PEAK_LEVELS[rp.k], PEAK_LEVELS[rp.k + 1], u);
    const w = (1 - smoothstep(2.1, 3.1, band)) * smoothstep(-2.6, -0.6, a) * (1 - smoothstep(rp.len + 0.6, rp.len + 2.6, a));
    h = lerp(h, hr, w);
  }
  return h;
}

export function terrainH(x, z) {
  let h = SEA_FLOOR + 0.8 * fbm(x * 0.01, z * 0.01, 2);
  for (const key of ISLAND_ORDER) {
    const v = islandProfile(ISLANDS[key], x, z);
    if (v > h) h = v;
  }
  h = peakTerraces(x, z, h);
  for (const f of FLATTEN) {
    const d = Math.hypot(x - f.x, z - f.z);
    if (d < f.r1) h = lerp(h, f.h, 1 - smoothstep(f.r0, f.r1, d));
  }
  for (const b of BUMPS) {
    const d = Math.hypot(x - b.x, z - b.z);
    if (d < b.r) h += b.add * smoothstep(b.r, 0, d);
  }
  return h;
}

// Is the point on one of the peak ramps (for colouring / footsteps)?
export function rampMask(x, z) {
  const dx = x - PEAK.x, dz = z - PEAK.z;
  const r = Math.sqrt(dx * dx + dz * dz);
  if (r > 52 || r < 17) return 0;
  const th = Math.atan2(dz, dx);
  let m = 0;
  for (const rp of RAMPS) {
    const band = Math.abs(r - rp.R);
    if (band > 2.4) continue;
    const a = wrapAngle(th - rp.A) * rp.dir * rp.R;
    if (a < -1.5 || a > rp.len + 1.5) continue;
    m = Math.max(m, 1 - smoothstep(1.6, 2.4, band));
  }
  return m;
}

// ---- Causeways ----
export const causeways = [];
function profileAt(cw, s) {
  const ea = 1 - smoothstep(0, 0.3, s);
  const eb = smoothstep(0.7, 1, s);
  return cw.mid + (cw.hA - cw.mid) * ea + (cw.hB - cw.mid) * eb + 0.05 * Math.sin(s * cw.len * 0.7);
}
export function causewayProfile(cw, s) { return profileAt(cw, s); }

function shorePoint(from, to) {
  const dx = to.x - from.x, dz = to.z - from.z;
  const L = Math.hypot(dx, dz);
  const ux = dx / L, uz = dz / L;
  for (let t = 0; t < L; t += 0.5) {
    const x = from.x + ux * t, z = from.z + uz * t;
    if (terrainH(x, z) < 0.9) return { x: x - ux * 2.0, z: z - uz * 2.0 };
  }
  return { x: from.x, z: from.z };
}

export function initCauseways() {
  causeways.length = 0;
  for (let k = 0; k < 5; k++) {
    const A = ISLANDS[ISLAND_ORDER[k]], B = ISLANDS[ISLAND_ORDER[(k + 1) % 5]];
    const a = shorePoint(A, B), b = shorePoint(B, A);
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const px = -(b.z - a.z) / len, pz = (b.x - a.x) / len;
    const bend = len * 0.08 * (k % 2 ? 1 : -1);
    const cx = (a.x + b.x) / 2 + px * bend, cz = (a.z + b.z) / 2 + pz * bend;
    const N = 48;
    const pts = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N, it = 1 - t;
      pts.push({ x: it * it * a.x + 2 * it * t * cx + t * t * b.x, z: it * it * a.z + 2 * it * t * cz + t * t * b.z });
    }
    let total = 0;
    const acc = [0];
    for (let i = 1; i <= N; i++) {
      total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
      acc.push(total);
    }
    const W = 4.6;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of pts) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
    }
    causeways.push({
      k, a, b, pts, acc, len: total, W,
      hA: terrainH(a.x, a.z), hB: terrainH(b.x, b.z),
      mid: -(k + 1) * TIDE_STEP + 0.3,
      box: [minX - W, maxX + W, minZ - W, maxZ + W],
    });
  }
}

// nearest point on a causeway: {d, s}
export function causewayNearest(cw, x, z) {
  let best = { d: Infinity, s: 0 };
  const pts = cw.pts;
  for (let i = 0; i < pts.length - 1; i++) {
    const r = segDist(x, z, pts[i].x, pts[i].z, pts[i + 1].x, pts[i + 1].z);
    if (r.d < best.d) {
      best.d = r.d;
      best.s = (cw.acc[i] + (cw.acc[i + 1] - cw.acc[i]) * r.t) / cw.len;
    }
  }
  return best;
}
export function causewayPoint(cw, s) {
  const target = s * cw.len;
  for (let i = 0; i < cw.pts.length - 1; i++) {
    if (cw.acc[i + 1] >= target) {
      const t = (target - cw.acc[i]) / Math.max(1e-6, cw.acc[i + 1] - cw.acc[i]);
      const p = cw.pts[i], q = cw.pts[i + 1];
      return { x: lerp(p.x, q.x, t), z: lerp(p.z, q.z, t), dx: q.x - p.x, dz: q.z - p.z };
    }
  }
  const p = cw.pts[cw.pts.length - 1];
  return { x: p.x, z: p.z, dx: 1, dz: 0 };
}

export function causewayH(x, z) {
  let h = -Infinity;
  for (const cw of causeways) {
    const b = cw.box;
    if (x < b[0] || x > b[1] || z < b[2] || z > b[3]) continue;
    const n = causewayNearest(cw, x, z);
    const half = cw.W / 2;
    if (n.d > half + 1.0) continue;
    let v = profileAt(cw, n.s);
    if (n.d > half) v -= (n.d - half) * 8;
    if (v > h) h = v;
  }
  return h;
}

// ---- Platforms (boardwalks, decks): oriented boxes with a sloped top ----
export const platforms = [];
export function addPlatform(p) {
  p.c = Math.cos(p.rot || 0);
  p.s = Math.sin(p.rot || 0);
  p.bound = Math.hypot(p.hx, p.hz) + 0.1;
  if (p.y1 === undefined) p.y1 = p.y0;
  platforms.push(p);
  return p;
}
function platformAt(x, z) {
  let best = null, bh = -Infinity;
  for (const p of platforms) {
    const dx = x - p.x, dz = z - p.z;
    if (Math.abs(dx) > p.bound || Math.abs(dz) > p.bound) continue;
    const lx = dx * p.c + dz * p.s, lz = -dx * p.s + dz * p.c;
    if (Math.abs(lx) > p.hx || Math.abs(lz) > p.hz) continue;
    const h = lerp(p.y0, p.y1, (lx + p.hx) / (2 * p.hx));
    if (h > bh) { bh = h; best = p; }
  }
  return best ? { h: bh, p: best } : null;
}

export function groundH(x, z) {
  let h = terrainH(x, z);
  const c = causewayH(x, z);
  if (c > h) h = c;
  const p = platformAt(x, z);
  if (p && p.h > h) h = p.h;
  return h;
}
// height used for the water shader (no platforms)
export function seabedH(x, z) {
  const h = terrainH(x, z);
  const c = causewayH(x, z);
  return c > h ? c : h;
}

export function surfaceAt(x, z) {
  const t = terrainH(x, z);
  const p = platformAt(x, z);
  if (p && p.h >= t - 0.05) return p.p.surface || 'wood';
  const c = causewayH(x, z);
  if (c >= t - 0.05) return 'stone';
  if (rampMask(x, z) > 0.4) return 'stone';
  const dp = Math.hypot(x - PEAK.x, z - PEAK.z);
  if (dp < 50 && t > 8) return 'stone';
  if (Math.hypot(x + 60, z - 150) < 13) return 'stone';
  if (t < 1.8) return 'sand';
  return 'grass';
}

// ---- Colliders ----
const CELL = 8;
const grid = new Map();
export const colliders = [];
function cellKey(ix, iz) { return ix * 73856093 ^ iz * 19349663; }
function insertCollider(c) {
  const r = c.type === 'c' ? c.r : Math.hypot(c.hx, c.hz);
  const x0 = Math.floor((c.x - r) / CELL), x1 = Math.floor((c.x + r) / CELL);
  const z0 = Math.floor((c.z - r) / CELL), z1 = Math.floor((c.z + r) / CELL);
  for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) {
    const k = cellKey(i, j);
    let arr = grid.get(k);
    if (!arr) grid.set(k, (arr = []));
    arr.push(c);
  }
}
export function addCircle(x, z, r, y0, y1, opts = {}) {
  const c = { type: 'c', x, z, r, y0, y1, block: opts.block !== false, cam: !!opts.cam, tree: !!opts.tree };
  colliders.push(c);
  insertCollider(c);
  return c;
}
export function addBox(x, z, hx, hz, rot, y0, y1, opts = {}) {
  const c = { type: 'b', x, z, hx, hz, rot, c: Math.cos(rot), s: Math.sin(rot), y0, y1, block: opts.block !== false, cam: !!opts.cam };
  colliders.push(c);
  insertCollider(c);
  return c;
}
function nearby(x0, z0, x1, z1, out) {
  out.length = 0;
  const seen = new Set();
  const ix0 = Math.floor(Math.min(x0, x1) / CELL), ix1 = Math.floor(Math.max(x0, x1) / CELL);
  const iz0 = Math.floor(Math.min(z0, z1) / CELL), iz1 = Math.floor(Math.max(z0, z1) / CELL);
  for (let i = ix0; i <= ix1; i++) for (let j = iz0; j <= iz1; j++) {
    const arr = grid.get(cellKey(i, j));
    if (!arr) continue;
    for (const c of arr) if (!seen.has(c)) { seen.add(c); out.push(c); }
  }
  return out;
}
const tmpList = [];

export function resolveCollisions(pos, radius, feetY, height) {
  for (let it = 0; it < 3; it++) {
    nearby(pos.x - 2, pos.z - 2, pos.x + 2, pos.z + 2, tmpList);
    let moved = false;
    for (const c of tmpList) {
      if (!c.block) continue;
      if (feetY + 0.4 > c.y1 || feetY + height < c.y0) continue;
      if (c.type === 'c') {
        const dx = pos.x - c.x, dz = pos.z - c.z;
        const d = Math.sqrt(dx * dx + dz * dz), m = c.r + radius;
        if (d < m) {
          if (d < 1e-5) { pos.x += m; continue; }
          pos.x += (dx / d) * (m - d);
          pos.z += (dz / d) * (m - d);
          moved = true;
        }
      } else {
        const dx = pos.x - c.x, dz = pos.z - c.z;
        const lx = dx * c.c + dz * c.s, lz = -dx * c.s + dz * c.c;
        const cx = clamp(lx, -c.hx, c.hx), cz = clamp(lz, -c.hz, c.hz);
        let px = lx - cx, pz = lz - cz;
        const d2 = px * px + pz * pz;
        if (d2 >= radius * radius) continue;
        let plx, plz;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          plx = (px / d) * (radius - d);
          plz = (pz / d) * (radius - d);
        } else {
          const penX = c.hx - Math.abs(lx) + radius, penZ = c.hz - Math.abs(lz) + radius;
          if (penX < penZ) { plx = Math.sign(lx || 1) * penX; plz = 0; }
          else { plx = 0; plz = Math.sign(lz || 1) * penZ; }
        }
        pos.x += plx * c.c - plz * c.s;
        pos.z += plx * c.s + plz * c.c;
        moved = true;
      }
    }
    if (!moved) break;
  }
}

// Ray test for the camera. Returns distance to first hit (or maxT).
export function cameraRay(ox, oy, oz, dx, dy, dz, maxT) {
  let best = maxT;
  nearby(ox, oz, ox + dx * maxT, oz + dz * maxT, tmpList);
  for (const c of tmpList) {
    if (!c.cam) continue;
    let t = Infinity;
    if (c.type === 'c') {
      const fx = ox - c.x, fz = oz - c.z;
      const a = dx * dx + dz * dz;
      if (a < 1e-8) continue;
      const b = 2 * (fx * dx + fz * dz);
      const cc = fx * fx + fz * fz - c.r * c.r;
      if (cc < 0) continue; // inside
      const disc = b * b - 4 * a * cc;
      if (disc < 0) continue;
      t = (-b - Math.sqrt(disc)) / (2 * a);
    } else {
      const rx = ox - c.x, rz = oz - c.z;
      const lox = rx * c.c + rz * c.s, loz = -rx * c.s + rz * c.c;
      const ldx = dx * c.c + dz * c.s, ldz = -dx * c.s + dz * c.c;
      if (Math.abs(lox) < c.hx && Math.abs(loz) < c.hz && oy > c.y0 && oy < c.y1) continue;
      let t0 = -Infinity, t1 = Infinity;
      const slab = (o, d, h) => {
        if (Math.abs(d) < 1e-8) { if (o < -h || o > h) { t0 = Infinity; } return; }
        let a = (-h - o) / d, b = (h - o) / d;
        if (a > b) { const tmp = a; a = b; b = tmp; }
        t0 = Math.max(t0, a); t1 = Math.min(t1, b);
      };
      slab(lox, ldx, c.hx);
      slab(loz, ldz, c.hz);
      const hy = (c.y1 - c.y0) / 2;
      slab(oy - (c.y0 + hy), dy, hy);
      if (t0 <= t1 && t1 > 0) t = t0;
    }
    if (t > 0 && t < best) {
      const y = oy + dy * t;
      if (c.type === 'b' || (y >= c.y0 && y <= c.y1)) best = t;
    }
  }
  // ground march
  const step = 0.3;
  let prevT = 0;
  for (let t = step; t <= best; t += step) {
    const x = ox + dx * t, y = oy + dy * t, z = oz + dz * t;
    if (y < groundH(x, z) + 0.3) {
      let lo = prevT, hi = t;
      for (let i = 0; i < 5; i++) {
        const m = (lo + hi) / 2;
        if (oy + dy * m < groundH(ox + dx * m, oz + dz * m) + 0.3) hi = m; else lo = m;
      }
      return Math.min(best, lo);
    }
    prevT = t;
  }
  return best;
}

// ---- Vegetation keep-out ----
export const keepOut = [];
export function addKeepOut(x, z, r) { keepOut.push({ x, z, r }); }
export function addKeepOutSeg(ax, az, bx, bz, r) { keepOut.push({ seg: true, ax, az, bx, bz, r }); }
export function isKept(x, z) {
  for (const k of keepOut) {
    if (k.seg) { if (segDist(x, z, k.ax, k.az, k.bx, k.bz).d < k.r) return true; }
    else if ((x - k.x) ** 2 + (z - k.z) ** 2 < k.r * k.r) return true;
  }
  return false;
}

// ---- dirt paths (colour + readability) ----
export const paths = [];
export function addPath(pts, w = 1.3) { paths.push({ pts, w }); }
export function pathMask(x, z) {
  let m = 0;
  for (const p of paths) {
    for (let i = 0; i < p.pts.length - 1; i++) {
      const a = p.pts[i], b = p.pts[i + 1];
      const minx = Math.min(a[0], b[0]) - 3, maxx = Math.max(a[0], b[0]) + 3;
      const minz = Math.min(a[1], b[1]) - 3, maxz = Math.max(a[1], b[1]) + 3;
      if (x < minx || x > maxx || z < minz || z > maxz) continue;
      const r = segDist(x, z, a[0], a[1], b[0], b[1]);
      m = Math.max(m, 1 - smoothstep(p.w * 0.6, p.w, r.d));
    }
  }
  return m;
}

// Walkability test between two points (used by the player controller)
export function canStep(fromX, fromZ, fromY, toX, toZ) {
  const h1 = groundH(toX, toZ);
  if (h1 < state.waterY - 0.5) return false;
  if (h1 - fromY > 0.45) return false;
  const dx = toX - fromX, dz = toZ - fromZ;
  const d = Math.hypot(dx, dz);
  if (d < 1e-6) return true;
  const ux = dx / d, uz = dz / d;
  // look half a metre ahead: too steep up, a ledge down, or deep water all block
  const ahead = groundH(toX + ux * 0.5, toZ + uz * 0.5);
  if (ahead - fromY > 0.62) return false;
  if (fromY - ahead > 0.75) return false;
  if (ahead < state.waterY - 0.5) return false;
  return true;
}

export function islandOf(x, z) {
  let best = null, bd = Infinity;
  for (const key of ISLAND_ORDER) {
    const isl = ISLANDS[key];
    const d = Math.hypot(x - isl.x, z - isl.z) / isl.R;
    if (d < bd) { bd = d; best = key; }
  }
  return best;
}
