// Instanced trees, bushes and grass. Canopies sway (and their shadows sway with them via a matching depth
// material); canopies between camera and player dither away. Grass is chunked and distance-culled.
import * as THREE from './three.module.min.js';
import { GeoBuilder, mat, mulberry32, fbm, toonGradient, smoothstep, segDist } from './util.js';
import { ISL, PATHS, PATH_HALF, TIDE0 } from './layout.js';
import { groundAt, matAt, slopeAt } from './terrain.js';
import { addCircle } from './colliders.js';

const EXCL = [];
export function exclude(x, z, r) { EXCL.push([x, z, r]); }
const SEGEX = []; // segment exclusions [ax,az,bx,bz,r]
export function excludeSegment(ax, az, bx, bz, r) { SEGEX.push([ax, az, bx, bz, r]); }

function excluded(x, z, extra = 0) {
  for (const e of EXCL) if ((x - e[0]) ** 2 + (z - e[1]) ** 2 < (e[2] + extra) ** 2) return true;
  for (const s of SEGEX) if (segDist(x, z, s[0], s[1], s[2], s[3]).d < s[4] + extra) return true;
  return false;
}

export const shared = {
  uTime: { value: 0 },
  uWind: { value: 1 },
  uCam: { value: new THREE.Vector3() },
  uPlayer: { value: new THREE.Vector3() },
};

const SWAY_VERT = `
#ifdef USE_INSTANCING
  vec3 iP = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
#else
  vec3 iP = vec3(0.0);
#endif
  float ph = iP.x * 0.21 + iP.z * 0.17;
  float sw = aSway * uWind;
  transformed.x += (sin(uTime * 1.5 + ph) * 0.55 + sin(uTime * 3.4 + ph * 2.0) * 0.18) * sw;
  transformed.z += cos(uTime * 1.25 + ph * 1.3) * 0.45 * sw;
`;

function patchSway(shader, fade, canopyY) {
  shader.uniforms.uTime = shared.uTime;
  shader.uniforms.uWind = shared.uWind;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>
attribute float aSway; uniform float uTime; uniform float uWind; varying vec3 vInstC; varying float vSway;`)
    .replace('#include <begin_vertex>', `#include <begin_vertex>
${SWAY_VERT}
  vInstC = (modelMatrix * vec4(iP, 1.0)).xyz; vSway = aSway;`);
  if (fade) {
    shader.uniforms.uCam = shared.uCam;
    shader.uniforms.uPlayer = shared.uPlayer;
    shader.uniforms.uCanopyY = { value: canopyY };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform vec3 uCam; uniform vec3 uPlayer; uniform float uCanopyY; varying vec3 vInstC; varying float vSway;`)
      .replace('void main() {', `void main() {
  if (vSway > 0.02) {
    vec3 ba = uPlayer - uCam; vec3 pa = vInstC + vec3(0.0, uCanopyY, 0.0) - uCam;
    float hh = clamp(dot(pa, ba) / max(dot(ba, ba), 0.001), 0.0, 1.0);
    float dd = length(pa - ba * hh);
    if (dd < 3.4 && hh < 0.97) {
      vec2 fc = floor(mod(gl_FragCoord.xy, 4.0));
      float b = mod(fc.x * 2.0 + fc.y * 3.0 + floor(fc.y * 0.5), 4.0) / 4.0;
      if (b < 0.75) discard;
    }
  }`);
  }
}

function canopyMaterial(canopyY, fade = true) {
  const m = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient() });
  m.onBeforeCompile = (s) => patchSway(s, fade, canopyY);
  m.customProgramCacheKey = () => (fade ? 'canopy-fade' : 'canopy');
  return m;
}
function canopyDepth() {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  m.onBeforeCompile = (s) => patchSway(s, false, 0);
  m.customProgramCacheKey = () => 'canopy-depth';
  return m;
}

