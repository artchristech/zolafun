// Static scenery (merged per island), foliage (instanced) and grass.
import * as THREE from './three.module.min.js';
import { Builder, G, mat4, rng, toon, smooth, DITHER_GLSL, vnoise } from './util.js';
import { ISL, TIDE, PEAK, CAUSEWAYS, TRAIL, terrainH, trailW, peakW, buildTerrainMeshes, buildCauseways } from './terrain.js';
import { addCircle, addBox, addPlatform } from './physics.js';
import {
  HOUSES, BOARDWALK, PIERS, BOARD_H, HOUSE_SHAPES, VILLAGE_ORDER, TOTEM, V_TUT, RING, RING_TUT, WRECK, WRECK_TUT,
  OBS, LIGHT, LIGHT_TUT, BEACONS, shutterAngle,
} from './places.js';

export const SHAPE_COLORS = [0xd8463a, 0xf2c03a, 0x3a78d8, 0x3fae5a, 0xf4f0e6];
const triGeo = new THREE.CylinderGeometry(0.42, 0.42, 1, 3).rotateX(Math.PI / 2).rotateZ(Math.PI / 2);
const ringGeo = new THREE.TorusGeometry(0.28, 0.09, 5, 14);
export const pyramid = new THREE.ConeGeometry(1, 1, 4, 1).rotateY(Math.PI / 4);
const bowl = new THREE.CylinderGeometry(1, 0.55, 1, 10, 1, true);
const hemi = new THREE.SphereGeometry(1, 14, 7, 0.35, Math.PI * 2 - 0.7, 0, Math.PI / 2);
const hull = new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);

// Shape token in the local XY plane, `thick` deep along Z.
export function addShape(b, shape, m, color = SHAPE_COLORS[shape], thick = 0.12) {
  const s = (geo, mm) => b.add(geo, color, m.clone().multiply(mm));
  if (shape === 0) s(ringGeo, mat4(0, 0, 0, 0, 0, 0, 1, 1, thick / 0.18));
  else if (shape === 1) s(triGeo, mat4(0, -0.04, 0, 0, 0, 0, 1, 1, thick));
  else if (shape === 2) s(G.box, mat4(0, 0, 0, 0, 0, 0, 0.55, 0.55, thick));
  else if (shape === 3) s(G.box, mat4(0, 0, 0, 0, 0, Math.PI / 4, 0.45, 0.45, thick));
  else { s(G.box, mat4(0, 0, 0, 0, 0, 0, 0.62, 0.18, thick)); s(G.box, mat4(0, 0, 0, 0, 0, 0, 0.18, 0.62, thick)); }
}

// Transform helper for objects placed with a yaw.
function local(x, z, yaw) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return (lx, lz) => ({ x: x + lx * c + lz * s, z: z - lx * s + lz * c });
}

export function boatGeometry(lantern = false) {
  const b = new Builder();
  const E = lantern ? { emit: { size: 1, value: 0 } } : undefined;
  b.add(hull, 0x8a5a36, mat4(0, 0.35, 0, 0, 0, 0, 0.75, 0.55, 1.9), E);
  b.add(G.box, 0xb5824e, mat4(0, 0.32, 0, 0, 0, 0, 1.3, 0.1, 3.2), E);
  b.add(G.box, 0x6b4426, mat4(0, 0.42, 0.4, 0, 0, 0, 1.2, 0.08, 0.3), E);
  b.add(G.box, 0x5a3a20, mat4(0, 1.3, -0.4, 0, 0, 0, 0.08, 2.0, 0.08), E);
  b.add(G.box, 0xefe4cc, mat4(0.0, 1.5, -0.1, 0, 0, 0, 0.04, 1.3, 0.8), E);
  if (lantern) {
    b.add(G.box, 0x3a2a1a, mat4(0, 0.9, 1.4, 0, 0, 0, 0.06, 1.2, 0.06), E);
    b.add(G.box, 0xffc070, mat4(0, 1.45, 1.4, 0, 0, 0, 0.22, 0.28, 0.22), { emit: { size: 1, value: 1 } });
  }
  return b.build();
}

function rock(b, x, y, z, s, R, col = 0x8f8a80) {
  b.add(G.dodeca, col, mat4(x, y, z, R() * 3, R() * 3, R() * 3, s * (0.8 + R() * 0.5), s * (0.5 + R() * 0.4), s * (0.8 + R() * 0.5)));
}

