// Terrain: analytic island shapes baked into a 1 m height grid, the switchback
// trail, half-sunken causeways, ground queries and the height texture used by
// water and grass shaders.
import * as THREE from './three.module.min.js';
import { clamp, lerp, smooth, fbm2, segDist, polyDist } from './util.js';
import { W0, N, ISL, TIDE, CW_TOP, CW_HALF, CW_SLOPE, BEACON_XZ, GRASS_EXCL, makePaths } from './layout.js';
import { platformTop, PT } from './colliders.js';

const P = ISL[3];
const FLAT = [
  { x: 0, z: 100, r0: 9, r1: 14, h: 4.7 },
  { x: -99, z: 14, r0: 11, r1: 15, h: 6.2 },
  { x: 70.7, z: -70.7, r0: 12.5, r1: 14.5, h: 40 },
  { x: 0, z: 0, r0: 8, r1: 12, h: 5.2 },
];
const BUMPS = [{ x: 0, z: 84, r0: 2, r1: 8, h: 3.0 }];

function islandH(I, x, z, skipCone = false) {
  const dx = x - I.x, dz = z - I.z;
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d > I.r2 + I.warp + 2) return -9;
  const w = fbm2(x * 0.035 + I.seed * 10, z * 0.035 - I.seed * 7, 3) * I.warp * clamp(d / I.r1, 0, 1);
  const dw = d + w;
  let h;
  if (dw < I.r0) h = I.hp;
  else if (dw < I.r1) h = I.hp * (1 - smooth(I.r0, I.r1, dw));
  else h = -9 * smooth(I.r1, I.r2, dw);
  if (h > -3) h += fbm2(x * 0.09 + I.seed, z * 0.09, 3) * I.rough * clamp((h + 3) / 5, 0, 1);
  if (I.cone && !skipCone) {
    const c = I.cone;
    if (d < c.r1) {
      let hc = c.hp;
      if (d > c.r0) hc = c.hp * (1 - (d - c.r0) / (c.r1 - c.r0)) + fbm2(x * 0.12, z * 0.12, 2) * 0.35;
      if (hc > h) h = hc;
    }
  }
  return h;
}

export function rawH(x, z) {
  let h = -9;
  for (const I of ISL) { const v = islandH(I, x, z); if (v > h) h = v; }
  for (const f of FLAT) {
    const d = Math.hypot(x - f.x, z - f.z);
    if (d < f.r1) h = lerp(f.h, h, smooth(f.r0, f.r1, d));
  }
  for (const b of BUMPS) {
    const d = Math.hypot(x - b.x, z - b.z);
    if (d < b.r1) h += b.h * (1 - smooth(b.r0, b.r1, d));
  }
  return h;
}

// ---------------------------------------------------------------- trail
const coneInv = (h) => P.cone.r0 + (1 - h / P.cone.hp) * (P.cone.r1 - P.cone.r0);
export const TRAIL = [];   // [x, z, h]
export const TRAIL_HALF = 1.6;
(function buildTrail() {
  // Constant-sweep switchback legs. Each leg drifts inward by 2*DRIFT, cuts in
  // at its start and fills out at its end, so every hairpin is a flat landing.
  const F = ISL[2];
  const coneH = (d) => P.cone.hp * clamp(1 - (d - P.cone.r0) / (P.cone.r1 - P.cone.r0), 0, 1);
  const thc = Math.atan2(F.z - P.z, F.x - P.x) + 1.1;
  const SW = 1.5, SP = 5.6, DRIFT = 1.4, FILL = 1.85, step = 0.5;
  let dk = 40, th = thc - SW / 2, dir = 1;
  const push = (d, h) => TRAIL.push([P.x + Math.cos(th) * d, P.z + Math.sin(th) * d, h]);
  // foot: from the sand up to the first leg
  {
    const ds = dk + DRIFT, hs = Math.max(coneH(ds) - FILL, islandH(P, P.x + Math.cos(th) * ds, P.z + Math.sin(th) * ds, true) + 0.1);
    for (let k = 6; k > 0; k--) {
      const dd = ds + k * 0.5;
      push(dd, lerp(hs, islandH(P, P.x + Math.cos(th) * dd, P.z + Math.sin(th) * dd, true), k / 7));
    }
  }
  while (dk > 15) {
    const ds = dk + DRIFT, de = dk - DRIFT;
    const hs = Math.max(coneH(ds) - FILL, TRAIL.length ? TRAIL[TRAIL.length - 1][2] : 0);
    const he = coneH(de) + FILL;
    const n = Math.max(2, Math.ceil(SW * dk / step));
    for (let i = 0; i < n; i++) {
      const u = i / n;
      push(lerp(ds, de, u), lerp(hs, he, u));
      th += dir * SW / n;
    }
    // landing: walk radially inward to the next leg
    const next = dk - SP;
    const ns = next + DRIFT;
    const hn = next > 15 ? Math.max(coneH(ns) - FILL, he) : P.cone.hp;
    const target = next > 15 ? ns : 11.5;
    for (let d = de; d > target; d -= step) push(d, lerp(he, hn, (de - d) / (de - target)));
    dir = -dir;
    dk = next;
  }
})();
export const TRAIL_START = TRAIL[0];

