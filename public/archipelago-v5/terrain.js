// Five Lights — terrain heightfield, island layout, causeways, walkable ground.
import * as THREE from './three.module.min.js';
import { fbm2, noise2, smoothstep, lerp, clamp, segDist, srgb, toonGradient } from './util.js';

export const HALF = 300;
export const N = 320;
export const CELL = (2 * HALF) / N;
export const TIDES = [2.4, 1.6, 0.8, 0.0, -0.8, -1.4];
export const WADE = 0.35; // max water depth the apprentice will wade

export const ISL = [
  { id: 'village', x: -150, z: 90, r: 55, top: 4.4, rough: 0.9 },
  { id: 'forest', x: -30, z: 178, r: 64, top: 6.5, rough: 1.5 },
  { id: 'ring', x: 108, z: 138, r: 46, top: 6.0, rough: 1.2 },
  { id: 'peak', x: 112, z: -42, r: 76, top: 6.5, rough: 1.6, peak: 56 },
  { id: 'light', x: -52, z: -112, r: 42, top: 5.5, rough: 1.0 },
];
const [IV, IF, IR, IP, IL] = ISL;

// ---------------------------------------------------------------- raw shape
function rawH(x, z) {
  let h = -8 + 1.2 * (fbm2(x * 0.02, z * 0.02) - 0.5);
  for (const I of ISL) {
    const dx = x - I.x, dz = z - I.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist > I.r * 1.7) continue;
    const warp = 0.82 + 0.36 * fbm2(x * 0.014 + I.x * 0.1, z * 0.014 + I.z * 0.1);
    const d = dist / (I.r * warp);
    let ih = lerp(-8, I.top, smoothstep(1.3, 0.6, d));
    ih += I.rough * 2 * (fbm2(x * 0.035, z * 0.035) - 0.5) * smoothstep(1.0, 0.5, d);
    if (I.peak) {
      const pd = dist / I.r;
      ih += I.peak * Math.pow(smoothstep(0.92, 0.0, pd), 1.6);
      ih += 5 * (fbm2(x * 0.05, z * 0.05) - 0.5) * smoothstep(0.9, 0.3, pd) * smoothstep(0.0, 0.25, pd);
    }
    if (ih > h) h = ih;
  }
  return h;
}

// flat zones (plazas, clearings, summit)
export const FLATS = [
  { x: IV.x, z: IV.z, r: 15, fade: 10 },
  { x: IF.x, z: IF.z, r: 23, fade: 10 },
  { x: IR.x, z: IR.z, r: 16, fade: 10 },
  { x: IP.x, z: IP.z, r: 13, fade: 6, dh: -3 },
  { x: IL.x, z: IL.z, r: 17, fade: 8 },
];
for (const f of FLATS) f.h = rawH(f.x, f.z) + (f.dh || 0);
function h1(x, z) {
  let h = rawH(x, z);
  for (const f of FLATS) {
    const d = Math.hypot(x - f.x, z - f.z);
    if (d < f.r + f.fade) h = lerp(h, f.h, 1 - smoothstep(f.r, f.r + f.fade, d));
  }
  return h;
}

function dir2(ax, az, bx, bz) { const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz); return { x: dx / l, z: dz / l }; }
function marchToShore(I, dir, level = 3.1) {
  for (let s = 0; s < I.r * 1.6; s += 0.5) {
    const x = I.x + dir.x * s, z = I.z + dir.z * s;
    if (h1(x, z) < level) return { x, z, s };
  }
  return { x: I.x + dir.x * I.r, z: I.z + dir.z * I.r, s: I.r };
}

