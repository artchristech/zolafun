import * as THREE from './three.module.min.js';
import { vnoise, fbm, smoothstep, clamp, lerp, segDist } from './noise.js';
import { gradientMap } from './materials.js';

// ---------------------------------------------------------------------------
// World layout: five islands chained by causeways that surface as the tide drops.
// ---------------------------------------------------------------------------
export const SEABED = -7;
// Tide level after N beacons are lit.
export const TIDE = [3.0, 2.1, 1.2, 0.3, -0.6, -1.2];
export const D2R = Math.PI / 180;

export const ISLANDS = [
  { key: 'ring',    c: [40, 230],    R: 58, h: 7,  rough: 0.12, hills: 3.0 },
  { key: 'forest',  c: [-190, 120],  R: 88, h: 9,  rough: 0.12, hills: 2.0 },
  { key: 'village', c: [-170, -140], R: 62, h: 6,  rough: 0.06, hills: 1.6 },
  { key: 'peak',    c: [60, -190],   R: 95, h: 64, rough: 0.05, hills: 4.0, mountain: true },
  { key: 'light',   c: [0, 0],       R: 48, h: 7,  rough: 0.08, hills: 1.2 },
];
// Causeway k links island k -> k+1; it sits 0.6m under water until beacon k+1 is lit.
export const CAUSEWAYS = [0, 1, 2, 3].map((k) => ({ a: k, b: k + 1, top: TIDE[k + 1] + 0.3 }));

export function coastR(i, ang) {
  const I = ISLANDS[i];
  const ca = Math.cos(ang), sa = Math.sin(ang);
  const n = vnoise(ca * 1.7 + i * 13.1 + 50, sa * 1.7 + i * 7.7 + 50);
  const n2 = vnoise(ca * 4.0 + i * 3.3 + 80, sa * 4.0 - i * 5.1 + 80);
  return I.R * (1 + I.rough * ((n - 0.5) * 1.6 + (n2 - 0.5) * 0.6));
}

function islandH(i, x, z) {
  const I = ISLANDS[i];
  const dx = x - I.c[0], dz = z - I.c[1];
  const dist = Math.sqrt(dx * dx + dz * dz);
  if (dist > I.R * 1.2 + 34) return SEABED;
  const m = coastR(i, Math.atan2(dz, dx)) - dist;
  if (m < -32) return SEABED;
  if (m < 0) return SEABED + (0.5 - SEABED) * smoothstep(-32, 0, m);
  let h = m < 25 ? 0.5 + 4.0 * (m / 25) : 4.5;
  if (I.mountain) h += (I.h - 4.5) * smoothstep(12, 78, m);
  else h += (I.h - 4.5) * smoothstep(22, 62, m);
  let hills = (fbm(x * 0.018 + i * 5.0, z * 0.018 - i * 3.0, 3) - 0.5) * 2 * I.hills * smoothstep(18, 40, m);
  if (I.mountain) hills *= 1 - smoothstep(58, 74, m);
  return h + hills;
}

function islandsMax(x, z) {
  let h = SEABED;
  for (let i = 0; i < ISLANDS.length; i++) {
    const v = islandH(i, x, z);
    if (v > h) h = v;
  }
  return h;
}

function causewayDist(k, x, z) {
  const cw = CAUSEWAYS[k];
  const a = ISLANDS[cw.a].c, b = ISLANDS[cw.b].c;
  return segDist(x, z, a[0], a[1], b[0], b[1]);
}

function causewayH(k, x, z) {
  const cw = CAUSEWAYS[k];
  const [d] = causewayDist(k, x, z);
  if (d > 7.5) return SEABED;
  if (d <= 2.6) return cw.top;
  return cw.top + (SEABED - cw.top) * smoothstep(2.6, 7.5, d);
}

export function baseH(x, z) {
  let h = islandsMax(x, z);
  for (let k = 0; k < CAUSEWAYS.length; k++) {
    const v = causewayH(k, x, z);
    if (v > h) h = v;
  }
  return h;
}

// Which causeway (if any) you are standing on — stone underfoot.
export function causewayAt(x, z) {
  for (let k = 0; k < CAUSEWAYS.length; k++) {
    const [d] = causewayDist(k, x, z);
    if (d < 2.9 && CAUSEWAYS[k].top >= islandsMax(x, z) - 0.05) return k;
  }
  return -1;
}

