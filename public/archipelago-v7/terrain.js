// Terrain: analytic island heights, a baked walk grid (terrain + causeways), island meshes, water heightmap.
import * as THREE from './three.module.min.js';
import { clamp, lerp, smoothstep, fbm, segDist, sceneryMat } from './util.js';
import { ISL, PADS, CAUSEWAYS, CAUSEWAY_HALF, TRAIL, TRAIL_HALF, PATHS, PATH_HALF, TIDE0 } from './layout.js';

export const GRID_MIN = -210;
export const GRID_SIZE = 420;
export const RES = 0.5;
export const GN = Math.round(GRID_SIZE / RES) + 1;
export const ground = new Float32Array(GN * GN);
export const groundMat = new Uint8Array(GN * GN); // 0 natural, 1 paved, 2 dirt, 3 causeway, 4 trail

const ISLS = Object.entries(ISL).map(([k, v], i) => Object.assign({ key: k, seed: i * 17.3 }, v));
const O = ISL.O;

// trail legs (6) as arrays of segments for blending
const LEGS = [];
{
  const per = 26;
  for (let l = 0; l < 6; l++) LEGS.push(TRAIL.slice(l * per, l * per + per + 1));
}

let _mat = 0;
export function lastMat() { return _mat; }

const _legD = new Float32Array(6), _legH = new Float32Array(6), _ord = [0, 1, 2, 3, 4, 5];

export function terrainH(x, z) {
  _mat = 0;
  let h = -9;
  for (let i = 0; i < ISLS.length; i++) {
    const I = ISLS[i];
    const dx = x - I.x, dz = z - I.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d > I.r * 1.75) continue;
    const t = d / I.r;
    const tw = t + fbm(x * 0.045 + I.seed, z * 0.045, 3) * 0.13;
    let land = I.h * smoothstep(1.1, 0.62, tw);
    land += fbm(x * 0.06 + 3.1, z * 0.06 - 1.7, 2) * 0.9 * smoothstep(0.95, 0.5, tw);
    const sea = -9 * smoothstep(0.95, 1.6, tw);
    let hi = land + sea;
    if (I.key === 'O') {
      let cone = d < 14.5 ? 40 : 40 - (d - 14.5) * (36.4 / 27.5);
      cone += fbm(x * 0.13, z * 0.13, 2) * 2.2 * smoothstep(15, 19, d) * smoothstep(44, 36, d);
      if (d < 14.5) cone = 40;
      hi = Math.max(hi, cone);
    }
    if (hi > h) h = hi;
  }
  // switchback trail
  const dO = Math.hypot(x - O.x, z - O.z);
  if (dO < 54) {
    for (let l = 0; l < 6; l++) {
      const leg = LEGS[l];
      let best = 1e9, bh = 0;
      for (let s = 0; s < leg.length - 1; s++) {
        const a = leg[s], b = leg[s + 1];
        const r = segDist(x, z, a[0], a[1], b[0], b[1]);
        if (r.d < best) { best = r.d; bh = lerp(a[2], b[2], r.t); }
      }
      _legD[l] = best; _legH[l] = bh;
    }
    _ord.sort((a, b) => _legD[b] - _legD[a]);
    for (let k = 0; k < 6; k++) {
      const l = _ord[k];
      const d = _legD[l];
      if (d < TRAIL_HALF + 2.6) {
        const w = smoothstep(TRAIL_HALF + 2.6, TRAIL_HALF, d);
        h = lerp(h, _legH[l], w);
        if (d < TRAIL_HALF + 0.2) _mat = 4;
      }
    }
  }
  // pads
  for (let i = 0; i < PADS.length; i++) {
    const p = PADS[i];
    const d = Math.hypot(x - p.x, z - p.z);
    if (d < p.r + p.blend) {
      h = lerp(h, p.h, smoothstep(p.r + p.blend, p.r, d));
      if (d < p.r && p.mat === 1) _mat = 1;
    }
  }
  // forest paths
  if (Math.abs(x - ISL.S.x) < 60 && Math.abs(z - ISL.S.z) < 60 && _mat === 0) {
    for (const path of PATHS) {
      for (let s = 0; s < path.length - 1; s++) {
        const r = segDist(x, z, path[s][0], path[s][1], path[s + 1][0], path[s + 1][1]);
        if (r.d < PATH_HALF * 0.85 + fbm(x * 0.3, z * 0.3, 1) * 0.4) { _mat = 2; break; }
      }
    }
  }
  return h;
}

