// Five Lights — instanced trees and grass. Canopies sway in the vertex shader and cast no
// shadow (only static trunks do), and they dither out when they block the camera.
import * as THREE from './three.module.min.js';
import { groundAt, pathDist, islandOf, ISL, FLATS, surfAt, HALF } from './terrain.js';
import { mulberry32, fbm2, srgb, toonGradient, shared, GLSL_BAYER, clamp, segDist } from './util.js';
import { addCircle } from './colliders.js';

export function mergeGeos(geos) {
  const parts = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  let n = 0; for (const g of parts) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
  const hasCol = parts.every((g) => g.attributes.color);
  const col = hasCol ? new Float32Array(n * 3) : null;
  let o = 0;
  for (const g of parts) {
    pos.set(g.attributes.position.array, o * 3);
    if (!g.attributes.normal) g.computeVertexNormals();
    nor.set(g.attributes.normal.array, o * 3);
    if (col) col.set(g.attributes.color.array, o * 3);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  if (col) out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return out;
}

function swayMaterial(base, { fade = false, grass = false } = {}) {
  const m = new THREE.MeshToonMaterial({ gradientMap: toonGradient(), ...base });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = shared.uTime;
    sh.vertexShader = `uniform float uTime;\n${fade ? 'attribute float aFade; varying float vFade;' : ''}\n` + sh.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
      float ph = uTime * ${grass ? '1.9' : '1.1'} + ip.x * 0.21 + ip.z * 0.17;
      float hh = max(position.y - ${grass ? '0.0' : '2.0'}, 0.0);
      float sw = (sin(ph) + 0.4 * sin(ph * 2.3 + 1.7)) * ${grass ? '0.22' : '0.045'} * hh;
      transformed.x += sw; transformed.z += sw * 0.55;
      ${fade ? 'vFade = aFade;' : ''}`
    );
    if (fade) {
      sh.fragmentShader = `varying float vFade;\n${GLSL_BAYER}\n` + sh.fragmentShader.replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
        if (vFade < 0.99 && bayer4(gl_FragCoord.xy) > vFade) discard;`
      );
    }
  };
  m.customProgramCacheKey = () => `sway-${fade}-${grass}`;
  return m;
}

const CELLW = 48;
export class Foliage {
  constructor(scene, exclusions) {
    this.scene = scene;
    this.trees = [];
    this.cells = new Map();
    this.grassCells = [];
    this.fadeHash = new Map();
    this.faded = new Set();
    this.exclusions = exclusions;
    this.place(exclusions);
  }
  // call after the terrain surfaces are known
  build() {
    this.buildTrees();
    this.buildGrass(this.exclusions);
  }

  place(exclusions) {
    const rng = mulberry32(1234);
    const ok = (x, z, clear) => {
      for (const e of exclusions) if (Math.hypot(x - e.x, z - e.z) < e.r + clear) return false;
      for (const f of FLATS) if (Math.hypot(x - f.x, z - f.z) < f.r + 1.5) return false;
      return true;
    };
    for (let ii = 0; ii < ISL.length; ii++) {
      const I = ISL[ii];
      const forest = I.id === 'forest';
      const sp = forest ? 2.6 : 6.0;
      for (let z = I.z - I.r; z < I.z + I.r; z += sp) for (let x = I.x - I.r; x < I.x + I.r; x += sp) {
        const px = x + (rng() - 0.5) * sp * 0.9, pz = z + (rng() - 0.5) * sp * 0.9;
        if (islandOf(px, pz) !== ii) continue;
        const h = groundAt(px, pz);
        if (h < 3.9) continue;
        if (I.id === 'peak' && h > 30) continue;
        const sl = Math.hypot(groundAt(px + 1, pz) - groundAt(px - 1, pz), groundAt(px, pz + 1) - groundAt(px, pz - 1)) / 2;
        if (sl > 0.7) continue;
        if (!forest) {
          const g = fbm2(px * 0.03 + ii * 9, pz * 0.03);
          if (g < (I.id === 'peak' ? 0.5 : 0.56)) continue;
        }
        const pd = pathDist(px, pz).d;
        if (pd < (forest ? 1.6 : 2.4)) continue;
        if (!ok(px, pz, 1.5)) continue;
        const conifer = forest ? rng() < 0.62 : I.id === 'peak' ? rng() < 0.8 : rng() < 0.25;
        const s = 0.75 + rng() * 0.6 + (forest ? 0.15 : 0);
        this.trees.push({ x: px, z: pz, y: h - 0.2, s, conifer, rot: rng() * 6.28, hue: rng() });
      }
    }
  }