// --- islands ------------------------------------------------------------------------------
function buildVillage(b, R) {
  const houseCols = [0x5aa6a0, 0xe08a6a, 0xe6c26a, 0xf1ece0, 0x7c9fd0];
  const roofCols = [0xb4553a, 0x3c7c7a, 0x8d5a3a, 0xc0743e, 0x6a4a8a];
  for (const H of HOUSES) {
    const P = local(H.x, H.z, H.yaw);
    const Y = BOARD_H;
    const put = (geo, col, lx, y, lz, sx, sy, sz, rx = 0, ry = 0, rz = 0) => {
      const p = P(lx, lz);
      b.add(geo, col, mat4(p.x, y, p.z, rx, H.yaw + ry, rz, sx, sy, sz));
    };
    put(G.box, 0x9a7048, 0, Y - 0.15, 0, 4.3, 0.3, 4.3);
    put(G.box, houseCols[H.i], 0, Y + 1.3, 0, 3.6, 2.6, 3.6);
    put(pyramid, roofCols[H.i], 0, Y + 3.5, 0, 3.4, 1.9, 3.4);
    put(G.box, 0x3a2618, 0, Y + 0.9, 1.81, 0.95, 1.8, 0.06);
    put(G.box, 0x2c3a48, 1.81, Y + 1.5, 0, 0.06, 0.6, 0.7);
    put(G.box, 0x2c3a48, -1.81, Y + 1.5, 0, 0.06, 0.6, 0.7);
    // shape plaque above the door
    { const p = P(0, 1.88); addShape(b, HOUSE_SHAPES[H.i], mat4(p.x, Y + 2.25, p.z, 0, H.yaw, 0, 0.9, 0.9, 1)); }
    // porch
    put(G.box, 0xa87c50, 0, Y - 0.1, 3.5, 2.8, 0.2, 3.1);
    for (const [lx, lz] of [[-1.9, -1.9], [1.9, -1.9], [-1.9, 1.9], [1.9, 1.9], [0, -1.9], [0, 1.9], [-1.3, 5], [1.3, 5], [-1.3, 3.5], [1.3, 3.5]]) {
      put(G.cyl6, 0x6b4a2e, lx, Y - 5, lz, 0.14, 10, 0.14);
    }
    for (const lx of [-1.35, 1.35]) {
      put(G.box, 0x6b4a2e, lx, Y + 0.45, 3.5, 0.08, 0.9, 3.0);
      put(G.box, 0x6b4a2e, lx, Y + 0.9, 3.5, 0.1, 0.08, 3.0);
    }
    // bell gallows
    {
      const lx = -1.0, lz = 3.3;
      put(G.box, 0x5a3c22, lx - 0.0, Y + 1.25, lz - 0.2, 0.14, 2.5, 0.14);
      put(G.box, 0x5a3c22, lx + 0.0, Y + 2.45, lz + 0.15, 0.1, 0.1, 0.8);
    }
    // nets and floats
    put(G.box, 0x7d8f6a, 1.83, Y + 0.6, 0.5, 0.05, 1.0, 1.6);
    put(G.sphere, 0xe0603a, 1.95, Y + 0.3, 0.9, 0.16, 0.16, 0.16);
    addBox(H.x, H.z, 1.9, 1.9, H.yaw, Y - 0.5, Y + 5);
    addPlatform(H.porch.x, H.porch.z, 1.4, 1.6, H.yaw, Y);
    addBox(P(-1.38, 3.5).x, P(-1.38, 3.5).z, 0.06, 1.5, H.yaw, Y - 0.5, Y + 1);
    addBox(P(1.38, 3.5).x, P(1.38, 3.5).z, 0.06, 1.5, H.yaw, Y - 0.5, Y + 1);
  }
  // boardwalk
  const step = (4 * Math.PI) / 180;
  for (let a = BOARDWALK.a0; a < BOARDWALK.a1 - 1e-4; a += step) {
    const m = a + step / 2;
    const x = ISL.V.x + Math.cos(m) * BOARDWALK.r, z = ISL.V.z + Math.sin(m) * BOARDWALK.r;
    const len = 2 * BOARDWALK.r * Math.sin(step / 2) + 0.15;
    b.add(G.box, R() < 0.5 ? 0xb08454 : 0xa27648, mat4(x, BOARD_H - 0.1, z, 0, -m, 0, BOARDWALK.w, 0.2, len));
    for (const s of [-1, 1]) {
      const px = x + Math.cos(m) * s * 1.1, pz = z + Math.sin(m) * s * 1.1;
      b.add(G.cyl6, 0x6b4a2e, mat4(px, BOARD_H - 4.5, pz, 0, 0, 0, 0.13, 9, 0.13));
    }
    addPlatform(x, z, BOARDWALK.w / 2, len / 2 + 0.05, -m, BOARD_H);
  }
  for (const a of PIERS) {
    const r = 28.2;
    const x = ISL.V.x + Math.cos(a) * r, z = ISL.V.z + Math.sin(a) * r;
    b.add(G.box, 0xa27648, mat4(x, BOARD_H - 0.1, z, 0, -a, 0, 8.6, 0.2, 2.0));
    addPlatform(x, z, 4.3, 1.0, -a, BOARD_H);
  }
  // totem (clue): shapes bottom to top
  b.add(G.cyl6, 0x7a5232, mat4(TOTEM.x, 4.3 + 2.6, TOTEM.z, 0, 0, 0, 0.32, 5.6, 0.32));
  b.add(pyramid, 0x5a3c22, mat4(TOTEM.x, 4.3 + 5.75, TOTEM.z, 0, 0, 0, 0.55, 0.7, 0.55));
  VILLAGE_ORDER.forEach((s, i) => addShape(b, s, mat4(TOTEM.x, 4.3 + 1.0 + i * 0.95, TOTEM.z, 0, 0.35, 0, 1.1, 1.1, 6)));
  addCircle(TOTEM.x, TOTEM.z, 0.5);
  // tutorial totem
  {
    const t = V_TUT.totem, y = terrainH(t.x, t.z);
    b.add(G.cyl6, 0x7a5232, mat4(t.x, y + 1.2, t.z, 0, 0, 0, 0.22, 2.4, 0.22));
    V_TUT.order.forEach((s, i) => addShape(b, s, mat4(t.x, y + 0.75 + i * 0.8, t.z, 0, 0.6, 0, 0.8, 0.8, 4)));
    addCircle(t.x, t.z, 0.35);
  }
  // beached boats, crates, drying racks
  const bg = boatGeometry(false);
  for (const [x, z, yaw] of [[18, 26, 0.6], [-16, 27, -0.4], [24, 18, 1.2]]) {
    const y = terrainH(x, z);
    const g = bg.clone();
    g.applyMatrix4(mat4(x, y - 0.15, z, 0.1, yaw, 0.25));
    b.parts.push(g);
    addBox(x, z, 0.8, 1.9, yaw, y - 1, y + 1.2);
  }
  for (const [x, z] of [[-6, 20], [-4.5, 21], [12, 8]]) {
    const y = terrainH(x, z);
    b.box(1, 0.8, 1, 0x9a6a3a, x, y + 0.4, z, 0, R(), 0);
    addCircle(x, z, 0.7, y, y + 0.9);
  }
  for (const [x, z, yaw] of [[-8, 6, 0.3], [10, 3, -0.5]]) {
    const y = terrainH(x, z);
    const P = local(x, z, yaw);
    for (const lx of [-1.5, 1.5]) { const p = P(lx, 0); b.cyl(0.08, 2, 0x6b4a2e, p.x, y + 1, p.z, 0, 0, 0, 6); addCircle(p.x, p.z, 0.15); }
    b.add(G.box, 0x6b4a2e, mat4(x, y + 1.95, z, 0, yaw, 0, 3.2, 0.08, 0.08));
    b.add(G.box, 0x84a07a, mat4(x, y + 1.3, z, 0, yaw, 0, 2.8, 1.2, 0.04));
  }
}

