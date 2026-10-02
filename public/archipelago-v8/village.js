// Fishing village of stilt houses. Puzzle: ring the six house bells in the
// order painted on the board at the end of the pier (coloured discs with dice
// pips). Each correct bell lights its house lantern; a wrong bell snuffs every
// lantern with a puff of smoke and silences the bells for a few seconds.
// The teaching version is a three-chime frame in the plaza with its own board.
import * as THREE from './three.module.min.js';
import { G, mat, GeoBuilder } from './geo.js';
import { glow } from './materials.js';
import { VILLAGE as V } from './layout.js';
import { terrainAt } from './terrain.js';
import { addCircle, addBox, addPlatform } from './colliders.js';
import { DEG, lerp } from './util.js';
import { Fire } from './fire.js';

const PIPS = {
  1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
  5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
};

class Seq {
  constructor(order, lockTime) { this.order = order; this.k = 0; this.lock = 0; this.lockTime = lockTime; this.done = false; }
  press(i) {
    if (this.done || this.lock > 0) return 'locked';
    if (this.order[this.k] === i) { this.k++; if (this.k === this.order.length) { this.done = true; return 'done'; } return 'ok'; }
    this.k = 0; this.lock = this.lockTime; return 'wrong';
  }
  update(dt) { if (this.lock > 0) this.lock = Math.max(0, this.lock - dt); }
}

const LIT = new THREE.Color(2.6, 1.5, 0.55), OFF = new THREE.Color(0.12, 0.1, 0.08);

// A board of coloured discs with pips, built into a static builder.
function clueBoard(sb, x, y, z, rot, colors, pips, w) {
  const c = Math.cos(rot), s = Math.sin(rot);
  const P = (lx, ly, lz) => [x + c * lx + s * lz, y + ly, z - s * lx + c * lz];
  const at = (lx, ly, lz, rx = 0, rz = 0) => { const p = P(lx, ly, lz); return mat(p[0], p[1], p[2], rx, rot, rz); };
  sb.add(G.box(w, 0.62 + (w > 2 ? 0.45 : 0), 0.08), at(0, 0, 0), 0x8a6240, { jitter: 0.1 });
  sb.add(G.box(w + 0.14, 0.08, 0.12), at(0, (w > 2 ? 0.55 : 0.35), 0), 0x5d3f27);
  const n = colors.length, step = (w - 0.3) / n;
  for (let k = 0; k < n; k++) {
    const lx = -w / 2 + 0.15 + step * (k + 0.5);
    sb.add(G.cyl(0.17, 0.17, 0.04, 14), at(lx, 0, 0.06, Math.PI / 2), colors[k]);
    for (const [px, py] of PIPS[pips[k]]) sb.add(G.cyl(0.028, 0.028, 0.03, 6), at(lx + px * 0.075, py * 0.075, 0.09, Math.PI / 2), 0x231d19);
  }
}

