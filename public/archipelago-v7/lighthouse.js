// The great lighthouse (hard red/white bands). Puzzle: eight shuttered windows ring the platform, each framing a
// direction across the sea. Open exactly those that face a burning beacon, then pull the lever. A wrong answer
// slams every shutter and the lever creeps back up. A small lantern with four shutters facing four torches
// (two burning) teaches it.
import * as THREE from './three.module.min.js';
import { GeoBuilder, mat, makeStaticMesh, sceneryMat, damp } from './util.js';
import { SPOT } from './layout.js';
import { groundAt } from './terrain.js';
import { addCircle, addBox } from './colliders.js';
import { exclude } from './foliage.js';
import { addBrazier, Fire } from './fire.js';

const DECOYS = [100, 128, 285, 310];
const LOCK = 8;
const TUT_ANG = [20, 110, 200, 290];
const TUT_LIT = [false, true, true, false];

export class Lighthouse {
  constructor(ctx, beaconWorld) {
    this.ctx = ctx;
    const [cx, cz] = SPOT.tower;
    this.cx = cx; this.cz = cz;
    const base = groundAt(cx, cz);
    this.base = base;
    const b = new GeoBuilder({ seed: 51 });
    this.areas = [{ x: cx, z: cz, r: 10 }, { x: cx - 1.3, z: cz - 14.9, r: 4 }];
    exclude(cx, cz, 11);

    // ---- tower: plinth, eight hard bands, gallery, lantern room, cap
    b.cyl(5.0, 5.3, 1.2, 16, mat(cx, base + 0.6, cz), '#8f877a', { flat: true });
    const H = 26, bands = 8, r0 = 4.0, r1 = 2.8, y0 = base + 1.2;
    for (let i = 0; i < bands; i++) {
      const ta = i / bands, tb = (i + 1) / bands;
      const ra = r0 + (r1 - r0) * ta, rb = r0 + (r1 - r0) * tb;
      const h = H / bands;
      b.cyl(rb, ra, h, 24, mat(cx, y0 + h * (i + 0.5), cz), i % 2 ? '#f4efe4' : '#c8322a', {});
    }
    const gy = y0 + H;
    b.cyl(3.7, 3.0, 0.5, 20, mat(cx, gy + 0.25, cz), '#3a3634', { flat: true });
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      b.box(0.08, 1.0, 0.08, mat(cx + Math.cos(a) * 3.5, gy + 1.0, cz + Math.sin(a) * 3.5), '#2a2624');
    }
    const rail = new THREE.TorusGeometry(3.5, 0.06, 4, 32); rail.rotateX(Math.PI / 2);
    b.add(rail, mat(cx, gy + 1.5, cz), '#2a2624', {}); rail.dispose();
    b.cyl(2.2, 2.2, 0.5, 16, mat(cx, gy + 0.75, cz), '#c8322a', { flat: true });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      b.box(0.12, 2.6, 0.12, mat(cx + Math.cos(a) * 2.05, gy + 2.3, cz + Math.sin(a) * 2.05), '#2a2624');
    }
    b.cyl(0.4, 2.5, 1.6, 16, mat(cx, gy + 4.4, cz), '#8c241f', { flat: true });
    b.ico(0.35, 1, mat(cx, gy + 5.4, cz), '#2a2624');
    this.topY = gy + 1.4;
    // glass of the lantern room (emissive when lit)
    this.glassMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.25, 0.32, 0.38), transparent: true, opacity: 0.55, depthWrite: false });
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.0, 2.6, 16, 1, true), this.glassMat);
    glass.position.set(cx, gy + 2.3, cz);
    glass.renderOrder = 3;
    ctx.scene.add(glass);
    // door and small windows
    const doorA = (205 * Math.PI) / 180;
    b.box(0.3, 2.4, 1.4, mat(cx + Math.cos(doorA) * 4.0, base + 2.4, cz + Math.sin(doorA) * 4.0, 0, -doorA, 0), '#3a2a22');
    b.box(0.35, 0.2, 1.7, mat(cx + Math.cos(doorA) * 4.02, base + 3.65, cz + Math.sin(doorA) * 4.02, 0, -doorA, 0), '#8f877a');
    for (let i = 0; i < 5; i++) {
      const a = doorA + 1.2 + i * 1.3, y = y0 + 4 + i * 4.2;
      const r = r0 + (r1 - r0) * ((y - y0) / H) + 0.02;
      b.box(0.1, 0.8, 0.5, mat(cx + Math.cos(a) * r, y, cz + Math.sin(a) * r, 0, -a, 0), '#2a2420');
    }
    addCircle(cx, cz, 5.4, base - 2, gy + 6);

    // ---- shutters: four face the other beacons, four face open sea
    const angs = [];
    for (const p of beaconWorld) angs.push({ a: Math.atan2(p.z - cz, p.x - cx), beacon: true });
    for (const d of DECOYS) angs.push({ a: (d * Math.PI) / 180, beacon: false });
    angs.sort((p, q) => ((p.a + 6.283) % 6.283) - ((q.a + 6.283) % 6.283));
    this.shutters = angs.map((o) => ({ a: o.a, want: o.beacon, open: false, shown: 0, tut: false }));
    const SR = 7.6;
    for (const sh of this.shutters) this.addFrame(b, cx, cz, SR, sh.a, 1, sh);
    // lever and the base brazier (where the lighthouse is lit)
    const lvA = (188 * Math.PI) / 180, brA = (222 * Math.PI) / 180;
    this.leverPos = new THREE.Vector3(cx + Math.cos(lvA) * 5.9, base + 1.2, cz + Math.sin(lvA) * 5.9);
    b.box(0.6, 0.6, 0.6, mat(this.leverPos.x, base + 0.3, this.leverPos.z), '#7a6a52');
    addCircle(this.leverPos.x, this.leverPos.z, 0.45, base - 1, base + 1.6, { cam: false });
    const lb = new GeoBuilder();
    lb.box(0.12, 1.4, 0.12, mat(0, 0.7, 0), '#5a4030');
    lb.ico(0.16, 1, mat(0, 1.45, 0), '#c8322a');
    this.leverMesh = new THREE.Mesh(lb.build(), sceneryMat());
    this.leverMesh.position.set(this.leverPos.x, base + 0.6, this.leverPos.z);
    this.leverMesh.rotation.order = 'YXZ';
    this.leverMesh.rotation.y = lvA + Math.PI / 2;
    ctx.scene.add(this.leverMesh);
    const bx = cx + Math.cos(brA) * 5.9, bz = cz + Math.sin(brA) * 5.9;
    const fy = addBrazier(b, bx, groundAt(bx, bz), bz, false);
    this.brazierPos = new THREE.Vector3(bx, fy, bz);
    addCircle(bx, bz, 0.9, base - 1, base + 3);
    this.beaconPos = new THREE.Vector3(cx, this.topY, cz);
    this.lever = 0; this.lock = 0; this.solved = false;

    // ---- tutorial: small lantern, four mini shutters, four torches (two lit)
    const tx = cx - 1.3, tz = cz - 14.9;
    const ty = groundAt(tx, tz);
    exclude(tx, tz, 7.5);
    b.cyl(0.25, 0.32, 1.0, 8, mat(tx, ty + 0.5, tz), '#8f877a', { flat: true });
    b.box(0.34, 0.06, 0.34, mat(tx, ty + 1.05, tz), '#3a3028');
    b.box(0.34, 0.06, 0.34, mat(tx, ty + 1.45, tz), '#3a3028');
    this.tLantern = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.36, 0.26), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 1.6, 0.6) }));
    this.tLantern.position.set(tx, ty + 1.25, tz);
    ctx.scene.add(this.tLantern);
    addCircle(tx, tz, 0.4, ty - 1, ty + 1.6, { cam: false });
    this.tShutters = TUT_ANG.map((d, i) => ({ a: (d * Math.PI) / 180, want: TUT_LIT[i], open: false, shown: 0, tut: true }));
    for (const sh of this.tShutters) this.addFrame(b, tx, tz, 1.7, sh.a, 0.5, sh);
    this.torchFires = [];
    TUT_ANG.forEach((d, i) => {
      const a = (d * Math.PI) / 180;
      const x = tx + Math.cos(a) * 6.2, z = tz + Math.sin(a) * 6.2;
      const y = groundAt(x, z);
      b.cyl(0.08, 0.11, 1.9, 6, mat(x, y + 0.95, z), '#5a4030');
      b.cyl(0.26, 0.12, 0.3, 8, mat(x, y + 2.0, z), '#2a2420', { flat: true });
      addCircle(x, z, 0.25, y - 1, y + 2.2, { cam: false });
      if (TUT_LIT[i]) {
        const f = new Fire(ctx.scene, new THREE.Vector3(x, y + 2.1, z), { scale: 0.32, embers: 14 });
        f.setIntensity(1);
        this.torchFires.push(f);
      }
    });
    const tla = (335 * Math.PI) / 180;
    this.tLeverPos = new THREE.Vector3(tx + Math.cos(tla) * 3.0, ty + 0.8, tz + Math.sin(tla) * 3.0);
    b.box(0.35, 0.35, 0.35, mat(this.tLeverPos.x, ty + 0.17, this.tLeverPos.z), '#7a6a52');
    addCircle(this.tLeverPos.x, this.tLeverPos.z, 0.3, ty - 1, ty + 1, { cam: false });
    const tlb = new GeoBuilder();
    tlb.box(0.07, 0.8, 0.07, mat(0, 0.4, 0), '#5a4030');
    tlb.ico(0.1, 1, mat(0, 0.82, 0), '#c8322a');
    this.tLeverMesh = new THREE.Mesh(tlb.build(), sceneryMat());
    this.tLeverMesh.position.set(this.tLeverPos.x, ty + 0.35, this.tLeverPos.z);
    this.tLeverMesh.rotation.order = 'YXZ';
    this.tLeverMesh.rotation.y = tla + Math.PI / 2;
    ctx.scene.add(this.tLeverMesh);
    this.tLever = 0; this.tLock = 0; this.tSolved = false;

    // shutter panels (instanced)
    const pb = new GeoBuilder();
    for (let i = 0; i < 4; i++) pb.box(0.38, 2.0, 0.08, mat(0.2 + i * 0.4, 0, 0), i % 2 ? '#3f6f8f' : '#477aa0', { jitter: 0.06 });
    pb.box(1.6, 0.12, 0.1, mat(0.8, 0.6, 0.02), '#2e4a60');
    pb.box(1.6, 0.12, 0.1, mat(0.8, -0.6, 0.02), '#2e4a60');
    const all = this.shutters.concat(this.tShutters);
    this.panels = new THREE.InstancedMesh(pb.build(), sceneryMat(), all.length);
    this.panels.castShadow = true;
    ctx.scene.add(this.panels);
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(); this._p = new THREE.Vector3(); this._up = new THREE.Vector3(0, 1, 0);
    this.static = makeStaticMesh(b);
    ctx.scene.add(this.static);
  }

  addFrame(b, cx, cz, R, a, s, sh) {
    const x = cx + Math.cos(a) * R, z = cz + Math.sin(a) * R;
    const y = groundAt(x, z);
    const tx = -Math.sin(a), tz = Math.cos(a); // tangent
    const w = 0.95 * s;
    for (const sd of [-1, 1]) {
      b.box(0.36 * s, 2.6 * s, 0.5 * s, mat(x + tx * w * sd, y + 1.3 * s, z + tz * w * sd, 0, -a, 0), '#9a8f7c', { flat: true });
      addCircle(x + tx * w * sd, z + tz * w * sd, 0.3 * s, y - 1, y + 2.6 * s, { cam: s > 0.6 });
    }
    b.box(0.6 * s, 0.3 * s, 2.4 * s, mat(x, y + 2.7 * s, z, 0, -a, 0), '#8a7f6a');
    b.box(0.5 * s, 0.2 * s, 1.9 * s, mat(x, y + 0.1 * s, z, 0, -a, 0), '#8a7f6a');
    // hinge at one post; the panel spans the opening when closed and swings outward when open
    sh.hinge = new THREE.Vector3(x - tx * (w - 0.18 * s), y + 1.3 * s, z - tz * (w - 0.18 * s));
    sh.pos = new THREE.Vector3(x - Math.cos(a) * 0.9 * s, y + 1.3 * s, z - Math.sin(a) * 0.9 * s); // stand inside to use
    sh.s = s;
    // a closed panel blocks walking through the frame
    sh.col = addBox(x, z, 0.2, w, a, y - 1, y + 2.4 * s, { cam: false });
  }

  interactables() {
    const out = [];
    for (const sh of this.shutters) out.push({ pos: sh.pos, r: 1.7, can: () => !this.solved && this.lock <= 0, use: () => this.toggle(sh) });
    for (const sh of this.tShutters) out.push({ pos: sh.pos, r: 0.95, can: () => !this.tSolved && this.tLock <= 0, use: () => this.toggle(sh) });
    out.push({ pos: this.leverPos, r: 1.7, can: () => !this.solved && this.lock <= 0, use: () => this.commit(false) });
    out.push({ pos: this.tLeverPos, r: 1.2, can: () => !this.tSolved && this.tLock <= 0, use: () => this.commit(true) });
    return out;
  }

  toggle(sh) {
    sh.open = !sh.open;
    this.ctx.audio.clack(sh.pos);
    this.ctx.save();
  }

  commit(tut) {
    const list = tut ? this.tShutters : this.shutters;
    const pos = tut ? this.tLeverPos : this.leverPos;
    if (tut) this.tLever = 1; else this.lever = 1;
    this.ctx.audio.clack(pos);
    const ok = list.every((s) => s.open === s.want);
    if (ok) {
      if (tut) { this.tSolved = true; this.ctx.audio.chime(988, pos, 0.3); }
      else {
        this.solved = true;
        this.ctx.audio.chime(523, pos, 0.35);
        this.ctx.onSolved(this.shutters.filter((s) => s.want).map((s) => s.pos));
      }
    } else {
      for (const s of list) s.open = false;
      if (tut) this.tLock = 3; else this.lock = LOCK;
      this.ctx.audio.thunk(pos);
      setTimeout(() => this.ctx.audio.clack(pos), 120);
    }
    this.ctx.save();
  }

  update(dt, time, night) {
    this.lock = Math.max(0, this.lock - dt);
    this.tLock = Math.max(0, this.tLock - dt);
    this.lever = Math.max(0, this.lever - dt * (this.lock > 0 ? 1 / LOCK : 1.5));
    if (this.solved) this.lever = 1;
    this.tLever = Math.max(0, this.tLever - dt * (this.tLock > 0 ? 1 / 3 : 1.5));
    if (this.tSolved) this.tLever = 1;
    this.leverMesh.rotation.x = 0.5 - 1.1 * Math.min(1, this.lever * 1.4);
    this.tLeverMesh.rotation.x = 0.5 - 1.1 * Math.min(1, this.tLever * 1.4);
    const all = this.shutters.concat(this.tShutters);
    all.forEach((sh, i) => {
      const slam = sh.tut ? this.tLock > 0 : this.lock > 0;
      sh.shown = damp(sh.shown, sh.open ? 1 : 0, slam ? 14 : 7, dt);
      // panel rotates about the hinge: closed = along tangent, open = swung outward
      const ang = -(sh.a + Math.PI / 2) + sh.shown * 1.75;
      this._q.setFromAxisAngle(this._up, ang);
      const s = sh.s;
      this._m.compose(sh.hinge, this._q, this._s.set(s * 1.0, s, s));
      this.panels.setMatrixAt(i, this._m);
      // open frames let you walk/look through
      sh.col.y1 = sh.open ? -100 : sh.col.y0 + 100;
    });
    this.panels.instanceMatrix.needsUpdate = true;
  }

  setLit(level) {
    const g = 0.3 + level * 4.5;
    this.glassMat.color.setRGB(g * 1.0, g * 0.75, g * 0.4);
    this.glassMat.opacity = 0.55 + level * 0.3;
  }

  getState() { return { open: this.shutters.map((s) => s.open), solved: this.solved, tOpen: this.tShutters.map((s) => s.open), tSolved: this.tSolved }; }
  setState(st) {
    if (!st) return;
    (st.open || []).forEach((v, i) => { if (this.shutters[i]) { this.shutters[i].open = v; this.shutters[i].shown = v ? 1 : 0; } });
    (st.tOpen || []).forEach((v, i) => { if (this.tShutters[i]) { this.tShutters[i].open = v; this.tShutters[i].shown = v ? 1 : 0; } });
    this.solved = !!st.solved; this.tSolved = !!st.tSolved;
  }
}