function buildRing(b, R) {
  const y0 = 5;
  for (let i = 0; i < RING.n; i++) {
    const a = (i / RING.n) * Math.PI * 2;
    const x = RING.x + Math.cos(a) * RING.r, z = RING.z + Math.sin(a) * RING.r;
    const yaw = Math.atan2(Math.cos(a), Math.sin(a));
    b.add(G.box, 0x7e7a72, mat4(x, y0 + 2.0, z, (R() - 0.5) * 0.06, yaw, (R() - 0.5) * 0.06, 1.4, 4.6, 0.95));
    b.add(pyramid, 0x77736b, mat4(x, y0 + 4.5, z, 0, yaw, 0, 0.75, 0.6, 0.55));
    for (let k = 0; k < 9; k++) {
      const s = 0.12 + R() * 0.14;
      const lx = (R() - 0.5) * 1.4, ly = R() * 1.8;
      const nz = R() < 0.5 ? 0.5 : -0.5;
      const P = local(x, z, yaw);
      const p = P(lx, nz);
      b.add(G.ico, R() < 0.5 ? 0xb8b2a0 : 0x8a9a88, mat4(p.x, y0 + ly + 0.1, p.z, R(), R(), R(), s, s * 0.7, s));
    }
    addBox(x, z, 0.75, 0.5, yaw, -5, 20);
  }
  // paving inside the ring
  for (let i = 0; i < 26; i++) {
    const a = R() * Math.PI * 2, r = Math.sqrt(R()) * 5.5;
    b.box(1.1 + R() * 0.6, 0.12, 0.9 + R() * 0.5, 0x9a958a, RING.x + Math.cos(a) * r, y0 + 0.02, RING.z + Math.sin(a) * r, 0, R() * 3, 0);
  }
  // tutorial stones
  for (let i = 0; i < RING_TUT.n; i++) {
    const x = RING_TUT.x + RING_TUT.dir.x * (i - 1) * 2.4, z = RING_TUT.z + RING_TUT.dir.z * (i - 1) * 2.4;
    const y = terrainH(x, z);
    const yaw = Math.atan2(RING_TUT.dir.x, RING_TUT.dir.z) + Math.PI / 2;
    b.add(G.box, 0x84807a, mat4(x, y + 1.1, z, 0, yaw, 0, 0.8, 2.6, 0.6));
    for (let k = 0; k < 4; k++) b.add(G.ico, 0xb8b2a0, mat4(x + (R() - 0.5) * 0.7, y + R() * 1.2, z + (R() - 0.5) * 0.5, R(), R(), R(), 0.12, 0.1, 0.12));
    addCircle(x, z, 0.5);
  }
}

function buildWreck(b, R) {
  const W = WRECK.hull, y = terrainH(W.x, W.z) - 0.3;
  const base = mat4(W.x, y, W.z, 0.08, 0.15, 0.38);
  const add = (geo, col, m) => b.add(geo, col, base.clone().multiply(m));
  add(hull, 0x6e4a2c, mat4(0, 1.9, 0, 0, 0, 0, 3.1, 2.4, 9));
  add(G.box, 0x5a3c22, mat4(0, -0.45, 0, 0, 0, 0, 0.4, 0.5, 17.5));
  add(G.box, 0x9a7650, mat4(0, 1.95, -1.5, 0, 0, 0, 5.6, 0.18, 11));
  for (let k = -3; k <= 3; k++) add(G.box, 0x4e3420, mat4(2.9, 2.0, k * 2.1, 0, 0, -0.15, 0.25, 0.9, 0.25));
  add(G.box, 0x8a6440, mat4(0, 3.0, 6.2, 0, 0, 0, 4.2, 2.0, 3.2));
  add(G.box, 0x3c2a1a, mat4(0, 3.2, 4.58, 0, 0, 0, 0.8, 1.2, 0.05));
  // exposed ribs at the bow
  for (let k = 0; k < 4; k++) add(new THREE.TorusGeometry(2.8, 0.14, 4, 10, Math.PI), 0x5a3c22, mat4(0, 2.0, -7 - k * 0.9, Math.PI, 0, 0, 1, 0.9 - k * 0.12, 1));
  // fallen mast and sail rag
  b.add(G.cyl6, 0x6b4a2e, mat4(W.x + 4.5, y + 1.2, W.z - 2, 0, 0.6, 1.35, 0.22, 13, 0.22));
  b.add(G.box, 0xe6dcc0, mat4(W.x + 6.5, y + 0.6, W.z + 1, 0.2, 0.4, 0.1, 3.2, 0.05, 2.4));
  addBox(W.x, W.z, 3.3, 9.2, 0.15, -10, 20);
  // dead-end rock piles closing the decoy corridors
  for (const [x, z] of WRECK.deadEnds) {
    const yy = terrainH(x, z);
    for (let k = 0; k < 5; k++) rock(b, x + (R() - 0.5) * 3, yy + 0.3 + R() * 0.6, z + (R() - 0.5) * 3, 1.3, R, 0x7a7a70);
    addCircle(x, z, 2.2);
  }
}