// ---------------------------------------------------------------------------
// Flattened areas (plazas, clearings, beacon pads)
// ---------------------------------------------------------------------------
const FLATS = [];
function addFlat(p, r, blend, hOverride) {
  FLATS.push({ x: p[0], z: p[1], r, blend, h: hOverride !== undefined ? hOverride : baseH(p[0], p[1]) });
}
function hFlat(x, z) {
  let h = baseH(x, z);
  for (const f of FLATS) {
    const dx = x - f.x, dz = z - f.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < f.r + f.blend) h = lerp(h, f.h, 1 - smoothstep(f.r, f.r + f.blend, d));
  }
  return h;
}

// ---------------------------------------------------------------------------
// Key positions
// ---------------------------------------------------------------------------
const C = (i) => ISLANDS[i].c;
export function polar(i, deg, r) {
  const c = C(i);
  return [c[0] + Math.cos(deg * D2R) * r, c[1] + Math.sin(deg * D2R) * r];
}
function off(i, x, z) { const c = C(i); return [c[0] + x, c[1] + z]; }
export function angTo(i, j) { return Math.atan2(C(j)[1] - C(i)[1], C(j)[0] - C(i)[0]) / D2R; }
export function landing(i, j, inset) {
  const a = angTo(i, j);
  return polar(i, a, coastR(i, a * D2R) - inset);
}

export const LAYOUT = {};
LAYOUT.start = off(0, 14, -24);
LAYOUT.ringC = off(0, -4, 6);
LAYOUT.ringR = 9;
LAYOUT.beacons = [polar(0, 205, 17), off(1, 40, -8), polar(2, 20, 22), polar(3, 60, 13), C(4).slice()];
LAYOUT.ship = { c: off(1, 5, 20), lamp: off(1, -9, 20), mirrors: [off(1, -38, 2), off(1, -20, -30), off(1, 20, -35)] };
LAYOUT.houseAngles = [190, 213, 236, 259, 282];
LAYOUT.totem = polar(2, 236, coastR(2, 236 * D2R) - 30);
LAYOUT.obs = C(3).slice();
LAYOUT.light = C(4).slice();
LAYOUT.doorAng = angTo(4, 3);
LAYOUT.landings = [];
for (let k = 0; k < 4; k++) LAYOUT.landings.push([landing(k, k + 1, 3), landing(k + 1, k, 3)]);

addFlat(LAYOUT.ringC, 12, 7);
addFlat(LAYOUT.ship.c, 13, 8);
for (let i = 0; i < 4; i++) addFlat(LAYOUT.beacons[i], 2.6, 3);
addFlat(LAYOUT.light, 17, 14);
addFlat(LAYOUT.totem, 5, 5);
for (const m of LAYOUT.ship.mirrors) addFlat(m, 1.6, 2.5);
addFlat(LAYOUT.ship.lamp, 1.5, 2);

// ---------------------------------------------------------------------------
// Switchback trail up the peak
// ---------------------------------------------------------------------------
export const TRAIL = [];
(function buildTrail() {
  const I = ISLANDS[3], c = I.c;
  const legs = 7, h0 = 6.2, h1 = 63.8, legLen = 31, thc = 158;
  const radiusFor = (deg, h) => {
    let lo = 3, hi = I.R + 8;
    const ca = Math.cos(deg * D2R), sa = Math.sin(deg * D2R);
    for (let it = 0; it < 32; it++) {
      const mid = (lo + hi) / 2;
      if (hFlat(c[0] + ca * mid, c[1] + sa * mid) > h) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  };
  const pts = [];
  for (let k = 0; k <= legs; k++) {
    const h = h0 + (h1 - h0) * k / legs;
    let r = radiusFor(thc, h);
    const half = Math.asin(Math.min(0.95, legLen / (2 * Math.max(r, 1)))) / D2R;
    const deg = thc + (k % 2 === 0 ? -1 : 1) * half;
    r = radiusFor(deg, h);
    pts.push([c[0] + Math.cos(deg * D2R) * r, c[1] + Math.sin(deg * D2R) * r, h, deg, r]);
  }
  // lead-in at the foot and walk-on onto the summit
  const f = pts[0];
  const leadR = f[4] + 11;
  const lead = [c[0] + Math.cos(f[3] * D2R) * leadR, c[1] + Math.sin(f[3] * D2R) * leadR];
  TRAIL.push([lead[0], lead[1], hFlat(lead[0], lead[1])]);
  for (const p of pts) TRAIL.push([p[0], p[1], p[2]]);
  const last = pts[pts.length - 1];
  TRAIL.push([c[0] + Math.cos(last[3] * D2R) * 10, c[1] + Math.sin(last[3] * D2R) * 10, h1]);
  LAYOUT.trailTopAng = last[3];
  LAYOUT.trailStart = [TRAIL[0][0], TRAIL[0][1]];
  LAYOUT.trailBase = [pts[0][0], pts[0][1]];
})();

const TRAIL_BB = (() => {
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (const p of TRAIL) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); }
  return [x0 - 6, x1 + 6, z0 - 6, z1 + 6];
})();

