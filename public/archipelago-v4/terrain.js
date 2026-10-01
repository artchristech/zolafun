// Heightfield, walkable surfaces, colliders and the terrain meshes.
import * as THREE from './three.module.min.js';
import { clamp, lerp, smoothstep, fbm, vnoise, polyDist, D2R } from './util.js';
import { ISL, LINKS, TIDES, GRID, OBS, MONO, SHIP, FOREST_PATHS, VILLAGE, LIGHT, CAUSEWAY_BEND } from './layout.js';

const TAU = Math.PI * 2;

function islandR(isl, a) {
  return isl.R * (1 + 0.09 * Math.sin(3 * a + isl.ph) + 0.05 * Math.sin(5 * a + isl.ph * 2.3) + 0.03 * Math.sin(9 * a + isl.ph * 0.7));
}

function islandFeature(isl, x, z, d, u) {
  switch (isl.id) {
    case 'P': return d < 50 ? 56 * Math.pow(1 - d / 50, 1.25) : 0;
    case 'M': return 5.5 * (1 - smoothstep(10, 30, d)) * smoothstep(0, 6, u);
    case 'F': return smoothstep(6, 26, u) * Math.max(0, fbm(x * 0.018 + 3.1, z * 0.018 - 1.7, 3) * 13 - 5);
    case 'V': return 0;
    case 'L': return smoothstep(4, 18, u) * 2.6 + (vnoise(x * 0.15, z * 0.15) - 0.5) * 1.4 * smoothstep(4, 14, u);
  }
  return 0;
}

function islandHeight(isl, x, z) {
  const dx = x - isl.x, dz = z - isl.z;
  const d = Math.hypot(dx, dz);
  const s = d - islandR(isl, Math.atan2(dz, dx));
  if (s >= 0) return Math.max(-12, -0.18 * s - 0.012 * s * s);
  const u = -s;
  let h = 3.6 * (1 - Math.exp(-u / 8)) + 0.02 * u;
  h += (fbm(x * 0.045, z * 0.045, 3) - 0.5) * 1.6 * smoothstep(4, 16, u);
  return h + islandFeature(isl, x, z, d, u);
}

export function naturalHeight(x, z) {
  let h = -12;
  for (const isl of ISL) {
    const lim = isl.R * 1.2 + 60;
    if (Math.abs(x - isl.x) > lim || Math.abs(z - isl.z) > lim) continue;
    const v = islandHeight(isl, x, z);
    if (v > h) h = v;
  }
  return h;
}

// ---- pads (flattened areas) ----
const PADS = [];
function pad(x, z, r, b, h) { PADS.push({ x, z, r, b, h: h === undefined ? naturalHeight(x, z) : h }); }
function applyPads(x, z, h) {
  for (const p of PADS) {
    const d = Math.hypot(x - p.x, z - p.z);
    if (d < p.r + p.b) h = lerp(h, p.h, 1 - smoothstep(p.r, p.r + p.b, d));
  }
  return h;
}