function buildObservatory(b, R) {
  const Y = PEAK.top;
  b.add(G.cyl24, 0xa8a090, mat4(OBS.x, Y + 0.04, OBS.z, 0, 0, 0, 4.7, 0.2, 4.7));
  // brass compass ring with 16 ticks and the inlaid line
  b.add(new THREE.TorusGeometry(3.6, 0.06, 3, 32), 0xd8a840, mat4(OBS.x, Y + 0.15, OBS.z, Math.PI / 2, 0, 0));
  for (let i = 0; i < 16; i++) {
    const yaw = (i / 16) * Math.PI * 2;
    b.add(G.box, 0xd8a840, mat4(OBS.x + Math.sin(yaw) * 3.6, Y + 0.15, OBS.z + Math.cos(yaw) * 3.6, 0, yaw, 0, 0.1, 0.05, 0.5));
  }
  {
    const yaw = OBS.arch.yaw;
    b.add(G.box, 0xf0c040, mat4(OBS.x + Math.sin(yaw) * 2.4, Y + 0.16, OBS.z + Math.cos(yaw) * 2.4, 0, yaw, 0, 0.16, 0.05, 3.6));
    b.add(G.box, 0xf0c040, mat4(OBS.x + Math.sin(yaw) * 4.2, Y + 0.16, OBS.z + Math.cos(yaw) * 4.2, 0, yaw + Math.PI / 4, 0, 0.45, 0.05, 0.45));
  }
  // ruined round wall (gap facing the trail)
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    if (Math.abs(((a - 2.2 + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < 0.45) continue;
    const h = 0.4 + R() * (i % 3 === 0 ? 2.8 : 1.4);
    const x = OBS.x + Math.cos(a) * 5.0, z = OBS.z + Math.sin(a) * 5.0;
    b.add(G.box, 0xcfc6b2, mat4(x, Y + h / 2, z, 0, -a, 0, 0.7, h, 1.6));
    addCircle(x, z, 0.75, Y - 1, Y + h);
  }
  // pier for the telescope
  b.add(G.cyl, 0x9a9282, mat4(OBS.x, Y + 0.6, OBS.z, 0, 0, 0, 0.55, 1.2, 0.55));
  // fallen dome
  const D = OBS.dome;
  b.add(hemi, 0x7fb4a4, mat4(D.x, Y + 1.6, D.z, 0.3, 0.9, 1.95, 3.6, 3.6, 3.6));
  b.add(new THREE.TorusGeometry(3.6, 0.14, 4, 24), 0x5d8a7c, mat4(D.x + 0.6, Y + 1.0, D.z + 0.3, 0.3, 0.9, 1.95 + Math.PI / 2));
  addCircle(D.x, D.z, 3.2, Y - 1, Y + 5);
  for (let k = 0; k < 9; k++) {
    const x = D.x + (R() - 0.5) * 7, z = D.z + (R() - 0.5) * 7;
    b.box(0.5 + R() * 0.6, 0.3 + R() * 0.3, 0.5 + R() * 0.6, 0xcfc6b2, x, Y + 0.15, z, R(), R(), R());
  }
  // sightline arch
  {
    const A = OBS.arch, P = local(A.x, A.z, A.yaw);
    for (const lx of [-1.3, 1.3]) {
      const p = P(lx, 0);
      b.add(G.box, 0xb8ae98, mat4(p.x, Y + 1.6, p.z, 0, A.yaw, 0, 0.6, 3.2, 0.6));
      addCircle(p.x, p.z, 0.4);
    }
    b.add(G.box, 0xb8ae98, mat4(A.x, Y + 3.4, A.z, 0, A.yaw, 0, 3.3, 0.5, 0.7));
  }
  // elevation carving at a switchback
  {
    const C = OBS.carving, y = terrainH(C.x, C.z);
    const base = mat4(C.x, y - 0.25, C.z, 0, C.yaw, 0);
    const add = (geo, col, m) => b.add(geo, col, base.clone().multiply(m));
    add(G.box, 0xbdb39c, mat4(0, 1.2, 0, 0, 0, 0, 2.0, 2.4, 0.35));
    add(G.box, 0x8a826e, mat4(-0.45, 0.65, 0.2, 0, 0, 0, 0.25, 0.5, 0.1));
    const el = [5, 20, 35, 50, 65][OBS.elAnswer] * Math.PI / 180;
    add(G.cyl6, 0x5a5444, mat4(-0.45 + Math.cos(el) * 0.55, 0.95 + Math.sin(el) * 0.55, 0.22, 0, 0, el - Math.PI / 2, 0.09, 1.2, 0.09));
    add(G.ico, 0xf6e7a0, mat4(-0.45 + Math.cos(el) * 1.45, 0.95 + Math.sin(el) * 1.45, 0.22, 0, 0, 0, 0.12, 0.12, 0.06));
    [5, 20, 35, 50, 65].forEach((d) => {
      const a = d * Math.PI / 180;
      add(G.box, 0x6a6250, mat4(-0.45 + Math.cos(a) * 0.35, 0.95 + Math.sin(a) * 0.35, 0.2, 0, 0, a, 0.12, 0.04, 0.06));
    });
    addCircle(C.x, C.z, 0.6);
  }
}

function buildLighthouse(b, R) {
  const Y = 5, X = LIGHT.x, Z = LIGHT.z;
  b.add(G.cyl24, 0x9c968a, mat4(X, Y - 0.2, Z, 0, 0, 0, 4.4, 0.5, 4.4));
  const bands = 8, H = 26, r0 = 3.6, r1 = 2.5;
  for (let i = 0; i < bands; i++) {
    const ya = Y + (i * H) / bands, yb = Y + ((i + 1) * H) / bands;
    const ra = r0 + (r1 - r0) * (i / bands), rb = r0 + (r1 - r0) * ((i + 1) / bands);
    const g = new THREE.CylinderGeometry(rb, ra, yb - ya, 24, 1, true);
    b.add(g, i % 2 === 0 ? 0xf2eee4 : 0xc8241e, mat4(X, (ya + yb) / 2, Z));
  }
  const top = Y + H;
  b.add(G.cyl24, 0x3c3c40, mat4(X, top + 0.15, Z, 0, 0, 0, 3.4, 0.3, 3.4));
  b.add(new THREE.TorusGeometry(3.3, 0.05, 3, 24), 0x2a2a2e, mat4(X, top + 1.0, Z, Math.PI / 2, 0, 0));
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; b.box(0.06, 1.0, 0.06, 0x2a2a2e, X + Math.cos(a) * 3.3, top + 0.5, Z + Math.sin(a) * 3.3); }
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; b.box(0.12, 2.8, 0.12, 0x2a2a2e, X + Math.cos(a) * 2.0, top + 1.7, Z + Math.sin(a) * 2.0); }
  b.add(G.cyl16, 0x2a2a2e, mat4(X, top + 0.45, Z, 0, 0, 0, 2.1, 0.3, 2.1));
  b.add(G.cone, 0xc8241e, mat4(X, top + 4.1, Z, 0, 0, 0, 2.6, 2.0, 2.6));
  b.add(G.sphere, 0x2a2a2e, mat4(X, top + 5.25, Z, 0, 0, 0, 0.3, 0.3, 0.3));
  // door + windows
  const d = LIGHT.door;
  b.add(G.box, 0x2a1a10, mat4(d.x, Y + 1.2, d.z, 0, d.yaw, 0, 1.3, 2.4, 0.3));
  for (let i = 0; i < 5; i++) {
    const a = d.yaw + i * 1.9 + 1.0, y = Y + 5 + i * 4.3, r = r0 + (r1 - r0) * ((y - Y) / H);
    b.add(G.box, 0x1e2a36, mat4(X + Math.sin(a) * r, y, Z + Math.cos(a) * r, 0, a, 0, 0.6, 0.9, 0.2));
  }
  addCircle(X, Z, 3.75, -5, 60);
  // shutter frames
  for (let k = 0; k < LIGHT.n; k++) {
    const a = shutterAngle(k, LIGHT.n), dx = Math.cos(a), dz = Math.sin(a);
    const x = X + dx * LIGHT.shutterR, z = Z + dz * LIGHT.shutterR, yaw = Math.atan2(dx, dz);
    const P = local(x, z, yaw);
    for (const lx of [-1.0, 1.0]) {
      const p = P(lx, 0);
      b.add(G.box, 0x6e6a62, mat4(p.x, Y + 1.3, p.z, 0, yaw, 0, 0.3, 2.6, 0.4));
      addCircle(p.x, p.z, 0.25);
    }
    b.add(G.box, 0x6e6a62, mat4(x, Y + 2.7, z, 0, yaw, 0, 2.4, 0.3, 0.45));
  }
  // tutorial lantern post and brazier stand
  {
    const t = LIGHT_TUT, y = terrainH(t.x, t.z);
    b.cyl(0.18, 1.2, 0x5a4a3a, t.x, y + 0.6, t.z, 0, 0, 0, 6);
    addCircle(t.x, t.z, 0.6);
    const br = t.brazier, by = terrainH(br.x, br.z);
    b.cyl(0.35, 1.1, 0x6e6a62, br.x, by + 0.55, br.z, 0, 0, 0, 6);
    b.add(bowl, 0x2e2a28, mat4(br.x, by + 1.3, br.z, 0, 0, 0, 0.6, 0.5, 0.6));
    addCircle(br.x, br.z, 0.6);
  }
}