// ---------------------------------------------------------------- switchback trail
export const TRAIL = []; // dense samples {x,z,h}
function buildTrail() {
  // classic switchbacks: legs at constant radius across the face that looks toward the ring
  // island, joined by tight hairpins. Heights follow the cone at each leg's middle and are
  // interpolated by arclength, so the grade stays gentle and legs never crowd each other.
  const toR = dir2(IP.x, IP.z, IR.x, IR.z);
  const th0 = Math.atan2(toR.z, toR.x);
  const R = IP.r;
  const land = marchToShore(IP, toR, 3.0);
  const legs = 8;
  const radii = [], spans = [];
  for (let k = 0; k < legs; k++) { const r = lerp(0.7, 0.19, k / (legs - 1)) * R; radii.push(r); spans.push(clamp(22 / r, 0.55, 1.2)); }
  const P = (a, r) => ({ x: IP.x + Math.cos(a) * r, z: IP.z + Math.sin(a) * r });
  const pts = [{ x: land.x - toR.x * 3, z: land.z - toR.z * 3 }];
  const anchors = []; // indices into pts of each leg's midpoint
  const turns = [];
  for (let k = 0; k < legs; k++) {
    const sgn = k % 2 === 0 ? 1 : -1; // leg 0 runs from -span to +span
    const a0 = th0 - sgn * spans[k], a1 = th0 + sgn * spans[k], r = radii[k];
    const n = Math.max(8, Math.ceil((Math.abs(a1 - a0) * r) / 1.5));
    for (let i = 0; i <= n; i++) {
      if (i === Math.floor(n / 2)) anchors.push(pts.length);
      pts.push(P(lerp(a0, a1, i / n), r));
    }
    if (k < legs - 1) {
      // hairpin bulging past the end of the leg
      const r2 = radii[k + 1], a2 = th0 + sgn * spans[k + 1];
      const rm = (r + r2) / 2, bulge = ((r - r2) / 2) / rm;
      for (let i = 1; i < 10; i++) {
        const t = i / 10;
        pts.push(P(lerp(a1, a2, t) + sgn * bulge * Math.sin(Math.PI * t), lerp(r, r2, t)));
      }
      turns.push(P(lerp(a1, a2, 0.5) + sgn * (bulge + 2.8 / rm), rm));
    }
  }
  // final approach onto the summit plateau
  const last = pts[pts.length - 1];
  const inD = dir2(last.x, last.z, IP.x, IP.z);
  for (let i = 1; i <= 3; i++) pts.push({ x: last.x + inD.x * 2 * i, z: last.z + inD.z * 2 * i });
  // resample at ~1 unit, tracking where the anchors land
  const dense = [];
  const anchorD = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    if (anchors.includes(i)) anchorD.push(dense.length);
    const L = Math.hypot(b.x - a.x, b.z - a.z);
    const n = Math.max(1, Math.ceil(L));
    for (let j = 0; j < n; j++) { const t = j / n; dense.push({ x: lerp(a.x, b.x, t), z: lerp(a.z, b.z, t) }); }
  }
  dense.push(pts[pts.length - 1]);
  // arclength
  let acc = 0; dense[0].s = 0;
  for (let i = 1; i < dense.length; i++) { acc += Math.hypot(dense[i].x - dense[i - 1].x, dense[i].z - dense[i - 1].z); dense[i].s = acc; }
  const keys = [{ s: 0, h: h1(dense[0].x, dense[0].z) }];
  for (const di of anchorD) keys.push({ s: dense[di].s, h: h1(dense[di].x, dense[di].z) });
  keys.push({ s: acc, h: FLATS[3].h });
  for (let i = 1; i < keys.length; i++) keys[i].h = Math.max(keys[i].h, keys[i - 1].h + 0.5);
  keys[keys.length - 1].h = FLATS[3].h;
  let ki = 0;
  for (const p of dense) {
    while (ki < keys.length - 2 && p.s > keys[ki + 1].s) ki++;
    const A = keys[ki], B = keys[ki + 1];
    p.h = lerp(A.h, B.h, smoothstep(0, 1, (p.s - A.s) / Math.max(B.s - A.s, 1e-3)) * 0.35 + ((p.s - A.s) / Math.max(B.s - A.s, 1e-3)) * 0.65);
    TRAIL.push(p);
  }
  for (let i = 0; i < TRAIL.length; i++) {
    const p = TRAIL[i], q = TRAIL[Math.min(i + 1, TRAIL.length - 1)], o = TRAIL[Math.max(i - 1, 0)];
    p.dx = q.x - o.x; p.dz = q.z - o.z; const l = Math.hypot(p.dx, p.dz) || 1; p.dx /= l; p.dz /= l;
  }
  TRAIL.turns = turns;
}
buildTrail();
const trailBox = (() => {
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (const p of TRAIL) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); }
  return { x0: x0 - 8, x1: x1 + 8, z0: z0 - 8, z1: z1 + 8 };
})();
export function nearestTrail(x, z) {
  let best = 1e9, bi = 0;
  for (let i = 0; i < TRAIL.length; i += 2) {
    const p = TRAIL[i]; const d = (p.x - x) ** 2 + (p.z - z) ** 2;
    if (d < best) { best = d; bi = i; }
  }
  // refine on neighbouring segments
  let bd = 1e9, bh = TRAIL[bi].h;
  for (let i = Math.max(0, bi - 3); i < Math.min(TRAIL.length - 1, bi + 3); i++) {
    const a = TRAIL[i], b = TRAIL[i + 1];
    const r = segDist(x, z, a.x, a.z, b.x, b.z);
    if (r.d < bd) { bd = r.d; bh = lerp(a.h, b.h, r.t); }
  }
  return { d: bd, h: bh };
}
function hFinal(x, z) {
  let h = h1(x, z);
  if (x > trailBox.x0 && x < trailBox.x1 && z > trailBox.z0 && z < trailBox.z1) {
    const t = nearestTrail(x, z);
    if (t.d < 7) h = lerp(h, t.h, 1 - smoothstep(2.0, 6.5, t.d));
  }
  return h;
}