// ---- switchback trail up the peak ----
const TRAIL_LEGS = [];
export const TRAIL_PTS = [];
function buildTrail() {
  // legs that climb diagonally across the slope, joined by tight hairpins
  const path = [];
  const polar = (aDeg, r) => ({ x: OBS.x + Math.cos(aDeg * D2R) * r, z: OBS.z + Math.sin(aDeg * D2R) * r });
  const arc = (a0, r0, a1, r1) => {
    const n = Math.max(4, Math.ceil((Math.abs(a1 - a0) * D2R * (r0 + r1)) / 2));
    for (let k = path.length ? 1 : 0; k <= n; k++) path.push(polar(lerp(a0, a1, k / n), lerp(r0, r1, k / n)));
  };
  const hairpin = (aDeg, rOut, rIn, sign) => {
    const a = aDeg * D2R, rc = (rOut + rIn) / 2, rad = (rOut - rIn) / 2;
    const cx = OBS.x + Math.cos(a) * rc, cz = OBS.z + Math.sin(a) * rc;
    const ux = Math.cos(a), uz = Math.sin(a), vx = -Math.sin(a) * sign, vz = Math.cos(a) * sign;
    for (let k = 1; k <= 10; k++) {
      const f = (k / 10) * Math.PI;
      path.push({ x: cx + rad * (Math.cos(f) * ux + Math.sin(f) * vx), z: cz + rad * (Math.cos(f) * uz + Math.sin(f) * vz) });
    }
  };
  arc(90, 49, 140, 47); hairpin(140, 47, 41.5, 1);
  arc(140, 41.5, 40, 37.5); hairpin(40, 37.5, 32, -1);
  arc(40, 32, 140, 28); hairpin(140, 28, 22.5, 1);
  arc(140, 22.5, 45, 18.6); arc(45, 18.6, 62, OBS.plateauR - 0.5);
  const all = path.map((p) => ({ x: p.x, z: p.z, h: applyPads(p.x, p.z, naturalHeight(p.x, p.z)) }));
  // heavy smoothing so the climb is even, then force a steady rise
  for (let pass = 0; pass < 10; pass++) {
    const hs = all.map((p) => p.h);
    for (let i = 1; i < all.length - 1; i++) {
      let sum = 0, c = 0;
      for (let k = -10; k <= 10; k++) { const j = clamp(i + k, 0, all.length - 1); sum += hs[j]; c++; }
      all[i].h = sum / c;
    }
  }
  for (let i = 1; i < all.length; i++) all[i].h = Math.max(all[i].h, all[i - 1].h + 0.03);
  const plateauH = PADS[0].h;
  const first = all[0].h, last = all[all.length - 1].h;
  for (const p of all) p.h = first + (p.h - first) * ((plateauH - first) / (last - first));
  // limit grade: blend toward a constant-grade profile where it gets steep
  const L = [0];
  for (let i = 1; i < all.length; i++) L.push(L[i - 1] + Math.hypot(all[i].x - all[i - 1].x, all[i].z - all[i - 1].z));
  for (let i = 0; i < all.length; i++) {
    const lin = first + (plateauH - first) * (L[i] / L[L.length - 1]);
    all[i].h = lerp(all[i].h, lin, 0.5);
  }
  // chunks of ~20 m for carving
  for (let s0 = 0; s0 < all.length - 1; s0 += 20) {
    const pts = all.slice(s0, Math.min(all.length, s0 + 21));
    let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
    for (const p of pts) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); }
    TRAIL_LEGS.push({ pts, minX: minX - 5, maxX: maxX + 5, minZ: minZ - 5, maxZ: maxZ + 5 });
  }
  for (const p of all) TRAIL_PTS.push(p);
}
function trailCarve(x, z, h) {
  if (Math.abs(x - OBS.x) > 56 || Math.abs(z - OBS.z) > 56) return h;
  let sumF = 0, sumD = 0;
  for (const leg of TRAIL_LEGS) {
    if (x < leg.minX || x > leg.maxX || z < leg.minZ || z > leg.maxZ) continue;
    const r = polyDist(x, z, leg.pts);
    const f = 1 - smoothstep(1.8, 4.2, r.d);
    if (f <= 0) continue;
    const ht = lerp(leg.pts[r.i].h, leg.pts[r.i + 1].h, r.t);
    sumF += f; sumD += f * (ht - h);
  }
  return sumF > 0 ? h + sumD / Math.max(1, sumF) : h;
}
function trailDist(x, z) {
  let best = 99;
  if (Math.abs(x - OBS.x) > 56 || Math.abs(z - OBS.z) > 56) return best;
  for (const leg of TRAIL_LEGS) {
    if (x < leg.minX || x > leg.maxX || z < leg.minZ || z > leg.maxZ) continue;
    best = Math.min(best, polyDist(x, z, leg.pts).d);
  }
  return best;
}

// ---- grid ----
const NX = Math.round((GRID.maxX - GRID.minX) / GRID.step) + 1;
const NZ = Math.round((GRID.maxZ - GRID.minZ) / GRID.step) + 1;
const H = new Float32Array(NX * NZ);
const DIRT = new Uint8Array(NX * NZ);

export function heightAt(x, z) {
  let fx = (x - GRID.minX) / GRID.step, fz = (z - GRID.minZ) / GRID.step;
  if (fx < 0 || fz < 0 || fx >= NX - 1 || fz >= NZ - 1) return -12;
  const i = Math.floor(fx), j = Math.floor(fz);
  fx -= i; fz -= j;
  const k = j * NX + i;
  const a = H[k], b = H[k + 1], c = H[k + NX], d = H[k + NX + 1];
  return (a * (1 - fx) + b * fx) * (1 - fz) + (c * (1 - fx) + d * fx) * fz;
}
export function isDirt(x, z) {
  const i = Math.round((x - GRID.minX) / GRID.step), j = Math.round((z - GRID.minZ) / GRID.step);
  if (i < 0 || j < 0 || i >= NX || j >= NZ) return 0;
  return DIRT[j * NX + i];
}
export function slopeAt(x, z) {
  const gx = heightAt(x + 0.5, z) - heightAt(x - 0.5, z);
  const gz = heightAt(x, z + 0.5) - heightAt(x, z - 0.5);
  return Math.hypot(gx, gz);
}
export function nearestIsland(x, z) {
  let best = 0, bd = 1e9;
  ISL.forEach((isl, i) => { const d = Math.hypot(x - isl.x, z - isl.z) - isl.R; if (d < bd) { bd = d; best = i; } });
  return best;
}