export function buildBeaconTower(b, B) {
  const y = terrainH(B.x, B.z);
  const h = B.tower;
  for (let i = 0; i < 4; i++) {
    const r = 1.5 - i * 0.22, hh = h / 4;
    b.add(G.cyl6, i % 2 ? 0x8f887a : 0x9d968a, mat4(B.x, y + hh * (i + 0.5), B.z, 0, i * 0.4, 0, r, hh, r));
  }
  b.add(bowl, 0x2e2a28, mat4(B.x, y + h + 0.35, B.z, 0, 0, 0, 1.25, 0.8, 1.25));
  b.add(G.cyl6, 0x2e2a28, mat4(B.x, y + h + 0.0, B.z, 0, 0, 0, 0.8, 0.12, 0.8));
  addCircle(B.x, B.z, 1.55, y - 2, y + h + 2);
  return y + h + 0.1;
}

// --- foliage ---------------------------------------------------------------------------
function fadeMaterial(opts) {
  const m = toon({ vertexColors: true, ...opts });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aFade;\nvarying float vFade;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFade = aFade;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vFade;\n' + DITHER_GLSL)
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (vFade < 0.999 && bayer4(gl_FragCoord.xy) > vFade) discard;');
  };
  m.customProgramCacheKey = () => 'fade';
  return m;
}

