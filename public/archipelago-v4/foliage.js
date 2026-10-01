// Instanced trees, grass and rocks. Chunked so frustum culling works and
// grass only draws near the player. Canopies sway in the shader and their
// shadow depth material sways identically.
import * as THREE from './three.module.min.js';
import { heightAt, slopeAt, isDirt, terrainColor, addCircle, CAUSEWAYS, TRAIL_PTS } from './terrain.js';
import { ISL, OBS, MONO, SHIP, VILLAGE, LIGHT, START, TIDES } from './layout.js';
import { canopyMaterial, swayDepthMaterial, swayMaterial, toon, paint, xf, mergeGeoms } from './materials.js';
import { rng, polyDist, vnoise } from './util.js';

function nearCauseway(x, z, pad) {
  for (const c of CAUSEWAYS) {
    if (x < c.minX - pad || x > c.maxX + pad || z < c.minZ - pad || z > c.maxZ + pad) continue;
    if (polyDist(x, z, c.pts).d < c.hw + pad) return true;
  }
  return false;
}
function inShip(x, z, pad = 0) {
  const dx = x - SHIP.x, dz = z - SHIP.z, c = Math.cos(SHIP.yaw), s = Math.sin(SHIP.yaw);
  const lx = dx * c - dz * s, lz = dx * s + dz * c;
  return Math.abs(lx) < 4.2 + pad && Math.abs(lz) < 12.5 + pad;
}
const d2 = (x, z, p) => Math.hypot(x - p.x, z - p.z);