const TCELL = 4, tgrid = new Map();
TRAIL.forEach((p, i) => {
  const k = `${Math.floor(p[0] / TCELL)},${Math.floor(p[1] / TCELL)}`;
  if (!tgrid.has(k)) tgrid.set(k, []);
  tgrid.get(k).push(i);
});
const TN = { d: 1e9, h: 0, i: -1 };
export function nearestTrail(x, z) {
  TN.d = 1e9; TN.i = -1;
  const cx = Math.floor(x / TCELL), cz = Math.floor(z / TCELL);
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
    const l = tgrid.get(`${cx + a},${cz + b}`);
    if (!l) continue;
    for (const i of l) {
      const p = TRAIL[i];
      const d = Math.hypot(p[0] - x, p[1] - z);
      if (d < TN.d) { TN.d = d; TN.h = p[2]; TN.i = i; }
    }
  }
  return TN;
}

function finalH(x, z) {
  let h = rawH(x, z);
  if (Math.abs(x - P.x) < 50 && Math.abs(z - P.z) < 50) {
    const n = nearestTrail(x, z);
    if (n.i >= 0 && n.d < TRAIL_HALF + 1.8) h = lerp(n.h, h, smooth(TRAIL_HALF, TRAIL_HALF + 1.8, n.d));
  }
  return h;
}

// ---------------------------------------------------------------- causeways
export const CW = [];
for (let k = 0; k < 4; k++) {
  const A = ISL[k], B = ISL[k + 1], top = CW_TOP[k];
  const dx = B.x - A.x, dz = B.z - A.z, len = Math.hypot(dx, dz);
  const ux = dx / len, uz = dz / len;
  let sA = 0; while (sA < len && finalH(A.x + ux * sA, A.z + uz * sA) >= top - 1.0) sA += 0.5;
  let sB = 0; while (sB < len && finalH(B.x - ux * sB, B.z - uz * sB) >= top - 1.0) sB += 0.5;
  const ax = A.x + ux * (sA - 4), az = A.z + uz * (sA - 4);
  const bx = B.x - ux * (sB - 4), bz = B.z - uz * (sB - 4);
  CW.push({ ax, az, bx, bz, ux, uz, len: Math.hypot(bx - ax, bz - az), top, k });
}
export function cwH(x, z) {
  let best = -99;
  for (const c of CW) {
    const px = x - c.ax, pz = z - c.az;
    let t = px * c.ux + pz * c.uz;
    if (t < -20 || t > c.len + 20) continue;
    t = clamp(t, 0, c.len);
    const qx = px - c.ux * t, qz = pz - c.uz * t;
    const dl = Math.sqrt(qx * qx + qz * qz);
    if (dl > 20) continue;
    const h = c.top - Math.max(0, dl - CW_HALF) * CW_SLOPE;
    if (h > best) best = h;
  }
  return best;
}

export const PATHS = makePaths(CW);

// ---------------------------------------------------------------- grid bake
export const H = new Float32Array(N * N);
const SURF = new Uint8Array(N * N); // 0 sand, 1 grass, 2 stone
const COL = new Float32Array(N * N * 3);
const GRASS = new Float32Array(N * N);
for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) H[j * N + i] = finalH(W0 + i, W0 + j);

function hAtIdx(i, j) { return H[clamp(j, 0, N - 1) * N + clamp(i, 0, N - 1)]; }

const C = (h) => new THREE.Color(h);
const cWet = C(0xb59d70), cWetDeep = C(0x8f7c59), cSand = C(0xe9d49c), cGrassL = C(0x8cc65a), cGrassD = C(0x63a043),
  cForestL = C(0x5f9a3c), cForestD = C(0x467a2e), cRock = C(0x958c7c), cRockD = C(0x726b60), cDirt = C(0xb68b57), cPlaza = C(0xd8c08a);
const tmp = new THREE.Color();

function islandOf(x, z) {
  let best = null, bd = 1e9;
  for (const I of ISL) { const d = Math.hypot(x - I.x, z - I.z) / I.r1; if (d < bd) { bd = d; best = I; } }
  return best;
}