// ---------------------------------------------------------------- grid
export const H = new Float32Array((N + 1) * (N + 1));
export const SURF = new Uint8Array((N + 1) * (N + 1)); // 0 sand 1 grass 2 stone 3 dirt
for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) H[j * (N + 1) + i] = hFinal(-HALF + i * CELL, -HALF + j * CELL);

export function groundAt(x, z) {
  const gx = (x + HALF) / CELL, gz = (z + HALF) / CELL;
  if (gx < 0 || gz < 0 || gx >= N || gz >= N) return -8;
  const i = Math.floor(gx), j = Math.floor(gz);
  const fx = gx - i, fz = gz - j;
  const r = N + 1;
  const h00 = H[j * r + i], h10 = H[j * r + i + 1], h01 = H[(j + 1) * r + i], h11 = H[(j + 1) * r + i + 1];
  if (fx + fz <= 1) return h00 + (h10 - h00) * fx + (h01 - h00) * fz;
  return h11 + (h01 - h11) * (1 - fx) + (h10 - h11) * (1 - fz);
}
export function surfAt(x, z) {
  const i = clamp(Math.round((x + HALF) / CELL), 0, N), j = clamp(Math.round((z + HALF) / CELL), 0, N);
  return SURF[j * (N + 1) + i];
}

// ---------------------------------------------------------------- causeways
export const CAUSEWAYS = [];
function makeCauseway(A, B, k) {
  const d = dir2(A.x, A.z, B.x, B.z);
  const sa = marchToShore(A, d, 3.0);
  const sb = marchToShore(B, { x: -d.x, z: -d.z }, 3.0);
  const a = { x: sa.x - d.x * 3, z: sa.z - d.z * 3 };
  const b = { x: sb.x + d.x * 3, z: sb.z + d.z * 3 };
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  const c = {
    k, a, b, len, dir: d, hw: 2.7,
    hA: groundAt(a.x, a.z), hB: groundAt(b.x, b.z),
    top: TIDES[k + 1] + 0.25,
    ramp: Math.min(16, len * 0.3),
  };
  c.box = { x0: Math.min(a.x, b.x) - 4, x1: Math.max(a.x, b.x) + 4, z0: Math.min(a.z, b.z) - 4, z1: Math.max(a.z, b.z) + 4 };
  CAUSEWAYS.push(c);
  return c;
}
export function causewayProfile(c, t) {
  const s = t * c.len;
  if (s < c.ramp) return lerp(c.hA, c.top, smoothstep(0, c.ramp, s));
  if (s > c.len - c.ramp) return lerp(c.top, c.hB, smoothstep(c.len - c.ramp, c.len, s));
  return c.top + 0.06 * Math.sin(s * 0.7);
}
makeCauseway(IV, IF, 0);
makeCauseway(IF, IR, 1);
makeCauseway(IR, IP, 2);
makeCauseway(IP, IL, 3);
// trail start sits at the ring→peak causeway landing
{
  const c = CAUSEWAYS[2];
  TRAIL.unshift({ x: c.b.x, z: c.b.z, h: groundAt(c.b.x, c.b.z), dx: c.dir.x, dz: c.dir.z });
}