// ---- causeways ----
export const CAUSEWAYS = [];
function buildCauseways() {
  for (let k = 1; k <= 5; k++) {
    const [i, j] = LINKS[k - 1];
    const A = ISL[i], B = ISL[j];
    const dx = B.x - A.x, dz = B.z - A.z, len = Math.hypot(dx, dz);
    const px = -dz / len, pz = dx / len;
    const mx = (A.x + B.x) / 2 + px * CAUSEWAY_BEND[k - 1], mz = (A.z + B.z) / 2 + pz * CAUSEWAY_BEND[k - 1];
    const n = Math.ceil(len);
    const pts = [];
    for (let s = 0; s <= n; s++) {
      const t = s / n, u = 1 - t;
      pts.push({ x: u * u * A.x + 2 * u * t * mx + t * t * B.x, z: u * u * A.z + 2 * u * t * mz + t * t * B.z });
    }
    const top = TIDES[k] + 0.3;
    let s0 = 0, s1 = pts.length - 1;
    while (s0 < pts.length - 1 && heightAt(pts[s0].x, pts[s0].z) > top + 0.6) s0++;
    while (s1 > 0 && heightAt(pts[s1].x, pts[s1].z) > top + 0.6) s1--;
    s0 = Math.max(0, s0 - 5); s1 = Math.min(pts.length - 1, s1 + 5);
    const cp = pts.slice(s0, s1 + 1);
    let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
    for (const p of cp) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); }
    const hw = 1.75;
    const cw = { k, from: i, to: j, pts: cp, top, hw, minX: minX - hw, maxX: maxX + hw, minZ: minZ - hw, maxZ: maxZ + hw };
    // entry points: first/last point that is on dry island ground
    let a = 0, b = cp.length - 1;
    while (a < cp.length - 1 && heightAt(cp[a + 1].x, cp[a + 1].z) > top + 0.4) a++;
    while (b > 0 && heightAt(cp[b - 1].x, cp[b - 1].z) > top + 0.4) b--;
    cw.startPt = cp[a];
    cw.endPt = cp[b];
    cw.mid = cp[Math.floor(cp.length / 2)];
    CAUSEWAYS.push(cw);
  }
}
function causewayTopAt(x, z) {
  let h = -99;
  for (const c of CAUSEWAYS) {
    if (x < c.minX || x > c.maxX || z < c.minZ || z > c.maxZ) continue;
    if (polyDist(x, z, c.pts).d < c.hw) h = Math.max(h, c.top);
  }
  return h;
}

// ---- walkable surfaces ----
const WALK = [];
export function addRect(cx, cz, ux, uz, hl, hw, h0, h1, surf) {
  const r = Math.hypot(hl, hw);
  WALK.push({ minX: cx - r, maxX: cx + r, minZ: cz - r, maxZ: cz + r, fn(x, z, push) {
    const dx = x - cx, dz = z - cz;
    const a = dx * ux + dz * uz, b = -dx * uz + dz * ux;
    if (Math.abs(a) <= hl && Math.abs(b) <= hw) push(lerp(h0, h1, (a + hl) / (2 * hl)), surf);
  } });
}
export function addDisc(cx, cz, r, h, surf) { addAnnulus(cx, cz, 0, r, h, surf); }
export function addAnnulus(cx, cz, r0, r1, h, surf) {
  WALK.push({ minX: cx - r1, maxX: cx + r1, minZ: cz - r1, maxZ: cz + r1, fn(x, z, push) {
    const r = Math.hypot(x - cx, z - cz);
    if (r >= r0 && r <= r1) push(h, surf);
  } });
}
export function addHelix(cx, cz, r0, r1, y0, rise, a0, turns, surf) {
  WALK.push({ minX: cx - r1, maxX: cx + r1, minZ: cz - r1, maxZ: cz + r1, fn(x, z, push) {
    const dx = x - cx, dz = z - cz, r = Math.hypot(dx, dz);
    if (r < r0 || r > r1) return;
    let a = Math.atan2(dz, dx) - a0;
    a = ((a % TAU) + TAU) % TAU;
    for (let k = 0; k <= Math.ceil(turns); k++) {
      const p = a / TAU + k;
      if (p > turns) break;
      push(y0 + (rise * p) / turns, surf);
    }
  } });
}
export function addCustomWalk(minX, maxX, minZ, maxZ, fn) { WALK.push({ minX, maxX, minZ, maxZ, fn }); }
function addCausewayWalks() {
  for (const c of CAUSEWAYS) {
    WALK.push({ minX: c.minX, maxX: c.maxX, minZ: c.minZ, maxZ: c.maxZ, fn(x, z, push) {
      if (polyDist(x, z, c.pts).d < c.hw) push(c.top, 'stone');
    } });
  }
}

