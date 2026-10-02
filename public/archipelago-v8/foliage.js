// Instanced trees and bushes (per island, so they cull) and a wrapping field
// of grass tufts placed on the GPU from the height texture.
import * as THREE from './three.module.min.js';
import { G, mat, GeoBuilder } from './geo.js';
import { U, foliageMaterial, foliageDepth, gradientMap } from './materials.js';
import { ISL } from './layout.js';
import { terrainAt, cwH, nearestTrail, PATHS } from './terrain.js';
import { addCircle } from './colliders.js';
import { polyDist, segDist, hash01, rng } from './util.js';

function broadleafGeo() {
  const b = new GeoBuilder(true);
  b.add(G.cyl(0.2, 0.32, 3.4, 6), mat(0, 1.7, 0), 0x6b4a2e, { fol: 0 });
  b.add(G.cyl(0.08, 0.12, 1.4, 5), mat(0.45, 2.9, 0, 0, 0, -0.8), 0x6b4a2e, { fol: 0 });
  b.add(G.blob(1.95, 0), mat(0, 4.3, 0), 0x4f913b, { fol: 1, jitter: 0.12 });
  b.add(G.blob(1.35, 0), mat(1.25, 3.7, 0.35), 0x5b9e40, { fol: 1, jitter: 0.12 });
  b.add(G.blob(1.25, 0), mat(-1.0, 3.8, -0.6), 0x468635, { fol: 1, jitter: 0.12 });
  b.add(G.blob(1.0, 0), mat(0.2, 5.6, 0.2), 0x63a846, { fol: 1, jitter: 0.12 });
  return b.build();
}
function pineGeo() {
  const b = new GeoBuilder(true);
  b.add(G.cyl(0.16, 0.26, 2.2, 5), mat(0, 1.1, 0), 0x5e4029, { fol: 0 });
  b.add(G.cone(2.0, 2.6, 7), mat(0, 2.6, 0), 0x2f6b3f, { fol: 1, jitter: 0.1 });
  b.add(G.cone(1.55, 2.2, 7), mat(0, 3.9, 0, 0, 0.4), 0x357646, { fol: 1, jitter: 0.1 });
  b.add(G.cone(1.0, 1.9, 7), mat(0, 5.1, 0, 0, 0.8), 0x3b7f4c, { fol: 1, jitter: 0.1 });
  return b.build();
}
function bushGeo() {
  const b = new GeoBuilder(true);
  b.add(G.blob(0.85, 0), mat(0, 0.45, 0, 0, 0, 0, 1, 0.75, 1), 0x4c8c36, { fol: 1, jitter: 0.15 });
  b.add(G.blob(0.6, 0), mat(0.55, 0.35, 0.2, 0, 0, 0, 1, 0.8, 1), 0x5a9c3f, { fol: 1, jitter: 0.15 });
  return b.build();
}

export function buildFoliage(scene, excl, segs) {
  const geos = { tree: broadleafGeo(), pine: pineGeo(), bush: bushGeo() };
  const mats = {
    tree: foliageMaterial('tree', 2.2, 1.0, true),
    pine: foliageMaterial('pine', 1.6, 0.8, true),
    bush: foliageMaterial('bush', 0.0, 0.6, true),
  };
  const depth = { tree: foliageDepth('tree', 2.2, 1.0), pine: foliageDepth('pine', 1.6, 0.8) };
  const R = rng(1234);
  const blocked = (x, z, pad) => {
    for (const [ex, ez, er] of excl) if ((x - ex) ** 2 + (z - ez) ** 2 < (er + pad) ** 2) return true;
    for (const [ax, az, bx, bz, r] of segs) if (segDist(x, z, ax, az, bx, bz) < r + pad) return true;
    for (const p of PATHS) if (polyDist(x, z, p) < 1.7 + pad) return true;
    return false;
  };
  const slopeAt = (x, z) => Math.hypot(terrainAt(x + 1, z) - terrainAt(x - 1, z), terrainAt(x, z + 1) - terrainAt(x, z - 1)) / 2;
  const plans = {
    V: { sp: 5.0, tree: 0.3, pine: 0, bush: 0.4, minH: 3.6, maxSlope: 0.6 },
    M: { sp: 4.5, tree: 0.18, pine: 0.06, bush: 0.42, minH: 3.6, maxSlope: 0.6 },
    F: { sp: 2.3, tree: 0.74, pine: 0.14, bush: 0.08, minH: 3.0, maxSlope: 0.7 },
    P: { sp: 3.6, tree: 0.04, pine: 0.6, bush: 0.12, minH: 3.4, maxSlope: 1.5 },
    L: { sp: 6.0, tree: 0.06, pine: 0, bush: 0.3, minH: 3.6, maxSlope: 0.6 },
  };
  const meshes = [];
  let total = 0;
  for (const I of ISL) {
    const pl = plans[I.id];
    const lists = { tree: [], pine: [], bush: [] };
    const ext = I.r1 + 6;
    for (let x = I.x - ext; x <= I.x + ext; x += pl.sp) for (let z = I.z - ext; z <= I.z + ext; z += pl.sp) {
      const jx = x + (hash01(x, z) - 0.5) * pl.sp * 0.8, jz = z + (hash01(z + 3.1, x - 7.7) - 0.5) * pl.sp * 0.8;
      const h = terrainAt(jx, jz);
      if (h < pl.minH) continue;
      if (Math.hypot(jx - I.x, jz - I.z) > ext) continue;
      if (slopeAt(jx, jz) > pl.maxSlope) continue;
      if (cwH(jx, jz) > h - 1.0) continue;
      if (I.id === 'P' && (h > 30 || nearestTrail(jx, jz).d < 4.6)) continue;
      const r = R();
      let type = null;
      if (r < pl.tree) type = 'tree'; else if (r < pl.tree + pl.pine) type = 'pine'; else if (r < pl.tree + pl.pine + pl.bush) type = 'bush';
      if (!type) continue;
      if (blocked(jx, jz, type === 'bush' ? 0.2 : 0.6)) continue;
      const s = type === 'bush' ? 0.7 + R() * 0.7 : 0.8 + R() * 0.55;
      lists[type].push([jx, h - 0.1, jz, s, R() * Math.PI * 2]);
      if (type !== 'bush') addCircle(jx, jz, (type === 'tree' ? 0.36 : 0.3) * s, h - 1, h + 3.2 * s);
    }
    for (const type of ['tree', 'pine', 'bush']) {
      const list = lists[type];
      if (!list.length) continue;
      const im = new THREE.InstancedMesh(geos[type], mats[type], list.length);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
      list.forEach(([x, y, z, s, yaw], k) => {
        e.set((R() - 0.5) * 0.08, yaw, (R() - 0.5) * 0.08);
        q.setFromEuler(e);
        m4.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(s, s * (0.9 + R() * 0.25), s));
        im.setMatrixAt(k, m4);
      });
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      im.boundingSphere.radius += 3;
      im.receiveShadow = true;
      im.castShadow = type !== 'bush';
      if (depth[type]) im.customDepthMaterial = depth[type];
      scene.add(im);
      meshes.push(im);
      total += list.length;
    }
  }
  return { meshes, total };
}