// ---------------------------------------------------------------- decks (wooden walkways)
export const DECKS = [];
export function addDeck(cx, cz, ux, uz, hl, hw, h0, h1_ = h0) {
  const l = Math.hypot(ux, uz); ux /= l; uz /= l;
  const r = Math.hypot(hl, hw) + 1;
  DECKS.push({ cx, cz, ux, uz, hl, hw, h0, h1: h1_, r });
}

export function walkInfo(x, z) {
  let h = groundAt(x, z), surf = surfAt(x, z);
  for (const c of CAUSEWAYS) {
    if (x < c.box.x0 || x > c.box.x1 || z < c.box.z0 || z > c.box.z1) continue;
    const r = segDist(x, z, c.a.x, c.a.z, c.b.x, c.b.z);
    if (r.d < c.hw) { const ch = causewayProfile(c, r.t); if (ch > h - 0.05) { h = Math.max(h, ch); surf = 2; } }
  }
  for (const d of DECKS) {
    const dx = x - d.cx, dz = z - d.cz;
    if (Math.abs(dx) > d.r || Math.abs(dz) > d.r) continue;
    const s = dx * d.ux + dz * d.uz, w = -dx * d.uz + dz * d.ux;
    if (Math.abs(s) <= d.hl && Math.abs(w) <= d.hw) {
      const dh = lerp(d.h0, d.h1, (s + d.hl) / (2 * d.hl));
      if (dh > h - 0.3) { h = Math.max(h, dh); surf = 4; }
    }
  }
  return { h, surf };
}

