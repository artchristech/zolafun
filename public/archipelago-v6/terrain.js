// Five Lights — island heightfield, causeways, walkable platforms, terrain meshes.
import * as THREE from './three.module.min.js';
import { clamp, lerp, smoothstep, fbm, noise2, segDist, polyDist } from './util.js';
import { ISLANDS, CAUSE_TOPS, VILLAGE, RING, FOREST, PEAK, LIGHT, BOUNDS } from './layout.js';

export const CAUSEWAYS = [];
export const PLATFORMS = [];   // walkable decks added by landmarks
export const TRAIL = [];       // world points {x,z,h}
export const PATHS = [];       // polylines of {x,z}
export const SCORCH = [];      // segments [{x,z},{x,z}] — burnt lines in the forest
const KNOLLS = [VILLAGE.knoll];
export const RAMPS = [];       // gentle cuts from each causeway end up into its island
const FLATS = [];
const STONE_ZONES = [];

function islandH(I, x, z) {
  const dx = x - I.x, dz = z - I.z;
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d > I.R * 1.3) return -99;
  const a = Math.atan2(dz, dx);
  const rr = I.R * (1 + I.wob * (0.6 * Math.sin(3 * a + I.seed) + 0.4 * Math.sin(5 * a + I.seed * 2.3)));
  const t = d / rr;
  let h = -4 + (I.H + 4) * smoothstep(1, 0.55, t);
  let bumpK = smoothstep(1.0, 0.6, t);
  if (I.peak) {
    const s = clamp((I.coneR - d) / (I.coneR - I.plateauR), 0, 1);
    h += (I.peak - I.H) * s;
    bumpK *= 1 - s;
    // rock ribs on the cone face
    h += 0.8 * s * (1 - s) * 4 * noise2(a * 6 + I.seed, d * 0.15);
  }
  h += I.bump * fbm(x * 0.045 + I.seed * 10, z * 0.045) * 1.6 * bumpK;
  return h;
}

export function baseH(x, z) {
  let h = -4 + 0.5 * noise2(x * 0.03, z * 0.03);
  for (const I of ISLANDS) { const v = islandH(I, x, z); if (v > h) h = v; }
  for (const k of KNOLLS) {
    const dx = x - k.x, dz = z - k.z;
    h += k.h * Math.exp(-(dx * dx + dz * dz) / (k.r * k.r));
  }
  return h;
}

export function terrainH(x, z) {
  let h = baseH(x, z);
  for (const f of FLATS) {
    const d = Math.hypot(x - f.x, z - f.z);
    if (d < f.r + f.blend) h = lerp(h, f.h, smoothstep(f.r + f.blend, f.r, d));
  }
  for (const R of RAMPS) {
    const rx = x - R.x, rz = z - R.z;
    const s = rx * R.dx + rz * R.dz;
    if (s < -1 || s > 17) continue;
    const lat = Math.abs(rx * R.dz - rz * R.dx);
    if (lat > R.hw + 4) continue;
    const target = R.top + Math.max(0, s) * 0.28;
    const w = smoothstep(R.hw + 4, R.hw + 0.6, lat) * (1 - smoothstep(12, 17, s)) * smoothstep(-1, 0.5, s);
    h = lerp(h, target, w);
  }
  if (TRAIL.length) {
    const I = ISLANDS[3];
    if (Math.abs(x - I.x) < 50 && Math.abs(z - I.z) < 50) {
      const r = polyDist(x, z, TRAIL);
      if (r.d < 2.6) {
        const a = TRAIL[r.i], b = TRAIL[r.i + 1];
        const th = lerp(a.h, b.h, r.t);
        h = lerp(h, th, smoothstep(2.6, 1.5, r.d));
      }
    }
  }
  return h;
}

function causewayH(C, x, z) {
  if (x < C.minx || x > C.maxx || z < C.minz || z > C.maxz) return -99;
  const r = segDist(x, z, C.ax, C.az, C.bx, C.bz);
  if (r.d > C.hw + 2) return -99;
  // slabs: a gentle crown across the width, steep sides
  const crown = C.top + 0.08 * (1 - (r.d / C.hw) ** 2);
  return r.d <= C.hw ? crown : C.top - (r.d - C.hw) * 2.2;
}

function platformH(P, x, z) {
  if (P.type === 'circle') {
    return Math.hypot(x - P.x, z - P.z) <= P.r ? P.y : -99;
  }
  const dx = x - P.x, dz = z - P.z;
  const c = Math.cos(P.rot || 0), s = Math.sin(P.rot || 0);
  const lx = dx * c - dz * s, lz = dx * s + dz * c;
  if (Math.abs(lx) <= P.hx && Math.abs(lz) <= P.hz) return P.y + (P.slope ? P.slope * lz : 0);
  return -99;
}

function terrainSurf(x, z, h) {
  for (const s of STONE_ZONES) if (Math.hypot(x - s.x, z - s.z) < s.r && h > s.minH) return 'stone';
  if (h < 2.7) return 'sand';
  return 'grass';
}