function treeGeos() {
  const broad = new Builder();
  broad.add(G.ico, 0x5f9a3a, mat4(0, 3.7, 0, 0.2, 0.3, 0, 2.0, 1.7, 2.0));
  broad.add(G.ico, 0x6aa842, mat4(1.0, 3.1, 0.5, 0.5, 0.1, 0.3, 1.45, 1.25, 1.45));
  broad.add(G.ico, 0x538a34, mat4(-0.9, 3.2, -0.5, 0.1, 0.7, 0.2, 1.5, 1.3, 1.5));
  const pine = new Builder();
  pine.add(G.cone, 0x2f6a3a, mat4(0, 2.4, 0, 0, 0, 0, 2.0, 2.8, 2.0));
  pine.add(G.cone, 0x3a7a42, mat4(0, 3.9, 0, 0, 0.3, 0, 1.55, 2.4, 1.55));
  pine.add(G.cone, 0x468a4a, mat4(0, 5.3, 0, 0, 0.6, 0, 1.05, 2.0, 1.05));
  const trunk = new Builder();
  trunk.add(new THREE.CylinderGeometry(0.17, 0.27, 1, 6, 1, true), 0x6e4c30, mat4(0, 1.6, 0, 0, 0, 0, 1, 3.2, 1));
  const bush = new Builder();
  bush.add(G.ico, 0x4f8a36, mat4(0, 0.5, 0, 0, 0, 0, 1.0, 0.75, 1.0));
  bush.add(G.ico, 0x5c9a3e, mat4(0.6, 0.4, 0.2, 0.4, 0.2, 0, 0.7, 0.55, 0.7));
  const rk = new Builder();
  rk.add(G.dodeca, 0x8f8a80, mat4(0, 0.2, 0, 0, 0, 0, 1, 0.65, 1));
  const lift = (g) => { // brighter tops for a sun-catching silhouette
    const p = g.attributes.position, c = g.attributes.color;
    for (let i = 0; i < p.count; i++) { const k = 0.85 + Math.min(0.3, Math.max(0, (p.getY(i) - 2.5) * 0.06)); c.setXYZ(i, c.getX(i) * k, c.getY(i) * k, c.getZ(i) * k); }
    return g;
  };
  return { broad: lift(broad.build()), pine: lift(pine.build()), trunk: trunk.build(), bush: bush.build(), rock: rk.build() };
}

function segDist(x, z, s) {
  const [x0, z0, x1, z1] = s;
  const dx = x1 - x0, dz = z1 - z0, L2 = dx * dx + dz * dz;
  const t = Math.max(0, Math.min(1, ((x - x0) * dx + (z - z0) * dz) / L2));
  return Math.hypot(x - (x0 + dx * t), z - (z0 + dz * t));
}

function exclusions() {
  const C = [];
  const S = [];
  C.push({ x: 0, z: 14, r: 15 }, { x: 0, z: 34, r: 12 }, { x: -18, z: 4, r: 5 }, { x: -11, z: 10, r: 5 });
  for (const H of HOUSES) C.push({ x: H.x, z: H.z, r: 6 });
  C.push({ x: RING.x, z: RING.z, r: 11 }, { x: RING_TUT.x, z: RING_TUT.z, r: 5 });
  C.push({ x: WRECK.clearing.x, z: WRECK.clearing.z, r: WRECK.clearing.r }, { x: WRECK.hull.x, z: WRECK.hull.z, r: 10 });
  for (const s of WRECK.corridors) S.push({ s, w: 2.3 });
  C.push({ x: WRECK_TUT.lens.x, z: WRECK_TUT.lens.z, r: 3 });
  C.push({ x: LIGHT.x, z: LIGHT.z, r: 11.5 }, { x: LIGHT_TUT.x, z: LIGHT_TUT.z, r: 4 }, { x: LIGHT_TUT.brazier.x, z: LIGHT_TUT.brazier.z, r: 3 });
  C.push({ x: OBS.carving.x, z: OBS.carving.z, r: 3 });
  for (const B of BEACONS) C.push({ x: B.x, z: B.z, r: 4.5 });
  for (const c of CAUSEWAYS) S.push({ s: [c.x0 - c.ux * 6, c.z0 - c.uz * 6, c.x1 + c.ux * 6, c.z1 + c.uz * 6], w: 3.5 });
  // walking path from the peak's causeway to the trail foot
  S.push({ s: [CAUSEWAYS[2].x1 + CAUSEWAYS[2].ux * 6, CAUSEWAYS[2].z1 + CAUSEWAYS[2].uz * 6, TRAIL[0].x, TRAIL[0].z], w: 2.5 });
  S.push({ s: [TRAIL[0].x, TRAIL[0].z, CAUSEWAYS[3].x0 - CAUSEWAYS[3].ux * 6, CAUSEWAYS[3].z0 - CAUSEWAYS[3].uz * 6], w: 2.5 });
  return (x, z, pad = 0) => {
    for (const c of C) if (Math.hypot(x - c.x, z - c.z) < c.r + pad) return true;
    for (const q of S) if (segDist(x, z, q.s) < q.w + pad) return true;
    return false;
  };
}

