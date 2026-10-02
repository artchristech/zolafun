// Ring of barnacled monoliths. Each stone hums one of four close pitches, shown by the height
// of its glowing band. Pressing a stone steps it and both neighbours. Tuned = one pure unison.
import * as THREE from './three.module.min.js';
import { RING_C, RING_R, RTUT, ISLANDS } from './layout.js';
import { groundH } from './ground.js';
import { mat, mulberry32, damp } from './util.js';

const K = 4;
const BASE_F = 146.83; // D3
const freqOf = (s, small) => (small ? BASE_F * 2 : BASE_F) * Math.pow(2, (s * 0.7) / 12);

function linkSets(n, ring) {
  const sets = [];
  for (let i = 0; i < n; i++) {
    if (ring) sets.push([(i + n - 1) % n, i, (i + 1) % n]);
    else sets.push([i - 1, i, i + 1].filter((j) => j >= 0 && j < n));
  }
  return sets;
}
// minimum number of presses to reach any all-equal arrangement
export function minPresses(state, sets) {
  const n = state.length;
  const total = Math.pow(K, n);
  let best = Infinity;
  const p = new Array(n).fill(0);
  const s = new Array(n);
  for (let code = 0; code < total; code++) {
    let c = code, cost = 0;
    for (let i = 0; i < n; i++) {
      p[i] = c % K;
      c = Math.floor(c / K);
      cost += p[i];
    }
    if (cost >= best) continue;
    for (let i = 0; i < n; i++) s[i] = state[i];
    for (let i = 0; i < n; i++) if (p[i]) for (const j of sets[i]) s[j] = (s[j] + p[i]) % K;
    let eq = true;
    for (let i = 1; i < n; i++) if (s[i] !== s[0]) { eq = false; break; }
    if (eq) best = cost;
  }
  return best;
}

function pickStart(n, sets, lo, hi, seed) {
  const rng = mulberry32(seed);
  for (let tries = 0; tries < 500; tries++) {
    const s = [];
    for (let i = 0; i < n; i++) s.push(Math.floor(rng() * K));
    const c = minPresses(s, sets);
    if (c >= lo && c <= hi) return s;
  }
  return n === 7 ? [0, 2, 1, 3, 3, 0, 2] : [1, 3, 0];
}