// Nearest distance to the trail and its height there. Where two legs meet at a hairpin
// their heights are blended so the turn is a smooth ramp rather than a crease.
function trailNearest(x, z) {
  let best = 1e9, wsum = 0, hsum = 0;
  for (let i = 0; i < TRAIL.length - 1; i++) {
    const a = TRAIL[i], b = TRAIL[i + 1];
    const [d, t] = segDist(x, z, a[0], a[1], b[0], b[1]);
    if (d < best) best = d;
    if (d < 7) {
      const w = Math.exp(-(d * d) / 2.2);
      wsum += w; hsum += w * (a[2] + (b[2] - a[2]) * t);
    }
  }
  return [best, wsum > 1e-9 ? hsum / wsum : 0];
}

export function heightAt(x, z) {
  let h = hFlat(x, z);
  if (x > TRAIL_BB[0] && x < TRAIL_BB[1] && z > TRAIL_BB[2] && z < TRAIL_BB[3]) {
    const [d, th] = trailNearest(x, z);
    if (d < 5) h = lerp(h, th, 1 - smoothstep(2.2, 5.0, d));
  }
  return h;
}

// ---------------------------------------------------------------------------
// Paths (dirt) and stone plazas: used for colour, surface sounds and tree exclusion
// ---------------------------------------------------------------------------
export const PATHS = [];
function addPath(pts, w, kind = 'dirt') { PATHS.push({ pts, w, kind }); }
const LD = LAYOUT.landings;
addPath([LAYOUT.start, [LAYOUT.ringC[0] + 8, LAYOUT.ringC[1] - 8]], 1.6);
addPath([LAYOUT.ringC, LAYOUT.beacons[0], LD[0][0]], 1.7);
addPath([LD[0][1], off(1, 30, 36), off(1, 18, 30)], 1.9);
addPath([off(1, 5, 6), off(1, 6, -20), LD[1][0]], 1.9);
const SH = LAYOUT.ship;
LAYOUT.corridor = [SH.lamp, SH.mirrors[0], SH.mirrors[1], SH.mirrors[2], LAYOUT.beacons[1]];
addPath(LAYOUT.corridor, 1.3, 'inlay');
addPath([LD[1][1], off(2, -5, 12), LAYOUT.totem], 1.8);
addPath([off(2, -5, 12), LAYOUT.beacons[2], LD[2][0]], 1.8);
addPath([LD[2][1], LAYOUT.trailStart], 1.8);
addPath([LAYOUT.trailStart, LD[3][0]], 1.8);
addPath(TRAIL.map((p) => [p[0], p[1]]), 1.9);
addPath([LD[3][1], polar(4, LAYOUT.doorAng, 15)], 1.8);

export function pathDist(x, z) {
  let best = 1e9;
  for (const p of PATHS) {
    for (let i = 0; i < p.pts.length - 1; i++) {
      const a = p.pts[i], b = p.pts[i + 1];
      const [d] = segDist(x, z, a[0], a[1], b[0], b[1]);
      const v = d - p.w;
      if (v < best) best = v;
    }
  }
  return best;
}

