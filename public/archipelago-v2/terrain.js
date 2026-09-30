// Terrain mesh (vertex coloured, cel shaded), dense trees, grass and rocks.
import * as THREE from './three.module.min.js';
import { terrainH, rampMask, pathMask, isKept, ISLANDS, PEAK, causewayH, islandOf } from './world.js';
import { toon, toonGradient, addWind, mergeGeos, colorGeo } from './util.js';
import { mulberry32, smoothstep, fbm, clamp } from './math.js';

export const TB = { minX: -200, maxX: 292, minZ: -196, maxZ: 222 };

const C = (h) => new THREE.Color(h);
const PAL = {
  sand: C(0xe9d4a2), wet: C(0xb89a6c), seabed: C(0x546a5c), grass: C(0x77b04a), grass2: C(0x98c85a),
  grassDark: C(0x4e8a3a), forest: C(0x3e6a30), rock: C(0x958a7c), rockDark: C(0x6f665c), dirt: C(0xb89066),
  stone: C(0xa39d92), moss: C(0x5d7a44),
};

export function buildTerrain(scene) {
  const step = 1.2;
  const nx = Math.round((TB.maxX - TB.minX) / step), nz = Math.round((TB.maxZ - TB.minZ) / step);
  const vx = nx + 1, vz = nz + 1;
  const pos = new Float32Array(vx * vz * 3);
  const col = new Float32Array(vx * vz * 3);
  const H = new Float32Array(vx * vz);
  for (let j = 0; j < vz; j++) {
    const z = TB.minZ + j * step;
    for (let i = 0; i < vx; i++) {
      const x = TB.minX + i * step;
      H[j * vx + i] = terrainH(x, z);
    }
  }
  const c = new THREE.Color();
  for (let j = 0; j < vz; j++) {
    const z = TB.minZ + j * step;
    for (let i = 0; i < vx; i++) {
      const x = TB.minX + i * step;
      const idx = j * vx + i;
      const h = H[idx];
      pos[idx * 3] = x; pos[idx * 3 + 1] = h; pos[idx * 3 + 2] = z;
      const hl = H[j * vx + Math.max(0, i - 1)], hr = H[j * vx + Math.min(vx - 1, i + 1)];
      const hd = H[Math.max(0, j - 1) * vx + i], hu = H[Math.min(vz - 1, j + 1) * vx + i];
      const slope = Math.hypot(hr - hl, hu - hd) / (2 * step);
      const n = fbm(x * 0.08, z * 0.08, 2);
      // base by height
      if (h < -0.6) c.copy(PAL.seabed).lerp(PAL.wet, smoothstep(-5, -0.6, h));
      else if (h < 1.3) c.copy(PAL.wet).lerp(PAL.sand, smoothstep(-0.6, 0.6, h));
      else {
        c.copy(PAL.sand).lerp(n > 0 ? PAL.grass : PAL.grass2, smoothstep(1.3, 2.1, h));
        const isl = islandOf(x, z);
        if (isl === 'forest') c.lerp(PAL.forest, 0.55 * smoothstep(2, 4, h));
        if (n < -0.25) c.lerp(PAL.grassDark, 0.4);
      }
      // rock on steep ground
      const rk = smoothstep(0.7, 1.2, slope);
      if (rk > 0) c.lerp(n > 0.1 ? PAL.rockDark : PAL.rock, rk);
      // peak terraces are rocky and high
      const dp = Math.hypot(x - PEAK.x, z - PEAK.z);
      if (dp < 50 && h > 8) c.lerp(PAL.moss, 0.35);
      if (dp < 19.5 && h > 40) c.copy(PAL.stone).lerp(PAL.moss, 0.2 + 0.2 * n);
      // monolith plateau: worn stone
      const dr = Math.hypot(x + 60, z - 150);
      if (dr < 13) c.lerp(PAL.stone, 0.75 * smoothstep(13, 10, dr));
      // ramps and paths
      const pm = Math.max(rampMask(x, z), pathMask(x, z));
      if (pm > 0) c.lerp(PAL.dirt, pm * 0.9);
      col[idx * 3] = c.r; col[idx * 3 + 1] = c.g; col[idx * 3 + 2] = c.b;
    }
  }
  const index = [];
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const a = j * vx + i, b = a + 1, d = a + vx, e = d + 1;
      // skip fully deep cells
      if (H[a] < -8.6 && H[b] < -8.6 && H[d] < -8.6 && H[e] < -8.6) continue;
      index.push(a, d, b, b, d, e);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(index);
  geo.computeVertexNormals();
  const mat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient() });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  scene.add(mesh);
  return mesh;
}

