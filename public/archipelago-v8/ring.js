// Ring of barnacled monoliths. Each stone hums; a glowing band shows its pitch
// and pulses at the beat between the stone and the centre stone's drone.
// Pressing a stone raises its pitch one notch and also shifts both
// neighbours, so the ring is tuned by listening to the whole chord until every
// band is level with the centre stone and still. Teaching version: three
// small linked stones in a row beside the ring.
import * as THREE from './three.module.min.js';
import { G, mat, GeoBuilder } from './geo.js';
import { glow } from './materials.js';
import { RING } from './layout.js';
import { terrainAt } from './terrain.js';
import { addCircle, addBox } from './colliders.js';
import { DEG, rng, lerp } from './util.js';
import { Fire } from './fire.js';

function effect(n, i, ring) {
  const e = new Array(n).fill(0);
  e[i] = 1;
  if (ring) { e[(i + n - 1) % n] = 1; e[(i + 1) % n] = 1; }
  else { if (i > 0) e[i - 1] = 1; if (i < n - 1) e[i + 1] = 1; }
  return e;
}
// Pick a start state that needs at least minD presses and is not uniform.
function startState(n, ring, target, minD, maxD2, seed) {
  const best = new Map();
  for (let v = 0; v < 4 ** n; v++) {
    let c = v, d = 0;
    const st = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      const ci = c % 4; c = (c / 4) | 0; d += ci;
      if (ci) { const e = effect(n, i, ring); for (let j = 0; j < n; j++) st[j] = (st[j] + ci * e[j]) % 4; }
    }
    const start = st.map((s) => (target - s + 8) % 4);
    const key = start.join('');
    if (!best.has(key) || best.get(key) > d) best.set(key, d);
  }
  // never a start that one repeated press would solve
  for (let i = 0; i < n; i++) for (let k = 1; k < 4; k++) {
    const e = effect(n, i, ring);
    best.delete(e.map((v) => (target - k * v + 8) % 4).join(''));
  }
  let maxD = 0;
  for (const d of best.values()) maxD = Math.max(maxD, d);
  const want = Math.min(maxD, minD);
  const cands = [...best.entries()].filter(([k, d]) => d >= want && d <= Math.max(want, maxD2) && new Set(k.split('')).size > 1).map(([k]) => k).sort();
  const r = rng(seed);
  return cands[Math.floor(r() * cands.length)].split('').map(Number);
}

const BAND = (k) => new THREE.Color(0.35 * k, 1.5 * k, 1.3 * k);