// Causeway walking surface (or -99); soft shoulders so stepping on and off is gentle.
export function causewayH(x, z) {
  let best = -99;
  for (const c of CAUSEWAYS) {
    const b = c.bbox;
    if (x < b[0] || x > b[2] || z < b[1] || z > b[3]) continue;
    let dmin = 1e9;
    const p = c.pts;
    for (let s = 0; s < p.length - 1; s++) {
      const r = segDist(x, z, p[s][0], p[s][1], p[s + 1][0], p[s + 1][1]);
      if (r.d < dmin) dmin = r.d;
    }
    let h = -99;
    if (dmin < CAUSEWAY_HALF) h = c.top;
    else if (dmin < CAUSEWAY_HALF + 2.0) h = c.top - (dmin - CAUSEWAY_HALF) * 0.55;
    if (h > best) best = h;
  }
  return best;
}

export function bakeGround() {
  for (let j = 0; j < GN; j++) {
    const z = GRID_MIN + j * RES;
    for (let i = 0; i < GN; i++) {
      const x = GRID_MIN + i * RES;
      let h = terrainH(x, z);
      let m = _mat;
      const ch = causewayH(x, z);
      if (ch > h + 0.02) { h = ch; m = 3; }
      ground[j * GN + i] = h;
      groundMat[j * GN + i] = m;
    }
  }
}

export function groundAt(x, z) {
  const fx = (x - GRID_MIN) / RES, fz = (z - GRID_MIN) / RES;
  if (fx < 0 || fz < 0 || fx >= GN - 1 || fz >= GN - 1) return -9;
  const ix = fx | 0, iz = fz | 0;
  const tx = fx - ix, tz = fz - iz;
  const o = iz * GN + ix;
  const a = ground[o], b = ground[o + 1], c = ground[o + GN], d = ground[o + GN + 1];
  return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
}

export function matAt(x, z) {
  const ix = Math.round((x - GRID_MIN) / RES), iz = Math.round((z - GRID_MIN) / RES);
  if (ix < 0 || iz < 0 || ix >= GN || iz >= GN) return 0;
  return groundMat[iz * GN + ix];
}

export function slopeAt(x, z) {
  const e = 0.8;
  const dx = groundAt(x + e, z) - groundAt(x - e, z);
  const dz = groundAt(x, z + e) - groundAt(x, z - e);
  return Math.hypot(dx, dz) / (2 * e);
}

const C = (h) => new THREE.Color(h);
const COL = {
  sand: C('#e9d29a'), wetSand: C('#b59d70'), grass: C('#86b54c'), grassDark: C('#5e963c'), grassLight: C('#a9c860'),
  forest: C('#4d7c35'), rock: C('#8e8476'), rockDark: C('#6f675d'), paved: C('#bdb29c'), pavedDark: C('#a59a84'),
  dirt: C('#a3845a'), trail: C('#d2b27c'), trailEdge: C('#9c8a6a'), seabed: C('#7f8f74'),
};