function slopeAt(x, z) {
  const e = 0.8;
  return Math.hypot(terrainH(x + e, z) - terrainH(x - e, z), terrainH(x, z + e) - terrainH(x, z - e)) / (2 * e);
}

// ---------- trees ----------
function roundCanopyGeo() {
  const parts = [];
  const blobs = [[0, 0, 0, 1.0], [0.55, -0.25, 0.2, 0.72], [-0.5, -0.2, -0.25, 0.75], [0.1, 0.45, -0.1, 0.7], [-0.15, -0.3, 0.55, 0.62]];
  for (const [x, y, z, s] of blobs) {
    const g = new THREE.IcosahedronGeometry(s, 1);
    g.translate(x, y, z);
    parts.push(g);
  }
  return mergeGeos(parts);
}
function pineGeo() {
  const parts = [];
  const tiers = [[0, 1.3, 1.6], [0.9, 1.05, 1.4], [1.7, 0.8, 1.2], [2.35, 0.55, 1.0]];
  for (const [y, r, h] of tiers) {
    const g = new THREE.ConeGeometry(r, h, 7, 1);
    g.translate(0, y + h / 2, 0);
    parts.push(g);
  }
  return mergeGeos(parts);
}

export function buildVegetation(scene, colliderFn) {
  const rng = mulberry32(1234);
  const trees = { round: [], pine: [] };
  // spatial hash so trees keep a walkable spacing
  const TG = new Map();
  const tkey = (ix, iz) => ix * 10007 + iz;
  const spacingOk = (x, z, sp) => {
    const ix = Math.floor(x / 4), iz = Math.floor(z / 4);
    for (let i = ix - 1; i <= ix + 1; i++) for (let j = iz - 1; j <= iz + 1; j++) {
      const arr = TG.get(tkey(i, j));
      if (!arr) continue;
      for (const t of arr) if ((t.x - x) ** 2 + (t.z - z) ** 2 < sp * sp) return false;
    }
    return true;
  };
  const tryTree = (x, z, kind, minH = 1.9, sp = 2.4) => {
    if (!spacingOk(x, z, sp)) return false;
    const h = terrainH(x, z);
    if (h < minH) return false;
    if (slopeAt(x, z) > 0.55) return false;
    if (isKept(x, z)) return false;
    if (rampMask(x, z) > 0 || pathMask(x, z) > 0.05) return false;
    if (causewayH(x, z) > h - 1.5) return false;
    const dp = Math.hypot(x - PEAK.x, z - PEAK.z);
    if (dp < 50 && h > 6) return false; // keep terraces open and readable
    const s = 0.75 + rng() * 0.6;
    const t = { x, y: h, z, s, r: rng() * Math.PI * 2 };
    trees[kind].push(t);
    const k = tkey(Math.floor(x / 4), Math.floor(z / 4));
    if (!TG.has(k)) TG.set(k, []);
    TG.get(k).push(t);
    return true;
  };
  const scatter = (key, count, kindFn, minH, sp) => {
    const isl = ISLANDS[key];
    let placed = 0, tries = 0;
    while (placed < count && tries < count * 40) {
      tries++;
      const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * isl.R * 0.95;
      const x = isl.x + Math.cos(a) * r, z = isl.z + Math.sin(a) * r;
      if (tryTree(x, z, kindFn(x, z), minH, sp)) placed++;
    }
  };
  scatter('forest', 1500, () => (rng() < 0.55 ? 'pine' : 'round'), 1.9, 1.95);
  scatter('village', 90, () => 'round', 2.0);
  scatter('ring', 150, () => (rng() < 0.3 ? 'pine' : 'round'));
  scatter('peak', 320, () => (rng() < 0.7 ? 'pine' : 'round'));
  scatter('light', 110, () => (rng() < 0.4 ? 'pine' : 'round'));

  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.26, 2.2, 6);
  trunkGeo.translate(0, 1.1, 0);
  const trunkMat = toon(0x6b4a33);
  const roundGeo = roundCanopyGeo();
  roundGeo.translate(0, 3.3, 0);
  const pGeo = pineGeo();
  pGeo.translate(0, 1.2, 0);
  const leafMat = addWind(new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: toonGradient() }), 0.012, 1);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
  const all = [...trees.round.map((t) => ({ ...t, k: 'round' })), ...trees.pine.map((t) => ({ ...t, k: 'pine' }))];
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, all.length);
  const rounds = new THREE.InstancedMesh(roundGeo, leafMat, trees.round.length);
  const pines = new THREE.InstancedMesh(pGeo, leafMat, trees.pine.length);
  const cc = new THREE.Color();
  let ri = 0, pi = 0;
  all.forEach((t, i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.r);
    const ts = t.k === 'pine' ? 0.8 : 1;
    sc.set(t.s, t.s * ts, t.s);
    p.set(t.x, t.y - 0.15, t.z);
    m4.compose(p, q, sc);
    trunks.setMatrixAt(i, m4);
    sc.set(t.s, t.s * (0.9 + rng() * 0.3), t.s);
    m4.compose(p, q, sc);
    if (t.k === 'round') {
      rounds.setMatrixAt(ri, m4);
      const hue = 0.24 + rng() * 0.06, l = 0.34 + rng() * 0.12;
      rounds.setColorAt(ri++, cc.setHSL(hue, 0.55, l));
    } else {
      pines.setMatrixAt(pi, m4);
      pines.setColorAt(pi++, cc.setHSL(0.3 + rng() * 0.05, 0.45, 0.24 + rng() * 0.08));
    }
    colliderFn(t.x, t.z, 0.35 * t.s, t.y - 1, t.y + 6, true);
  });
  for (const m of [trunks, rounds, pines]) {
    m.castShadow = true;
    m.receiveShadow = true;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
    scene.add(m);
  }

  // ---------- grass (chunked so frustum culling works) ----------
  const blade = new THREE.BufferGeometry();
  {
    const verts = [], cols = [];
    const base = new THREE.Color(0x3d6e2a), tip = new THREE.Color(0xc6e27a);
    const blades = [[0, 0, 0], [0.12, 0.05, 1.9], [-0.1, -0.06, 4.1], [0.03, 0.12, 5.3]];
    for (const [ox, oz, rot] of blades) {
      const cs = Math.cos(rot), sn = Math.sin(rot);
      const w = 0.06, hgt = 0.55 + (rot % 1) * 0.2;
      const pts = [[-w, 0], [w, 0], [-w * 0.6, hgt * 0.5], [w * 0.6, hgt * 0.5], [0, hgt]];
      const tri = [[0, 1, 2], [1, 3, 2], [2, 3, 4]];
      for (const t of tri) for (const k of t) {
        const [lx, ly] = pts[k];
        const lean = (ly / hgt) * 0.12;
        verts.push(ox + lx * cs + lean * sn, ly, oz + lx * sn + lean * cs);
        const cl = base.clone().lerp(tip, ly / hgt);
        cols.push(cl.r, cl.g, cl.b);
      }
    }
    blade.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    blade.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    blade.computeVertexNormals();
    // point normals upward so grass is lit like the ground under it
    const nrm = blade.attributes.normal;
    for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, 0, 1, 0);
  }
  const grassMat = addWind(new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient(), side: THREE.DoubleSide }), 0.35, 1.6);
  const CH = 40;
  const chunks = new Map();
  const grassRng = mulberry32(99);
  const addTuft = (x, z) => {
    const h = terrainH(x, z);
    if (h < 1.9) return;
    if (slopeAt(x, z) > 0.6) return;
    if (isKept(x, z)) return;
    if (rampMask(x, z) > 0 || pathMask(x, z) > 0.2) return;
    if (causewayH(x, z) > h - 0.5) return;
    const dp = Math.hypot(x - PEAK.x, z - PEAK.z);
    if (dp < 19.5 && h > 40) return;
    if (Math.hypot(x + 60, z - 150) < 13) return;
    const key = Math.floor(x / CH) + ',' + Math.floor(z / CH);
    let arr = chunks.get(key);
    if (!arr) chunks.set(key, (arr = []));
    arr.push([x, h, z, grassRng()]);
  };
  for (const key of Object.keys(ISLANDS)) {
    const isl = ISLANDS[key];
    const count = key === 'peak' ? 46000 : key === 'forest' ? 36000 : 24000;
    for (let i = 0; i < count; i++) {
      const a = grassRng() * Math.PI * 2, r = Math.sqrt(grassRng()) * isl.R * 0.9;
      addTuft(isl.x + Math.cos(a) * r, isl.z + Math.sin(a) * r);
    }
  }
  const gc = new THREE.Color();
  for (const arr of chunks.values()) {
    const im = new THREE.InstancedMesh(blade, grassMat, arr.length);
    arr.forEach(([x, h, z, r], i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r * 6.28);
      const s = 0.7 + r * 0.7;
      sc.set(s, s * (0.8 + fbm(x * 0.1, z * 0.1, 1) * 0.5 + 0.3), s);
      p.set(x, h - 0.02, z);
      m4.compose(p, q, sc);
      im.setMatrixAt(i, m4);
      const isl = islandOf(x, z);
      gc.setHSL(0.22 + r * 0.06 + (isl === 'forest' ? 0.04 : 0), 0.5, 0.42 + r * 0.12);
      im.setColorAt(i, gc);
    });
    im.receiveShadow = true;
    im.castShadow = false;
    im.instanceMatrix.needsUpdate = true;
    im.instanceColor.needsUpdate = true;
    im.computeBoundingSphere();
    scene.add(im);
  }

  // ---------- rocks ----------
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const rocks = [];
  for (const key of Object.keys(ISLANDS)) {
    const isl = ISLANDS[key];
    for (let i = 0; i < 70; i++) {
      const a = rng() * Math.PI * 2, r = isl.R * (0.55 + rng() * 0.45);
      const x = isl.x + Math.cos(a) * r, z = isl.z + Math.sin(a) * r;
      const h = terrainH(x, z);
      if (h < -3 || isKept(x, z) || causewayH(x, z) > h - 2 || rampMask(x, z) > 0 || pathMask(x, z) > 0) continue;
      rocks.push([x, h, z, 0.4 + rng() * 1.2, rng()]);
    }
  }
  const rockMesh = new THREE.InstancedMesh(rockGeo, toon(0x8e867a), rocks.length);
  rocks.forEach(([x, h, z, s, r], i) => {
    q.setFromEuler(new THREE.Euler(r * 3, r * 7, r * 5));
    sc.set(s * 1.3, s * 0.8, s);
    p.set(x, h + s * 0.2, z);
    m4.compose(p, q, sc);
    rockMesh.setMatrixAt(i, m4);
    rockMesh.setColorAt(i, gc.setHSL(0.08, 0.08, 0.45 + r * 0.15));
    if (s > 0.9) colliderFn(x, z, s * 1.0, h - 1, h + s);
  });
  rockMesh.castShadow = true;
  rockMesh.receiveShadow = true;
  rockMesh.instanceMatrix.needsUpdate = true;
  if (rockMesh.instanceColor) rockMesh.instanceColor.needsUpdate = true;
  rockMesh.computeBoundingSphere();
  scene.add(rockMesh);

  // ---------- understory bushes (no collision) to thicken the forest ----------
  const bushGeo = new THREE.IcosahedronGeometry(1, 1);
  const bushes = [];
  for (const key of ['forest', 'forest', 'forest', 'forest', 'ring', 'peak', 'peak', 'light', 'village']) {
    const isl = ISLANDS[key];
    for (let i = 0; i < 600; i++) {
      const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * isl.R * 0.9;
      const x = isl.x + Math.cos(a) * r, z = isl.z + Math.sin(a) * r;
      const h = terrainH(x, z);
      if (h < 2 || isKept(x, z) || rampMask(x, z) > 0 || pathMask(x, z) > 0.05 || slopeAt(x, z) > 0.6) continue;
      if (Math.hypot(x - PEAK.x, z - PEAK.z) < 50 && h > 6) continue;
      bushes.push([x, h, z, 0.5 + rng() * 0.7, rng()]);
    }
  }
  const bushMesh = new THREE.InstancedMesh(bushGeo, leafMat, bushes.length);
  bushes.forEach(([x, h, z, s, r], i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r * 6);
    sc.set(s * 1.3, s * 0.8, s * 1.3);
    p.set(x, h + s * 0.35, z);
    m4.compose(p, q, sc);
    bushMesh.setMatrixAt(i, m4);
    bushMesh.setColorAt(i, gc.setHSL(0.25 + r * 0.06, 0.5, 0.3 + r * 0.1));
  });
  bushMesh.castShadow = true;
  bushMesh.receiveShadow = true;
  bushMesh.instanceMatrix.needsUpdate = true;
  if (bushMesh.instanceColor) bushMesh.instanceColor.needsUpdate = true;
  bushMesh.computeBoundingSphere();
  scene.add(bushMesh);
  return { treeCount: all.length, bushes: bushes.length };
}