for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
  const k = j * N + i, x = W0 + i, z = W0 + j, h = H[k];
  const sx = (hAtIdx(i + 1, j) - hAtIdx(i - 1, j)) / 2, sz = (hAtIdx(i, j + 1) - hAtIdx(i, j - 1)) / 2;
  const slope = Math.hypot(sx, sz);
  const I = islandOf(x, z);
  const n = fbm2(x * 0.11, z * 0.11, 2);
  let surf = 1, grass = 0;
  if (h < 2.2 + n * 0.3) { tmp.copy(h < 0 ? cWetDeep : cWet); surf = 0; }
  else if (h < 3.3 + n * 0.5) { tmp.copy(cSand); surf = 0; }
  else {
    let pd = 1e9;
    if (h > 3) for (const p of PATHS) { const v = polyDist(x, z, p); if (v < pd) pd = v; }
    let td = 1e9;
    if (I.id === 'P') td = nearestTrail(x, z).d;
    const light = n > 0.05;
    if (I.id === 'F') tmp.copy(light ? cForestL : cForestD);
    else tmp.copy(light ? cGrassL : cGrassD);
    grass = I.id === 'F' ? 0.5 : I.id === 'L' ? 0.55 : 1.0;
    if (I.id === 'V' && Math.hypot(x - 0, z - 100) < 11.5) { tmp.copy(cPlaza); surf = 0; grass = 0; }
    if (slope > 0.75) { tmp.lerp(cRock, smooth(0.75, 1.0, slope)); grass *= 1 - smooth(0.55, 0.8, slope); if (slope > 0.9) surf = 2; }
    if (slope > 1.25 || (I.id === 'P' && h > 33 && slope > 0.5)) { tmp.copy(n > 0 ? cRock : cRockD); surf = 2; grass = 0; }
    if (pd < 1.5 || td < TRAIL_HALF + 0.2) { tmp.copy(cDirt).multiplyScalar(0.95 + n * 0.1); surf = td < 3 ? 2 : 0; grass = 0; }
    else if (pd < 2.2) grass *= 0.3;
    if (I.id === 'P' && h > 30) grass *= 0.5;
    for (const e of GRASS_EXCL) if (Math.hypot(x - e[0], z - e[1]) < e[2]) grass = 0;
  }
  if (cwH(x, z) > h - 0.1) grass = 0;
  COL[k * 3] = tmp.r; COL[k * 3 + 1] = tmp.g; COL[k * 3 + 2] = tmp.b;
  SURF[k] = surf; GRASS[k] = grass;
}

// ---------------------------------------------------------------- queries
export function terrainAt(x, z) {
  const gx = x - W0, gz = z - W0;
  if (gx < 0 || gz < 0 || gx >= N - 1 || gz >= N - 1) return -9;
  const i = Math.floor(gx), j = Math.floor(gz);
  const fx = gx - i, fz = gz - j;
  const k = j * N + i;
  const h00 = H[k], h10 = H[k + 1], h01 = H[k + N], h11 = H[k + N + 1];
  if (fx + fz <= 1) return h00 + (h10 - h00) * fx + (h01 - h00) * fz;
  return h11 + (h01 - h11) * (1 - fx) + (h10 - h11) * (1 - fz);
}
export function surfAt(x, z) {
  const i = clamp(Math.round(x - W0), 0, N - 1), j = clamp(Math.round(z - W0), 0, N - 1);
  return SURF[j * N + i];
}
export const GR = { h: 0, surf: 'sand', plat: false };
const SURFN = ['sand', 'grass', 'stone'];
export function groundAt(x, z, yRef = 1e9) {
  let g = terrainAt(x, z), s = null;
  GR.plat = false;
  const c = cwH(x, z);
  if (c > g) { g = c; s = 'stone'; }
  if (platformTop(x, z, yRef) && PT.top > g) { g = PT.top; s = PT.mat; GR.plat = true; }
  GR.h = g;
  GR.surf = s || SURFN[surfAt(x, z)];
  return GR;
}