function canopyColors(g, dark, light) {
  const a = new THREE.Color(dark), b = new THREE.Color(light), c = new THREE.Color();
  const n = g.attributes.normal, cnt = g.attributes.position.count;
  const col = new Float32Array(cnt * 3);
  for (let i = 0; i < cnt; i++) {
    c.copy(a).lerp(b, THREE.MathUtils.clamp(0.5 + 0.6 * n.getY(i), 0, 1));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

export function buildFoliage(scene, corridors) {
  const R = rng(1234);
  const trees = { broad: [], conifer: [] };
  const occupied = [];

  const treeOK = (x, z, h) => {
    if (h < TIDES[0] + 1.0 || slopeAt(x, z) > 0.75) return false;
    if (isDirt(x, z)) return false;
    if (nearCauseway(x, z, 3.5)) return false;
    if (d2(x, z, START) < 9) return false;
    if (d2(x, z, OBS) < OBS.plateauR + 4) return false;
    if (d2(x, z, MONO) < 21) return false;
    if (d2(x, z, MONO.brazier) < 5) return false;
    if (d2(x, z, SHIP.clearing) < SHIP.clearing.r + 1.5 || inShip(x, z, 3)) return false;
    if (d2(x, z, SHIP.beacon) < 5) return false;
    for (const m of SHIP.mirrors) if (d2(x, z, m) < 3.5) return false;
    if (d2(x, z, LIGHT) < 14) return false;
    if (Math.abs(x - VILLAGE.x) < 14 && z < VILLAGE.z - 4) return false;
    if (d2(x, z, VILLAGE) < 12) return false;
    for (const c of corridors) {
      const r = polyDist(x, z, c.pts);
      if (r.d < c.w + 1.1) return false;
    }
    if (Math.hypot(x - OBS.x, z - OBS.z) < 56 && polyDist(x, z, TRAIL_PTS).d < 3.8) return false;
    return true;
  };

  const placeGrid = (isl, spacing, prob, type) => {
    const ext = isl.R * 1.1;
    for (let gx = isl.x - ext; gx < isl.x + ext; gx += spacing) for (let gz = isl.z - ext; gz < isl.z + ext; gz += spacing) {
      if (R() > prob) continue;
      const x = gx + (R() - 0.5) * spacing * 0.9, z = gz + (R() - 0.5) * spacing * 0.9;
      const h = heightAt(x, z);
      if (!treeOK(x, z, h)) continue;
      const t = typeof type === 'function' ? type(x, z, h) : type;
      const s = 0.85 + R() * 0.5;
      trees[t].push({ x, y: h - 0.15, z, s, r: R() * Math.PI * 2, hue: R() });
      addCircle(x, z, 0.32 * s, h - 1, h + 6 * s, true);
    }
  };
  // dense forest on F, conifers on the peak's flanks, scattered elsewhere
  placeGrid(ISL[2], 2.55, 0.95, (x, z) => (vnoise(x * 0.05, z * 0.05) > 0.62 ? 'conifer' : 'broad'));
  placeGrid(ISL[0], 5.2, 0.6, (x, z, h) => (h > 12 ? 'conifer' : (R() > 0.5 ? 'conifer' : 'broad')));
  placeGrid(ISL[1], 7, 0.45, 'broad');
  placeGrid(ISL[3], 7, 0.4, 'broad');
  placeGrid(ISL[4], 8, 0.35, 'conifer');

  // geometry
  const trunkG = paint(new THREE.CylinderGeometry(0.17, 0.3, 3.4, 6, 1).translate(0, 1.7, 0), 0x6b4a32, 0.15);
  const broadG = mergeGeoms([
    canopyColors(xf(new THREE.IcosahedronGeometry(1.75, 1), 0, 4.0, 0, 0, 0, 0, 1, 0.82, 1), 0x2f6b2a, 0x8cc84a),
    canopyColors(xf(new THREE.IcosahedronGeometry(1.15, 0), 0.7, 4.85, 0.35), 0x3a7a2e, 0x9fd458),
  ]);
  const conG = mergeGeoms([
    canopyColors(new THREE.ConeGeometry(1.7, 2.6, 7).translate(0, 2.6, 0), 0x1f4f2e, 0x5a9a48),
    canopyColors(new THREE.ConeGeometry(1.3, 2.3, 7).translate(0, 3.8, 0), 0x245a32, 0x66a84e),
    canopyColors(new THREE.ConeGeometry(0.85, 1.9, 7).translate(0, 4.9, 0), 0x2a6436, 0x74b456),
  ]);
  const trunkM = toon(0xffffff, { vertexColors: true });
  const broadM = canopyMaterial('broad', 0.045, 2.2, 4.1, 2.1);
  const conM = canopyMaterial('con', 0.035, 1.6, 3.6, 1.8);
  const broadD = swayDepthMaterial('broad', 0.045, 2.2);
  const conD = swayDepthMaterial('con', 0.035, 1.6);

  const CH = 40;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color();
  const tris = { count: 0 };
  const buildChunks = (list, canopyG, canopyM, canopyD) => {
    const chunks = new Map();
    for (const t of list) {
      const k = Math.floor(t.x / CH) + ',' + Math.floor(t.z / CH);
      if (!chunks.has(k)) chunks.set(k, []);
      chunks.get(k).push(t);
    }
    for (const arr of chunks.values()) {
      const trunk = new THREE.InstancedMesh(trunkG, trunkM, arr.length);
      const can = new THREE.InstancedMesh(canopyG, canopyM, arr.length);
      arr.forEach((t, i) => {
        q.setFromAxisAngle(v.set(0, 1, 0), t.r);
        m4.compose(v.set(t.x, t.y, t.z), q, sc.set(t.s, t.s * (0.9 + t.hue * 0.25), t.s));
        trunk.setMatrixAt(i, m4); can.setMatrixAt(i, m4);
        col.setHSL(0.0 + (t.hue - 0.5) * 0.06 + 0.0, 0, 1);
        col.setRGB(0.85 + t.hue * 0.3, 0.9 + (1 - t.hue) * 0.2, 0.8 + t.hue * 0.15);
        can.setColorAt(i, col);
      });
      can.customDepthMaterial = canopyD;
      for (const m of [trunk, can]) { m.castShadow = true; m.receiveShadow = true; m.computeBoundingSphere(); scene.add(m); }
      tris.count += arr.length * (trunkG.attributes.position.count / 3 + canopyG.attributes.position.count / 3);
    }
  };
  buildChunks(trees.broad, broadG, broadM, broadD);
  buildChunks(trees.conifer, conG, conM, conD);

  // ---- rocks ----
  const rocks = [];
  for (let i = 0; i < 520; i++) {
    const isl = ISL[Math.floor(R() * ISL.length)];
    const a = R() * Math.PI * 2, r = isl.R * (0.3 + R() * 0.85);
    const x = isl.x + Math.cos(a) * r, z = isl.z + Math.sin(a) * r;
    const h = heightAt(x, z);
    if (h < TIDES[5] - 0.5 || isDirt(x, z) || nearCauseway(x, z, 2.5) || d2(x, z, START) < 6) continue;
    if (d2(x, z, OBS) < OBS.plateauR + 2 || d2(x, z, MONO) < 18 || d2(x, z, SHIP.clearing) < SHIP.clearing.r + 1 || d2(x, z, LIGHT) < 11 || d2(x, z, VILLAGE) < 26) continue;
    let bad = false;
    for (const c of corridors) if (polyDist(x, z, c.pts).d < c.w + 0.6) { bad = true; break; }
    if (bad) continue;
    const s = 0.35 + Math.pow(R(), 2.2) * 1.6;
    rocks.push({ x, y: h - s * 0.25, z, s, r: R() * 6 });
    if (s > 0.8) addCircle(x, z, s * 0.85, h - 2, h + s * 0.9, s > 1.2);
  }
  // trail edge stones make the switchbacks easy to read
  for (let i = 0; i < TRAIL_PTS.length - 1; i += 2) {
    const a = TRAIL_PTS[i], b = TRAIL_PTS[i + 1];
    const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
    for (const side of [-1, 1]) {
      if (R() < 0.25) continue;
      const x = a.x - (dz / l) * 2.3 * side, z = a.z + (dx / l) * 2.3 * side;
      const s = 0.22 + R() * 0.22;
      rocks.push({ x, y: heightAt(x, z) - 0.05, z, s, r: R() * 6 });
    }
  }
  const rockG = paint(new THREE.DodecahedronGeometry(1, 0).scale(1, 0.7, 1.1), 0x9a9288, 0.25, 7);
  const rockM = toon(0xffffff, { vertexColors: true, flat: true });
  const rockMesh = new THREE.InstancedMesh(rockG, rockM, rocks.length);
  rocks.forEach((r, i) => {
    q.setFromEuler(new THREE.Euler(r.r * 0.3, r.r, r.r * 0.2));
    m4.compose(v.set(r.x, r.y, r.z), q, sc.set(r.s, r.s, r.s));
    rockMesh.setMatrixAt(i, m4);
    col.setScalar(0.8 + ((r.r * 13.7) % 1) * 0.35);
    rockMesh.setColorAt(i, col);
  });
  rockMesh.castShadow = true; rockMesh.receiveShadow = true; rockMesh.computeBoundingSphere();
  scene.add(rockMesh);

  // ---- grass ----
  const blade = (ang, lean) => {
    const g = new THREE.BufferGeometry();
    const w = 0.07, hgt = 0.62;
    const p = [-w, 0, 0, w, 0, 0, lean * 0.6, hgt, lean];
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute([0.55, 0.6, 0.5, 0.55, 0.6, 0.5, 1.15, 1.15, 0.9], 3));
    g.rotateY(ang);
    return g;
  };
  const tuftG = mergeGeoms([blade(0, 0.12), blade(2.1, 0.16), blade(4.2, 0.1), blade(1.0, -0.14)]);
  // keep the flat up-facing normals
  const nn = tuftG.attributes.normal;
  for (let i = 0; i < nn.count; i++) nn.setXYZ(i, 0, 1, 0);
  const grassM = swayMaterial('grass', 0.28, 0.0, { side: THREE.DoubleSide });
  const GC = 16;
  const grassChunks = [];
  const density = 5.2;
  const grassOK = (x, z, h) => {
    if (h < TIDES[0] + 1.15 || h > 41.5) return false;
    if (slopeAt(x, z) > 0.62 || isDirt(x, z)) return false;
    if (d2(x, z, OBS) < OBS.wallR + 0.6) return false;
    if (d2(x, z, MONO) < 2.6) return false;
    if (inShip(x, z, 0.5) || d2(x, z, LIGHT) < 7) return false;
    if (nearCauseway(x, z, 0.5)) return false;
    return true;
  };
  for (const isl of ISL) {
    const ext = isl.R * 1.1;
    for (let cx = Math.floor((isl.x - ext) / GC); cx <= Math.floor((isl.x + ext) / GC); cx++)
      for (let cz = Math.floor((isl.z - ext) / GC); cz <= Math.floor((isl.z + ext) / GC); cz++) {
        const pts = [];
        const n = Math.floor(GC * GC * density);
        for (let i = 0; i < n; i++) {
          const x = (cx + R()) * GC, z = (cz + R()) * GC;
          const h = heightAt(x, z);
          if (!grassOK(x, z, h)) continue;
          // patchy meadows
          if (vnoise(x * 0.09, z * 0.09) < 0.3) continue;
          pts.push(x, h, z);
        }
        if (pts.length < 30) continue;
        const cnt = pts.length / 3;
        const im = new THREE.InstancedMesh(tuftG, grassM, cnt);
        for (let i = 0; i < cnt; i++) {
          const x = pts[i * 3], y = pts[i * 3 + 1], z = pts[i * 3 + 2];
          q.setFromAxisAngle(v.set(0, 1, 0), R() * 6.28);
          const s = 0.7 + R() * 0.6;
          m4.compose(v.set(x, y - 0.03, z), q, sc.set(s, s * (0.7 + R() * 0.7), s));
          im.setMatrixAt(i, m4);
          terrainColor(x, z, y, col);
          col.multiplyScalar(1.05 + R() * 0.15);
          im.setColorAt(i, col);
        }
        im.receiveShadow = true; im.castShadow = false;
        im.computeBoundingSphere();
        im.userData.cx = (cx + 0.5) * GC; im.userData.cz = (cz + 0.5) * GC;
        scene.add(im);
        grassChunks.push(im);
      }
  }

  return {
    treeCount: trees.broad.length + trees.conifer.length,
    grassChunks,
    update(px, pz, warm) {
      for (const g of grassChunks) {
        const d = Math.hypot(g.userData.cx - px, g.userData.cz - pz);
        g.visible = warm || d < 62;
      }
    },
  };
}
