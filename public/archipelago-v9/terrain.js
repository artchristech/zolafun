// Island layout, analytic height function, baked heightfield, terrain + causeway meshes.
import * as THREE from './three.module.min.js';
import { clamp, lerp, smooth, fbm, vnoise, rng, Builder, toon, G, mat4 } from './util.js';

// Tide levels: index = number of beacons lit.
export const TIDE = [2.8, 2.1, 1.4, 0.7, 0.0, -0.7];

export const ISL = {
  V: { x: 0, z: 0, r: 40, h: 7, wob: 0.05, amp: 1.0, seed: 1 },
  M: { x: -90, z: -55, r: 28, h: 6, wob: 0.1, amp: 0.8, seed: 7 },
  F: { x: -90, z: -180, r: 46, h: 5.0, wob: 0.06, amp: 0.2, seed: 13 },
  P: { x: 50, z: -190, r: 46, h: 6, wob: 0.08, amp: 0.8, seed: 21 },
  L: { x: -15, z: -95, r: 24, h: 5, wob: 0.08, amp: 0.5, seed: 31 },
};
export const ISL_LIST = ['V', 'M', 'F', 'P', 'L'];

export const PEAK = { x: 58, z: -196, top: 42, rTop: 11, rBase: 28 };
PEAK.slope = (PEAK.top - 6) / (PEAK.rBase - PEAK.rTop);

// Areas levelled for landmarks.
export const FLAT = [
  { x: 0, z: 14, r: 13, h: 4.3, b: 9 },        // village square
  { x: -18, z: 4, r: 4, h: 5.6, b: 5 },        // beacon 1 knoll
  { x: -90, z: -55, r: 12, h: 5, b: 6 },       // monolith ring
  { x: -98, z: -176, r: 17, h: 5.0, b: 6 },    // wreck clearing
  { x: -15, z: -95, r: 12, h: 5, b: 5 },       // lighthouse base
];

// Causeway k is revealed when beacon k is lit.
export const CAUSEWAYS = [];
function addCause(k, a, b) {
  const A = ISL[a], B = ISL[b];
  const dx = B.x - A.x, dz = B.z - A.z, L = Math.hypot(dx, dz);
  const ux = dx / L, uz = dz / L;
  const s0 = A.r * 0.6, s1 = L - B.r * 0.6;
  CAUSEWAYS.push({
    k, top: TIDE[k] + 0.3, hw: 1.7,
    x0: A.x + ux * s0, z0: A.z + uz * s0, x1: A.x + ux * s1, z1: A.z + uz * s1,
    ux, uz, len: s1 - s0,
  });
}
addCause(1, 'V', 'M');
addCause(2, 'M', 'F');
addCause(3, 'F', 'P');
addCause(4, 'P', 'L');
addCause(5, 'L', 'V');

// --- switchback trail up the peak --------------------------------------------
export const TRAIL = [];
export const TRAIL_TURNS = [];
// Four level lanes cut into the cone at fixed radii, joined by flat U-turns.
{
  const LANES = [26.5, 21.8, 17.1, 12.4], TH0 = Math.PI, SPAN = (55 * Math.PI) / 180, H0 = 6.6;
  const TURN_GAIN = 1.0;
  const legGain = (PEAK.top - H0 - TURN_GAIN * (LANES.length - 1)) / LANES.length;
  let H = H0;
  LANES.forEach((R, i) => {
    const dir = i % 2 === 0 ? 1 : -1;
    const a0 = TH0 - dir * SPAN, a1 = TH0 + dir * SPAN;
    const n = Math.ceil((R * 2 * SPAN) / 0.7);
    for (let j = 0; j <= n; j++) {
      const t = j / n, a = lerp(a0, a1, t);
      TRAIL.push({ x: PEAK.x + Math.cos(a) * R, z: PEAK.z + Math.sin(a) * R, h: H + legGain * t, leg: i });
    }
    H += legGain;
    if (i === LANES.length - 1) return;
    // U-turn: semicircle from lane R to lane R-5, bulging past the lane end
    const rad = (R - LANES[i + 1]) / 2;
    const cr = R - rad;
    const cx = PEAK.x + Math.cos(a1) * cr, cz = PEAK.z + Math.sin(a1) * cr;
    const ox = Math.cos(a1), oz = Math.sin(a1);            // outward
    const tx = -Math.sin(a1) * dir, tz = Math.cos(a1) * dir; // onward, past the lane end
    const m = Math.ceil((Math.PI * rad) / 0.7);
    for (let j = 1; j < m; j++) {
      const f = (j / m) * Math.PI;
      TRAIL.push({ x: cx + (ox * Math.cos(f) + tx * Math.sin(f)) * rad, z: cz + (oz * Math.cos(f) + tz * Math.sin(f)) * rad, h: H + TURN_GAIN * (j / m), leg: i + 0.5 });
    }
    TRAIL_TURNS.push({ cx, cz, tx, tz, rad, h: H + TURN_GAIN * 0.5 });
    H += TURN_GAIN;
  });
  // a short run-out from the foot of the trail onto the plain
  const a = TH0 - SPAN;
  for (let j = 1; j <= 8; j++) {
    const r = LANES[0] + j * 0.8;
    TRAIL.unshift({ x: PEAK.x + Math.cos(a) * r, z: PEAK.z + Math.sin(a) * r, h: Math.max(H0 - j * 0.15, 5), leg: -1 });
  }
}
const TRAIL_HALF = 1.5, TRAIL_BLEND = 2.8;

