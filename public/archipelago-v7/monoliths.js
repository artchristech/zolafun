// Ring of barnacled monoliths that hum when you stand inside. Each stone has a sliding glowing collar on
// five carved notches; its hum pitch follows the collar. Pressing a stone moves it AND its two neighbours.
// Tuned when all collars sit level and the chord becomes one pure note (the glow stops beating, links light).
import * as THREE from './three.module.min.js';
import { GeoBuilder, mat, makeStaticMesh, mulberry32, smoothstep, clamp } from './util.js';
import { SPOT } from './layout.js';
import { groundAt } from './terrain.js';
import { addCircle } from './colliders.js';
import { exclude } from './foliage.js';
import { addBrazier } from './fire.js';

const PITCH = [98.0, 103.83, 110.0, 116.54, 123.47];
const START = [2, 3, 4, 4, 2, 2, 0]; // six presses from tuned, needs four different stones
const TUT_START = [4, 2, 3, 2]; // three presses from tuned
const MOVE_T = 1.15;

class Ring {
  constructor(owner, cx, cz, n, radius, scale, start, b, rng, phase0) {
    this.owner = owner;
    this.n = n;
    this.cx = cx; this.cz = cz;
    this.radius = radius;
    this.scale = scale;
    this.state = start.slice();
    this.shown = start.slice(); // animated collar positions
    this.anim = 0;
    this.solved = false;
    this.stones = [];
    const y0 = groundAt(cx, cz);
    this.y0 = y0;
    for (let i = 0; i < n; i++) {
      const a = phase0 + (i / n) * Math.PI * 2;
      const x = cx + Math.cos(a) * radius, z = cz + Math.sin(a) * radius;
      const y = groundAt(x, z);
      const lean = (rng() - 0.5) * 0.06;
      const H = 4.4 * scale, Wd = 1.3 * scale, D = 0.9 * scale;
      const rot = -a + Math.PI / 2;
      b.box(Wd, H, D, mat(x, y + H / 2 - 0.2, z, lean, rot, lean * 0.5), '#7c7f7a', { jitter: 0.1, top: '#6d8a5a' });
      b.box(Wd * 0.85, 0.5 * scale, D * 0.85, mat(x, y + H - 0.1, z, lean, rot + 0.1, 0), '#8a8c86', { flat: true });
      // carved notches facing the centre: five grooves
      const ix = -Math.cos(a), iz = -Math.sin(a);
      for (let k = 0; k < 5; k++) {
        const ny = y + this.notchY(k);
        b.box(Wd * 1.02, 0.07 * scale, D * 1.04, mat(x, ny, z, 0, rot, 0), '#3d403d');
      }
      // barnacles and weed at the foot
      for (let k = 0; k < 14; k++) {
        const ba = rng() * Math.PI * 2;
        const bx = x + Math.cos(ba) * Wd * 0.62, bz = z + Math.sin(ba) * D * 0.62;
        const by = y + rng() * 1.4 * scale;
        b.cyl(0.02, 0.09 * scale, 0.12 * scale, 5, mat(bx, by, bz, rng(), rng() * 3, rng()), rng() < 0.5 ? '#e6e1d4' : '#bdb7a8', { flat: true });
      }
      b.box(Wd * 1.05, 0.9 * scale, D * 1.05, mat(x, y + 0.25, z, 0, rot, 0), '#3f5a3a', { jitter: 0.2 });
      addCircle(x, z, 0.85 * scale, y - 1, y + H);
      this.stones.push({ x, y, z, a, ix, iz, pos: new THREE.Vector3(x + ix * 0.9 * scale, y + 1.6 * scale, z + iz * 0.9 * scale), loop: null });
    }
    // centre altar
    b.cyl(1.2 * scale, 1.4 * scale, 0.5, 12, mat(cx, y0 + 0.2, cz), '#8c8a82', { flat: true });
    b.cyl(0.9 * scale, 0.9 * scale, 0.52, 12, mat(cx, y0 + 0.22, cz), '#5d6a6a', {});
  }