export function terrainSurf(x, z, h) {
  if (isDirt(x, z)) return 'sand';
  if (h < 3.5) return 'sand';
  const isl = nearestIsland(x, z);
  if (ISL[isl].id === 'L' || h > 36) return 'stone';
  return 'grass';
}

const _g = { h: 0, surf: 'sand', terrain: true };
export function groundAt(x, z, refY) {
  const t = heightAt(x, z);
  let best = -1e9, bs = null, bt = false, low = 1e9, ls = null, lt = false;
  const lim = refY + 0.5;
  if (t <= lim) { best = t; bt = true; } else { low = t; lt = true; }
  for (let i = 0; i < WALK.length; i++) {
    const w = WALK[i];
    if (x < w.minX || x > w.maxX || z < w.minZ || z > w.maxZ) continue;
    w.fn(x, z, (h, s) => {
      if (h <= lim) { if (h > best) { best = h; bs = s; bt = false; } }
      else if (h < low) { low = h; ls = s; lt = false; }
    });
  }
  if (best > -1e8) { _g.h = best; _g.terrain = bt; _g.surf = bt ? terrainSurf(x, z, best) : bs; }
  else { _g.h = low; _g.terrain = lt; _g.surf = lt ? terrainSurf(x, z, low) : ls; }
  return _g;
}