function nearestTrail(x, z) {
  let best = 1e9, bp = null;
  for (let i = 0; i < TRAIL.length; i++) {
    const p = TRAIL[i];
    const d = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z);
    if (d < best) { best = d; bp = p; }
  }
  return { d: Math.sqrt(best), p: bp };
}

function islandH(I, x, z) {
  const dx = x - I.x, dz = z - I.z;
  const dist = Math.hypot(dx, dz);
  if (dist > I.r * 1.45) return -99;
  const rr = I.r * (1 + I.wob * fbm(x * 0.025 + I.seed, z * 0.025 - I.seed, 3));
  const d = dist / rr;
  if (d < 0.7) {
    const inner = 1 - smooth(0.05, 0.7, d);
    return 4.3 + (I.h - 4.3) * inner + fbm(x * 0.05 + I.seed, z * 0.05, 3) * I.amp * (1 - smooth(0.5, 0.7, d));
  }
  if (d < 1.0) {
    const t = (d - 0.7) / 0.3;
    return lerp(4.3, -1.6, t * t * (3 - 2 * t) * 0.35 + t * 0.65);
  }
  return lerp(-1.6, -6.5, smooth(1.0, 1.25, d));
}

// Raw analytic height plus trail weight.
export function heightRaw(x, z) {
  let h = -6.5 + vnoise(x * 0.05, z * 0.05) * 0.4;
  for (const k of ISL_LIST) h = Math.max(h, islandH(ISL[k], x, z));
  let tw = 0, peak = 0;
  const pd = Math.hypot(x - PEAK.x, z - PEAK.z);
  if (pd < PEAK.rBase + 6) {
    let c;
    if (pd < PEAK.rTop) c = PEAK.top;
    else c = PEAK.top - (pd - PEAK.rTop) * PEAK.slope + fbm(x * 0.15, z * 0.15, 3) * 1.6 * smooth(PEAK.rTop, PEAK.rTop + 3, pd);
    if (c > h) { peak = smooth(0, 3, c - h); h = c; }
    if (pd > PEAK.rTop + 0.2) {
      const n = nearestTrail(x, z);
      if (n.d < TRAIL_BLEND) {
        const w = 1 - smooth(TRAIL_HALF, TRAIL_BLEND, n.d);
        h = lerp(h, n.p.h, w);
        tw = w;
      }
    }
  }
  for (const f of FLAT) {
    const d = Math.hypot(x - f.x, z - f.z);
    if (d < f.r + f.b) h = lerp(h, f.h, 1 - smooth(f.r, f.r + f.b, d));
  }
  return { h, tw, peak };
}

// --- baked grid ---------------------------------------------------------------
export const BOUNDS = { x0: -175, z0: -265, x1: 135, z1: 70 };
const RES = 0.5;
const NX = Math.round((BOUNDS.x1 - BOUNDS.x0) / RES) + 1;
const NZ = Math.round((BOUNDS.z1 - BOUNDS.z0) / RES) + 1;
let HGRID = null, TGRID = null, PGRID = null;