  notchY(k) { return (0.75 + k * 0.72) * this.scale; }

  press(i) {
    if (this.anim > 0 || this.solved) return;
    for (const d of [-1, 0, 1]) {
      const j = (i + d + this.n) % this.n;
      this.state[j] = (this.state[j] + 1) % 5;
      this.owner.ctx.audio.grind(this.stones[j].pos);
    }
    this.anim = MOVE_T;
  }

  tuned() { return this.state.every((v) => v === this.state[0]); }

  update(dt) {
    if (this.anim > 0) {
      this.anim -= dt;
      const k = 1 - Math.exp(-dt * 6);
      for (let i = 0; i < this.n; i++) {
        let tgt = this.state[i];
        // wrap 4 -> 0 slides down through the notches visibly
        this.shown[i] += (tgt - this.shown[i]) * k;
      }
      if (this.anim <= 0) {
        this.anim = 0;
        for (let i = 0; i < this.n; i++) this.shown[i] = this.state[i];
        return true; // finished a move
      }
    }
    return false;
  }

  freq(i) {
    // continuous pitch from the shown collar height
    const s = clamp(this.shown[i], 0, 4);
    const k = Math.floor(s), f = s - k;
    return PITCH[k] + (PITCH[Math.min(4, k + 1)] - PITCH[k]) * f;
  }
}