const _gi = { h: 0, surf: 'sand', terrain: 0 };
// walkable height at x,z including causeways and decks
export function groundInfo(x, z) {
  let h = terrainH(x, z);
  _gi.terrain = h;
  let surf = null;
  for (const C of CAUSEWAYS) { const v = causewayH(C, x, z); if (v > h) { h = v; surf = 'stone'; } }
  for (const P of PLATFORMS) {
    const v = platformH(P, x, z);
    if (v > -99 && v >= h - 0.35) { if (v > h) h = v; surf = P.surf; }
  }
  _gi.h = h;
  _gi.surf = surf || terrainSurf(x, z, h);
  return _gi;
}
export function groundH(x, z) { return groundInfo(x, z).h; }

// height used for water depth: terrain + causeways (not decks over water)
export function seabedH(x, z) {
  let h = terrainH(x, z);
  for (const C of CAUSEWAYS) { const v = causewayH(C, x, z); if (v > h) h = v; }
  return h;
}

function makeCauseway(k) {
  const A = ISLANDS[k], B = ISLANDS[k + 1], top = CAUSE_TOPS[k];
  const dx = B.x - A.x, dz = B.z - A.z, L = Math.hypot(dx, dz);
  const ux = dx / L, uz = dz / L;
  let ra = 0, rb = 0;
  for (let r = 0; r < L; r += 0.25) if (baseH(A.x + ux * r, A.z + uz * r) < top + 0.02) { ra = r - 0.5; break; }
  for (let r = 0; r < L; r += 0.25) if (baseH(B.x - ux * r, B.z - uz * r) < top + 0.02) { rb = r - 0.5; break; }
  const C = {
    k, top, hw: 2.1,
    ax: A.x + ux * ra, az: A.z + uz * ra,
    bx: B.x - ux * rb, bz: B.z - uz * rb,
    ux, uz,
  };
  C.len = Math.hypot(C.bx - C.ax, C.bz - C.az);
  C.minx = Math.min(C.ax, C.bx) - 5; C.maxx = Math.max(C.ax, C.bx) + 5;
  C.minz = Math.min(C.az, C.bz) - 5; C.maxz = Math.max(C.az, C.bz) + 5;
  C.mid = { x: (C.ax + C.bx) / 2, z: (C.az + C.bz) / 2 };
  RAMPS.push({ x: C.ax, z: C.az, dx: -ux, dz: -uz, top, hw: C.hw });
  RAMPS.push({ x: C.bx, z: C.bz, dx: ux, dz: uz, top, hw: C.hw });
  return C;
}

export function initTerrain() {
  // flat zones
  FLATS.push({ x: RING.c.x, z: RING.c.z, r: 13, blend: 5 });
  FLATS.push({ x: FOREST.ship.x, z: FOREST.ship.z, r: 9, blend: 4 });
  FLATS.push({ x: FOREST.beacon.x, z: FOREST.beacon.z, r: 4, blend: 3 });
  FLATS.push({ x: RING.beacon.x, z: RING.beacon.z, r: 3, blend: 3 });
  for (const f of FLATS) f.h = baseH(f.x, f.z);
  STONE_ZONES.push({ x: RING.c.x, z: RING.c.z, r: 12.5, minH: 3 });
  STONE_ZONES.push({ x: PEAK.c.x, z: PEAK.c.z, r: 12.5, minH: 25 });
  for (let k = 0; k < 4; k++) CAUSEWAYS.push(makeCauseway(k));
  // switchback trail
  const I = ISLANDS[3];
  for (const [r, a] of PEAK.trailPolar) {
    const x = I.x + Math.cos(a) * r, z = I.z + Math.sin(a) * r;
    TRAIL.push({ x, z, h: 0 });
  }
  TRAIL.forEach((p, i) => { p.h = i === TRAIL.length - 1 ? I.peak + 0.05 : baseH(p.x, p.z) - 0.15; });
  // ensure every leg climbs evenly (no dips on the way up)
  for (let i = 1; i < TRAIL.length; i++) TRAIL[i].h = Math.max(TRAIL[i].h, TRAIL[i - 1].h + 1);
  // the trail begins where the forest causeway's ramp climbs onto the peak island
  {
    const C = CAUSEWAYS[2];
    TRAIL[0].x = C.bx + C.ux * 4; TRAIL[0].z = C.bz + C.uz * 4; TRAIL[0].h = C.top + 4 * 0.28;
    TRAIL.unshift({ x: C.bx, z: C.bz, h: C.top });
  }

  for (const p of FOREST.paths) PATHS.push(p);
  const route = [FOREST.lamp, ...FOREST.mirrors, FOREST.beacon];
  for (let i = 0; i < route.length - 1; i++) SCORCH.push([route[i], route[i + 1]]);
}