// ---- colliders (spatial hash) ----
const CELL = 8;
const CH = new Map();
let stamp = 1;
const ckey = (i, j) => i * 100003 + j;
function insert(c, rad) {
  for (let i = Math.floor((c.x - rad) / CELL); i <= Math.floor((c.x + rad) / CELL); i++)
    for (let j = Math.floor((c.z - rad) / CELL); j <= Math.floor((c.z + rad) / CELL); j++) {
      const k = ckey(i, j);
      let a = CH.get(k);
      if (!a) { a = []; CH.set(k, a); }
      a.push(c);
    }
}
export function addCircle(x, z, r, y0, y1, cam = true) {
  const c = { t: 0, x, z, r, y0, y1, cam, s: 0 };
  insert(c, r + 1);
  return c;
}
export function addBox(x, z, hw, hd, ang, y0, y1, cam = true) {
  const c = { t: 1, x, z, hw, hd, c: Math.cos(ang), sn: Math.sin(ang), y0, y1, cam, s: 0 };
  insert(c, Math.hypot(hw, hd) + 1);
  return c;
}
function each(x, z, rad, cb) {
  stamp++;
  for (let i = Math.floor((x - rad) / CELL); i <= Math.floor((x + rad) / CELL); i++)
    for (let j = Math.floor((z - rad) / CELL); j <= Math.floor((z + rad) / CELL); j++) {
      const a = CH.get(ckey(i, j));
      if (!a) continue;
      for (const c of a) { if (c.s === stamp) continue; c.s = stamp; if (cb(c) === true) return true; }
    }
  return false;
}
export function pushOut(p, rad, y) {
  for (let it = 0; it < 2; it++) {
    each(p.x, p.z, rad + 1, (c) => {
      if (y + 1.5 < c.y0 || y > c.y1) return;
      if (c.t === 0) {
        const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz), m = c.r + rad;
        if (d < m) {
          if (d < 1e-4) { p.x += m; return; }
          p.x = c.x + (dx / d) * m; p.z = c.z + (dz / d) * m;
        }
      } else {
        const dx = p.x - c.x, dz = p.z - c.z;
        let lx = dx * c.c - dz * c.sn, lz = dx * c.sn + dz * c.c;
        const qx = clamp(lx, -c.hw, c.hw), qz = clamp(lz, -c.hd, c.hd);
        const ex = lx - qx, ez = lz - qz, d = Math.hypot(ex, ez);
        if (d > 0) { if (d >= rad) return; const k = (rad - d) / d; lx += ex * k; lz += ez * k; }
        else {
          const px = c.hw - Math.abs(lx), pz = c.hd - Math.abs(lz);
          if (px < pz) lx = (lx < 0 ? -1 : 1) * (c.hw + rad); else lz = (lz < 0 ? -1 : 1) * (c.hd + rad);
        }
        p.x = c.x + lx * c.c + lz * c.sn; p.z = c.z - lx * c.sn + lz * c.c;
      }
    });
  }
}
function pointInCollider(x, y, z, pad) {
  return each(x, z, pad + 0.5, (c) => {
    if (!c.cam || y < c.y0 - pad || y > c.y1 + pad) return false;
    if (c.t === 0) return Math.hypot(x - c.x, z - c.z) < c.r + pad;
    const dx = x - c.x, dz = z - c.z;
    const lx = dx * c.c - dz * c.sn, lz = dx * c.sn + dz * c.c;
    return Math.abs(lx) < c.hw + pad && Math.abs(lz) < c.hd + pad;
  });
}
// Returns how far the camera may sit along dir from p without entering terrain or solids.
function insideWalkSlab(x, y, z) {
  let hit = false;
  for (let i = 0; i < WALK.length && !hit; i++) {
    const w = WALK[i];
    if (x < w.minX || x > w.maxX || z < w.minZ || z > w.maxZ) continue;
    w.fn(x, z, (h) => { if (y > h - 0.7 && y < h + 0.3) hit = true; });
  }
  return hit;
}
export function cameraCast(px, py, pz, dx, dy, dz, maxD) {
  for (let s = 0.5; s <= maxD; s += 0.25) {
    const x = px + dx * s, y = py + dy * s, z = pz + dz * s;
    if (heightAt(x, z) + 0.35 > y || pointInCollider(x, y, z, 0.3) || (s > 1.2 && insideWalkSlab(x, y, z))) return Math.max(0.6, s - 0.4);
  }
  return maxD;
}

// ---- terrain colours ----
const C = (hex) => new THREE.Color(hex);
const COL = {
  deep: C(0x6f6a52), wet: C(0xa8946a), sand: C(0xf0d9a0), grassA: C(0x6fae3c), grassB: C(0x9cc44a),
  grassDry: C(0xb9b860), rock: C(0x948a7c), rockDark: C(0x6f6a66), dirt: C(0xc49a62), moss: C(0x4f8a3a),
};
const _tc = new THREE.Color();
export function terrainColor(x, z, h, out = _tc) {
  const sl = slopeAt(x, z);
  const n = vnoise(x * 0.08, z * 0.08), n2 = vnoise(x * 0.31 + 7, z * 0.31);
  if (h < TIDES[0] + 0.15) {
    out.copy(COL.deep).lerp(COL.wet, smoothstep(-4, TIDES[0], h));
  } else if (h < 3.5) {
    out.copy(COL.wet).lerp(COL.sand, smoothstep(TIDES[0] + 0.15, TIDES[0] + 0.45, h));
  } else {
    out.copy(COL.grassA).lerp(COL.grassB, n);
    const isl = ISL[nearestIsland(x, z)].id;
    if (isl === 'F') out.lerp(COL.moss, 0.45 * (1 - n2));
    if (isl === 'L') out.lerp(COL.rock, 0.55 + 0.3 * n2);
    if (h > 30) out.lerp(COL.grassDry, smoothstep(30, 40, h) * 0.6);
    out.lerp(COL.sand, 1 - smoothstep(3.5, 4.3, h));
  }
  const rockF = smoothstep(0.78, 1.05, sl);
  if (rockF > 0) out.lerp(n2 > 0.5 ? COL.rock : COL.rockDark, rockF);
  if (isDirt(x, z)) out.lerp(COL.dirt, 0.9);
  if (h > 2.6 && h < 3.5) out.lerp(COL.sand, 0.3);
  return out;
}