export function buildFoliage(scene) {
  const R = rng(4242);
  const geos = treeGeos();
  const fadeMat = fadeMaterial();
  const solidMat = toon({ vertexColors: true });
  const blocked = exclusions();
  const records = [];
  const slopeAt = (x, z) => Math.hypot(terrainH(x + 0.7, z) - terrainH(x - 0.7, z), terrainH(x, z + 0.7) - terrainH(x, z - 0.7)) / 1.4;
  const cfg = {
    V: { sp: 3.4, p: 0.75, pine: 0.15, bush: 0.3, grove: true },
    M: { sp: 3.4, p: 0.7, pine: 0.3, bush: 0.3, grove: true },
    F: { sp: 2.05, p: 0.9, pine: 0.6, bush: 0.5 },
    P: { sp: 3.4, p: 0.7, pine: 0.7, bush: 0.25, grove: true },
    L: { sp: 3.6, p: 0.65, pine: 0.2, bush: 0.25, grove: true },
  };
  const meshes = [];
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  for (const k of Object.keys(ISL)) {
    const I = ISL[k], c = cfg[k];
    const trees = [], bushes = [], rocks = [];
    const ext = I.r;
    for (let gx = -ext; gx <= ext; gx += c.sp) for (let gz = -ext; gz <= ext; gz += c.sp) {
      const x = I.x + gx + (R() - 0.5) * c.sp * 0.9, z = I.z + gz + (R() - 0.5) * c.sp * 0.9;
      const h = terrainH(x, z);
      const r1 = R(), r2 = R(), r3 = R();
      if (h < TIDE[0] + 1.0 || trailW(x, z) > 0.01 || peakW(x, z) > 0.05) {
        if (h > -0.5 && h < TIDE[0] + 0.6 && r3 < 0.08 && !blocked(x, z, 1)) rocks.push({ x, z, y: h, s: 0.6 + R() * 1.2 });
        continue;
      }
      if (slopeAt(x, z) > 0.55) continue;
      if (blocked(x, z, 0.7)) continue;
      const g = c.grove ? 0.3 + 0.7 * smooth(-0.2, 0.3, vnoise(x * 0.045 + 7, z * 0.045 - 3)) : 1;
      if (r1 < c.p * g) trees.push({ x, z, y: h, pine: r2 < c.pine, s: 0.8 + R() * 0.55, rot: R() * 6.28 });
      else if (r1 < c.p * g + c.bush * (1 - c.p * g) * (0.4 + 0.6 * g)) bushes.push({ x, z, y: h, s: 0.7 + R() * 0.7, rot: R() * 6.28 });
    }
    // extra undergrowth in the forest
    if (k === 'F') {
      for (let i = 0; i < 420; i++) {
        const a = R() * 6.28, r = Math.sqrt(R()) * I.r * 0.66;
        const x = I.x + Math.cos(a) * r, z = I.z + Math.sin(a) * r;
        if (blocked(x, z, 0.8) || terrainH(x, z) < TIDE[0] + 1.3) continue;
        bushes.push({ x, z, y: terrainH(x, z), s: 0.6 + R() * 0.8, rot: R() * 6.28 });
      }
    }
    // stones lining the switchback trail
    if (k === 'P') {
      for (let i = 4; i < TRAIL.length - 3; i += 4) {
        const p = TRAIL[i], q = TRAIL[i + 1];
        const dx = q.x - p.x, dz = q.z - p.z, L = Math.hypot(dx, dz) || 1;
        const nx = -dz / L, nz = dx / L;
        for (const s of [-1.75, 1.75]) {
          const x = p.x + nx * s, z = p.z + nz * s;
          const y = terrainH(x, z);
          if (y < p.h - 1.0) rocks.push({ x, z, y: y + 0.15, s: 0.45 + R() * 0.2, edge: true });
        }
      }
    }
    const mk = (geo, list, mat, fade, shadow) => {
      if (!list.length) return null;
      const m = new THREE.InstancedMesh(geo, mat, list.length);
      if (fade) {
        const f = new Float32Array(list.length).fill(1);
        m.geometry = geo.clone();
        m.geometry.setAttribute('aFade', new THREE.InstancedBufferAttribute(f, 1));
      }
      list.forEach((t, i) => {
        dummy.position.set(t.x, t.y - 0.1, t.z);
        dummy.rotation.set(0, t.rot || 0, 0);
        dummy.scale.setScalar(t.s);
        dummy.updateMatrix();
        m.setMatrixAt(i, dummy.matrix);
        const v = 0.85 + (vnoise(t.x * 0.2, t.z * 0.2) * 0.5 + 0.5) * 0.3;
        col.setRGB(v, v * (0.95 + R() * 0.1), v);
        m.setColorAt(i, col);
      });
      m.castShadow = shadow;
      m.receiveShadow = true;
      m.computeBoundingSphere();
      scene.add(m);
      meshes.push(m);
      return m;
    };
    const broad = trees.filter((t) => !t.pine), pine = trees.filter((t) => t.pine);
    mk(geos.trunk, trees, solidMat, false, true);
    const mb = mk(geos.broad, broad, fadeMat, true, true);
    const mp = mk(geos.pine, pine, fadeMat, true, true);
    const mbu = mk(geos.bush, bushes, fadeMat, true, true);
    mk(geos.rock, rocks, solidMat, false, true);
    broad.forEach((t, i) => records.push({ mesh: mb, i, x: t.x, y: t.y + 3.5 * t.s, z: t.z, r: 2.4 * t.s, f: 1 }));
    pine.forEach((t, i) => records.push({ mesh: mp, i, x: t.x, y: t.y + 3.8 * t.s, z: t.z, r: 2.2 * t.s, f: 1, tall: 3 * t.s }));
    bushes.forEach((t, i) => records.push({ mesh: mbu, i, x: t.x, y: t.y + 0.5 * t.s, z: t.z, r: 1.1 * t.s, f: 1 }));
    for (const t of trees) addCircle(t.x, t.z, 0.3 * t.s, t.y - 1, t.y + 3 * t.s);
    for (const r of rocks) if (r.s > 0.9) addCircle(r.x, r.z, 0.7 * r.s, r.y - 1, r.y + 0.6 * r.s);
  }
  return { records, meshes, fadeMat };
}