function terrainColor(x, z, h, m, ny, key, out) {
  const n = fbm(x * 0.15, z * 0.15, 2);
  if (m === 1) {
    const chk = ((Math.floor(x / 1.6) + Math.floor(z / 1.6)) & 1) === 0;
    out.copy(chk ? COL.paved : COL.pavedDark);
  } else if (m === 2) {
    out.copy(COL.dirt).lerp(COL.forest, 0.15 + n * 0.1);
  } else if (m === 4) {
    out.copy(COL.trail);
  } else {
    const shore = TIDE0 + 0.45;
    if (h < -0.4) out.copy(COL.wetSand).lerp(COL.seabed, smoothstep(-0.4, -4, h));
    else if (h < shore) out.copy(COL.sand);
    else {
      out.copy(COL.grass).lerp(n > 0 ? COL.grassLight : COL.grassDark, Math.abs(n) * 1.3);
      if (key === 'S') {
        const d = Math.hypot(x - ISL.S.x - 4, z - ISL.S.z - 4);
        if (d > 19) out.lerp(COL.forest, 0.75);
      }
      out.lerp(COL.sand, smoothstep(shore + 0.7, shore, h));
    }
    if (ny < 0.8 && h > shore) out.lerp(n > 0 ? COL.rock : COL.rockDark, smoothstep(0.8, 0.66, ny));
  }
  // trail edge darkening for readability
  if (m !== 4 && key === 'O') {
    const ix = Math.round((x - GRID_MIN) / RES), iz = Math.round((z - GRID_MIN) / RES);
    let near = false;
    for (let a = -3; a <= 3 && !near; a += 3) for (let b = -3; b <= 3; b += 3) {
      const ii = ix + a, jj = iz + b;
      if (ii >= 0 && jj >= 0 && ii < GN && jj < GN && groundMat[jj * GN + ii] === 4) { near = true; break; }
    }
    if (near) out.lerp(COL.trailEdge, 0.55);
  }
  return out;
}

export function buildTerrainMeshes(scene) {
  const meshes = [];
  const spec = { V: 1.4, M: 1.3, O: 1.1, S: 1.4, L: 1.15 };
  const tmp = new THREE.Color();
  for (const I of ISLS) {
    const half = I.r * (I.key === 'O' ? 1.32 : 1.48);
    const seg = Math.round((half * 2) / spec[I.key]);
    const g = new THREE.PlaneGeometry(half * 2, half * 2, seg, seg);
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    const mats = new Uint8Array(p.count);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) + I.x, z = p.getZ(i) + I.z;
      p.setXYZ(i, x, terrainH(x, z), z);
      mats[i] = _mat;
    }
    g.computeVertexNormals();
    const nrm = g.attributes.normal;
    const col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      terrainColor(p.getX(i), p.getZ(i), p.getY(i), mats[i], nrm.getY(i), I.key, tmp);
      col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, sceneryMat());
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.matrixAutoUpdate = false;
    scene.add(mesh);
    meshes.push(mesh);
  }
  return meshes;
}

// Half-float height texture for the water shader (depth colour, foam, submerged causeways).
export const HM_SIZE = 512;
export function buildHeightTexture() {
  const data = new Uint16Array(HM_SIZE * HM_SIZE);
  for (let j = 0; j < HM_SIZE; j++) {
    const z = GRID_MIN + (j / (HM_SIZE - 1)) * GRID_SIZE;
    for (let i = 0; i < HM_SIZE; i++) {
      const x = GRID_MIN + (i / (HM_SIZE - 1)) * GRID_SIZE;
      data[j * HM_SIZE + i] = THREE.DataUtils.toHalfFloat(clamp(groundAt(x, z), -12, 60));
    }
  }
  const tex = new THREE.DataTexture(data, HM_SIZE, HM_SIZE, THREE.RedFormat, THREE.HalfFloatType);
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

// Which island (key) a point belongs to, or null when at sea.
export function islandAt(x, z) {
  let best = null, bd = 1e9;
  for (const I of ISLS) {
    const d = Math.hypot(x - I.x, z - I.z) / I.r;
    if (d < 1.15 && d < bd) { bd = d; best = I.key; }
  }
  return best;
}

export function nearestCausewayPoint(x, z, k) {
  const c = CAUSEWAYS[k];
  let best = null, bd = 1e9;
  for (const p of c.pts) {
    const d = Math.hypot(p[0] - x, p[1] - z);
    if (d < bd) { bd = d; best = p; }
  }
  return { p: best, d: bd };
}