export function bake() {
  HGRID = new Float32Array(NX * NZ);
  TGRID = new Uint8Array(NX * NZ);
  PGRID = new Uint8Array(NX * NZ);
  for (let j = 0; j < NZ; j++) {
    const z = BOUNDS.z0 + j * RES;
    for (let i = 0; i < NX; i++) {
      const x = BOUNDS.x0 + i * RES;
      const r = heightRaw(x, z);
      HGRID[j * NX + i] = r.h;
      TGRID[j * NX + i] = Math.round(r.tw * 255);
      PGRID[j * NX + i] = Math.round(r.peak * 255);
    }
  }
}

function sampleGrid(grid, x, z) {
  const fx = clamp((x - BOUNDS.x0) / RES, 0, NX - 1.001), fz = clamp((z - BOUNDS.z0) / RES, 0, NZ - 1.001);
  const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
  const a = grid[j * NX + i], b = grid[j * NX + i + 1], c = grid[(j + 1) * NX + i], d = grid[(j + 1) * NX + i + 1];
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}
export const terrainH = (x, z) => sampleGrid(HGRID, x, z);
export const trailW = (x, z) => sampleGrid(TGRID, x, z) / 255;
export const peakW = (x, z) => sampleGrid(PGRID, x, z) / 255;

// Causeway query: returns top height or -99.
export function causewayAt(x, z) {
  let best = -99;
  for (const c of CAUSEWAYS) {
    const px = x - c.x0, pz = z - c.z0;
    const t = px * c.ux + pz * c.uz;
    if (t < -1 || t > c.len + 1) continue;
    const lat = Math.abs(px * -c.uz + pz * c.ux);
    if (lat <= c.hw && c.top > best) best = c.top;
  }
  return best;
}

// --- meshes ---------------------------------------------------------------------
const C_SAND = new THREE.Color(0.95, 0.83, 0.6), C_WET = new THREE.Color(0.72, 0.6, 0.44);
const C_GRASS = new THREE.Color(0.42, 0.62, 0.27), C_GRASS2 = new THREE.Color(0.32, 0.52, 0.22);
const C_ROCK = new THREE.Color(0.58, 0.52, 0.47), C_TRAIL = new THREE.Color(0.74, 0.58, 0.4);
const C_FOREST = new THREE.Color(0.3, 0.42, 0.2);

function colorAt(x, z, h, slope, out) {
  const tw = trailW(x, z), pk = peakW(x, z);
  if (h < TIDE[0] + 0.9) {
    out.copy(C_WET).lerp(C_SAND, smooth(-1.5, TIDE[0] + 0.4, h));
  } else {
    const n = vnoise(x * 0.12, z * 0.12) * 0.5 + 0.5;
    out.copy(C_GRASS).lerp(C_GRASS2, n);
    const inForest = Math.hypot(x - ISL.F.x, z - ISL.F.z) < ISL.F.r * 0.62;
    if (inForest) out.lerp(C_FOREST, 0.55);
    out.lerp(C_SAND, 1 - smooth(TIDE[0] + 0.9, TIDE[0] + 1.6, h));
  }
  if (slope > 0.75 || pk > 0.5) out.lerp(C_ROCK, Math.max(smooth(0.75, 1.1, slope), pk));
  if (tw > 0.35) out.lerp(C_TRAIL, smooth(0.35, 0.7, tw));
  return out;
}

