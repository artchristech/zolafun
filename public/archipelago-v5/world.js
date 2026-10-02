// Five Lights — static scenery: causeways, trail, village, shipwreck, observatory ruins, lighthouse, rocks.
import * as THREE from './three.module.min.js';
import { toon, srgb, mulberry32, lerp, clamp, inst } from './util.js';
import { groundAt, CAUSEWAYS, causewayProfile, TRAIL, LAYOUT, ISL, DECKS, pathDist, islandOf } from './terrain.js';
import { addCircle, addBox } from './colliders.js';

const rng = mulberry32(4242);
function M(parent, geo, mat, x = 0, y = 0, z = 0, ry = 0, cast = true) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z); m.rotation.y = ry;
  m.castShadow = cast; m.receiveShadow = true;
  parent.add(m);
  return m;
}
const angOf = (d) => Math.atan2(d.z, d.x); // world angle of an XZ direction
// mesh rotation.y that aligns local +x with world angle a
const ry = (a) => -a;

export const MAT = {
  stone: toon(srgb(0.64, 0.62, 0.58)), stoneDark: toon(srgb(0.46, 0.45, 0.47)), moss: toon(srgb(0.42, 0.5, 0.36)),
  wood: toon(srgb(0.55, 0.4, 0.27)), woodDark: toon(srgb(0.36, 0.26, 0.19)), plank: toon(srgb(0.68, 0.53, 0.36)),
  white: toon(srgb(0.95, 0.93, 0.88)), red: toon(srgb(0.8, 0.13, 0.11)), brass: toon(srgb(0.86, 0.66, 0.3)),
  rope: toon(srgb(0.78, 0.68, 0.48)), dark: toon(srgb(0.12, 0.1, 0.1)), sail: toon(srgb(0.92, 0.88, 0.76), { side: THREE.DoubleSide }),
};

export function buildWorld(scene) {
  const root = new THREE.Group();
  scene.add(root);
  const exclusions = [];
  const out = { root, exclusions };
  buildCauseways(root, exclusions);
  buildTrail(root);
  buildVillage(root, exclusions, out);
  buildWreck(root, exclusions);
  buildObservatory(root, exclusions);
  out.lighthouse = buildLighthouse(root, exclusions);
  buildRocks(root, exclusions);
  // other landmark clearances
  const F = LAYOUT.forest;
  for (const m of F.mirrors) exclusions.push({ x: m.x, z: m.z, r: 3 });
  exclusions.push({ ...F.lamp, r: 3 }, { ...F.beacon, r: 4 }, { ...LAYOUT.ring.c, r: 15 }, { ...LAYOUT.ring.beacon, r: 4 });
  exclusions.push({ ...LAYOUT.peak.tablet, r: 3 });
  return out;
}

// ---------------------------------------------------------------- causeways
function buildCauseways(root, exclusions) {
  const slabs = [], pillars = [];
  for (const c of CAUSEWAYS) {
    const n = Math.ceil(c.len / 2.15);
    const a = angOf(c.dir);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = lerp(c.a.x, c.b.x, t), z = lerp(c.a.z, c.b.z, t);
      const h = causewayProfile(c, t);
      if (groundAt(x, z) > h + 0.6) continue;
      slabs.push({ x: x + (rng() - 0.5) * 0.15, z: z + (rng() - 0.5) * 0.15, y: h - 0.35, a: a + (rng() - 0.5) * 0.06, tilt: (rng() - 0.5) * 0.04, s: 0.95 + rng() * 0.1 });
      if (i % 5 === 2) pillars.push({ x, z, top: h - 0.6 });
    }
    exclusions.push({ ...c.a, r: 5 }, { ...c.b, r: 5 });
  }
  const sg = new THREE.BoxGeometry(2.1, 0.7, 5.4);
  const im = new THREE.InstancedMesh(sg, MAT.stone, slabs.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();
  const col = new THREE.Color(), cA = srgb(1, 1, 1), cB = srgb(0.78, 0.82, 0.72);
  slabs.forEach((b, i) => {
    e.set(b.tilt, ry(b.a), b.tilt * 0.5, 'YXZ'); q.setFromEuler(e);
    p.set(b.x, b.y, b.z); s.set(b.s, 1, 1);
    m4.compose(p, q, s); im.setMatrixAt(i, m4);
    im.setColorAt(i, col.copy(cA).lerp(cB, rng()));
  });
  im.castShadow = true; im.receiveShadow = true;
  root.add(im);
  const pg = new THREE.CylinderGeometry(1.1, 1.5, 1, 7);
  const pm = new THREE.InstancedMesh(pg, MAT.moss, pillars.length);
  pillars.forEach((b, i) => {
    const h = b.top + 9;
    p.set(b.x, b.top - h / 2, b.z); s.set(1, h, 1); q.identity();
    m4.compose(p, q, s); pm.setMatrixAt(i, m4);
  });
  pm.castShadow = false; pm.receiveShadow = true;
  root.add(pm);
}