// ---------- tree geometries (base at origin, aSway weight per vertex)
function pineGeo() {
  const b = new GeoBuilder({ extra: true });
  b.cyl(0.17, 0.3, 2.6, 6, mat(0, 1.3, 0), '#6b4a32', { extra: 0 });
  const g = ['#2f6b3f', '#3a7d45', '#4a8f4e'];
  b.cyl(0.0, 2.3, 3.2, 7, mat(0, 3.6, 0), g[0], { flat: true, extra: (v) => Math.max(0, v.y - 2.2) * 0.07 });
  b.cyl(0.0, 1.8, 2.8, 7, mat(0, 5.0, 0, 0, 0.4, 0), g[1], { flat: true, extra: (v) => Math.max(0, v.y - 2.2) * 0.07 });
  b.cyl(0.0, 1.2, 2.3, 6, mat(0, 6.4, 0, 0, 0.9, 0), g[2], { flat: true, extra: (v) => Math.max(0, v.y - 2.2) * 0.07 });
  return b.build('aSway');
}
function broadGeo() {
  const b = new GeoBuilder({ extra: true });
  b.cyl(0.2, 0.34, 3.2, 6, mat(0, 1.6, 0), '#6e5038', { extra: 0 });
  b.cyl(0.08, 0.14, 1.6, 5, mat(0.5, 3.0, 0, 0, 0, -0.7), '#6e5038', { extra: 0.02 });
  const sw = (v) => Math.max(0, v.y - 2.4) * 0.06;
  b.ico(2.2, 0, mat(0, 4.4, 0), '#5f9e3c', { extra: sw });
  b.ico(1.7, 0, mat(1.3, 3.9, 0.5, 0.3, 0.2, 0), '#4f8c34', { extra: sw });
  b.ico(1.6, 0, mat(-1.0, 4.1, -0.7, 0.5, 0.9, 0), '#6aad44', { extra: sw });
  b.ico(1.35, 0, mat(0.2, 5.6, -0.2, 0.2, 0.4, 0.1), '#78b94c', { extra: sw });
  return b.build('aSway');
}
function palmGeo() {
  const b = new GeoBuilder({ extra: true });
  let x = 0, y = 0;
  for (let i = 0; i < 6; i++) {
    const nx = 0.05 + i * i * 0.022;
    b.cyl(0.15, 0.2, 1.05, 6, mat(x + nx / 2, y + 0.5, 0, 0, 0, -nx * 0.6), i % 2 ? '#8a6a46' : '#9b7a52', { extra: i * 0.012 });
    x += nx; y += 1.0;
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const m = new THREE.Matrix4().makeTranslation(x, y + 0.1, 0)
      .multiply(new THREE.Matrix4().makeRotationY(a))
      .multiply(new THREE.Matrix4().makeRotationZ(-0.5 - (i % 2) * 0.25))
      .multiply(new THREE.Matrix4().makeTranslation(1.3, 0, 0));
    b.box(2.7, 0.06, 0.55, m, i % 2 ? '#4f9a3a' : '#62ad44', { extra: (v) => 0.07 + Math.max(0, Math.hypot(v.x - x, v.z) - 0.4) * 0.05 });
  }
  b.ico(0.3, 0, mat(x, y - 0.1, 0), '#6b4a2c', { extra: 0.07 });
  return b.build('aSway');
}
function bushGeo() {
  const b = new GeoBuilder({ extra: true });
  b.ico(0.9, 0, mat(0, 0.55, 0, 0, 0, 0, 1, 0.75, 1), '#4c8a36', { extra: (v) => v.y * 0.05 });
  b.ico(0.7, 0, mat(0.6, 0.45, 0.3, 0.4, 0.3, 0, 1, 0.8, 1), '#5c9a3e', { extra: (v) => v.y * 0.05 });
  b.ico(0.55, 0, mat(-0.5, 0.4, -0.4, 0.4, 1.3, 0), '#3f7a30', { extra: (v) => v.y * 0.05 });
  return b.build('aSway');
}
function fernGeo() {
  const b = new GeoBuilder({ extra: true });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const m = new THREE.Matrix4().makeRotationY(a).multiply(new THREE.Matrix4().makeRotationZ(-0.6)).multiply(new THREE.Matrix4().makeTranslation(0.5, 0, 0));
    b.box(1.1, 0.04, 0.28, m, i % 2 ? '#3f8a3a' : '#57a043', { extra: (v) => Math.hypot(v.x, v.z) * 0.08 });
  }
  return b.build('aSway');
}