// ---------------------------------------------------------------- layout of landmarks
export const LAYOUT = {};
{
  // village
  const u = { x: -0.75, z: 0.66 }; { const l = Math.hypot(u.x, u.z); u.x /= l; u.z /= l; }
  const v = { x: -u.z, z: u.x };
  const shore = marchToShore(IV, u, 3.0);
  const deckH = 3.35;
  const pierStart = { x: shore.x - u.x * 5, z: shore.z - u.z * 5 };
  const platform = { x: shore.x + u.x * 28, z: shore.z + u.z * 28 };
  LAYOUT.village = {
    c: { x: IV.x, z: IV.z }, u, v, shore, deckH, pierStart, platform,
    pole: { x: IV.x + v.x * 8 + u.x * 1, z: IV.z + v.z * 8 + u.z * 1 },
    spawn: { x: IV.x - u.x * 4 - v.x * 2, z: IV.z - u.z * 4 - v.z * 2 },
    houses: [],
  };
  const pierLen = 28 + 5 - 4.5;
  addDeck(pierStart.x + u.x * pierLen / 2, pierStart.z + u.z * pierLen / 2, u.x, u.z, pierLen / 2, 1.7, deckH);
  addDeck(platform.x, platform.z, u.x, u.z, 4.8, 4.8, deckH);
  const ua = Math.atan2(u.z, u.x);
  for (const deg of [48, 86, -44, 128, -150]) {
    const a = ua + (deg * Math.PI) / 180;
    const dd = { x: Math.cos(a), z: Math.sin(a) };
    const s = marchToShore(IV, dd, 3.0);
    const hc = { x: s.x + dd.x * 4.5, z: s.z + dd.z * 4.5 };
    LAYOUT.village.houses.push({ x: hc.x, z: hc.z, dir: dd, shore: s });
    // porch deck (land side) + house floor
    addDeck(hc.x, hc.z, dd.x, dd.z, 4.2, 4.2, deckH + 0.15);
    addDeck(s.x - dd.x * 1.5, s.z - dd.z * 1.5, dd.x, dd.z, 3.2, 1.3, groundAt(s.x - dd.x * 4.7, s.z - dd.z * 4.7), deckH + 0.15);
  }

  // forest clearing + shipwreck mirror route
  const C = { x: IF.x, z: IF.z };
  const P = (dx, dz) => ({ x: C.x + dx, z: C.z + dz });
  LAYOUT.forest = {
    c: C,
    wreck: { ...P(-4, 10), ang: (10 * Math.PI) / 180, len: 20 },
    lamp: P(-15, 4),
    mirrors: [P(-8, -6), P(5, -9), P(13, 2)],
    beacon: P(17, 13),
  };

  // monolith ring
  const toP = dir2(IR.x, IR.z, IP.x, IP.z);
  LAYOUT.ring = {
    c: { x: IR.x, z: IR.z }, radius: 9,
    beacon: { x: IR.x + toP.x * 14.5 + toP.z * 4, z: IR.z + toP.z * 14.5 - toP.x * 4 },
  };

  // peak & observatory
  const toL = dir2(IP.x, IP.z, IL.x, IL.z);
  const S = { x: IP.x, z: IP.z };
  const tLeg = TRAIL[Math.floor(TRAIL.length * 0.42)];
  LAYOUT.peak = {
    c: S,
    dome: { x: S.x + 7.5 * Math.cos(1.1), z: S.z + 7.5 * Math.sin(1.1) },
    beacon: { x: S.x + toL.x * 9.5, z: S.z + toL.z * 9.5 },
    azSteps: 12, azTarget: 5, elSteps: [0, 15, 30, 45], elTarget: 2,
    tablet: (() => {
      // stand the carved tablet on the downhill side of the trail
      const ox = tLeg.x - IP.x, oz = tLeg.z - IP.z, l = Math.hypot(ox, oz);
      return { x: tLeg.x + (ox / l) * 2.6, z: tLeg.z + (oz / l) * 2.6, face: Math.atan2(-oz, -ox) };
    })(),
    trailStart: { x: TRAIL[0].x, z: TRAIL[0].z },
  };

  // lighthouse
  const toPk = dir2(IL.x, IL.z, IP.x, IP.z);
  const da = Math.atan2(toPk.z, toPk.x);
  LAYOUT.light = {
    c: { x: IL.x, z: IL.z }, doorDir: toPk, doorAng: da,
    plinths: [0, 1, 2, 3].map((i) => {
      const a = da + Math.PI / 4 + (i * Math.PI) / 2;
      return { x: IL.x + Math.cos(a) * 11, z: IL.z + Math.sin(a) * 11 };
    }),
  };
}

// paths (for colour, tree clearance, sound)
export const PATHS = [];
function wiggle(a, b, n, amp, seed) {
  const pts = [a];
  const d = dir2(a.x, a.z, b.x, b.z);
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const o = (noise2(seed + t * 3, seed * 0.7) - 0.5) * 2 * amp * Math.sin(Math.PI * t);
    pts.push({ x: lerp(a.x, b.x, t) - d.z * o, z: lerp(a.z, b.z, t) + d.x * o });
  }
  pts.push(b);
  return pts;
}
{
  const V = LAYOUT.village, cw = CAUSEWAYS;
  PATHS.push({ pts: [V.c, V.pierStart], w: 2.0 });
  PATHS.push({ pts: wiggle(V.c, cw[0].a, 4, 3, 1.3), w: 2.0 });
  PATHS.push({ pts: [V.c, V.pole], w: 1.6 });
  for (const h of V.houses) PATHS.push({ pts: [V.c, { x: h.shore.x - h.dir.x * 5, z: h.shore.z - h.dir.z * 5 }], w: 1.5 });
  const F = LAYOUT.forest;
  PATHS.push({ pts: wiggle(cw[0].b, F.c, 6, 7, 4.1), w: 1.9 });
  PATHS.push({ pts: wiggle(F.c, cw[1].a, 6, 7, 7.7), w: 1.9 });
  const Rg = LAYOUT.ring;
  PATHS.push({ pts: wiggle(cw[1].b, Rg.c, 4, 3, 9.2), w: 1.9 });
  PATHS.push({ pts: wiggle(Rg.c, cw[2].a, 4, 3, 2.9), w: 1.9 });
  PATHS.push({ pts: TRAIL.filter((_, i) => i % 3 === 0), w: 1.8, trail: true });
  const L = LAYOUT.light;
  PATHS.push({ pts: wiggle(cw[3].b, L.c, 3, 2, 5.5), w: 2.0 });
  for (const p of PATHS) {
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const q of p.pts) { x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); z0 = Math.min(z0, q.z); z1 = Math.max(z1, q.z); }
    p.box = { x0: x0 - 8, x1: x1 + 8, z0: z0 - 8, z1: z1 + 8 };
  }
}
export function pathDist(x, z) {
  let best = 1e9, trail = false;
  for (const p of PATHS) {
    if (x < p.box.x0 || x > p.box.x1 || z < p.box.z0 || z > p.box.z1) continue;
    for (let i = 0; i < p.pts.length - 1; i++) {
      const a = p.pts[i], b = p.pts[i + 1];
      const d = segDist(x, z, a.x, a.z, b.x, b.z).d - p.w;
      if (d < best) { best = d; trail = !!p.trail; }
    }
  }
  return { d: best, trail };
}