  buildTrees() {
    const trunkGeo = new THREE.CylinderGeometry(0.2, 0.34, 3.8, 6, 1, true); trunkGeo.translate(0, 1.9, 0);
    const c1 = new THREE.ConeGeometry(2.3, 3.4, 7, 1, true); c1.translate(0, 3.4, 0);
    const c2 = new THREE.ConeGeometry(1.75, 3.0, 7, 1, true); c2.translate(0, 5.0, 0);
    const c3 = new THREE.ConeGeometry(1.15, 2.6, 7, 1, true); c3.translate(0, 6.6, 0);
    const conGeo = mergeGeos([c1, c2, c3]);
    const b1 = new THREE.IcosahedronGeometry(2.3, 0); b1.scale(1, 0.85, 1); b1.translate(0, 4.6, 0);
    const b2 = new THREE.IcosahedronGeometry(1.6, 0); b2.translate(0.9, 5.9, 0.5);
    const broGeo = mergeGeos([b1, b2]);
    for (const g of [conGeo, broGeo]) g.computeVertexNormals();
    this.trunkMat = new THREE.MeshToonMaterial({ color: srgb(0.42, 0.3, 0.22), gradientMap: toonGradient() });
    this.canopyMat = swayMaterial({ color: 0xffffff }, { fade: true });
    // bucket by cell
    for (const t of this.trees) {
      const k = `${Math.floor((t.x + HALF) / CELLW)},${Math.floor((t.z + HALF) / CELLW)}`;
      if (!this.cells.has(k)) this.cells.set(k, []);
      this.cells.get(k).push(t);
      addCircle(t.x, t.z, 0.42 * t.s, t.y - 1, t.y + 4 * t.s);
    }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const col = new THREE.Color();
    const conA = srgb(0.16, 0.38, 0.22), conB = srgb(0.24, 0.48, 0.24), broA = srgb(0.38, 0.6, 0.22), broB = srgb(0.55, 0.66, 0.24);
    for (const [, list] of this.cells) {
      const trunk = new THREE.InstancedMesh(trunkGeo, this.trunkMat, list.length);
      const cons = list.filter((t) => t.conifer), bros = list.filter((t) => !t.conifer);
      const mk = (geo, arr, ca, cb) => {
        if (!arr.length) return null;
        const im = new THREE.InstancedMesh(geo, this.canopyMat, arr.length);
        const fade = new Float32Array(arr.length).fill(1);
        im.geometry = geo.clone();
        im.geometry.setAttribute('aFade', new THREE.InstancedBufferAttribute(fade, 1));
        arr.forEach((t, i) => {
          q.setFromAxisAngle(up, t.rot); sc.set(t.s, t.s * (0.9 + t.hue * 0.3), t.s); p.set(t.x, t.y, t.z);
          m4.compose(p, q, sc); im.setMatrixAt(i, m4);
          col.copy(ca).lerp(cb, t.hue); im.setColorAt(i, col);
          t.mesh = im; t.idx = i;
        });
        im.castShadow = false; im.receiveShadow = true;
        im.computeBoundingSphere();
        this.scene.add(im);
        return im;
      };
      list.forEach((t, i) => {
        q.setFromAxisAngle(up, t.rot); sc.set(t.s, t.s * (t.conifer ? 1 : 1.1), t.s); p.set(t.x, t.y, t.z);
        m4.compose(p, q, sc); trunk.setMatrixAt(i, m4);
      });
      trunk.castShadow = true; trunk.receiveShadow = true;
      trunk.computeBoundingSphere();
      this.scene.add(trunk);
      mk(conGeo, cons, conA, conB);
      mk(broGeo, bros, broA, broB);
    }
    // fade lookup hash (8m cells)
    for (const t of this.trees) {
      const k = `${Math.floor(t.x / 8)},${Math.floor(t.z / 8)}`;
      if (!this.fadeHash.has(k)) this.fadeHash.set(k, []);
      this.fadeHash.get(k).push(t);
    }
  }