export function buildVillage(ctx) {
  const sb = ctx.sb('V');
  const [cx, cz] = V.c;
  const D = V.deckY;
  const wood = 0x9b6b43, woodD = 0x6e4a2e, wall = 0xf1e6cc, dark = 0x2b2420, brass = 0xc9a24a, iron = 0x2c2a2a;
  const houses = [];
  const audio = ctx.audio;

  // ---- order: house index sorted by pips
  const order = [...V.pips.keys()].sort((a, b) => V.pips[a] - V.pips[b]);
  const seq = new Seq(order, 4.5);

  V.houseAngles.forEach((deg, i) => {
    const a = deg * DEG, ca = Math.cos(a), sa = Math.sin(a);
    const o = { x: cx + ca * V.houseR, z: cz + sa * V.houseR, rot: Math.atan2(-ca, -sa) };
    o.c = Math.cos(o.rot); o.s = Math.sin(o.rot);
    const T = (lx, ly, lz) => [o.x + o.c * lx + o.s * lz, ly, o.z - o.s * lx + o.c * lz];
    const M = (lx, ly, lz, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) => { const p = T(lx, ly, lz); return mat(p[0], p[1], p[2], rx, o.rot + ry, rz, sx, sy, sz); };
    const col = V.colors[i];
    const wallC = i === 5 ? 0xa9c9de : wall;
    // deck & stilts
    sb.add(G.box(6, 0.3, 6), M(0, D - 0.15, 0), wood, { jitter: 0.12 });
    for (let k = -2; k <= 2; k++) sb.add(G.box(0.05, 0.02, 5.9), M(k * 1.2, D + 0.005, 0), woodD);
    for (const lx of [-2.7, 0, 2.7]) for (const lz of [-2.7, 2.7]) {
      const p = T(lx, 0, lz);
      sb.add(G.cyl(0.15, 0.18, D + 7.3, 6), mat(p[0], (D - 0.3 - 7) / 2, p[2]), woodD, { jitter: 0.1 });
      addCircle(p[0], p[2], 0.2, -9, D - 0.3);
    }
    sb.add(G.box(5.6, 0.12, 0.12), M(0, D - 1.6, 2.7, 0, 0, 0.5), woodD);
    sb.add(G.box(5.6, 0.12, 0.12), M(0, D - 1.6, -2.7, 0, 0, -0.5), woodD);
    addPlatform({ x: o.x, z: o.z, hx: 3, hz: 3, rot: o.rot, y0: D, mat: 'wood' });
    // house
    sb.add(G.box(3.6, 2.6, 3.2), M(0, D + 1.3, -0.9), wallC, { jitter: 0.06 });
    sb.add(G.box(3.75, 0.25, 3.35), M(0, D + 0.12, -0.9), woodD);
    sb.add(G.prism(4.4, 1.55, 4.0), M(0, D + 2.6, -0.9), col, { jitter: 0.08 });
    sb.add(G.box(1.0, 1.9, 0.1), M(0, D + 0.95, 0.73), 0x4a3222);
    sb.add(G.box(1.2, 0.12, 0.14), M(0, D + 1.95, 0.74), woodD);
    for (const sx of [-1, 1]) {
      sb.add(G.box(0.08, 0.62, 0.72), M(sx * 1.82, D + 1.5, -0.9), 0x2d3a4a);
      sb.add(G.box(0.06, 0.66, 0.34), M(sx * 1.85, D + 1.5, -0.9 + 0.55), col);
      sb.add(G.box(0.06, 0.66, 0.34), M(sx * 1.85, D + 1.5, -0.9 - 0.55), col);
    }
    sb.add(G.box(0.5, 0.9, 0.5), M(1.1, D + 3.4, -1.6), 0x9a8f80);
    sb.add(G.cyl(0.035, 0.035, 1.7, 5), M(-1.5, D + 4.0, -0.9), woodD);
    sb.add(G.box(0.03, 0.42, 0.9), M(-1.5, D + 4.55, -0.45), col);
    addBox(...T(0, 0, -0.9).filter((_, k) => k !== 1), 1.85, 1.65, o.rot, D, D + 4.2);
    // railings on three sides
    const rails = [[2.9, 0, 0.08, 3], [-2.9, 0, 0.08, 3], [0, -2.9, 3, 0.08]];
    for (const [lx, lz, hx, hz] of rails) {
      sb.add(G.box(hx * 2, 0.08, hz * 2), M(lx, D + 0.95, lz), woodD);
      sb.add(G.box(hx * 2, 0.06, hz * 2), M(lx, D + 0.5, lz), woodD);
      const p = T(lx, 0, lz);
      addBox(p[0], p[2], hx, hz, o.rot, D - 0.2, D + 1.1);
    }
    for (const [lx, lz] of [[2.9, 2.9], [2.9, 0], [2.9, -2.9], [-2.9, 2.9], [-2.9, 0], [-2.9, -2.9], [0, -2.9]])
      sb.add(G.box(0.12, 1.05, 0.12), M(lx, D + 0.52, lz), woodD);
    // barrel & crate
    sb.add(G.cyl(0.36, 0.36, 0.9, 8), M(2.1, D + 0.45, 1.9), 0x8a5a33, { jitter: 0.1 });
    sb.add(G.torus(0.37, 0.03, 3, 10), M(2.1, D + 0.25, 1.9, Math.PI / 2), iron);
    sb.add(G.torus(0.37, 0.03, 3, 10), M(2.1, D + 0.65, 1.9, Math.PI / 2), iron);
    { const p = T(2.1, 0, 1.9); addCircle(p[0], p[2], 0.4, D, D + 1); }
    sb.add(G.box(0.7, 0.6, 0.7), M(-2.0, D + 0.3, -2.0, 0, 0.3), 0xa57b4c, { jitter: 0.1 });
    { const p = T(-2.0, 0, -2.0); addCircle(p[0], p[2], 0.45, D, D + 0.6); }
    // bell post
    sb.add(G.box(0.16, 2.7, 0.16), M(-2.35, D + 1.35, 2.4), woodD);
    sb.add(G.box(0.8, 0.12, 0.12), M(-2.0, D + 2.62, 2.4), woodD);
    { const p = T(-2.35, 0, 2.4); addCircle(p[0], p[2], 0.14, D, D + 2.8); }
    const hp = T(-1.7, D + 2.55, 2.4);
    const bellGroup = new THREE.Group();
    bellGroup.position.set(hp[0], hp[1], hp[2]);
    bellGroup.rotation.y = o.rot;
    const bb = new GeoBuilder();
    bb.add(G.cyl(0.015, 0.015, 0.25, 4), mat(0, -0.12, 0), 0xcdb88a);
    bb.add(G.cyl(0.16, 0.3, 0.42, 12), mat(0, -0.45, 0), col);
    bb.add(G.sph(0.16, 10, 5), mat(0, -0.25, 0, 0, 0, 0, 1, 0.5, 1), col);
    bb.add(G.torus(0.3, 0.035, 4, 14), mat(0, -0.66, 0, Math.PI / 2), brass);
    bb.add(G.sph(0.06, 6, 4), mat(0, -0.66, 0), iron);
    const bell = new THREE.Mesh(bb.build(), ctx.toonMat);
    bell.castShadow = true;
    bellGroup.add(bell);
    ctx.scene.add(bellGroup);
    // lantern by the door
    const lp = T(1.05, D + 2.05, 0.9);
    sb.add(G.box(0.05, 0.4, 0.05), M(1.05, D + 2.35, 0.8), iron);
    sb.add(G.box(0.34, 0.04, 0.34), M(1.05, D + 2.26, 0.9), iron);
    sb.add(G.box(0.34, 0.04, 0.34), M(1.05, D + 1.84, 0.9), iron);
    const lantern = new THREE.Mesh(G.sph(0.13, 8, 6), glow(0x000000));
    lantern.material.color.copy(OFF);
    lantern.position.set(lp[0], lp[1], lp[2]);
    ctx.scene.add(lantern);
    // gangway from the plaza
    const s0 = 16.8, s1 = V.houseR - 2.9, gx0 = cx + ca * s0, gz0 = cz + sa * s0;
    const y0 = terrainAt(gx0, gz0) + 0.04;
    const grot = Math.atan2(-sa, ca);
    const gm = (s1 + s0) / 2, ghx = (s1 - s0) / 2;
    addPlatform({ x: cx + ca * gm, z: cz + sa * gm, hx: ghx, hz: 0.85, rot: grot, y0, y1: D, mat: 'wood' });
    const nP = Math.ceil((s1 - s0) / 0.5);
    for (let k = 0; k < nP; k++) {
      const u = (k + 0.5) / nP, r = lerp(s0, s1, u);
      sb.add(G.box(0.42, 0.08, 1.7), mat(cx + ca * r, lerp(y0, D, u) - 0.05, cz + sa * r, 0, grot, 0), k % 2 ? wood : 0xa77a4f);
    }
    for (const side of [-1, 1]) {
      const px = -sa * side * 0.9, pz = ca * side * 0.9;
      for (let k = 0; k <= 3; k++) {
        const r = lerp(s0, s1, k / 3), yy = lerp(y0, D, k / 3);
        sb.add(G.cyl(0.07, 0.08, yy + 8, 5), mat(cx + ca * r + px, (yy + 1.0 - 7) / 2, cz + sa * r + pz), woodD);
      }
      sb.add(G.box(s1 - s0, 0.05, 0.05), mat(cx + ca * gm + px, lerp(y0, D, 0.5) + 0.9, cz + sa * gm + pz, 0, grot, Math.atan2(D - y0, s1 - s0)), 0xcdb88a);
      addBox(cx + ca * gm + px * 1.05, cz + sa * gm + pz * 1.05, ghx, 0.06, grot, Math.min(y0, D) - 0.6, Math.max(y0, D) + 1.1);
    }
    houses.push({ bellGroup, lantern, swing: 0, deg, hp });
    ctx.addInteract({
      x: hp[0], y: D + 1.4, z: hp[2], r: 2.0,
      enabled: () => !seq.done && seq.lock <= 0,
      press: () => ring(i),
    });
    ctx.exclude(o.x, o.z, 4.5);
  });

  function setLantern(i, on) { houses[i].lantern.material.color.copy(on ? LIT : OFF); }
  function ring(i) {
    const h = houses[i];
    h.swing = 1;
    const r = seq.press(i);
    if (r === 'locked') return;
    audio.bell(h.hp, V.bellNotes[i], r === 'wrong' ? 0.5 : 1);
    if (r === 'ok' || r === 'done') setLantern(i, true);
    if (r === 'wrong') {
      audio.thud(h.hp);
      for (let k = 0; k < houses.length; k++) {
        const lit = houses[k].lantern.material.color.r > 1;
        setLantern(k, false);
        if (lit || k === i) { const p = houses[k].lantern.position; ctx.puffs.burst(p.x, p.y, p.z, 9, 0.5); }
      }
    }
    if (r === 'done') solveMain(false);
  }

  // ---- the pier and the order board
  const pz0 = V.pierZ0, pz1 = V.pierZ1;
  const py0 = terrainAt(0, pz0) + 0.04;
  addPlatform({ x: 0, z: (pz0 + pz1) / 2, hx: (pz1 - pz0) / 2, hz: 1.3, rot: -Math.PI / 2, y0: py0, y1: D, mat: 'wood' });
  for (let z = pz0 + 0.25; z < pz1; z += 0.5) {
    const u = (z - pz0) / (pz1 - pz0);
    sb.add(G.box(2.6, 0.09, 0.44), mat(0, lerp(py0, D, u) - 0.05, z), ((z * 2) | 0) % 2 ? wood : 0xa77a4f);
  }
  for (let z = pz0 + 3; z <= pz1; z += 3) for (const x of [-1.25, 1.25]) {
    sb.add(G.cyl(0.13, 0.15, D + 8, 6), mat(x, (D + 0.5 - 7.5) / 2, z), woodD, { jitter: 0.1 });
    addCircle(x, z, 0.16, -9, D + 0.5);
  }
  sb.add(G.cyl(0.13, 0.15, 1.6, 6), mat(1.15, D + 0.3, pz1 - 4), woodD);
  sb.add(G.cyl(0.13, 0.15, 1.6, 6), mat(-1.15, D + 0.3, pz1 - 9), woodD);
  // the board faces north, toward the village
  const bz = pz1 - 0.6;
  for (const x of [-1.2, 1.2]) { sb.add(G.box(0.16, 2.4, 0.16), mat(x, D + 1.2, bz + 0.1), woodD); addCircle(x, bz + 0.1, 0.14, D, D + 2.4); }
  const boardOrder = [2, 5, 0, 4, 1, 3];
  clueBoard(sb, 0, D + 1.55, bz, Math.PI, boardOrder.map((i) => V.colors[i]), boardOrder.map((i) => V.pips[i]), 3.0);
  addBox(0, bz, 1.6, 0.12, 0, D, D + 2.4);

  // ---- teaching chimes on the plaza
  const [tx, tz] = V.teach;
  const ty = terrainAt(tx, tz);
  for (const x of [tx - 2.0, tx + 2.0]) { sb.add(G.box(0.18, 2.6, 0.18), mat(x, ty + 1.3, tz), woodD); addCircle(x, tz, 0.15, ty, ty + 2.6); }
  sb.add(G.box(4.4, 0.16, 0.18), mat(tx, ty + 2.55, tz), woodD);
  const tOrder = [...V.teachPips.keys()].sort((a, b) => V.teachPips[a] - V.teachPips[b]);
  const tseq = new Seq(tOrder, 2.5);
  const chimes = [];
  const tbx = tx + 3.2;
  sb.add(G.box(0.14, 1.3, 0.14), mat(tbx, ty + 0.65, tz - 0.05), woodD);
  clueBoard(sb, tbx, ty + 1.3, tz + 0.05, 0, V.teachColors, V.teachPips, 1.3);
  addCircle(tbx, tz, 0.35, ty, ty + 1.8);
  const bulbs = [];
  for (let k = 0; k < 3; k++) {
    const b = new THREE.Mesh(G.sph(0.07, 6, 4), glow(0x000000));
    b.material.color.copy(OFF);
    b.position.set(tbx - 0.4 + k * 0.4, ty + 1.78, tz + 0.05);
    ctx.scene.add(b);
    bulbs.push(b);
  }
  const tFire = new Fire(ctx.scene, new THREE.Vector3(tx, ty + 2.75, tz), 0.4, false);
  sb.add(G.cyl(0.22, 0.16, 0.18, 8), mat(tx, ty + 2.7, tz), iron);
  [-1.1, 0, 1.1].forEach((dx, i) => {
    const g = new THREE.Group();
    g.position.set(tx + dx, ty + 2.45, tz);
    const cb = new GeoBuilder();
    cb.add(G.cyl(0.012, 0.012, 0.3, 3), mat(0, -0.15, 0), 0xcdb88a);
    cb.add(G.cyl(0.075, 0.075, 0.9, 8), mat(0, -0.75, 0), V.teachColors[i]);
    cb.add(G.cyl(0.08, 0.08, 0.04, 8), mat(0, -0.3, 0), brass);
    const m = new THREE.Mesh(cb.build(), ctx.toonMat);
    m.castShadow = true;
    g.add(m);
    ctx.scene.add(g);
    const pos = [tx + dx, ty + 1.6, tz];
    chimes.push({ g, swing: 0, pos });
    ctx.addInteract({
      x: tx + dx, y: ty + 1.5, z: tz + 0.15, r: 1.5,
      enabled: () => !tseq.done && tseq.lock <= 0,
      press: () => {
        chimes[i].swing = 1;
        const r = tseq.press(i);
        if (r === 'locked') return;
        audio.chime(pos, [784, 988, 659][i], r === 'wrong' ? 0.4 : 1);
        if (r === 'ok' || r === 'done') bulbs[tseq.done ? 2 : tseq.k - 1].material.color.copy(LIT);
        if (r === 'wrong') {
          audio.thud(pos);
          bulbs.forEach((b) => { if (b.material.color.r > 1) ctx.puffs.burst(b.position.x, b.position.y, b.position.z, 5, 0.25); b.material.color.copy(OFF); });
        }
        if (r === 'done') solveTeach(false);
      },
    });
  });

  // ---- plaza dressing
  {
    const wx = 5, wz = 96, wy = terrainAt(wx, wz);
    sb.add(G.cyl(0.9, 1.0, 0.9, 10), mat(wx, wy + 0.45, wz), 0x9a9284, { jitter: 0.1 });
    sb.add(G.cyl(0.7, 0.7, 0.05, 10), mat(wx, wy + 0.88, wz), 0x2a3b4a);
    for (const s of [-1, 1]) sb.add(G.box(0.1, 1.8, 0.1), mat(wx + s * 0.8, wy + 1.3, wz), woodD);
    sb.add(G.prism(2.0, 0.6, 1.2), mat(wx, wy + 2.15, wz, 0, 0, 0), 0xc4553f);
    addCircle(wx, wz, 1.05, wy, wy + 2.5);
    // fish drying racks
    for (const [rx, rz, rr] of [[-8, 92, 0.4], [9, 105, -0.6]]) {
      const ry = terrainAt(rx, rz);
      const c = Math.cos(rr), s = Math.sin(rr);
      for (const e of [-1.4, 1.4]) { sb.add(G.box(0.1, 1.8, 0.1), mat(rx + c * e, ry + 0.9, rz - s * e), woodD); addCircle(rx + c * e, rz - s * e, 0.12, ry, ry + 1.8); }
      sb.add(G.box(3.0, 0.07, 0.07), mat(rx, ry + 1.75, rz, 0, rr), woodD);
      for (let k = 0; k < 6; k++) {
        const e = -1.1 + k * 0.44;
        sb.add(G.box(0.08, 0.45, 0.16), mat(rx + c * e, ry + 1.45, rz - s * e, 0, rr, 0.1), 0x9fb3b8);
      }
    }
    // crates and barrels
    for (const [bx, bz2] of [[7, 108], [-9, 106], [-3, 92], [10, 98]]) {
      const by = terrainAt(bx, bz2);
      sb.add(G.cyl(0.38, 0.38, 0.95, 8), mat(bx, by + 0.47, bz2), 0x8a5a33, { jitter: 0.1 });
      sb.add(G.torus(0.39, 0.03, 3, 10), mat(bx, by + 0.75, bz2, Math.PI / 2), iron);
      addCircle(bx, bz2, 0.42, by, by + 1);
      sb.add(G.box(0.7, 0.7, 0.7), mat(bx + 0.9, by + 0.35, bz2 + 0.3, 0, 0.5), 0xa57b4c, { jitter: 0.1 });
      addCircle(bx + 0.9, bz2 + 0.3, 0.45, by, by + 0.7);
    }
    // rowboats resting on the flats (revealed as the tide falls)
    for (const [bx, bz2, br] of [[-22, 118, 0.6], [24, 112, -0.4], [14, 132, 1.2]]) {
      const by = terrainAt(bx, bz2);
      sb.add(G.box(3.2, 0.5, 1.2), mat(bx, Math.max(by, -1) + 0.25, bz2, 0, br, 0.08), 0x6f8fa8, { jitter: 0.1 });
      sb.add(G.box(2.9, 0.1, 1.0), mat(bx, Math.max(by, -1) + 0.45, bz2, 0, br, 0.08), 0x8a6240);
    }
    // unlit lamp posts around the plaza
    for (const a of [30, 100, 170, 250, 320]) {
      const lx = cx + Math.cos(a * DEG) * 11.5, lz = cz + Math.sin(a * DEG) * 11.5, ly = terrainAt(lx, lz);
      sb.add(G.cyl(0.07, 0.09, 2.6, 6), mat(lx, ly + 1.3, lz), iron);
      sb.add(G.box(0.3, 0.35, 0.3), mat(lx, ly + 2.7, lz), 0x3b3a36);
      addCircle(lx, lz, 0.12, ly, ly + 2.8);
    }
  }

  let solved = false, teachSolved = false;
  function solveMain(instant) {
    if (solved) return;
    solved = true; seq.done = true;
    houses.forEach((_, k) => setLantern(k, true));
    if (!instant) audio.success();
    ctx.onSolved(0, instant);
  }
  function solveTeach(instant) {
    if (teachSolved) return;
    teachSolved = true; tseq.done = true;
    bulbs.forEach((b) => b.material.color.copy(LIT));
    tFire.set(1, instant);
    if (!instant) audio.success(0.6);
    ctx.onTeach(0, instant);
  }

  return {
    teachPos: [tx, ty + 1, tz],
    mainPos: [0, D + 1, bz - 2],
    get solved() { return solved; },
    get teachSolved() { return teachSolved; },
    solveMain, solveTeach,
    fires: [tFire],
    update(dt, t) {
      seq.update(dt); tseq.update(dt);
      for (const h of houses) {
        if (h.swing > 0) h.swing = Math.max(0, h.swing - dt * 0.6);
        h.bellGroup.rotation.z = Math.sin(t * 9) * 0.45 * h.swing * h.swing;
        if (solved) { const k = 0.9 + 0.1 * Math.sin(t * 3 + h.deg); h.lantern.material.color.setRGB(LIT.r * k, LIT.g * k, LIT.b * k); }
      }
      for (const c of chimes) {
        if (c.swing > 0) c.swing = Math.max(0, c.swing - dt * 0.8);
        c.g.rotation.x = Math.sin(t * 11) * 0.35 * c.swing;
      }
      tFire.update(dt);
    },
  };
}