export class Ring {
  constructor(ctx, beacon) {
    this.ctx = ctx;
    this.beacon = beacon;
    this.solved = false;
    this.tutDone = false;
    this.sets = linkSets(7, true);
    this.tSets = linkSets(3, false);
    this.state = pickStart(7, this.sets, 9, 14, 2024);
    this.tState = pickStart(3, this.tSets, 3, 4, 77);
    this.stones = [];
    this.tStones = [];
    const b = ctx.batch(1);
    const rng = mulberry32(88);
    const base = groundH(RING_C.x, RING_C.z);
    this.center = new THREE.Vector3(RING_C.x, base, RING_C.z);
    const bandGeo = new THREE.BoxGeometry(1.46, 0.16, 1.06);
    const tBandGeo = new THREE.BoxGeometry(0.86, 0.12, 0.66);
    const make = (x, z, yaw, w, hgt, d, small, idx) => {
      const g = groundH(x, z);
      const stone = new THREE.BoxGeometry(w, hgt, d, 2, 4, 2);
      const P = stone.attributes.position;
      for (let i = 0; i < P.count; i++) {
        const k = Math.sin(P.getX(i) * 12.9 + P.getY(i) * 7.1 + P.getZ(i) * 3.3 + idx) * 43758.5;
        const j = (k - Math.floor(k) - 0.5) * 0.12 * w;
        P.setX(i, P.getX(i) + j);
        P.setZ(i, P.getZ(i) - j * 0.6);
        if (P.getY(i) > hgt / 2 - 0.01) P.setY(i, P.getY(i) - Math.abs(j) * 2.5);
      }
      b.add(stone, mat(x, g + hgt / 2 - 0.3, z, 0, yaw, 0), '#8f8b80', {
        flat: true,
        colorFn: (wx, wy, wz, c, out) => out.copy(c).lerp(new THREE.Color('#4d6b4a'), wy < g + 0.5 ? 0.5 : 0),
      });
      // barnacles
      const nb = small ? 10 : 22;
      for (let i = 0; i < nb; i++) {
        const side = Math.floor(rng() * 4);
        const ly = -0.3 + rng() * hgt * 0.6;
        const across = (rng() - 0.5) * w * 0.9;
        let lx = 0, lz = 0;
        if (side === 0) { lx = across; lz = d / 2; } else if (side === 1) { lx = across; lz = -d / 2; } else if (side === 2) { lx = w / 2; lz = across * (d / w); } else { lx = -w / 2; lz = across * (d / w); }
        const c = Math.cos(yaw), s = Math.sin(yaw);
        const bx = x + lx * c + lz * s, bz = z - lx * s + lz * c;
        const r = (small ? 0.06 : 0.09) + rng() * 0.08;
        b.add(new THREE.ConeGeometry(r, r * 1.2, 6), mat(bx, g + ly, bz, (rng() - 0.5) * 2, rng() * 6, (rng() - 0.5) * 2), rng() < 0.5 ? '#ddd6c6' : '#b9b09f', { flat: true });
      }
      // four carved notches mark the band heights on the inner face
      for (let k = 0; k < K; k++) {
        const y = g + (small ? 0.35 + k * 0.32 : 0.6 + k * 0.72);
        const c = Math.cos(yaw), s = Math.sin(yaw);
        const off = d / 2 + 0.02;
        b.add(new THREE.BoxGeometry(w * 0.5, 0.05, 0.04), mat(x + off * s, y, z + off * c, 0, yaw, 0), '#4a463f');
      }
      ctx.col.circle(x, z, Math.max(w, d) * 0.55, g - 1, g + hgt);
      const bandMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 1.6, 1.4), fog: false });
      const band = new THREE.Mesh(small ? tBandGeo : bandGeo, bandMat);
      band.rotation.y = yaw;
      band.position.set(x, g + 1, z);
      ctx.scene.add(band);
      return { x, z, g, yaw, band, bandMat, small, y: 0, shake: 0 };
    };
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + 0.2;
      const x = RING_C.x + Math.sin(a) * RING_R, z = RING_C.z + Math.cos(a) * RING_R;
      const yaw = a; // inner face (+z local) faces outward, so flip
      const S = make(x, z, yaw + Math.PI, 1.3, 4.0 + rng() * 0.8, 0.95, false, i);
      S.i = i;
      this.stones.push(S);
      const inner = new THREE.Vector3(RING_C.x + Math.sin(a) * (RING_R - 1.3), base + 1.0, RING_C.z + Math.cos(a) * (RING_R - 1.3));
      ctx.interact.push({
        pos: inner,
        prompt: new THREE.Vector3(x, S.g + 2.0, z).lerp(inner, 0.4),
        reach: 2.0,
        can: () => !this.solved,
        press: () => this.press(i),
        puzzle: true,
      });
    }
    // tutorial: three small stones in a row, facing the ring
    const toRing = Math.atan2(RING_C.x - RTUT.x, RING_C.z - RTUT.z);
    for (let i = 0; i < 3; i++) {
      const lx = (i - 1) * 2.2;
      const c = Math.cos(toRing), s = Math.sin(toRing);
      const x = RTUT.x + lx * c, z = RTUT.z - lx * s;
      const S = make(x, z, toRing, 0.8, 2.1, 0.6, true, 20 + i);
      S.i = i;
      this.tStones.push(S);
      const front = new THREE.Vector3(x + s * 1.1, S.g + 0.8, z + c * 1.1);
      ctx.interact.push({
        pos: front,
        prompt: new THREE.Vector3(x, S.g + 1.6, z).lerp(front, 0.5),
        reach: 1.5,
        can: () => !this.tutDone,
        press: () => this.pressTut(i),
        puzzle: true,
      });
    }
    // ripple ring on the ground
    this.ripple = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.0, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 1.4, 1.2), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.ripple.visible = false;
    this.rippleT = 1;
    ctx.scene.add(this.ripple);
    this.tutPos = new THREE.Vector3(RTUT.x, groundH(RTUT.x, RTUT.z), RTUT.z);
    this.hintPos = this.center.clone();
    this.zone = [{ x: RING_C.x, z: RING_C.z, r: RING_R + 3 }, { x: RTUT.x, z: RTUT.z, r: 5 }];
    this.time = 0;
  }
  _apply(state, sets, i) {
    for (const j of sets[i]) state[j] = (state[j] + 1) % K;
  }
  _rip(S) {
    this.ripple.position.set(S.x, S.g + 0.08, S.z);
    this.rippleT = 0;
    this.ripple.visible = true;
  }
  press(i) {
    this._apply(this.state, this.sets, i);
    for (const j of this.sets[i]) this.stones[j].shake = 0.4;
    this._rip(this.stones[i]);
    this.ctx.audio.stonePress(new THREE.Vector3(this.stones[i].x, this.stones[i].g + 1, this.stones[i].z));
    this.ctx.audio.setHum(this.stones.map((s, k) => freqOf(this.state[k], false)), false);
    if (this.state.every((v) => v === this.state[0])) {
      this.solved = true;
      this.ctx.audio.humSolved(true);
      this.ctx.addTimer(1.2, () => this.ctx.onSolved(1));
    }
    this.ctx.requestSave();
  }
  pressTut(i) {
    this._apply(this.tState, this.tSets, i);
    for (const j of this.tSets[i]) this.tStones[j].shake = 0.3;
    this._rip(this.tStones[i]);
    this.ctx.audio.stonePress(new THREE.Vector3(this.tStones[i].x, this.tStones[i].g + 1, this.tStones[i].z), 0.6);
    this.ctx.audio.setHum(this.tStones.map((s, k) => freqOf(this.tState[k], true)), true);
    if (this.tState.every((v) => v === this.tState[0])) {
      this.tutDone = true;
      this.ctx.audio.humSolved(false, true);
      this.ctx.addTimer(0.5, () => this.ctx.audio.success(this.tutPos, 0.5));
    }
    this.ctx.requestSave();
  }
  registerAudio() {
    const a = this.ctx.audio;
    a.makeHum(this.stones.map((s, k) => ({ pos: new THREE.Vector3(s.x, s.g + 2, s.z), f: freqOf(this.state[k], false) })), false);
    a.makeHum(this.tStones.map((s, k) => ({ pos: new THREE.Vector3(s.x, s.g + 1, s.z), f: freqOf(this.tState[k], true) })), true);
    if (this.solved) a.humSolved(true);
    if (this.tutDone) a.humSolved(false, true);
  }
  _bands(list, state, done, dt) {
    const t = this.time;
    const fs = list.map((s, k) => freqOf(state[k], s.small));
    const mean = fs.reduce((a, b) => a + b, 0) / fs.length;
    list.forEach((S, k) => {
      const target = S.small ? 0.35 + state[k] * 0.32 : 0.6 + state[k] * 0.72;
      S.y = damp(S.y || target, target, 7, dt);
      S.shake = Math.max(0, S.shake - dt);
      const sh = Math.sin(t * 60) * S.shake * 0.04;
      S.band.position.set(S.x + sh, S.g + S.y, S.z);
      // the band flickers at the beat between its pitch and the chord: steady when in tune
      const beat = Math.abs(fs[k] - mean);
      const flick = done ? 1 : 0.62 + 0.38 * Math.cos(t * Math.PI * 2 * beat);
      if (done) S.bandMat.color.setRGB(3.2, 2.4, 0.9);
      else S.bandMat.color.setRGB(0.3 * flick, 1.7 * flick, 1.45 * flick);
    });
  }
  update(dt, time, playerPos) {
    this.time = time;
    this._bands(this.stones, this.state, this.solved, dt);
    this._bands(this.tStones, this.tState, this.tutDone, dt);
    if (this.rippleT < 1) {
      this.rippleT += dt / 1.2;
      const s = 1 + this.rippleT * 6;
      this.ripple.scale.set(s, 1, s);
      this.ripple.material.opacity = (1 - this.rippleT) * 0.9;
      if (this.rippleT >= 1) this.ripple.visible = false;
    }
    const d = Math.hypot(playerPos.x - RING_C.x, playerPos.z - RING_C.z);
    const inside = d < RING_R - 0.6 ? 1 : Math.max(0, 1 - (d - RING_R + 0.6) / 18) * 0.25;
    this.ctx.audio.humLevel(inside, Math.max(0, 1 - Math.hypot(playerPos.x - RTUT.x, playerPos.z - RTUT.z) / 14));
  }
  save() {
    return { s: this.state.slice(), ts: this.tState.slice(), tutDone: this.tutDone, solved: this.solved };
  }
  load(o) {
    if (!o) return;
    if (Array.isArray(o.s) && o.s.length === 7) this.state = o.s.map((v) => v % K);
    if (Array.isArray(o.ts) && o.ts.length === 3) this.tState = o.ts.map((v) => v % K);
    this.tutDone = !!o.tutDone;
    this.solved = !!o.solved;
  }
}