  buildGrass(exclusions) {
    const rng = mulberry32(99);
    // a clump of five tapered blades
    const pos = [], colr = [], nor = [];
    const base = srgb(0.3, 0.52, 0.2), tip = srgb(0.78, 0.82, 0.42);
    for (let b = 0; b < 5; b++) {
      const a = rng() * Math.PI * 2, r = rng() * 0.35, w = 0.07 + rng() * 0.05, h = 0.45 + rng() * 0.45;
      const cx = Math.cos(a) * r, cz = Math.sin(a) * r, ta = rng() * Math.PI;
      const tx = Math.cos(ta) * w, tz = Math.sin(ta) * w;
      const lean = (rng() - 0.5) * 0.3;
      pos.push(cx - tx, 0, cz - tz, cx + tx, 0, cz + tz, cx + lean, h, cz + lean * 0.5);
      colr.push(base.r, base.g, base.b, base.r, base.g, base.b, tip.r, tip.g, tip.b);
      for (let k = 0; k < 3; k++) nor.push(0, 1, 0);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    this.grassMat = swayMaterial({ vertexColors: true, side: THREE.DoubleSide }, { grass: true });
    const GC = 24;
    const cells = new Map();
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
    for (const I of ISL) {
      for (let z = I.z - I.r; z < I.z + I.r; z += 0.8) for (let x = I.x - I.r; x < I.x + I.r; x += 0.8) {
        const px = x + (rng() - 0.5) * 0.75, pz = z + (rng() - 0.5) * 0.75;
        const s = surfAt(px, pz);
        if (s !== 1) continue;
        const h = groundAt(px, pz);
        if (h < 3.8 || h > 32) continue;
        const dens = fbm2(px * 0.08, pz * 0.08);
        if (dens < 0.38) continue;
        if (pathDist(px, pz).d < 0.4) continue;
        let bad = false; for (const e of exclusions) if (Math.hypot(px - e.x, pz - e.z) < e.r * 0.8) { bad = true; break; }
        if (bad) continue;
        const k = `${Math.floor(px / GC)},${Math.floor(pz / GC)}`;
        if (!cells.has(k)) cells.set(k, { x: (Math.floor(px / GC) + 0.5) * GC, z: (Math.floor(pz / GC) + 0.5) * GC, items: [] });
        cells.get(k).items.push({ x: px, y: h - 0.03, z: pz, s: 0.7 + dens * 0.9, r: rng() * 6.28, c: rng() });
      }
    }
    const cA = srgb(1, 1, 1), cB = srgb(0.85, 0.95, 0.7);
    for (const [, c] of cells) {
      const im = new THREE.InstancedMesh(geo, this.grassMat, c.items.length);
      c.items.forEach((g, i) => {
        q.setFromAxisAngle(up, g.r); sc.set(g.s, g.s, g.s); p.set(g.x, g.y, g.z);
        m4.compose(p, q, sc); im.setMatrixAt(i, m4);
        col.copy(cA).lerp(cB, g.c); im.setColorAt(i, col);
      });
      im.castShadow = false; im.receiveShadow = true;
      im.computeBoundingSphere();
      im.visible = false;
      this.scene.add(im);
      this.grassCells.push({ x: c.x, z: c.z, mesh: im });
    }
    this.grassCount = [...cells.values()].reduce((a, c) => a + c.items.length, 0);
  }

  update(dt, player, camPos) {
    for (const g of this.grassCells) g.mesh.visible = Math.hypot(g.x - player.x, g.z - player.z) < 70;
    // dither canopies that sit between the camera and the apprentice
    const want = new Set();
    const ax = camPos.x, az = camPos.z, bx = player.x, bz = player.z;
    const x0 = Math.floor((Math.min(ax, bx) - 4) / 8), x1 = Math.floor((Math.max(ax, bx) + 4) / 8);
    const z0 = Math.floor((Math.min(az, bz) - 4) / 8), z1 = Math.floor((Math.max(az, bz) + 4) / 8);
    for (let j = z0; j <= z1; j++) for (let i = x0; i <= x1; i++) {
      const l = this.fadeHash.get(`${i},${j}`); if (!l) continue;
      for (const t of l) {
        const cy = t.y + (t.conifer ? 4.6 : 4.8) * t.s, cr = 2.6 * t.s;
        const r = segDist(t.x, t.z, ax, az, bx, bz);
        if (r.d > cr) continue;
        const ly = camPos.y + (player.y + 1.4 - camPos.y) * (1 - r.t);
        if (Math.abs(ly - cy) < cr * 1.4) want.add(t);
      }
    }
    for (const t of want) this.faded.add(t);
    const dirty = new Set();
    for (const t of [...this.faded]) {
      const attr = t.mesh.geometry.attributes.aFade;
      const target = want.has(t) ? 0.22 : 1;
      const cur = attr.array[t.idx];
      const nv = cur + clamp(target - cur, -dt * 3, dt * 3);
      attr.array[t.idx] = nv;
      dirty.add(attr);
      if (nv >= 1 && target === 1) { attr.array[t.idx] = 1; this.faded.delete(t); }
    }
    for (const a of dirty) a.needsUpdate = true;
  }
}