export function buildTerrainMeshes(material) {
  const meshes = [];
  for (const isl of ISL) {
    const ext = isl.R * 1.18 + 22;
    const x0 = Math.max(GRID.minX + 1, isl.x - ext), x1 = Math.min(GRID.maxX - 1, isl.x + ext);
    const z0 = Math.max(GRID.minZ + 1, isl.z - ext), z1 = Math.min(GRID.maxZ - 1, isl.z + ext);
    const res = isl.res;
    const nx = Math.ceil((x1 - x0) / res) + 1, nz = Math.ceil((z1 - z0) / res) + 1;
    const pos = new Float32Array(nx * nz * 3), col = new Float32Array(nx * nz * 3);
    const hs = new Float32Array(nx * nz);
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const x = x0 + i * res, z = z0 + j * res, k = j * nx + i;
      const h = heightAt(x, z);
      hs[k] = h;
      pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;
      terrainColor(x, z, h, _tc);
      col[k * 3] = _tc.r; col[k * 3 + 1] = _tc.g; col[k * 3 + 2] = _tc.b;
    }
    const idx = [];
    for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
      if (hs[a] < -7 && hs[b] < -7 && hs[c] < -7 && hs[d] < -7) continue;
      if ((i + j) & 1) { idx.push(a, c, b, b, c, d); } else { idx.push(a, c, d, a, d, b); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, material);
    m.receiveShadow = true; m.castShadow = true;
    meshes.push(m);
  }
  return meshes;
}

// Height texture used by the water shader for depth colour and foam.
export function buildHeightTexture() {
  const step = 2;
  const w = Math.floor((GRID.maxX - GRID.minX) / step) + 1, h = Math.floor((GRID.maxZ - GRID.minZ) / step) + 1;
  const data = new Uint16Array(w * h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const x = GRID.minX + i * step, z = GRID.minZ + j * step;
    let v = heightAt(x, z);
    if (i === 0 || j === 0 || i === w - 1 || j === h - 1) v = -12;
    v = Math.max(v, causewayTopAt(x, z));
    data[j * w + i] = THREE.DataUtils.toHalfFloat(v);
  }
  const tex = new THREE.DataTexture(data, w, h, THREE.RedFormat, THREE.HalfFloatType);
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return { tex, min: new THREE.Vector2(GRID.minX, GRID.minZ), step, size: new THREE.Vector2(w, h) };
}

// ---- build everything ----
export function buildWorldData() {
  // pads first (heights sampled from the natural terrain)
  const plateauH = naturalHeight(OBS.x + Math.cos(90 * D2R) * OBS.plateauR, OBS.z + Math.sin(90 * D2R) * OBS.plateauR) + 0.3;
  pad(OBS.x, OBS.z, OBS.plateauR, 5, plateauH);
  pad(MONO.x, MONO.z, 14, 12);
  pad(SHIP.clearing.x, SHIP.clearing.z, SHIP.clearing.r, 8);
  pad(SHIP.beacon.x, SHIP.beacon.z, 3.5, 3);
  for (const m of SHIP.mirrors) pad(m.x, m.z, 2.2, 2.5);
  pad(VILLAGE.x, VILLAGE.z - 3, 22, 10, 3.0);
  pad(LIGHT.x, LIGHT.z, 9.5, 5);
  pad(MONO.brazier.x, MONO.brazier.z, 3, 3);
  buildTrail();

  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
    const x = GRID.minX + i * GRID.step, z = GRID.minZ + j * GRID.step;
    let h = applyPads(x, z, naturalHeight(x, z));
    h = trailCarve(x, z, h);
    H[j * NX + i] = h;
  }
  // dirt mask: trail, forest paths, mirror sightlines
  const corridors = [...FOREST_PATHS];
  const lamp = SHIP.lamp, M = SHIP.mirrors, R = SHIP.route;
  corridors.push({ w: 1.6, pts: [lamp, M[R[0]]] }, { w: 1.6, pts: [M[R[0]], M[R[1]]] }, { w: 1.6, pts: [M[R[1]], M[R[2]]] },
    { w: 1.6, pts: [M[R[2]], SHIP.beacon] }, { w: 1.6, pts: [M[1], M[3]] });
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
    const x = GRID.minX + i * GRID.step, z = GRID.minZ + j * GRID.step;
    let dirt = trailDist(x, z) < 1.9;
    if (!dirt && x > 140 && z < 0 && z > -150) {
      for (const c of corridors) if (polyDist(x, z, c.pts).d < c.w * 0.75) { dirt = true; break; }
    }
    DIRT[j * NX + i] = dirt ? 1 : 0;
  }
  buildCauseways();
  addCausewayWalks();
  return { corridors };
}