export function nearPath(x, z, pad) {
  for (const p of PATHS) if (polyDist(x, z, p).d < pad) return true;
  for (const s of SCORCH) if (segDist(x, z, s[0].x, s[0].z, s[1].x, s[1].z).d < pad - 0.5) return true;
  if (TRAIL.length && Math.hypot(x - ISLANDS[3].x, z - ISLANDS[3].z) < 48 && polyDist(x, z, TRAIL).d < pad) return true;
  return false;
}

const COL = {
  sand: new THREE.Color(0.93, 0.8, 0.58), wet: new THREE.Color(0.72, 0.6, 0.44),
  grass: new THREE.Color(0.45, 0.63, 0.27), grass2: new THREE.Color(0.6, 0.7, 0.3),
  forest: new THREE.Color(0.28, 0.42, 0.2), rock: new THREE.Color(0.56, 0.5, 0.47),
  rock2: new THREE.Color(0.44, 0.4, 0.4), dirt: new THREE.Color(0.74, 0.58, 0.38),
  stone: new THREE.Color(0.68, 0.66, 0.6), scorch: new THREE.Color(0.17, 0.13, 0.11),
  seabed: new THREE.Color(0.5, 0.48, 0.38),
};
const _col = new THREE.Color();

function colorAt(x, z, h, slope, isl) {
  const n = fbm(x * 0.08, z * 0.08, 2);
  if (h < -1.5) return _col.copy(COL.seabed);
  if (h < 2.05) return _col.copy(COL.wet).lerp(COL.sand, smoothstep(-1, 2, h));
  if (h < 2.8 + n * 0.5) return _col.copy(COL.sand);
  for (const s of STONE_ZONES) {
    const d = Math.hypot(x - s.x, z - s.z);
    if (d < s.r && h > s.minH) return _col.copy(COL.stone).multiplyScalar(0.92 + 0.08 * n + (d % 2.2 < 0.12 ? -0.15 : 0));
  }
  if (TRAIL.length && isl === 3 && polyDist(x, z, TRAIL).d < 1.8) return _col.copy(COL.dirt);
  for (const s of SCORCH) {
    const r = segDist(x, z, s[0].x, s[0].z, s[1].x, s[1].z);
    if (r.d < 0.55 + 0.25 * noise2(x * 0.7, z * 0.7)) return _col.copy(COL.scorch);
  }
  for (const p of PATHS) if (polyDist(x, z, p).d < 1.4 + 0.3 * n) return _col.copy(COL.dirt);
  if (slope > 0.85) return _col.copy(n > 0 ? COL.rock : COL.rock2);
  const base = isl === 2 ? COL.forest : COL.grass;
  _col.copy(base).lerp(COL.grass2, clamp(0.5 + n, 0, 1) * 0.6);
  if (slope > 0.55) _col.lerp(COL.rock, smoothstep(0.55, 0.85, slope));
  return _col;
}

export function buildTerrain(scene, material) {
  const meshes = [];
  for (const I of ISLANDS) {
    const step = I.peak ? 1.15 : 1.4;
    const half = I.R * 1.22;
    const n = Math.ceil((half * 2) / step) + 1;
    const H = new Float32Array(n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      H[j * n + i] = terrainH(I.x - half + i * step, I.z - half + j * step);
    }
    const pos = new Float32Array(n * n * 3), col = new Float32Array(n * n * 3);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const k = j * n + i, x = I.x - half + i * step, z = I.z - half + j * step, h = H[k];
      const hx = H[j * n + Math.min(n - 1, i + 1)] - H[j * n + Math.max(0, i - 1)];
      const hz = H[Math.min(n - 1, j + 1) * n + i] - H[Math.max(0, j - 1) * n + i];
      const slope = Math.hypot(hx, hz) / (2 * step);
      pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;
      const c = colorAt(x, z, h, slope, I.id);
      col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
    }
    const idx = [];
    for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
      const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
      if (H[a] < -3.6 && H[b] < -3.6 && H[c] < -3.6 && H[d] < -3.6) continue;
      idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, material);
    m.receiveShadow = true;
    m.castShadow = !!I.peak;
    m.matrixAutoUpdate = false;
    scene.add(m);
    meshes.push(m);
  }
  // sea floor
  const sf = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), new THREE.MeshBasicMaterial({ color: 0x1d3b4a }));
  sf.rotation.x = -Math.PI / 2; sf.position.y = -4.6;
  sf.matrixAutoUpdate = false; sf.updateMatrix();
  scene.add(sf);
  return meshes;
}

// Height texture used by the water shader for depth colour and foam.
export function bakeHeightTexture() {
  const N = 512, data = new Uint16Array(N * N);
  const { x0, z0, size } = BOUNDS;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = x0 + (i + 0.5) / N * size, z = z0 + (j + 0.5) / N * size;
    data[j * N + i] = THREE.DataUtils.toHalfFloat(seabedH(x, z));
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RedFormat, THREE.HalfFloatType);
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

export { LIGHT };