export function islandOf(x, z) {
  let best = 0, bd = 1e9;
  for (let i = 0; i < ISL.length; i++) { const d = Math.hypot(x - ISL[i].x, z - ISL[i].z) / ISL[i].r; if (d < bd) { bd = d; best = i; } }
  return best;
}

// ---------------------------------------------------------------- surfaces + colours + meshes
function slopeAtIdx(i, j) {
  const r = N + 1;
  const hl = H[j * r + Math.max(i - 1, 0)], hr = H[j * r + Math.min(i + 1, N)];
  const hd = H[Math.max(j - 1, 0) * r + i], hu = H[Math.min(j + 1, N) * r + i];
  return { gx: (hr - hl) / (2 * CELL), gz: (hu - hd) / (2 * CELL) };
}

export function buildTerrain(scene, trees) {
  const r = N + 1;
  // shade under trees (canopies cast no shadow, so we paint the forest floor)
  const shadeMap = new Float32Array(r * r);
  for (const t of trees) {
    const ci = Math.round((t.x + HALF) / CELL), cj = Math.round((t.z + HALF) / CELL);
    const rad = Math.ceil((t.s * 2.6) / CELL);
    for (let j = cj - rad; j <= cj + rad; j++) for (let i = ci - rad; i <= ci + rad; i++) {
      if (i < 0 || j < 0 || i > N || j > N) continue;
      const d = Math.hypot(-HALF + i * CELL - t.x, -HALF + j * CELL - t.z) / (t.s * 2.6);
      if (d < 1) shadeMap[j * r + i] = Math.min(1, shadeMap[j * r + i] + (1 - d) * 0.45);
    }
  }
  const cSand = srgb(0.93, 0.83, 0.62), cWet = srgb(0.68, 0.6, 0.46), cGrass = srgb(0.47, 0.7, 0.3), cGrass2 = srgb(0.36, 0.6, 0.25);
  const cForest = srgb(0.24, 0.42, 0.2), cRock = srgb(0.58, 0.54, 0.5), cRock2 = srgb(0.44, 0.42, 0.45), cDirt = srgb(0.74, 0.6, 0.42), cTrail = srgb(0.8, 0.74, 0.62), cBed = srgb(0.5, 0.47, 0.36);
  const colors = new Float32Array(r * r * 3);
  const tmp = new THREE.Color();
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
    const k = j * r + i, x = -HALF + i * CELL, z = -HALF + j * CELL, h = H[k];
    const g = slopeAtIdx(i, j), s = Math.hypot(g.gx, g.gz);
    const nz = noise2(x * 0.15, z * 0.15), nb = fbm2(x * 0.04, z * 0.04, 3);
    let surf = 1;
    const isl = islandOf(x, z);
    if (h < 0.6 + nz * 0.5) { tmp.copy(cBed).lerp(cWet, smoothstep(-3, 0.6, h)); surf = 0; }
    else if (h < 3.4 + nz * 0.7) { tmp.copy(cWet).lerp(cSand, smoothstep(0.6, 2.2, h)); surf = 0; }
    else {
      tmp.copy(cGrass).lerp(cGrass2, smoothstep(0.35, 0.7, nb));
      if (isl === 1) tmp.lerp(cForest, 0.35);
      tmp.lerp(cSand, 1 - smoothstep(3.4, 4.6, h));
      tmp.lerp(cForest, shadeMap[k]);
      const rocky = Math.max(smoothstep(0.7, 1.05, s), isl === 3 ? smoothstep(26, 44, h) * 0.85 : 0);
      if (rocky > 0.01) { tmp.lerp(nb > 0.5 ? cRock : cRock2, rocky); if (rocky > 0.5) surf = 2; }
      if (h > 3.0) {
        const pd = pathDist(x, z);
        if (pd.d < 1.2) {
          const w = 1 - smoothstep(-0.4, 1.2, pd.d);
          tmp.lerp(pd.trail ? cTrail : cDirt, w);
          if (w > 0.5) surf = pd.trail ? 2 : 3;
        }
      }
    }
    SURF[k] = surf;
    colors[k * 3] = tmp.r; colors[k * 3 + 1] = tmp.g; colors[k * 3 + 2] = tmp.b;
  }
  // plaza / clearing / summit floors are packed earth or stone
  const mat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient() });
  const CH = 32, group = new THREE.Group();
  let tris = 0;
  for (let cj = 0; cj < N / CH; cj++) for (let ci = 0; ci < N / CH; ci++) {
    let maxH = -99;
    for (let j = cj * CH; j <= cj * CH + CH; j++) for (let i = ci * CH; i <= ci * CH + CH; i++) maxH = Math.max(maxH, H[j * r + i]);
    if (maxH < TIDES[5] - 0.4) continue;
    const vr = CH + 1;
    const pos = new Float32Array(vr * vr * 3), nor = new Float32Array(vr * vr * 3), col = new Float32Array(vr * vr * 3);
    for (let jj = 0; jj <= CH; jj++) for (let ii = 0; ii <= CH; ii++) {
      const i = ci * CH + ii, j = cj * CH + jj, k = j * r + i, o = (jj * vr + ii) * 3;
      pos[o] = -HALF + i * CELL; pos[o + 1] = H[k]; pos[o + 2] = -HALF + j * CELL;
      const g = slopeAtIdx(i, j); const l = Math.hypot(g.gx, 1, g.gz);
      nor[o] = -g.gx / l; nor[o + 1] = 1 / l; nor[o + 2] = -g.gz / l;
      col[o] = colors[k * 3]; col[o + 1] = colors[k * 3 + 1]; col[o + 2] = colors[k * 3 + 2];
    }
    const idx = [];
    for (let jj = 0; jj < CH; jj++) for (let ii = 0; ii < CH; ii++) {
      const a = jj * vr + ii, b = a + 1, c = a + vr, d = c + 1;
      // tri (00,01,10) and (10,01,11): matches groundAt's split; CCW seen from above
      idx.push(a, c, b, b, c, d);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    const m = new THREE.Mesh(geo, mat);
    m.receiveShadow = true;
    m.castShadow = false;
    m.matrixAutoUpdate = false;
    group.add(m);
    tris += idx.length / 3;
  }
  scene.add(group);
  return { group, tris };
}

// height texture for the water shader (terrain + causeways), encodes (h+6)/12
export function buildHeightTexture() {
  const R = 512;
  const data = new Uint8Array(R * R);
  for (let j = 0; j < R; j++) for (let i = 0; i < R; i++) {
    const x = -HALF + ((i + 0.5) / R) * 2 * HALF, z = -HALF + ((j + 0.5) / R) * 2 * HALF;
    let h = groundAt(x, z);
    for (const c of CAUSEWAYS) {
      if (x < c.box.x0 || x > c.box.x1 || z < c.box.z0 || z > c.box.z1) continue;
      const s = segDist(x, z, c.a.x, c.a.z, c.b.x, c.b.z);
      if (s.d < c.hw + 0.6) h = Math.max(h, causewayProfile(c, s.t));
    }
    data[j * R + i] = clamp(Math.round(((h + 6) / 12) * 255), 0, 255);
  }
  const tex = new THREE.DataTexture(data, R, R, THREE.RedFormat);
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}