export function buildRing(ctx) {
  const sb = ctx.sb('M');
  const [cx, cz] = RING.c, R = RING.r;
  const audio = ctx.audio;
  const stoneC = 0x5d6672, barn = 0xddd6c6, weed = 0x3f5b45;

  function bandMesh(w, d) {
    const b = new GeoBuilder();
    const t = 0.07;
    b.add(G.box(w + 0.16, t, 0.08), mat(0, 0, d / 2 + 0.04), 0xffffff);
    b.add(G.box(w + 0.16, t, 0.08), mat(0, 0, -d / 2 - 0.04), 0xffffff);
    b.add(G.box(0.08, t, d + 0.16), mat(w / 2 + 0.04, 0, 0), 0xffffff);
    b.add(G.box(0.08, t, d + 0.16), mat(-w / 2 - 0.04, 0, 0), 0xffffff);
    return b.build();
  }

  function monolith(x, z, rot, w, h, d, lvlH, barnacles) {
    const y = terrainAt(x, z) - 0.3;
    const c = Math.cos(rot), s = Math.sin(rot);
    const M = (lx, ly, lz, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) => mat(x + c * lx + s * lz, y + ly, z - s * lx + c * lz, rx, rot + ry, rz, sx, sy, sz);
    sb.add(G.box(w, h, d), M(0, h / 2, 0, 0.02, 0, 0.03), stoneC, { jitter: 0.14 });
    sb.add(G.box(w * 0.86, 0.35, d * 0.86), M(0, h + 0.15, 0, 0, 0.1, 0.05), 0x6c7480, { jitter: 0.1 });
    sb.add(G.box(w + 0.05, 0.5, d + 0.05), M(0, 0.45, 0), weed, { jitter: 0.2 });
    for (const lh of lvlH) sb.add(G.box(w + 0.03, 0.05, d + 0.03), M(0, lh + 0.3, 0), 0x2e333a);
    for (let k = 0; k < barnacles; k++) {
      const face = k % 4, u = ((k * 0.618) % 1) - 0.5, v = ((k * 0.381) % 1) * 0.55 * h + 0.3;
      const lx = face < 2 ? u * w : (face === 2 ? 1 : -1) * w / 2;
      const lz = face < 2 ? (face === 0 ? 1 : -1) * d / 2 : u * d;
      sb.add(G.cone(0.07 + (k % 3) * 0.025, 0.12, 5), M(lx, v, lz, face < 2 ? (face === 0 ? 1.4 : -1.4) : 0, 0, face >= 2 ? (face === 2 ? -1.4 : 1.4) : 0), barn, { jitter: 0.15 });
    }
    addBox(x, z, w / 2 + 0.05, d / 2 + 0.05, rot, y, y + h);
    return y + 0.3;
  }

  // ---- the ring
  const LV = [0.8, 1.65, 2.5, 3.35];
  const base = [110, 165, 220, 110, 165, 220];
  const levels = startState(6, true, 2, 7, 8, 4242);
  const stones = [];
  const cy = terrainAt(cx, cz);
  // centre reference stone
  sb.add(G.cyl(0.5, 0.65, 3.0, 8), mat(cx, cy + 1.2, cz), stoneC, { jitter: 0.14 });
  sb.add(G.cyl(0.66, 0.66, 0.4, 8), mat(cx, cy + 0.1, cz), weed);
  addCircle(cx, cz, 0.7, cy - 0.5, cy + 2.8);
  const refBand = new THREE.Mesh(G.torus(0.62, 0.06, 4, 8), glow(0xffffff));
  refBand.rotation.x = Math.PI / 2;
  refBand.position.set(cx, cy + LV[2] + 0.3 - 0.3, cz);
  refBand.material.color.copy(BAND(1));
  ctx.scene.add(refBand);
  const refHum = audio.hum([cx, cy + 1.5, cz], [110, 165, 220], 0.7);
  // a floor of worn flagstones
  for (let k = 0; k < 18; k++) {
    const a = k / 18 * Math.PI * 2, r = 3.3 + (k % 3) * 1.2;
    const fx = cx + Math.cos(a) * r, fz = cz + Math.sin(a) * r;
    sb.add(G.box(1.2, 0.08, 0.9), mat(fx, terrainAt(fx, fz) + 0.02, fz, 0, a * 1.7), 0x8b8a80, { jitter: 0.15 });
  }

  for (let k = 0; k < 6; k++) {
    const a = (30 + 60 * k) * DEG;
    const x = cx + Math.cos(a) * R, z = cz + Math.sin(a) * R;
    const rot = Math.atan2(-Math.cos(a), -Math.sin(a));
    const gy = monolith(x, z, rot, 1.35, 4.4, 0.95, LV, 26);
    const band = new THREE.Mesh(bandMesh(1.35, 0.95), glow(0xffffff));
    band.position.set(x, gy + LV[levels[k]], z);
    band.rotation.y = rot;
    ctx.scene.add(band);
    const hum = audio.hum([x, gy + 2, z], [base[k]], 1);
    stones.push({ x, z, gy, band, hum, h: LV[levels[k]] });
    const ix = cx + Math.cos(a) * (R - 1.0), iz = cz + Math.sin(a) * (R - 1.0);
    ctx.addInteract({ x: ix, y: gy + 1.2, z: iz, r: 1.9, enabled: () => !solved && lock <= 0, press: () => press(k) });
  }
  ctx.exclude(cx, cz, R + 3);

  let lock = 0, solved = false;
  function press(i) {
    if (lock > 0 || solved) return;
    const e = effect(6, i, true);
    for (let j = 0; j < 6; j++) if (e[j]) {
      levels[j] = (levels[j] + 1) % 4;
      ctx.puffs.burst(stones[j].x, stones[j].gy + 0.3, stones[j].z, 6, 1.2);
    }
    lock = 2.2;
    audio.grind([stones[i].x, stones[i].gy + 1, stones[i].z]);
    if (levels.every((l) => l === 2)) solveMain(false);
  }

  // ---- teaching row
  const [tx, tz] = RING.teach;
  const nx = (tx - cx), nz = (tz - cz), nl = Math.hypot(nx, nz);
  const ux = nx / nl, uz = nz / nl;           // outward
  const vx = -uz, vz = ux;                    // along the row
  const TLV = [0.45, 0.85, 1.25, 1.65];
  const tbase = [220, 330, 440];
  const tlevels = startState(3, false, 2, 3, 3, 99);
  const tstones = [];
  const trot = Math.atan2(-ux, -uz);
  const rx0 = tx + ux * 1.3, rz0 = tz + uz * 1.3, ry0 = terrainAt(rx0, rz0);
  sb.add(G.cyl(0.25, 0.32, 1.5, 7), mat(rx0, ry0 + 0.55, rz0), stoneC, { jitter: 0.14 });
  addCircle(rx0, rz0, 0.35, ry0, ry0 + 1.4);
  const tref = new THREE.Mesh(G.torus(0.31, 0.04, 4, 8), glow(0xffffff));
  tref.rotation.x = Math.PI / 2;
  tref.position.set(rx0, ry0 + TLV[2], rz0);
  tref.material.color.copy(BAND(1));
  ctx.scene.add(tref);
  const tFire = new Fire(ctx.scene, new THREE.Vector3(rx0, ry0 + 1.35, rz0), 0.45, false);
  const trefHum = audio.hum([rx0, ry0 + 1, rz0], [220, 330, 440], 0.35);
  for (let k = 0; k < 3; k++) {
    const x = tx + vx * (k - 1) * 1.7, z = tz + vz * (k - 1) * 1.7;
    const gy = monolith(x, z, trot, 0.7, 2.0, 0.5, TLV, 8);
    const band = new THREE.Mesh(bandMesh(0.7, 0.5), glow(0xffffff));
    band.position.set(x, gy + TLV[tlevels[k]], z);
    band.rotation.y = trot;
    ctx.scene.add(band);
    const hum = audio.hum([x, gy + 1, z], [tbase[k]], 0.45);
    tstones.push({ x, z, gy, band, hum, h: TLV[tlevels[k]] });
    ctx.addInteract({ x: x + ux * 0.9, y: gy + 0.8, z: z + uz * 0.9, r: 1.3, enabled: () => !tSolved && tlock <= 0, press: () => tpress(k) });
  }
  ctx.exclude(tx, tz, 4);
  let tlock = 0, tSolved = false;
  function tpress(i) {
    if (tlock > 0 || tSolved) return;
    const e = effect(3, i, false);
    for (let j = 0; j < 3; j++) if (e[j]) { tlevels[j] = (tlevels[j] + 1) % 4; ctx.puffs.burst(tstones[j].x, tstones[j].gy + 0.2, tstones[j].z, 4, 0.6); }
    tlock = 1.6;
    audio.grind([tstones[i].x, tstones[i].gy + 0.5, tstones[i].z], 0.5);
    if (tlevels.every((l) => l === 2)) solveTeach(false);
  }

  function solveMain(instant) {
    if (solved) return;
    solved = true;
    for (let j = 0; j < 6; j++) levels[j] = 2;
    if (instant) stones.forEach((s) => { s.h = LV[2]; });
    if (!instant) audio.success();
    ctx.onSolved(1, instant);
  }
  function solveTeach(instant) {
    if (tSolved) return;
    tSolved = true;
    for (let j = 0; j < 3; j++) tlevels[j] = 2;
    if (instant) tstones.forEach((s) => { s.h = TLV[2]; });
    tFire.set(1, instant);
    if (!instant) audio.success(0.6);
    ctx.onTeach(1, instant);
  }

  const DET = 0.014;
  function animate(list, lv, LVH, bases, dt, t, near, done) {
    for (let k = 0; k < list.length; k++) {
      const s = list[k];
      const target = LVH[lv[k]];
      s.h = lerp(s.h, target, Math.min(1, dt * 1.6));
      if (Math.abs(s.h - target) < 0.005) s.h = target;
      const shake = Math.abs(s.h - target) > 0.02 ? (Math.random() - 0.5) * 0.03 : 0;
      s.band.position.set(s.x + shake, s.gy + s.h, s.z + shake);
      const f = bases[k] * (1 + (lv[k] - 2) * DET);
      const beat = Math.abs(f - bases[k]);
      const k2 = done ? 1.25 : (beat < 0.01 ? 1.0 : 0.55 + 0.45 * Math.cos(t * beat * Math.PI * 2));
      s.band.material.color.copy(BAND(k2));
      s.hum.set([f], near);
    }
  }
  return {
    teachPos: [tx, terrainAt(tx, tz) + 1, tz],
    mainPos: [cx, cy + 1, cz],
    get solved() { return solved; },
    get teachSolved() { return tSolved; },
    solveMain, solveTeach,
    fires: [tFire],
    update(dt, t, player) {
      if (lock > 0) lock -= dt;
      if (tlock > 0) tlock -= dt;
      const d = Math.hypot(player.x - cx, player.z - cz);
      const inside = d < R + 0.6 ? 1 : Math.max(0, 1 - (d - R) / 22) * 0.25;
      animate(stones, levels, LV, base, dt, t, inside * 0.2, solved);
      refHum.set([110, 165, 220], inside * 0.16);
      const dt2 = Math.hypot(player.x - tx, player.z - tz);
      const tn = Math.max(0, 1 - dt2 / 10);
      animate(tstones, tlevels, TLV, tbase, dt, t, tn * 0.14, tSolved);
      trefHum.set([220, 330, 440], tn * 0.1);
      refBand.material.color.copy(BAND(solved ? 1.25 : 1));
      tFire.update(dt);
    },
  };
}