// ---------------------------------------------------------------- meshes
export function buildTerrain(scene, material) {
  const CH = 32, meshes = [];
  const lowest = TIDE[TIDE.length - 1] - 1.4;
  for (let cj = 0; cj < (N - 1) / CH; cj++) for (let ci = 0; ci < (N - 1) / CH; ci++) {
    const i0 = ci * CH, j0 = cj * CH;
    let mx = -1e9;
    for (let j = j0; j <= j0 + CH; j++) for (let i = i0; i <= i0 + CH; i++) mx = Math.max(mx, H[j * N + i]);
    if (mx < lowest) continue;
    const V = CH + 1;
    const pos = new Float32Array(V * V * 3), nor = new Float32Array(V * V * 3), col = new Float32Array(V * V * 3);
    for (let b = 0; b < V; b++) for (let a = 0; a < V; a++) {
      const i = i0 + a, j = j0 + b, k = j * N + i, v = b * V + a;
      pos[v * 3] = W0 + i; pos[v * 3 + 1] = H[k]; pos[v * 3 + 2] = W0 + j;
      const nx = hAtIdx(i - 1, j) - hAtIdx(i + 1, j), nz = hAtIdx(i, j - 1) - hAtIdx(i, j + 1);
      const l = Math.hypot(nx, 2, nz);
      nor[v * 3] = nx / l; nor[v * 3 + 1] = 2 / l; nor[v * 3 + 2] = nz / l;
      col[v * 3] = COL[k * 3]; col[v * 3 + 1] = COL[k * 3 + 1]; col[v * 3 + 2] = COL[k * 3 + 2];
    }
    const idx = new Uint16Array(CH * CH * 6);
    let p = 0;
    for (let b = 0; b < CH; b++) for (let a = 0; a < CH; a++) {
      const v00 = b * V + a, v10 = v00 + 1, v01 = v00 + V, v11 = v01 + 1;
      idx[p++] = v00; idx[p++] = v01; idx[p++] = v10;
      idx[p++] = v10; idx[p++] = v01; idx[p++] = v11;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, material);
    m.castShadow = true; m.receiveShadow = true;
    m.matrixAutoUpdate = false;
    scene.add(m);
    meshes.push(m);
  }
  return meshes;
}

export function buildHeightTexture() {
  const data = new Uint16Array(N * N * 4);
  const toH = THREE.DataUtils.toHalfFloat;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = j * N + i;
    const h = Math.max(H[k], cwH(W0 + i, W0 + j));
    data[k * 4] = toH(h); data[k * 4 + 1] = toH(GRASS[k]); data[k * 4 + 2] = toH(0); data[k * 4 + 3] = toH(1);
  }
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.HalfFloatType);
  t.minFilter = t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

// Causeway mound ribbons (stone-topped embankments with rubble flanks).
export function buildCauseways(scene, material, addTop) {
  const offs = [-16, -11, -7, -4.4, -2.9, -2, 2, 2.9, 4.4, 7, 11, 16];
  const meshes = [];
  const cTop = new THREE.Color(0x9a958a), cSide = new THREE.Color(0x6c7469), cWeed = new THREE.Color(0x4f6b4a);
  for (const c of CW) {
    const px = -c.uz, pz = c.ux;
    const rows = [];
    for (let t = -6; t <= c.len + 6.01; t += 1) rows.push(t);
    const pos = [], col = [], idx = [];
    for (const t of rows) for (const l of offs) {
      const x = c.ax + c.ux * t + px * l, z = c.az + c.uz * t + pz * l;
      const tt = clamp(t, 0, c.len);
      const dl = Math.hypot(t - tt, l);
      const h = Math.max(-9.5, c.top - Math.max(0, dl - CW_HALF) * CW_SLOPE) - (Math.abs(l) <= CW_HALF && t >= 0 && t <= c.len ? 0.05 : 0);
      pos.push(x, h, z);
      const w = Math.abs(l) > CW_HALF ? smooth(0, 3, c.top - h) : 0;
      tmp.copy(cTop).lerp(cSide, Math.min(1, Math.abs(l) > CW_HALF ? 0.6 + w * 0.4 : 0));
      if (h < c.top - 1.2) tmp.lerp(cWeed, 0.35);
      col.push(tmp.r, tmp.g, tmp.b);
    }
    const W = offs.length;
    for (let r = 0; r < rows.length - 1; r++) for (let q = 0; q < W - 1; q++) {
      const a = r * W + q, b = a + 1, cc = a + W, d = cc + 1;
      idx.push(a, b, cc, b, d, cc);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    // orientation check: make sure normals face up
    const nrm = g.attributes.normal;
    let up = 0; for (let i = 0; i < nrm.count; i++) up += nrm.getY(i);
    if (up < 0) {
      const ix = g.index.array;
      for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
      g.computeVertexNormals();
    }
    const m = new THREE.Mesh(g, material);
    m.receiveShadow = true; m.castShadow = false;
    scene.add(m);
    meshes.push(m);
    if (addTop) addTop(c);
  }
  return meshes;
}

export function beaconGround(i) { const [x, z] = BEACON_XZ[i]; return terrainAt(x, z); }