// --- grass: a patch of instanced tufts that follows the player -------------------------------
export class Grass {
  constructor(scene, max = 9000) {
    const pos = [], colr = [], nrm = [];
    for (let k = 0; k < 3; k++) {
      const a = k * 2.1 + 0.3, ox = Math.cos(a) * 0.12, oz = Math.sin(a) * 0.12;
      const tx = -Math.sin(a) * 0.07, tz = Math.cos(a) * 0.07;
      const h = 0.45 + k * 0.12;
      pos.push(ox - tx, 0, oz - tz, ox + tx, 0, oz + tz, ox * 1.8, h, oz * 1.8);
      colr.push(0.22, 0.4, 0.14, 0.22, 0.4, 0.14, 0.72, 0.82, 0.36);
      nrm.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    this.uTime = { value: 0 };
    const mat = toon({ vertexColors: true, side: THREE.DoubleSide });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.uTime;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
          float ph = uTime * 1.7 + ip.x * 0.31 + ip.z * 0.23;
          float k = position.y * position.y * 1.6;
          transformed.x += sin(ph) * 0.18 * k;
          transformed.z += cos(ph * 0.8) * 0.12 * k;`);
    };
    mat.customProgramCacheKey = () => 'grass';
    this.mesh = new THREE.InstancedMesh(g, mat, max);
    this.mesh.count = 0;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.max = max;
    this.cx = 1e9; this.cz = 1e9;
    const C = [{ x: TOTEM.x, z: TOTEM.z, r: 1 }, { x: RING.x, z: RING.z, r: 6 }, { x: LIGHT.x, z: LIGHT.z, r: 5 }, { x: OBS.x, z: OBS.z, r: 5.5 }];
    for (const B of BEACONS) C.push({ x: B.x, z: B.z, r: 2 });
    for (const H of HOUSES) C.push({ x: H.x, z: H.z, r: 5 });
    const Sg = WRECK.corridors.map((s) => s);
    this.blocked = (x, z) => {
      for (const c of C) if (Math.hypot(x - c.x, z - c.z) < c.r) return true;
      for (const s of Sg) if (segDist(x, z, s) < 1.1) return true;
      return Math.hypot(x - WRECK.hull.x, z - WRECK.hull.z) < 9;
    };
    scene.add(this.mesh);
  }
  update(px, pz, time) {
    this.uTime.value = time;
    if (Math.hypot(px - this.cx, pz - this.cz) < 5) return;
    this.cx = px; this.cz = pz;
    const S = 0.52, RAD = 30;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    let n = 0;
    const i0 = Math.floor((px - RAD) / S), i1 = Math.floor((px + RAD) / S);
    const j0 = Math.floor((pz - RAD) / S), j1 = Math.floor((pz + RAD) / S);
    for (let i = i0; i <= i1 && n < this.max; i++) for (let j = j0; j <= j1 && n < this.max; j++) {
      let hsh = Math.imul(i, 73856093) ^ Math.imul(j, 19349663);
      hsh = Math.imul(hsh ^ (hsh >>> 13), 1274126177);
      const r1 = ((hsh >>> 0) & 1023) / 1023, r2 = ((hsh >>> 10) & 1023) / 1023, r3 = ((hsh >>> 20) & 1023) / 1023;
      const x = (i + r1) * S, z = (j + r2) * S;
      const d = Math.hypot(x - px, z - pz);
      if (d > RAD) continue;
      if (r3 > 0.9 - smooth(RAD * 0.5, RAD, d) * 0.6) continue;
      const h = terrainH(x, z);
      if (h < TIDE[0] + 1.25 || trailW(x, z) > 0.05 || peakW(x, z) > 0.2) continue;
      const patch = vnoise(x * 0.09, z * 0.09);
      if (patch < -0.35) continue;
      if (this.blocked(x, z)) continue;
      p.set(x, h - 0.03, z);
      q.setFromAxisAngle(up, r3 * 6.28);
      const sc = 0.7 + r1 * 0.6 + Math.max(0, patch) * 0.6;
      s.set(sc, sc, sc);
      m.compose(p, q, s);
      this.mesh.setMatrixAt(n++, m);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// --- assemble -----------------------------------------------------------------------------------
export function buildStatic(scene) {
  const mat = toon({ vertexColors: true });
  const tmat = toon({ vertexColors: true });
  for (const m of buildTerrainMeshes(tmat)) scene.add(m);
  const causeways = buildCauseways().map((c) => {
    const mesh = new THREE.Mesh(c.geo, mat);
    mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);
    return { ...c, mesh };
  });
  const R = rng(777);
  const builders = { V: new Builder(), M: new Builder(), F: new Builder(), P: new Builder(), L: new Builder() };
  buildVillage(builders.V, R);
  buildRing(builders.M, R);
  buildWreck(builders.F, R);
  buildObservatory(builders.P, R);
  buildLighthouse(builders.L, R);
  const beaconTops = BEACONS.map((B, i) => (B.great ? 5 + 26 + 1.2 : buildBeaconTower(builders[['V', 'M', 'F', 'P', 'L'][i]], B)));
  for (const k in builders) {
    const g = builders[k].build();
    if (!g) continue;
    const mesh = new THREE.Mesh(g, mat);
    mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);
  }
  return { causeways, beaconTops, mat };
}