// ---------------------------------------------------------------- switchback trail
function buildTrail(root) {
  const pos = [], idx = [];
  const W = 1.75;
  for (let i = 0; i < TRAIL.length; i++) {
    const p = TRAIL[i];
    const px = -p.dz, pz = p.dx;
    for (const sgn of [-1, 1]) {
      const x = p.x + px * W * sgn, z = p.z + pz * W * sgn;
      pos.push(x, groundAt(x, z) + 0.14, z);
    }
    if (i > 0) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const mat = toon(srgb(0.82, 0.75, 0.6), { side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const m = new THREE.Mesh(g, mat);
  m.receiveShadow = true;
  root.add(m);
  // edge stones on the downhill side and cairns at each switchback
  const P = ISL[3];
  const stones = [];
  for (let i = 4; i < TRAIL.length; i += 3) {
    const p = TRAIL[i];
    let px = -p.dz, pz = p.dx;
    // pick the side further from the summit (downhill)
    if ((p.x + px - P.x) ** 2 + (p.z + pz - P.z) ** 2 < (p.x - px - P.x) ** 2 + (p.z - pz - P.z) ** 2) { px = -px; pz = -pz; }
    const x = p.x + px * 2.3, z = p.z + pz * 2.3;
    stones.push({ x, z, y: groundAt(x, z), s: 0.35 + rng() * 0.25 });
  }
  const sg = new THREE.DodecahedronGeometry(1, 0);
  const im = new THREE.InstancedMesh(sg, MAT.stone, stones.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  stones.forEach((s, i) => { e.set(rng(), rng() * 6, rng()); q.setFromEuler(e); m4.compose(new THREE.Vector3(s.x, s.y + s.s * 0.4, s.z), q, new THREE.Vector3(s.s, s.s * 0.8, s.s)); im.setMatrixAt(i, m4); });
  im.castShadow = true; im.receiveShadow = true;
  root.add(im);
  // cairns at the turns
  const legs = TRAIL.turns;
  for (let i = 0; i < legs.length; i++) {
    const L = legs[i];
    if (!L) continue;
    const x = L.x + (L.x - P.x) * 0.1, z = L.z + (L.z - P.z) * 0.1;
    cairn(root, x, groundAt(x, z), z);
  }
}
function cairn(root, x, y, z, n = 4) {
  let yy = y;
  for (let i = 0; i < n; i++) {
    const s = 0.55 - i * 0.1;
    const m = M(root, new THREE.DodecahedronGeometry(s, 0), i % 2 ? MAT.stoneDark : MAT.stone, x + (rng() - 0.5) * 0.1, yy + s * 0.7, z, rng() * 6);
    m.scale.y = 0.7;
    yy += s * 1.1;
  }
  addCircle(x, z, 0.6, y - 1, y + 3, { cam: false });
}

// ---------------------------------------------------------------- village of stilt houses
function buildVillage(root, exclusions, out) {
  const V = LAYOUT.village, u = V.u, v = V.v;
  const ua = angOf(u);
  // pier
  const pierLen = 28.5;
  const pc = { x: V.pierStart.x + u.x * pierLen / 2, z: V.pierStart.z + u.z * pierLen / 2 };
  M(root, new THREE.BoxGeometry(pierLen, 0.25, 3.4), MAT.plank, pc.x, V.deckH - 0.125, pc.z, ry(ua));
  M(root, new THREE.BoxGeometry(9.6, 0.3, 9.6), MAT.plank, V.platform.x, V.deckH - 0.15, V.platform.z, ry(ua));
  const postG = new THREE.CylinderGeometry(0.16, 0.2, 1, 6);
  const posts = [];
  for (let s = 2; s < pierLen; s += 3.2) for (const k of [-1.6, 1.6]) {
    const x = V.pierStart.x + u.x * s + v.x * k, z = V.pierStart.z + u.z * s + v.z * k;
    posts.push([x, z, V.deckH + (s > 6 ? 0.7 : 0)]);
  }
  for (const a of [0, 4.6]) for (const b of [-4.6, 0, 4.6]) {
    if (a === 0 && b === 0) continue;
    if (a !== 0 && b !== 0) continue; // corners carry the float posts
    posts.push([V.platform.x + u.x * a + v.x * b, V.platform.z + u.z * a + v.z * b, V.deckH + 0.9]);
  }
  // houses
  const wallCols = [srgb(0.96, 0.9, 0.78), srgb(0.88, 0.8, 0.62), srgb(0.95, 0.94, 0.9), srgb(0.84, 0.88, 0.86), srgb(0.96, 0.85, 0.7)];
  const roofCols = [srgb(0.75, 0.24, 0.16), srgb(0.2, 0.5, 0.55), srgb(0.85, 0.5, 0.18), srgb(0.32, 0.38, 0.6), srgb(0.6, 0.3, 0.45)];
  const doorCols = [srgb(0.3, 0.5, 0.3), srgb(0.55, 0.25, 0.2), srgb(0.25, 0.35, 0.55), srgb(0.5, 0.42, 0.2), srgb(0.3, 0.3, 0.3)];
  V.houses.forEach((h, i) => {
    const a = angOf(h.dir);
    const g = new THREE.Group();
    g.position.set(h.x, 0, h.z); g.rotation.y = ry(a);
    root.add(g);
    const fy = V.deckH + 0.15;
    M(g, new THREE.BoxGeometry(8.4, 0.3, 8.4), MAT.plank, 0, fy - 0.15, 0);
    for (const sx of [-3.9, 0, 3.9]) for (const sz of [-3.9, 3.9]) posts.push([h.x + Math.cos(a) * sx - Math.sin(a) * sz, h.z + Math.sin(a) * sx + Math.cos(a) * sz, fy]);
    const wall = toon(wallCols[i % 5]);
    const H = 3.2 + (i % 2) * 0.6;
    M(g, new THREE.BoxGeometry(5.0, H, 6.0), wall, 1.4, fy + H / 2, 0);
    // roof: triangular prism along local z
    const roof = new THREE.CylinderGeometry(3.9, 3.9, 7.0, 3, 1);
    roof.rotateY(Math.PI / 2); roof.rotateZ(Math.PI / 2); roof.scale(1, 0.45, 1);
    M(g, roof, toon(roofCols[i % 5]), 1.4, fy + H + 0.86, 0);
    // door on the land side, windows
    M(g, new THREE.BoxGeometry(0.15, 2.0, 1.2), toon(doorCols[i % 5]), -1.12, fy + 1.0, 0, 0, false);
    for (const wz of [-3.02, 3.02]) M(g, new THREE.BoxGeometry(1.0, 0.9, 0.1), MAT.dark, 1.4, fy + 2.0, wz, 0, false);
    // hanging lantern by the door
    M(g, new THREE.BoxGeometry(0.25, 0.35, 0.25), MAT.brass, -1.3, fy + 2.3, 1.0, 0, false);
    // gangway
    M(root, new THREE.BoxGeometry(6.4, 0.2, 2.6), MAT.plank, h.shore.x - h.dir.x * 1.5, (groundAt(h.shore.x - h.dir.x * 4.7, h.shore.z - h.dir.z * 4.7) + fy) / 2 - 0.1, h.shore.z - h.dir.z * 1.5, ry(a)).rotation.z =
      Math.atan2(fy - groundAt(h.shore.x - h.dir.x * 4.7, h.shore.z - h.dir.z * 4.7), 6.4);
    const cx = h.x + Math.cos(a) * 1.4, cz = h.z + Math.sin(a) * 1.4;
    addBox(cx, cz, 2.5, 3.0, a, fy - 0.5, fy + H + 2.5);
    exclusions.push({ x: h.x, z: h.z, r: 7 }, { x: h.shore.x - h.dir.x * 4, z: h.shore.z - h.dir.z * 4, r: 3 });
    // drying nets and crates on the porch
    M(g, new THREE.BoxGeometry(0.8, 0.8, 0.8), MAT.wood, -2.8, fy + 0.4, 2.8 - (i % 2) * 5.6, 0.3);
  });
  const pim = new THREE.InstancedMesh(postG, MAT.woodDark, posts.length);
  const m4 = new THREE.Matrix4();
  posts.forEach(([x, z, top], i) => {
    const bot = Math.min(groundAt(x, z), -3);
    m4.makeScale(1, top - bot, 1); m4.setPosition(x, (top + bot) / 2, z);
    pim.setMatrixAt(i, m4);
    addCircle(x, z, 0.22, bot, top, { cam: false });
  });
  pim.castShadow = true; pim.receiveShadow = true;
  root.add(pim);
  exclusions.push({ ...V.pierStart, r: 5 }, { ...V.pole, r: 3 }, { ...V.spawn, r: 3 });
  // plaza clutter: barrels, crates, fish racks, a beached rowing boat
  const C = V.c;
  const spots = [[-9, 5], [-7, 7.5], [10, -6], [6, 10], [-11, -6]];
  spots.forEach(([a, b], i) => {
    const x = C.x + u.x * a + v.x * b, z = C.z + u.z * a + v.z * b;
    if (pathDist(x, z).d < 0.6) return;
    const y = groundAt(x, z);
    if (i % 2 === 0) { M(root, new THREE.CylinderGeometry(0.45, 0.45, 1.0, 8), MAT.wood, x, y + 0.5, z); M(root, new THREE.CylinderGeometry(0.45, 0.45, 1.0, 8), MAT.woodDark, x + 0.9, y + 0.5, z + 0.3); addCircle(x + 0.45, z + 0.15, 1.1, y, y + 1.2); }
    else { rack(root, x, y, z, rng() * 3); addCircle(x, z, 1.4, y, y + 2, { cam: false }); }
    exclusions.push({ x, z, r: 2.5 });
  });
  // rowing boats moored by the pier
  for (const s of [10, 18]) {
    const x = V.pierStart.x + u.x * s + v.x * 3.4, z = V.pierStart.z + u.z * s + v.z * 3.4;
    const b = rowboat(srgb(0.85, 0.35 + s * 0.01, 0.2));
    b.position.set(x, 2.4, z); b.rotation.y = ry(ua);
    root.add(b);
    out.moored = out.moored || []; out.moored.push(b);
  }
}
function rack(root, x, y, z, r) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = r; root.add(g);
  for (const s of [-1.2, 1.2]) M(g, new THREE.CylinderGeometry(0.07, 0.07, 2, 5), MAT.woodDark, s, 1, 0);
  M(g, new THREE.CylinderGeometry(0.05, 0.05, 2.6, 5), MAT.wood, 0, 1.9, 0).rotation.z = Math.PI / 2;
  for (let i = -2; i <= 2; i++) M(g, new THREE.ConeGeometry(0.12, 0.6, 5), toon(srgb(0.7, 0.72, 0.75)), i * 0.45, 1.5, 0, 0, true).rotation.x = Math.PI;
}
export function rowboat(col) {
  const g = new THREE.Group();
  const hull = new THREE.Mesh(hullGeometry(4.2, 0.85, 0.7), toon(col, { side: THREE.DoubleSide }));
  hull.castShadow = true; g.add(hull);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 1.4), MAT.wood); seat.position.y = -0.15; g.add(seat);
  return g;
}

// boat hull along local x, open on top
export function hullGeometry(L, W, H, nx = 16, na = 9) {
  const pos = [], idx = [];
  for (let i = 0; i <= nx; i++) {
    const t = i / nx, x = (t - 0.5) * L, e = Math.abs(x / (L / 2));
    const w = W * Math.pow(Math.max(0, 1 - Math.pow(e, x > 0 ? 1.6 : 2.6)), 0.5) + 0.02;
    const sheer = 0.25 * e * e * H;
    for (let j = 0; j <= na; j++) {
      const a = (j / na) * Math.PI;
      pos.push(x, sheer - H * Math.sin(a) * (1 - 0.35 * e * e), w * Math.cos(a));
    }
  }
  for (let i = 0; i < nx; i++) for (let j = 0; j < na; j++) {
    const a = i * (na + 1) + j, b = a + na + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------- shipwreck in the forest
function buildWreck(root, exclusions) {
  const W = LAYOUT.forest.wreck;
  const y = groundAt(W.x, W.z);
  const g = new THREE.Group(); g.position.set(W.x, y, W.z); g.rotation.y = ry(W.ang); root.add(g);
  const tilt = new THREE.Group(); tilt.rotation.x = 0.36; tilt.rotation.z = 0.05; tilt.position.y = 1.7; g.add(tilt);
  const hullMat = toon(srgb(0.45, 0.32, 0.22), { side: THREE.DoubleSide });
  const hull = M(tilt, hullGeometry(W.len, 3.4, 3.4, 20, 10), hullMat);
  hull.castShadow = true;
  // exposed ribs where planks rotted away
  for (let i = 0; i < 5; i++) {
    const r = M(tilt, new THREE.TorusGeometry(3.0, 0.14, 5, 10, Math.PI), MAT.woodDark, 2 + i * 1.4, 0.0, 0);
    r.rotation.set(0, Math.PI / 2, Math.PI);
    r.scale.set(1, 1.08, 1);
  }
  // stern castle + deck boards + broken mast
  M(tilt, new THREE.BoxGeometry(3.2, 2.2, 5.0), MAT.wood, -W.len / 2 + 2.4, 0.6, 0);
  M(tilt, new THREE.BoxGeometry(3.4, 0.25, 5.4), MAT.plank, -W.len / 2 + 2.4, 1.8, 0);
  for (let i = 0; i < 6; i++) M(tilt, new THREE.BoxGeometry(1.0, 0.12, 5.6 - (i % 3) * 0.8), MAT.plank, -4 + i * 1.1, -0.2, 0.2);
  const mast = M(tilt, new THREE.CylinderGeometry(0.28, 0.35, 9, 8), MAT.wood, -1, 1.8, 0);
  mast.rotation.z = -0.25; mast.position.y = 5.5;
  // the snapped upper mast lying on the forest floor with its torn sail
  const mx = W.x + Math.cos(W.ang + 1.9) * 6, mz = W.z + Math.sin(W.ang + 1.9) * 6;
  const lm = M(root, new THREE.CylinderGeometry(0.22, 0.28, 10, 8), MAT.woodDark, mx, groundAt(mx, mz) + 0.3, mz, ry(W.ang + 0.4));
  lm.rotation.z = Math.PI / 2;
  const sail = M(root, new THREE.PlaneGeometry(5, 3.5, 4, 3), MAT.sail, mx + 1, groundAt(mx, mz) + 1.1, mz + 1, ry(W.ang + 0.4));
  sail.rotation.x = -1.2;
  addBox(mx, mz, 5, 0.4, W.ang + 0.4, groundAt(mx, mz) - 1, groundAt(mx, mz) + 0.8);
  // collider for the hull
  addBox(W.x, W.z, W.len / 2, 2.6, W.ang, y - 2, y + 6);
  exclusions.push({ x: W.x, z: W.z, r: 13 });
}

// ---------------------------------------------------------------- toppled observatory (ruins only)
function buildObservatory(root, exclusions) {
  const P = LAYOUT.peak, S = P.c;
  const y = groundAt(S.x, S.z);
  // stone floor
  M(root, new THREE.CylinderGeometry(7.2, 7.4, 0.5, 28), MAT.stone, S.x, y - 0.1, S.z, 0, false);
  // ring of broken wall stubs with a gap where the dome tore loose
  const blockG = new THREE.BoxGeometry(1.8, 1, 0.9);
  const blocks = [];
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const da = Math.atan2(P.dome.z - S.z, P.dome.x - S.x);
    const off = Math.abs(Math.atan2(Math.sin(a - da), Math.cos(a - da)));
    if (off < 0.55) continue;
    const toL = Math.atan2(P.beacon.z - S.z, P.beacon.x - S.x);
    if (Math.abs(Math.atan2(Math.sin(a - toL), Math.cos(a - toL))) < 0.3) continue; // opening toward the beacon
    const starA = (P.azTarget / P.azSteps) * Math.PI * 2;
    if (Math.abs(Math.atan2(Math.sin(a - starA), Math.cos(a - starA))) < 0.2) continue; // sightline slot toward the evening star
    const h = 0.6 + Math.abs(Math.sin(i * 2.3)) * 2.6 * (off > 1.6 ? 1 : 0.5);
    const x = S.x + Math.cos(a) * 7.6, z = S.z + Math.sin(a) * 7.6;
    blocks.push({ x, y: y + h / 2, z, ry: ry(a + Math.PI / 2), sy: h });
    addBox(x, z, 0.95, 0.5, a + Math.PI / 2, y - 1, y + h);
  }
  inst(root, blockG, MAT.stone, blocks, { cast: true });
  // the fallen dome: a cracked hemisphere shell lying on its side, its slit open to the sky
  const D = P.dome;
  const dy = groundAt(D.x, D.z);
  const dg = new THREE.Group(); dg.position.set(D.x, dy + 1.2, D.z); root.add(dg);
  const dr = new THREE.Group(); dr.rotation.set(1.85, 0.4, 0.2); dg.add(dr);
  const shell = new THREE.SphereGeometry(5.2, 22, 12, 0.35, Math.PI * 2 - 0.7, 0, Math.PI / 2);
  M(dr, shell, toon(srgb(0.55, 0.62, 0.66), { side: THREE.DoubleSide }));
  M(dr, new THREE.TorusGeometry(5.2, 0.25, 6, 32), MAT.brass).rotation.x = Math.PI / 2;
  // brass ribs from rim to crown
  for (let i = 0; i < 6; i++) M(dr, new THREE.TorusGeometry(5.25, 0.12, 4, 12, Math.PI / 2), MAT.brass, 0, 0, 0, 0.35 + i * 1.0);
  addCircle(D.x, D.z, 5.2, dy - 1, dy + 6);
  exclusions.push({ x: S.x, z: S.z, r: 10 }, { x: D.x, z: D.z, r: 7 });
}

// ---------------------------------------------------------------- the great lighthouse (red & white)
function buildLighthouse(root, exclusions) {
  const L = LAYOUT.light, C = L.c;
  const y = groundAt(C.x, C.z);
  const g = new THREE.Group(); g.position.set(C.x, y, C.z); root.add(g);
  M(g, new THREE.CylinderGeometry(6.2, 6.8, 1.2, 24), MAT.stone, 0, 0.3, 0);
  const H = 30, bands = 6;
  for (let i = 0; i < bands; i++) {
    const y0 = 0.9 + (i * H) / bands, y1 = 0.9 + ((i + 1) * H) / bands;
    const r0 = lerp(4.6, 3.2, i / bands), r1 = lerp(4.6, 3.2, (i + 1) / bands);
    M(g, new THREE.CylinderGeometry(r1, r0, y1 - y0, 28), i % 2 ? MAT.red : MAT.white, 0, (y0 + y1) / 2, 0);
  }
  const top = 0.9 + H;
  M(g, new THREE.CylinderGeometry(4.6, 3.4, 0.6, 28), MAT.stoneDark, 0, top + 0.2, 0);
  // gallery railing
  inst(g, new THREE.CylinderGeometry(0.06, 0.06, 1.1, 4), MAT.dark, Array.from({ length: 20 }, (_, i) => { const a = (i / 20) * Math.PI * 2; return { x: Math.cos(a) * 4.3, y: top + 1.0, z: Math.sin(a) * 4.3 }; }));
  M(g, new THREE.TorusGeometry(4.3, 0.06, 4, 32), MAT.dark, 0, top + 1.55, 0, 0, false).rotation.x = Math.PI / 2;
  // lantern room: glass + red cap
  const glassMat = new THREE.MeshBasicMaterial({ color: srgb(0.55, 0.62, 0.66), transparent: true, opacity: 0.55, depthWrite: false });
  const glass = M(g, new THREE.CylinderGeometry(2.4, 2.4, 3.2, 16, 1, true), glassMat, 0, top + 2.1, 0, 0, false);
  inst(g, new THREE.BoxGeometry(0.12, 3.2, 0.12), MAT.dark, Array.from({ length: 8 }, (_, i) => { const a = (i / 8) * Math.PI * 2; return { x: Math.cos(a) * 2.42, y: top + 2.1, z: Math.sin(a) * 2.42 }; }));
  M(g, new THREE.SphereGeometry(2.7, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), MAT.red, 0, top + 3.7, 0);
  M(g, new THREE.SphereGeometry(0.35, 8, 6), MAT.brass, 0, top + 6.5, 0);
  M(g, new THREE.CylinderGeometry(0.08, 0.08, 1.4, 5), MAT.dark, 0, top + 5.9, 0);
  // door facing the causeway
  const dd = L.doorDir;
  const door = M(g, new THREE.BoxGeometry(0.4, 2.8, 1.8), MAT.woodDark, dd.x * 4.5, 2.3, dd.z * 4.5, ry(L.doorAng));
  addCircle(C.x, C.z, 5.4, y - 1, y + 40);
  exclusions.push({ x: C.x, z: C.z, r: 16 });
  return { group: g, glass, glassMat, top: y + top, door };
}

// ---------------------------------------------------------------- shore rocks
function buildRocks(root, exclusions) {
  const rocks = [];
  for (const I of ISL) {
    const n = Math.floor(I.r * 0.6);
    for (let k = 0; k < n; k++) {
      const a = rng() * Math.PI * 2, d = I.r * (0.55 + rng() * 0.6);
      const x = I.x + Math.cos(a) * d, z = I.z + Math.sin(a) * d;
      const h = groundAt(x, z);
      if (h < -3 || h > 12) continue;
      const s = 0.6 + rng() * 1.8;
      if (pathDist(x, z).d < 2.0 + s) continue;
      if (exclusions.some((e) => Math.hypot(x - e.x, z - e.z) < e.r + 2)) continue;
      if (DECKS.some((D) => Math.hypot(x - D.cx, z - D.cz) < D.r + 2)) continue;
      if (islandOf(x, z) !== ISL.indexOf(I)) continue;
      rocks.push({ x, z, y: h, s });
    }
  }
  const im = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), MAT.stoneDark, rocks.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  const col = new THREE.Color();
  rocks.forEach((r, i) => {
    e.set(rng(), rng() * 6, rng()); q.setFromEuler(e);
    m4.compose(new THREE.Vector3(r.x, r.y + r.s * 0.2, r.z), q, new THREE.Vector3(r.s * 1.2, r.s * 0.8, r.s));
    im.setMatrixAt(i, m4);
    im.setColorAt(i, col.setRGB(0.9 + rng() * 0.2, 0.9 + rng() * 0.2, 0.9 + rng() * 0.2));
    if (r.s > 1.1) addCircle(r.x, r.z, r.s * 0.9, r.y - 2, r.y + r.s * 0.9);
  });
  im.castShadow = true; im.receiveShadow = true;
  root.add(im);
}