export class Monoliths {
  constructor(ctx) {
    this.ctx = ctx;
    const [cx, cz] = SPOT.ring;
    const [tx, tz] = SPOT.ringTut;
    this.areas = [{ x: cx, z: cz, r: 11 }, { x: tx, z: tz, r: 4.5 }];
    const b = new GeoBuilder({ seed: 21 });
    const rng = mulberry32(77);
    this.ring = new Ring(this, cx, cz, 7, 7, 1, START, b, rng, 0.2);
    this.tut = new Ring(this, tx, tz, 4, 2.0, 0.5, TUT_START, b, rng, 0.4);
    exclude(cx, cz, 11);
    exclude(tx, tz, 4);
    // beacon
    const [bx, bz] = SPOT.beaconM;
    const by = groundAt(bx, bz);
    this.fireY = addBrazier(b, bx, by, bz, true);
    this.beaconPos = new THREE.Vector3(bx, this.fireY, bz);
    addCircle(bx, bz, 1.1, by - 1, by + 4);
    exclude(bx, bz, 5);
    this.static = makeStaticMesh(b);
    ctx.scene.add(this.static);

    // collars (instanced, glowing) and links between neighbours (instanced)
    const total = 11;
    this.collars = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), total);
    this.links = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), total);
    for (let i = 0; i < total; i++) { this.collars.setColorAt(i, new THREE.Color(1, 1, 1)); this.links.setColorAt(i, new THREE.Color(1, 1, 1)); }
    ctx.scene.add(this.collars);
    ctx.scene.add(this.links);
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(); this._p = new THREE.Vector3(); this._c = new THREE.Color();
    this.linkGlow = new Array(total).fill(0);
    // hum voices: one per stone
    for (const r of [this.ring, this.tut]) for (const s of r.stones) s.loop = ctx.audio.addLoop('hum', s.pos, PITCH[0]);
  }

  get solved() { return this.ring.solved; }

  interactables() {
    const out = [];
    this.ring.stones.forEach((s, i) => out.push({ pos: s.pos, r: 2.0, can: () => !this.ring.solved && this.ring.anim <= 0, use: () => this.ring.press(i) }));
    this.tut.stones.forEach((s, i) => out.push({ pos: s.pos, r: 1.25, can: () => !this.tut.solved && this.tut.anim <= 0, use: () => this.tut.press(i) }));
    return out;
  }

  update(dt, time, night, water, playerPos) {
    for (const r of [this.ring, this.tut]) {
      if (r.update(dt) && r.tuned() && !r.solved) {
        r.solved = true;
        const A = this.ctx.audio;
        if (r === this.ring) { this.ctx.onSolved(r.stones.map((s) => s.pos)); }
        else A.chime(523, r.stones[0].pos, 0.3);
        this.ctx.save();
      }
    }
    let idx = 0, li = 0;
    for (const r of [this.ring, this.tut]) {
      const sc = r.scale;
      // hum loudness: strong inside the ring, faint outside
      const d = Math.hypot(playerPos.x - r.cx, playerPos.z - r.cz);
      const inside = 1 - smoothstep(r.radius + 0.6 * sc, r.radius + 6 * sc, d);
      const far = 0.12 * (1 - smoothstep(r.radius + 6, r.radius + 40, d));
      for (let i = 0; i < r.n; i++) {
        const s = r.stones[i];
        const f = r.freq(i);
        s.loop.freq = f;
        s.loop.level = (r.solved ? 1.2 : 1) * Math.max(inside, far) * (r === this.tut ? 0.7 : 1);
        // visual beating: glow pulses at the beat rate against neighbours
        const fl = r.freq((i - 1 + r.n) % r.n), fr = r.freq((i + 1) % r.n);
        const beat = Math.min(9, Math.abs(f - fl) + Math.abs(f - fr));
        const pulse = beat < 0.05 ? 1 : 0.55 + 0.45 * Math.cos(time * Math.PI * 2 * beat * 0.5);
        const glow = (r.solved ? 3.2 : 1.4 + night * 1.2) * pulse * (0.35 + 0.65 * Math.max(inside, 0.4));
        this._c.setRGB(0.25 * glow, 1.0 * glow, 0.85 * glow);
        if (r.solved) this._c.setRGB(1.0 * glow, 0.8 * glow, 0.35 * glow);
        const y = s.y + r.notchY(clamp(r.shown[i], 0, 4)) + 0.0;
        this._q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -s.a + Math.PI / 2);
        this._m.compose(this._p.set(s.x, y, s.z), this._q, this._s.set(1.42 * sc, 0.26 * sc, 1.02 * sc));
        this.collars.setMatrixAt(idx, this._m);
        this.collars.setColorAt(idx, this._c);
        idx++;
        // link to next stone (lit when level with it)
        const n = r.stones[(i + 1) % r.n];
        const same = Math.abs(r.shown[i] - r.shown[(i + 1) % r.n]) < 0.08;
        this.linkGlow[li] += ((same ? 1 : 0) - this.linkGlow[li]) * Math.min(1, dt * 5);
        const lg = this.linkGlow[li];
        const mx = (s.x + n.x) / 2, mz = (s.z + n.z) / 2;
        const len = Math.hypot(n.x - s.x, n.z - s.z) - 1.2 * sc;
        const ang = Math.atan2(n.z - s.z, n.x - s.x);
        this._q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -ang);
        this._m.compose(this._p.set(mx, groundAt(mx, mz) + 0.04, mz), this._q, this._s.set(len * Math.max(0.02, lg), 0.06, 0.16 * sc));
        this.links.setMatrixAt(li, this._m);
        const lgc = (r.solved ? 4 : 2.2) * lg;
        this._c.setRGB(0.3 * lgc, 1.0 * lgc, 0.85 * lgc);
        this.links.setColorAt(li, this._c);
        li++;
      }
    }
    this.collars.instanceMatrix.needsUpdate = true;
    this.collars.instanceColor.needsUpdate = true;
    this.links.instanceMatrix.needsUpdate = true;
    this.links.instanceColor.needsUpdate = true;
  }

  getState() { return { s: this.ring.state.slice(), solved: this.ring.solved, t: this.tut.state.slice(), tSolved: this.tut.solved }; }
  setState(st) {
    if (!st) return;
    if (st.s) { this.ring.state = st.s.slice(); this.ring.shown = st.s.slice(); }
    if (st.t) { this.tut.state = st.t.slice(); this.tut.shown = st.t.slice(); }
    this.ring.solved = !!st.solved; this.tut.solved = !!st.tSolved;
  }
}