const TYPES = {
  pine: { geo: pineGeo, canopyY: 4.8, trunk: 0.3, cast: true },
  broad: { geo: broadGeo, canopyY: 4.4, trunk: 0.32, cast: true },
  palm: { geo: palmGeo, canopyY: 6.0, trunk: 0.2, cast: true },
  bush: { geo: bushGeo, canopyY: 0, trunk: 0, cast: false, nofade: true },
  fern: { geo: fernGeo, canopyY: 0, trunk: 0, cast: false, nofade: true },
};

export class Foliage {
  constructor(scene) {
    this.scene = scene;
    this.grassChunks = [];
    this.meshes = [];
  }

  build() {
    const rng = mulberry32(99);
    const trees = []; // {type,x,z,h,s,ry,group}
    const grid = new Map();
    const gk = (x, z) => `${Math.floor(x / 6)},${Math.floor(z / 6)}`;
    const tooClose = (x, z, d) => {
      const cx = Math.floor(x / 6), cz = Math.floor(z / 6);
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
        const a = grid.get(`${cx + i},${cz + j}`);
        if (a) for (const t of a) if ((t.x - x) ** 2 + (t.z - z) ** 2 < d * d) return true;
      }
      return false;
    };
    const nearMat = (x, z, m, r) => {
      for (let a = -r; a <= r; a += r) for (let b = -r; b <= r; b += r) if (matAt(x + a, z + b) === m) return true;
      return false;
    };
    const onPath = (x, z, w) => {
      for (const p of PATHS) for (let i = 0; i < p.length - 1; i++) if (segDist(x, z, p[i][0], p[i][1], p[i + 1][0], p[i + 1][1]).d < w) return true;
      return false;
    };
    const cfg = {
      V: { tries: 700, minD: 5.5, pick: (r) => (r < 0.55 ? 'palm' : 'broad'), dens: 0.05 },
      M: { tries: 700, minD: 4.5, pick: (r) => (r < 0.6 ? 'broad' : 'pine'), dens: 0.0 },
      O: { tries: 2600, minD: 3.8, pick: (r) => (r < 0.85 ? 'pine' : 'broad'), dens: -0.1 },
      S: { tries: 9000, minD: 2.35, pick: (r) => (r < 0.55 ? 'broad' : 'pine'), dens: -9 },
      L: { tries: 160, minD: 5, pick: () => 'palm', dens: 0 },
    };
    for (const key in cfg) {
      const I = ISL[key], c = cfg[key];
      for (let n = 0; n < c.tries; n++) {
        const a = rng() * Math.PI * 2, rr = Math.sqrt(rng()) * I.r * (key === 'S' ? 0.97 : 1.02);
        const x = I.x + Math.cos(a) * rr, z = I.z + Math.sin(a) * rr;
        const h = groundAt(x, z);
        if (h < TIDE0 + 0.55) continue;
        if (slopeAt(x, z) > (key === 'O' ? 0.75 : 0.55)) continue;
        if (matAt(x, z) !== 0) continue;
        if (excluded(x, z, 1.0)) continue;
        if (key === 'O' && (nearMat(x, z, 4, 3.2) || h > 38)) continue;
        if (nearMat(x, z, 3, 3)) continue;
        if (key === 'S' && onPath(x, z, PATH_HALF + 0.9)) continue;
        if (key !== 'S' && fbm(x * 0.035 + 11, z * 0.035, 2) < c.dens) continue;
        const type = c.pick(rng());
        if (tooClose(x, z, c.minD * (type === 'palm' ? 1.4 : 1))) continue;
        const t = { type, x, z, h, s: 0.8 + rng() * 0.5, ry: rng() * Math.PI * 2 };
        trees.push(t);
        const k = gk(x, z);
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(t);
      }
    }
    // understory in the forest: bushes and ferns (no collision except bushes, no shadows)
    const under = [];
    const IS = ISL.S;
    for (let n = 0; n < 2600; n++) {
      const a = rng() * Math.PI * 2, rr = Math.sqrt(rng()) * IS.r * 0.98;
      const x = IS.x + Math.cos(a) * rr, z = IS.z + Math.sin(a) * rr;
      const h = groundAt(x, z);
      if (h < TIDE0 + 0.5 || matAt(x, z) !== 0 || excluded(x, z, 0.3) || onPath(x, z, PATH_HALF + 0.3)) continue;
      if (Math.hypot(x - IS.x - 4, z - IS.z - 4) < 19) continue;
      if (tooClose(x, z, 1.1)) continue;
      under.push({ type: rng() < 0.45 ? 'bush' : 'fern', x, z, h, s: 0.7 + rng() * 0.6, ry: rng() * 6.28 });
    }
    // a few bushes on the other islands
    for (const key of ['V', 'M', 'O', 'L']) {
      const I = ISL[key];
      for (let n = 0; n < 160; n++) {
        const a = rng() * Math.PI * 2, rr = Math.sqrt(rng()) * I.r;
        const x = I.x + Math.cos(a) * rr, z = I.z + Math.sin(a) * rr;
        const h = groundAt(x, z);
        if (h < TIDE0 + 0.6 || matAt(x, z) !== 0 || excluded(x, z, 0.5) || slopeAt(x, z) > 0.6) continue;
        if (key === 'O' && nearMat(x, z, 4, 2.5)) continue;
        if (tooClose(x, z, 2)) continue;
        under.push({ type: rng() < 0.6 ? 'bush' : 'fern', x, z, h, s: 0.6 + rng() * 0.5, ry: rng() * 6.28 });
      }
    }
    this.treeCount = trees.length;
    // colliders for trunks (and bushes, softly)
    for (const t of trees) addCircle(t.x, t.z, TYPES[t.type].trunk * t.s + 0.12, t.h - 1, t.h + 3.6 * t.s);
    for (const u of under) if (u.type === 'bush') addCircle(u.x, u.z, 0.55 * u.s, u.h - 1, u.h + 1.0 * u.s, { cam: false });

