// Five Lights — instanced trees and grass with wind. Tree shadows use a depth
// material with the same sway so shadows move with the foliage; canopies dither
// away where they come between the camera and the player.
import * as THREE from './three.module.min.js';
import { rng, mat, prepGeo, mergeGeos, toonGradient } from './util.js';
import { ISLANDS } from './layout.js';
import { terrainH, nearPath, RAMPS } from './terrain.js';
import { addCircle } from './colliders.js';

export const foliageU = {
  uTime: { value: 0 },
  uCam: { value: new THREE.Vector3() },
  uPlayer: { value: new THREE.Vector3() },
};

const WIND = /* glsl */`
  vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
  float wph = uTime * 1.3 + ip.x * 0.21 + ip.z * 0.17;
  float wk = max(position.y - WIND_BASE, 0.0);
  wk = wk * wk * WIND_AMT;
  transformed.x += (sin(wph) + 0.4 * sin(wph * 2.7)) * wk;
  transformed.z += cos(wph * 0.8) * wk * 0.6;
`;

function patch(material, base, amt, fade, grassFar) {
  material.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = foliageU.uTime;
    sh.uniforms.uCam = foliageU.uCam;
    sh.uniforms.uPlayer = foliageU.uPlayer;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uTime; uniform vec3 uCam; uniform vec3 uPlayer;
        varying vec3 vFolW; varying float vFolY;
        #define WIND_BASE ${base.toFixed(2)}
        #define WIND_AMT ${amt.toFixed(4)}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        ${WIND}
        vFolY = position.y;
        ${grassFar ? 'transformed *= 1.0 - smoothstep(55.0, 80.0, distance(ip, cameraPosition));' : ''}`)
      .replace('#include <project_vertex>', `#include <project_vertex>
        vFolW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;`);
    if (sh.fragmentShader && fade) {
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform vec3 uCam; uniform vec3 uPlayer; varying vec3 vFolW; varying float vFolY;`)
        .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
          {
            vec3 seg = uCam - uPlayer; float L = length(seg);
            if (L > 0.5 && vFolY > ${fade.toFixed(2)}) {
              vec3 dir = seg / L;
              float s = dot(vFolW - uPlayer, dir);
              if (s > 0.4 && s < L + 0.5) {
                float dd = length(vFolW - (uPlayer + dir * s));
                float f = smoothstep(3.2, 1.4, dd);
                float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
                if (ign < f * 0.88) discard;
              }
            }
          }`);
    }
  };
  material.customProgramCacheKey = () => `fol-${base}-${amt}-${fade}-${grassFar}`;
  return material;
}

function coniferGeo() {
  const parts = [];
  parts.push(prepGeo(new THREE.CylinderGeometry(0.16, 0.26, 2.4, 6), 0x6b4a33, mat(0, 1.2, 0)));
  const greens = [0x2f5e3a, 0x3a6e3f, 0x4a7f45];
  [[1.9, 2.6, 2.4], [1.5, 2.3, 3.7], [1.05, 2.0, 4.9], [0.6, 1.4, 5.9]].forEach(([r, h, y], i) => {
    parts.push(prepGeo(new THREE.ConeGeometry(r, h, 7), greens[i % 3], mat(0, y, 0, 0, i * 0.4, 0)));
  });
  return mergeGeos(parts);
}
function broadGeo() {
  const parts = [];
  parts.push(prepGeo(new THREE.CylinderGeometry(0.17, 0.3, 3.0, 6), 0x7a5638, mat(0, 1.5, 0)));
  parts.push(prepGeo(new THREE.CylinderGeometry(0.06, 0.1, 1.4, 4), 0x7a5638, mat(0.5, 3.1, 0, 0, 0, -0.7)));
  const greens = [0x5f8a3a, 0x739b42, 0x4f7a35];
  [[1.7, 0, 4.0, 0], [1.3, 0.9, 4.6, 0.5], [1.25, -0.8, 4.4, -0.6], [1.1, 0.1, 5.3, 0.2]].forEach(([r, x, y, z], i) => {
    const g = new THREE.IcosahedronGeometry(r, 0);
    parts.push(prepGeo(g, greens[i % 3], mat(x, y, z, 0, i, 0, 1, 0.82, 1)));
  });
  return mergeGeos(parts);
}
function grassGeo() {
  const pos = [], col = [];
  const base = new THREE.Color(0x3d6a2a), tip = new THREE.Color(0xb9cf6a);
  for (let b = 0; b < 3; b++) {
    const a = b * 2.1 + 0.3, ca = Math.cos(a), sa = Math.sin(a), off = 0.12;
    const ox = Math.cos(a + 1.5) * off, oz = Math.sin(a + 1.5) * off;
    const w = 0.07, h = 0.55 + b * 0.12, lean = 0.12;
    pos.push(ox - ca * w, 0, oz - sa * w, ox + ca * w, 0, oz + sa * w, ox + lean * Math.cos(a + 1.5), h, oz + lean * Math.sin(a + 1.5));
    col.push(base.r, base.g, base.b, base.r, base.g, base.b, tip.r, tip.g, tip.b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const n = new Float32Array(pos.length);
  for (let i = 0; i < n.length; i += 3) n[i + 1] = 1;
  g.setAttribute('normal', new THREE.BufferAttribute(n, 3));
  return g;
}

function depthMat(base, amt) {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  return patch(m, base, amt, 0, false);
}

// exclusions: [{x,z,r}] areas kept clear of trees (paths are handled separately)
export function buildFoliage(scene, exclusions) {
  const R = rng(4242);
  const trees = { c: [], b: [] };
  const excluded = (x, z, pad = 0) => {
    for (const e of exclusions) if (Math.hypot(x - e.x, z - e.z) < e.r + pad) return true;
    for (const R of RAMPS) {
      for (let s = 0; s <= 16; s += 4) if (Math.hypot(x - R.x - R.dx * s, z - R.z - R.dz * s) < 5.5) return true;
    }
    return false;
  };
  const tryTree = (x, z, kind) => {
    const h = terrainH(x, z);
    if (h < 2.7) return;
    const s = 0.8 + R() * 0.55;
    if (excluded(x, z, 1.2) || nearPath(x, z, 2.8)) return;
    // keep slopes free except gentle ones
    const sl = Math.abs(terrainH(x + 1, z) - terrainH(x - 1, z)) + Math.abs(terrainH(x, z + 1) - terrainH(x, z - 1));
    if (sl > 1.5) return;
    trees[kind].push({ x, z, y: h - 0.15, s, r: R() * 6.28 });
    addCircle(x, z, 0.32 * s, h - 1, h + 2.6 * s, true, true);
  };
  // dense forest island, laid out on a jittered grid
  const F = ISLANDS[2];
  for (let gx = -40; gx <= 40; gx += 2.15) for (let gz = -40; gz <= 40; gz += 2.15) {
    const x = F.x + gx + (R() - 0.5) * 1.6, z = F.z + gz + (R() - 0.5) * 1.6;
    tryTree(x, z, R() < 0.55 ? 'c' : 'b');
  }
  // groves elsewhere
  const groves = [
    [0, 22, 30, 50, 'b'], [1, -18, 12, 14, 'b'], [1, 14, 14, 10, 'c'], [3, 0, 0, 200, 'c'], [4, 0, 0, 4, 'b'], [0, -25, 10, 14, 'c'],
  ];
  for (const [i, ox, oz, count, kind] of groves) {
    const I = ISLANDS[i];
    for (let k = 0; k < count; k++) {
      let x, z;
      if (i === 3) { const a = R() * 6.28, r = 39 + R() * 7; x = I.x + Math.cos(a) * r; z = I.z + Math.sin(a) * r; }
      else if (i === 0 && ox === 22) { const a = R() * 6.28, r = 12 + R() * 18; x = I.x + Math.cos(a) * r; z = I.z - 6 + Math.sin(a) * r * 0.8; }
      else { const a = R() * 6.28, r = R() * 9; x = I.x + ox + Math.cos(a) * r; z = I.z + oz + Math.sin(a) * r; }
      tryTree(x, z, kind);
    }
  }

  const meshes = [];
  const gC = coniferGeo(), gB = broadGeo();
  const matTree = (fadeY) => patch(new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient() }), 2.0, 0.0045, fadeY, false);
  const mC = matTree(1.8), mB = matTree(2.4);
  const dC = depthMat(2.0, 0.0045), dB = depthMat(2.0, 0.0045);
  const m4 = new THREE.Matrix4();
  // chunk instances so frustum culling works per chunk
  const chunk = (list, geo, material, depth, cell) => {
    const buckets = new Map();
    for (const t of list) {
      const k = Math.floor(t.x / cell) + ',' + Math.floor(t.z / cell);
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k).push(t);
    }
    for (const arr of buckets.values()) {
      const im = new THREE.InstancedMesh(geo, material, arr.length);
      arr.forEach((t, i) => { m4.copy(mat(t.x, t.y, t.z, 0, t.r, 0, t.s, t.s * (0.9 + (t.s % 0.2)), t.s)); im.setMatrixAt(i, m4); });
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      if (depth) { im.customDepthMaterial = depth; im.castShadow = true; }
      im.receiveShadow = true;
      scene.add(im);
      meshes.push(im);
    }
  };
  chunk(trees.c, gC, mC, dC, 44);
  chunk(trees.b, gB, mB, dB, 44);

  // grass
  const grass = [];
  for (const I of ISLANDS) {
    const n = I.id === 2 ? 6000 : I.id === 3 ? 9000 : I.id === 4 ? 1500 : 9000;
    for (let k = 0; k < n; k++) {
      const a = R() * 6.28, r = Math.sqrt(R()) * I.R * 0.85;
      const x = I.x + Math.cos(a) * r, z = I.z + Math.sin(a) * r;
      const h = terrainH(x, z);
      if (h < 3.0 || (I.id === 3 && h > 7)) continue;
      if (excluded(x, z, -0.5) || nearPath(x, z, 1.3)) continue;
      const sl = Math.abs(terrainH(x + 0.7, z) - h) + Math.abs(terrainH(x, z + 0.7) - h);
      if (sl > 0.8) continue;
      grass.push({ x, z, y: h - 0.03, s: 0.7 + R() * 0.8, r: R() * 6.28 });
    }
  }
  const gMat = patch(new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient(), side: THREE.DoubleSide }), 0.0, 0.22, 0, true);
  chunk(grass, grassGeo(), gMat, null, 40);
  return { meshes, treeCount: trees.c.length + trees.b.length, grassCount: grass.length };
}