export const STONE = [
  { x: LAYOUT.ringC[0], z: LAYOUT.ringC[1], r: 11.5 },
  { x: LAYOUT.light[0], z: LAYOUT.light[1], r: 16.5 },
  { x: LAYOUT.obs[0], z: LAYOUT.obs[1], r: 9.8 },
];
function inStone(x, z) {
  for (const s of STONE) { const dx = x - s.x, dz = z - s.z; if (dx * dx + dz * dz < s.r * s.r) return true; }
  return false;
}

export function islandOf(x, z) {
  let best = 0, bs = 1e9;
  for (let i = 0; i < ISLANDS.length; i++) {
    const I = ISLANDS[i];
    const s = Math.hypot(x - I.c[0], z - I.c[1]) / I.R;
    if (s < bs) { bs = s; best = i; }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Height grid (matches the rendered mesh exactly)
// ---------------------------------------------------------------------------
export const GRID = { x0: -335, z0: -330, s: 1.5, nx: 358, nz: 448, h: null };

export function buildGrid() {
  const { nx, nz, x0, z0, s } = GRID;
  const h = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) {
    const z = z0 + j * s;
    for (let i = 0; i < nx; i++) h[j * nx + i] = heightAt(x0 + i * s, z);
  }
  GRID.h = h;
}

function gh(i, j) {
  const { nx, nz } = GRID;
  if (i < 0 || j < 0 || i >= nx || j >= nz) return SEABED;
  return GRID.h[j * nx + i];
}

export function groundH(x, z) {
  const fx0 = (x - GRID.x0) / GRID.s, fz0 = (z - GRID.z0) / GRID.s;
  const i = Math.floor(fx0), j = Math.floor(fz0);
  const fx = fx0 - i, fz = fz0 - j;
  if (fx + fz <= 1) {
    const ha = gh(i, j);
    return ha + (gh(i + 1, j) - ha) * fx + (gh(i, j + 1) - ha) * fz;
  }
  const hd = gh(i + 1, j + 1);
  return hd + (gh(i, j + 1) - hd) * (1 - fx) + (gh(i + 1, j) - hd) * (1 - fz);
}

export function slopeAt(x, z) {
  const e = 0.9;
  const dx = (groundH(x + e, z) - groundH(x - e, z)) / (2 * e);
  const dz = (groundH(x, z + e) - groundH(x, z - e)) / (2 * e);
  return Math.sqrt(dx * dx + dz * dz);
}

export function surfaceAt(x, z, h) {
  if (inStone(x, z)) return 'stone';
  if (causewayAt(x, z) >= 0) return 'stone';
  if (pathDist(x, z) < 0.2) return 'sand';
  if (h < 5.0) return 'sand';
  return 'grass';
}

// ---------------------------------------------------------------------------
// Meshes
// ---------------------------------------------------------------------------
export function buildTerrainMeshes(scene) {
  const { nx, nz, x0, z0, s } = GRID;
  const mat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: gradientMap() });
  const cSand = new THREE.Color(0xecd39c), cWet = new THREE.Color(0xb49a6c), cGrass = new THREE.Color(0x5f9f36),
    cGrass2 = new THREE.Color(0x8cbb42), cRock = new THREE.Color(0x8f8375), cRock2 = new THREE.Color(0x6b625a),
    cDirt = new THREE.Color(0xc99a62), cInlay = new THREE.Color(0xd8c9a4), cStone = new THREE.Color(0xb7ad98),
    cStone2 = new THREE.Color(0x9c9482), cMoss = new THREE.Color(0x7d8c63), cDeep = new THREE.Color(0x2f625f);
  const tmp = new THREE.Color();
  const CH = 32;
  const meshes = [];
  for (let cj = 0; cj < nz - 1; cj += CH) {
    for (let ci = 0; ci < nx - 1; ci += CH) {
      const w = Math.min(CH, nx - 1 - ci), d = Math.min(CH, nz - 1 - cj);
      let maxH = -1e9;
      for (let j = 0; j <= d; j++) for (let i = 0; i <= w; i++) maxH = Math.max(maxH, gh(ci + i, cj + j));
      if (maxH < -3.5) continue; // deep water: the seabed plane shows through
      const vc = (w + 1) * (d + 1);
      const pos = new Float32Array(vc * 3), nor = new Float32Array(vc * 3), col = new Float32Array(vc * 3);
      let v = 0;
      for (let j = 0; j <= d; j++) {
        for (let i = 0; i <= w; i++) {
          const gi = ci + i, gj = cj + j;
          const x = x0 + gi * s, z = z0 + gj * s, h = gh(gi, gj);
          pos[v * 3] = x; pos[v * 3 + 1] = h; pos[v * 3 + 2] = z;
          const dx = (gh(gi + 1, gj) - gh(gi - 1, gj)) / (2 * s);
          const dz = (gh(gi, gj + 1) - gh(gi, gj - 1)) / (2 * s);
          const il = 1 / Math.sqrt(dx * dx + 1 + dz * dz);
          nor[v * 3] = -dx * il; nor[v * 3 + 1] = il; nor[v * 3 + 2] = -dz * il;
          const slope = Math.sqrt(dx * dx + dz * dz);
          // colour
          const n = vnoise(x * 0.08, z * 0.08), n2 = vnoise(x * 0.31 + 7, z * 0.31 - 3);
          if (h < 4.4 + n * 1.0) {
            tmp.copy(cSand).lerp(cWet, smoothstep(3.6, 1.0, h) * 0.8);
          } else {
            tmp.copy(cGrass).lerp(cGrass2, smoothstep(0.35, 0.75, n * 0.7 + n2 * 0.3));
          }
          if (h > -1) {
            const pd = pathDist(x, z);
            if (pd < 0.8) {
              const inl = PATHS.length && pd < 0.8 ? pathKind(x, z) : 'dirt';
              tmp.lerp(inl === 'inlay' ? cInlay : cDirt, smoothstep(0.8, -0.4, pd) * (0.85 + 0.15 * n2));
            }
          }
          if (slope > 0.7) tmp.lerp(n2 > 0.5 ? cRock : cRock2, smoothstep(0.7, 1.05, slope));
          if (causewayAt(x, z) >= 0) tmp.copy(cStone2).lerp(cMoss, n2 * 0.8);
          if (inStone(x, z)) {
            const tile = ((Math.floor(x / 1.5) + Math.floor(z / 1.5)) & 1) ? 1 : 0;
            tmp.copy(tile ? cStone : cStone2).lerp(cMoss, smoothstep(0.55, 0.9, n) * 0.6);
          }
          if (h < 0.5) tmp.lerp(cDeep, smoothstep(0.5, -6.0, h));
          col[v * 3] = tmp.r; col[v * 3 + 1] = tmp.g; col[v * 3 + 2] = tmp.b;
          v++;
        }
      }
      const idx = [];
      for (let j = 0; j < d; j++) {
        for (let i = 0; i < w; i++) {
          const a = j * (w + 1) + i, b = a + 1, c = a + (w + 1), e = c + 1;
          idx.push(a, c, b, b, c, e);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.setIndex(idx);
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, mat);
      m.receiveShadow = true;
      m.castShadow = true;
      scene.add(m);
      meshes.push(m);
    }
  }
  // seabed far plane
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshToonMaterial({ color: 0x2c5a58, gradientMap: gradientMap() }));
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = SEABED - 0.08;
  scene.add(sea);
  return meshes;
}

function pathKind(x, z) {
  let best = 1e9, kind = 'dirt';
  for (const p of PATHS) {
    for (let i = 0; i < p.pts.length - 1; i++) {
      const a = p.pts[i], b = p.pts[i + 1];
      const [d] = segDist(x, z, a[0], a[1], b[0], b[1]);
      if (d - p.w < best) { best = d - p.w; kind = p.kind; }
    }
  }
  return kind;
}

// Terrain heights for the water shader (shore foam, transparency over sunken causeways).
export function makeHeightTexture() {
  const N = 512;
  const data = new Uint16Array(N * N);
  const X0 = GRID.x0, Z0 = GRID.z0, SX = (GRID.nx - 1) * GRID.s, SZ = (GRID.nz - 1) * GRID.s;
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const x = X0 + (i + 0.5) / N * SX, z = Z0 + (j + 0.5) / N * SZ;
      data[j * N + i] = THREE.DataUtils.toHalfFloat(groundH(x, z));
    }
  }
  const t = new THREE.DataTexture(data, N, N, THREE.RedFormat, THREE.HalfFloatType);
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return { tex: t, bounds: new THREE.Vector4(X0, Z0, SX, SZ) };
}