    // group into chunks for culling: 48m cells
    const groups = new Map();
    for (const t of trees.concat(under)) {
      const k = `${t.type}|${Math.floor(t.x / 48)},${Math.floor(t.z / 48)}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(t);
    }
    const geos = {}, mats = {}, depth = canopyDepth();
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s3 = new THREE.Vector3(), p3 = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const col = new THREE.Color();
    for (const [k, list] of groups) {
      const type = k.split('|')[0];
      const T = TYPES[type];
      if (!geos[type]) { geos[type] = T.geo(); mats[type] = canopyMaterial(T.canopyY, !T.nofade); }
      const im = new THREE.InstancedMesh(geos[type], mats[type], list.length);
      list.forEach((t, i) => {
        q.setFromAxisAngle(up, t.ry);
        m4.compose(p3.set(t.x, t.h - 0.15, t.z), q, s3.set(t.s, t.s * (0.9 + (i % 5) * 0.05), t.s));
        im.setMatrixAt(i, m4);
        const v = 0.85 + rng() * 0.3;
        col.setRGB(v, v * (0.95 + rng() * 0.1), v * (0.9 + rng() * 0.1));
        im.setColorAt(i, col);
      });
      im.instanceMatrix.needsUpdate = true;
      im.instanceColor.needsUpdate = true;
      im.computeBoundingSphere();
      im.castShadow = T.cast;
      im.receiveShadow = true;
      if (T.cast) im.customDepthMaterial = depth;
      this.scene.add(im);
      this.meshes.push(im);
    }
    this.buildGrass(rng);
  }

  buildGrass(rng) {
    // clump of 6 tapered blades
    const pos = [], col = [], nrm = [], sway = [];
    const base = new THREE.Color('#3f7a2c'), tip = new THREE.Color('#b8d86a');
    for (let i = 0; i < 6; i++) {
      const a = rng() * Math.PI * 2, r = rng() * 0.32;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const ba = rng() * Math.PI;
      const w = 0.07, h = 0.45 + rng() * 0.4;
      const lx = Math.cos(a) * 0.18, lz = Math.sin(a) * 0.18;
      const dx = Math.cos(ba) * w, dz = Math.sin(ba) * w;
      pos.push(x - dx, 0, z - dz, x + dx, 0, z + dz, x + lx, h, z + lz);
      for (let k = 0; k < 3; k++) nrm.push(0, 1, 0);
      col.push(base.r, base.g, base.b, base.r, base.g, base.b, tip.r, tip.g, tip.b);
      sway.push(0, 0, h);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('aSway', new THREE.Float32BufferAttribute(sway, 1));
    const m = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient(), side: THREE.DoubleSide });
    m.onBeforeCompile = (s) => {
      s.uniforms.uTime = shared.uTime;
      s.uniforms.uWind = shared.uWind;
      s.uniforms.uPlayer = shared.uPlayer;
      s.vertexShader = s.vertexShader
        .replace('#include <common>', `#include <common>
attribute float aSway; uniform float uTime; uniform float uWind; uniform vec3 uPlayer;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
  vec3 iP = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
  float fd = distance(iP, cameraPosition);
  float fade = 1.0 - smoothstep(46.0, 60.0, fd);
  transformed *= fade;
  float ph = iP.x * 0.31 + iP.z * 0.23;
  transformed.x += sin(uTime * 2.1 + ph) * aSway * 0.35 * uWind;
  transformed.z += cos(uTime * 1.7 + ph) * aSway * 0.2 * uWind;
  vec2 dp = iP.xz - uPlayer.xz; float pd = length(dp);
  if (pd < 1.4 && abs(iP.y - uPlayer.y) < 1.5) { transformed.xz += normalize(dp + 0.001) * (1.4 - pd) * aSway * 0.9; transformed.y *= 1.0 - (1.4 - pd) * 0.35; }`);
    };
    m.customProgramCacheKey = () => 'grass';
    const cells = new Map();
    const tryAdd = (x, z, s) => {
      const h = groundAt(x, z);
      if (h < TIDE0 + 0.75 || matAt(x, z) !== 0 || slopeAt(x, z) > 0.7) return;
      if (excluded(x, z, -0.5)) return;
      const k = `${Math.floor(x / 32)},${Math.floor(z / 32)}`;
      if (!cells.has(k)) cells.set(k, []);
      cells.get(k).push([x, h, z, s]);
    };
    for (const key in ISL) {
      const I = ISL[key];
      const n = key === 'O' ? 9000 : key === 'S' ? 9000 : key === 'L' ? 1400 : 6000;
      for (let i = 0; i < n; i++) {
        const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * I.r * 1.05;
        const x = I.x + Math.cos(a) * r, z = I.z + Math.sin(a) * r;
        if (fbm(x * 0.08, z * 0.08 + 5, 2) < -0.15 && key !== 'S') continue;
        tryAdd(x, z, 0.7 + rng() * 0.7);
      }
    }
    const m4 = new THREE.Matrix4();
    let total = 0;
    for (const [k, list] of cells) {
      const im = new THREE.InstancedMesh(g, m, list.length);
      list.forEach((c, i) => { m4.makeScale(c[3], c[3], c[3]).setPosition(c[0], c[1] - 0.05, c[2]); im.setMatrixAt(i, m4); });
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      im.receiveShadow = true;
      im.castShadow = false;
      const [cx, cz] = k.split(',').map(Number);
      im.userData.center = new THREE.Vector3(cx * 32 + 16, list[0][1], cz * 32 + 16);
      this.scene.add(im);
      this.grassChunks.push(im);
      total += list.length;
    }
    this.grassCount = total;
  }

  update(time, camPos, playerPos) {
    shared.uTime.value = time;
    shared.uCam.value.copy(camPos);
    shared.uPlayer.value.copy(playerPos);
    for (const g of this.grassChunks) {
      const c = g.userData.center;
      g.visible = Math.hypot(c.x - camPos.x, c.z - camPos.z) < 84;
    }
  }

  setAllVisible() { for (const g of this.grassChunks) g.visible = true; }
}