export function buildTerrainMeshes(material) {
  const meshes = [];
  const col = new THREE.Color();
  for (const k of ISL_LIST) {
    const I = ISL[k];
    const ext = I.r * 1.45;
    const res = k === 'P' ? 1.0 : 1.4;
    const n = Math.ceil((ext * 2) / res);
    const verts = (n + 1) * (n + 1);
    const pos = new Float32Array(verts * 3), colr = new Float32Array(verts * 3);
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
      const x = I.x - ext + i * res, z = I.z - ext + j * res;
      const h = terrainH(x, z);
      const o = (j * (n + 1) + i) * 3;
      pos[o] = x; pos[o + 1] = h; pos[o + 2] = z;
      const sx = terrainH(x + 0.6, z) - terrainH(x - 0.6, z), sz = terrainH(x, z + 0.6) - terrainH(x, z - 0.6);
      const slope = Math.hypot(sx, sz) / 1.2;
      colorAt(x, z, h, slope, col);
      colr[o] = col.r; colr[o + 1] = col.g; colr[o + 2] = col.b;
    }
    const idx = [];
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const a = j * (n + 1) + i, b = a + 1, c = a + n + 1, d = c + 1;
      // skip quads fully below the seabed plane
      if (pos[a * 3 + 1] < -6.3 && pos[b * 3 + 1] < -6.3 && pos[c * 3 + 1] < -6.3 && pos[d * 3 + 1] < -6.3) continue;
      idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(colr, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, material);
    m.receiveShadow = true;
    m.castShadow = true;
    m.userData.solid = true;
    meshes.push(m);
  }
  // seabed
  const sb = new THREE.PlaneGeometry(900, 900, 1, 1);
  sb.rotateX(-Math.PI / 2);
  const sbm = new THREE.Mesh(sb, toon({ color: 0x2c6f78 }));
  sbm.position.set(-20, -6.7, -95);
  meshes.push(sbm);
  return meshes;
}

export function buildCauseways() {
  const R = rng(99);
  const list = [];
  for (const c of CAUSEWAYS) {
    const b = new Builder();
    const steps = Math.ceil(c.len / 2.1);
    const yaw = Math.atan2(c.ux, c.uz);
    for (let i = 0; i <= steps; i++) {
      const s = (i / steps) * c.len;
      const x = c.x0 + c.ux * s, z = c.z0 + c.uz * s;
      if (terrainH(x, z) > c.top + 0.15) continue;
      const shade = 0.78 + R() * 0.18;
      const colr = new THREE.Color(0.62 * shade, 0.6 * shade, 0.55 * shade);
      const depth = c.top - Math.max(terrainH(x, z), -6.5) + 0.2;
      // slab
      b.add(G.box, colr, mat4(x, c.top - 0.25, z, (R() - 0.5) * 0.02, yaw + (R() - 0.5) * 0.04, (R() - 0.5) * 0.02, c.hw * 2 + 0.2, 0.5, 2.0));
      // body down to seabed
      if (depth > 0.6) b.add(G.box, colr.clone().multiplyScalar(0.8), mat4(x, c.top - 0.5 - depth / 2, z, 0, yaw, 0, c.hw * 2 - 0.2, depth, 1.9));
      // barnacle crust along the sides
      if (R() < 0.6) b.add(G.ico, 0x8d8a7e, mat4(x + c.uz * c.hw * (R() < 0.5 ? 1 : -1), c.top - 0.35, z - c.ux * c.hw, R(), R(), R(), 0.35, 0.25, 0.35));
      // broken bollards
      if (i % 6 === 3) {
        const side = R() < 0.5 ? 1 : -1;
        const hh = 0.6 + R() * 1.4;
        b.add(G.cyl6, colr, mat4(x + c.uz * (c.hw + 0.15) * side, c.top + hh / 2 - 0.1, z - c.ux * (c.hw + 0.15) * side, (R() - 0.5) * 0.2, 0, (R() - 0.5) * 0.2, 0.3, hh, 0.3));
      }
    }
    const g = b.build();
    if (!g) continue;
    list.push({ k: c.k, geo: g, mid: { x: c.x0 + c.ux * c.len / 2, z: c.z0 + c.uz * c.len / 2 }, c });
  }
  return list;
}

// Heightmap texture for the water shader (depth for foam & colour).
export function waterHeightTexture() {
  const S = 1.0;
  const w = Math.round((BOUNDS.x1 - BOUNDS.x0) / S), h = Math.round((BOUNDS.z1 - BOUNDS.z0) / S);
  const data = new Uint16Array(w * h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const x = BOUNDS.x0 + i * S, z = BOUNDS.z0 + j * S;
    let v = terrainH(x, z);
    const c = causewayAt(x, z);
    if (c > v) v = c;
    data[j * w + i] = THREE.DataUtils.toHalfFloat(v);
  }
  const tex = new THREE.DataTexture(data, w, h, THREE.RedFormat, THREE.HalfFloatType);
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}