// ---------------------------------------------------------------- grass
export function buildGrass(scene, heightTex) {
  const COUNT = 16000, HALF = 32;
  const base = new THREE.Color(0x3d7a2a), tip = new THREE.Color(0xa6d870);
  const pos = [], col = [], nor = [];
  for (let k = 0; k < 3; k++) {
    const a = k / 3 * Math.PI * 2 + 0.3, c = Math.cos(a), s = Math.sin(a);
    const w = 0.075, h = 0.5 + k * 0.08, lean = 0.12;
    const ox = c * 0.06, oz = s * 0.06;
    pos.push(ox - s * w, 0, oz + c * w, ox + s * w, 0, oz - c * w, ox + c * lean, h, oz + s * lean);
    col.push(base.r, base.g, base.b, base.r, base.g, base.b, tip.r, tip.g, tip.b);
    nor.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const off = new Float32Array(COUNT * 3);
  const R = rng(77);
  for (let i = 0; i < COUNT; i++) { off[i * 3] = R() * HALF * 2; off[i * 3 + 1] = R() * HALF * 2; off[i * 3 + 2] = R(); }
  g.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 3));
  g.instanceCount = COUNT;
  const m = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: gradientMap(), side: THREE.DoubleSide });
  const uniforms = { uHeight: { value: heightTex }, uFocus: { value: new THREE.Vector3() } };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uHeight = uniforms.uHeight;
    sh.uniforms.uFocus = uniforms.uFocus;
    sh.uniforms.uTime = U.uTime;
    sh.uniforms.uWater = U.uWater;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
uniform sampler2D uHeight; uniform vec3 uFocus; uniform float uTime; uniform float uWater; attribute vec3 aOff;`)
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3(0.0, 1.0, 0.0);')
      .replace('#include <begin_vertex>', `
  vec2 rel = mod(aOff.xy - uFocus.xz + ${HALF.toFixed(1)}, ${(HALF * 2).toFixed(1)}) - ${HALF.toFixed(1)};
  vec2 wxz = uFocus.xz + rel;
  vec2 huv = (wxz + 160.5) / 321.0;
  vec4 hs = texture2D(uHeight, huv);
  float fadeR = 1.0 - smoothstep(${(HALF * 0.65).toFixed(1)}, ${(HALF * 0.97).toFixed(1)}, length(rel));
  float msk = step(aOff.z, hs.g) * step(uWater + 0.25, hs.r) * fadeR;
  float sc = msk * (0.7 + fract(aOff.z * 17.3) * 0.7);
  float ang = aOff.z * 40.0;
  float cs = cos(ang), sn = sin(ang);
  vec3 p = position * sc;
  p.xz = vec2(cs * p.x - sn * p.z, sn * p.x + cs * p.z);
  float sw = sin(uTime * 1.9 + wxz.x * 0.35 + wxz.y * 0.21) * 0.13 + sin(uTime * 4.3 + wxz.x * 1.7) * 0.03;
  p.x += sw * position.y * sc; p.z += sw * 0.6 * position.y * sc;
  vec3 transformed = vec3(wxz.x, hs.r - 0.03, wxz.y) + p;`);
  };
  m.customProgramCacheKey = () => 'grass';
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  scene.add(mesh);
  return { mesh, uniforms, tris: COUNT * 3 };
}
