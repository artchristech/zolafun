// Fishing village of stilt houses. Puzzle: ring the house bells in the order of the
// coloured bands on the tide pole (bottom to top). Progress lamps climb the beacon.
import * as THREE from './three.module.min.js';
import {
  ISLANDS, HOUSES, COLORS, DECK_H, SEABED, VILLAGE_SEQ, TOTEM, VTUT, VTUT_COLORS, VTUT_SEQ, localToWorld,
} from './layout.js';
import { groundH, naturalH } from './ground.js';
import { mat, mul, damp, mulberry32 } from './util.js';

const BELL_PITCH = [523.25, 587.33, 659.25, 783.99, 880.0, 698.46]; // per colour

function bellGeometry(r, h) {
  const pts = [];
  const n = 8;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const rad = r * (0.45 + 0.55 * Math.pow(t, 1.8)) + (t > 0.92 ? r * 0.12 : 0);
    pts.push(new THREE.Vector2(rad, -t * h));
  }
  pts.unshift(new THREE.Vector2(0.001, 0.02));
  const g = new THREE.LatheGeometry(pts, 12);
  return g;
}

export class Village {
  constructor(ctx, beacon) {
    this.ctx = ctx;
    this.beacon = beacon;
    this.step = 0;
    this.lock = 0;
    this.flash = 0;
    this.tStep = 0;
    this.tLock = 0;
    this.tFlash = 0;
    this.tutDone = false;
    this.solved = false;
    this.bells = [];
    const b = ctx.batch(0);
    const rng = mulberry32(5);
    const wood = '#a87c50', wetWood = '#5e4430', plank = '#b98d5c';
    for (const h of HOUSES) {
      const M0 = mat(h.x, 0, h.z, 0, h.yaw, 0);
      const add = (geo, lx, ly, lz, color, rx = 0, ry = 0, rz = 0, opt = {}) => b.add(geo, mul(M0, mat(lx, ly, lz, rx, ry, rz)), color, opt);
      const stiltLen = DECK_H - SEABED;
      for (const [sx, sz] of [[-3.3, -3.3], [3.3, -3.3], [-3.3, 3.3], [3.3, 3.3], [0, -3.3], [-3.3, 0], [3.3, 0]]) {
        add(new THREE.CylinderGeometry(0.17, 0.22, stiltLen, 6), sx, SEABED + stiltLen / 2, sz, wetWood);
      }
      add(new THREE.BoxGeometry(7.2, 0.28, 7.2), 0, DECK_H - 0.14, 0, plank);
      for (let i = -3; i <= 3; i++) add(new THREE.BoxGeometry(0.05, 0.02, 7.1), i, DECK_H + 0.005, 0, '#8a6440');
      const body = h.i % 2 ? '#e8dcc6' : '#b88f62';
      add(new THREE.BoxGeometry(4.4, 3.0, 4.2), 0, DECK_H + 1.5, -0.6, body, 0, 0, 0, { flat: true });
      add(new THREE.ConeGeometry(3.55, 2.0, 4), 0, DECK_H + 4.0, -0.6, COLORS[h.color], 0, Math.PI / 4, 0, { flat: true });
      add(new THREE.BoxGeometry(1.0, 1.9, 0.12), 0, DECK_H + 0.95, 1.52, '#4a3426');
      add(new THREE.BoxGeometry(0.75, 0.7, 0.1), -1.5, DECK_H + 1.8, 1.52, '#2b3546');
      add(new THREE.BoxGeometry(0.1, 0.7, 0.75), 2.22, DECK_H + 1.8, -0.6, '#2b3546');
      add(new THREE.BoxGeometry(0.1, 0.7, 0.75), -2.22, DECK_H + 1.8, -0.6, '#2b3546');
      add(new THREE.BoxGeometry(0.5, 1.2, 0.5), 1.3, DECK_H + 4.0, -1.2, '#8a7f74', 0, 0, 0, { flat: true });
      // railing (gap at the front for the walkway)
      for (const [x0, z0, x1, z1] of [[-3.5, -3.5, 3.5, -3.5], [-3.5, -3.5, -3.5, 3.5], [3.5, -3.5, 3.5, 3.5], [-3.5, 3.5, -1.3, 3.5], [1.3, 3.5, 3.5, 3.5]]) {
        const len = Math.hypot(x1 - x0, z1 - z0);
        const ry = Math.atan2(x1 - x0, z1 - z0);
        add(new THREE.BoxGeometry(0.1, 0.1, len), (x0 + x1) / 2, DECK_H + 0.95, (z0 + z1) / 2, wood, 0, ry, 0);
        const posts = Math.ceil(len / 1.7);
        for (let k = 0; k <= posts; k++) add(new THREE.BoxGeometry(0.12, 1.0, 0.12), x0 + ((x1 - x0) * k) / posts, DECK_H + 0.5, z0 + ((z1 - z0) * k) / posts, wood);
      }
      // walkway toward the village
      add(new THREE.BoxGeometry(2.4, 0.22, 13.2), 0, DECK_H - 0.11, 10.0, plank);
      for (let k = 0; k < 5; k++) {
        const lz = 4.5 + k * 2.8;
        const wp = localToWorld(h.x, h.z, h.yaw, 0, lz);
        const gh = naturalH(wp.x, wp.z);
        if (gh > DECK_H - 0.3) continue;
        for (const sx of [-1.1, 1.1]) add(new THREE.CylinderGeometry(0.12, 0.15, DECK_H - gh + 1, 5), sx, (DECK_H + gh - 1) / 2, lz, wetWood);
      }
      // nets drying, barrels
      add(new THREE.CylinderGeometry(0.35, 0.35, 0.8, 8), -2.6, DECK_H + 0.4, 2.4, '#7a5534');
      ctx.col.circle(...Object.values(localToWorld(h.x, h.z, h.yaw, -2.6, 2.4)), 0.4, DECK_H - 0.5, DECK_H + 1);
      // house collider + railing colliders
      const hc = localToWorld(h.x, h.z, h.yaw, 0, -0.6);
      ctx.col.box(hc.x, hc.z, 2.25, 2.15, h.yaw, DECK_H - 0.5, DECK_H + 5);
      // bell post on the front corner
      add(new THREE.BoxGeometry(0.2, 2.8, 0.2), 2.6, DECK_H + 1.4, 2.9, wood);
      add(new THREE.BoxGeometry(1.3, 0.16, 0.16), 2.05, DECK_H + 2.7, 2.9, wood);
      const bp = localToWorld(h.x, h.z, h.yaw, 1.55, 2.9);
      ctx.col.circle(...Object.values(localToWorld(h.x, h.z, h.yaw, 2.6, 2.9)), 0.2, DECK_H, DECK_H + 3);
      const bell = new THREE.Mesh(bellGeometry(0.36, 0.62), ctx.mats.toon(COLORS[h.color]));
      bell.position.set(bp.x, DECK_H + 2.62, bp.z);
      bell.castShadow = true;
      ctx.scene.add(bell);
      const B = { mesh: bell, swing: 0, vel: 0, color: h.color, house: h };
      this.bells.push(B);
      ctx.interact.push({
        pos: new THREE.Vector3(bp.x, DECK_H + 1.0, bp.z),
        prompt: new THREE.Vector3(bp.x, DECK_H + 2.1, bp.z),
        reach: 2.4,
        can: () => !this.solved && this.lock <= 0,
        press: () => this.ring(B),
        puzzle: true,
      });
    }

    // tide pole with coloured bands, bottom to top
    const tb = groundH(TOTEM.x, TOTEM.z);
    b.add(new THREE.CylinderGeometry(1.0, 1.2, 0.5, 8), mat(TOTEM.x, tb + 0.05, TOTEM.z), '#9b917f', { flat: true });
    b.add(new THREE.CylinderGeometry(0.3, 0.36, 7.4, 8), mat(TOTEM.x, tb + 3.7, TOTEM.z), '#7a5232');
    VILLAGE_SEQ.forEach((c, i) => {
      b.add(new THREE.CylinderGeometry(0.56, 0.56, 0.5, 12), mat(TOTEM.x, tb + 1.0 + i * 0.95, TOTEM.z), COLORS[c]);
    });
    // a carved beacon flame crowns the pole
    b.add(new THREE.ConeGeometry(0.45, 1.1, 6), mat(TOTEM.x, tb + 7.75, TOTEM.z), '#e8a63a', { flat: true });
    b.add(new THREE.CylinderGeometry(0.55, 0.4, 0.3, 8), mat(TOTEM.x, tb + 7.15, TOTEM.z), '#3c3632');
    ctx.col.circle(TOTEM.x, TOTEM.z, 0.7, tb - 1, tb + 8);

    // progress lamps on the beacon column, facing the village
    const lampGeo = new THREE.SphereGeometry(0.25, 8, 6);
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
    this.lamps = new THREE.InstancedMesh(lampGeo, lampMat, 6);
    const dirToV = new THREE.Vector2(ISLANDS[0].x - beacon.x, ISLANDS[0].z - beacon.z).normalize();
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < 6; i++) {
      const r = 0.82 - i * 0.025;
      m4.makeTranslation(beacon.x + dirToV.x * r, beacon.base + 0.75 + i * 0.52, beacon.z + dirToV.y * r);
      this.lamps.setMatrixAt(i, m4);
      this.lamps.setColorAt(i, new THREE.Color(0.1, 0.08, 0.06));
      b.add(new THREE.TorusGeometry(0.28, 0.06, 4, 10), mat(beacon.x + dirToV.x * (r - 0.02), beacon.base + 0.75 + i * 0.52, beacon.z + dirToV.y * (r - 0.02), 0, Math.atan2(dirToV.x, dirToV.y), 0), '#3c3632');
    }
    this.lamps.instanceMatrix.needsUpdate = true;
    this.lamps.computeBoundingSphere();
    ctx.scene.add(this.lamps);

    // ---- tutorial: a little rack of three bells and a short pole beside the beacon
    const yaw = Math.atan2(ISLANDS[0].x - VTUT.x, ISLANDS[0].z - VTUT.z);
    const tg = groundH(VTUT.x, VTUT.z);
    const T0 = mat(VTUT.x, tg, VTUT.z, 0, yaw, 0);
    const tadd = (geo, lx, ly, lz, color, opt) => b.add(geo, mul(T0, mat(lx, ly, lz)), color, opt);
    tadd(new THREE.BoxGeometry(0.18, 2.2, 0.18), -1.5, 1.1, 0, '#8a6440');
    tadd(new THREE.BoxGeometry(0.18, 2.2, 0.18), 1.5, 1.1, 0, '#8a6440');
    tadd(new THREE.BoxGeometry(3.3, 0.18, 0.2), 0, 2.15, 0, '#8a6440');
    ctx.col.box(VTUT.x, VTUT.z, 1.6, 0.2, yaw, tg - 1, tg + 2.3);
    this.tBells = [];
    VTUT_COLORS.forEach((c, i) => {
      const lp = localToWorld(VTUT.x, VTUT.z, yaw, -1.0 + i * 1.0, 0);
      const bell = new THREE.Mesh(bellGeometry(0.22, 0.38), ctx.mats.toon(COLORS[c]));
      bell.position.set(lp.x, tg + 2.06, lp.z);
      ctx.scene.add(bell);
      const B = { mesh: bell, swing: 0, vel: 0, color: c, small: true };
      this.tBells.push(B);
      const front = localToWorld(VTUT.x, VTUT.z, yaw, -1.0 + i * 1.0, 0.5);
      ctx.interact.push({
        pos: new THREE.Vector3(front.x, tg + 1.0, front.z),
        prompt: new THREE.Vector3(lp.x, tg + 1.4, lp.z),
        reach: 1.6,
        can: () => !this.tutDone && this.tLock <= 0,
        press: () => this.ringTut(B),
        puzzle: true,
      });
    });
    // mini pole
    const mp = localToWorld(VTUT.x, VTUT.z, yaw, 2.4, -0.2);
    b.add(new THREE.CylinderGeometry(0.12, 0.14, 2.6, 6), mat(mp.x, tg + 1.3, mp.z), '#7a5232');
    VTUT_SEQ.forEach((c, i) => b.add(new THREE.CylinderGeometry(0.24, 0.24, 0.26, 10), mat(mp.x, tg + 0.6 + i * 0.6, mp.z), COLORS[c]));
    b.add(new THREE.ConeGeometry(0.18, 0.45, 6), mat(mp.x, tg + 2.8, mp.z), '#e8a63a', { flat: true });
    ctx.col.circle(mp.x, mp.z, 0.25, tg - 1, tg + 3);
    // three small lamps on top of the rack
    this.tLamps = new THREE.InstancedMesh(new THREE.SphereGeometry(0.1, 6, 5), lampMat, 3);
    for (let i = 0; i < 3; i++) {
      const lp = localToWorld(VTUT.x, VTUT.z, yaw, -1.0 + i * 1.0, 0);
      m4.makeTranslation(lp.x, tg + 2.36, lp.z);
      this.tLamps.setMatrixAt(i, m4);
      this.tLamps.setColorAt(i, new THREE.Color(0.1, 0.08, 0.06));
    }
    this.tLamps.instanceMatrix.needsUpdate = true;
    this.tLamps.computeBoundingSphere();
    ctx.scene.add(this.tLamps);
    this.tutPos = new THREE.Vector3(VTUT.x, tg, VTUT.z);
    this.hintPos = new THREE.Vector3(TOTEM.x, tb, TOTEM.z);
    this.zone = [{ x: VTUT.x, z: VTUT.z, r: 6 }, { x: TOTEM.x, z: TOTEM.z, r: 6 }, ...HOUSES.map((h) => ({ x: h.x, z: h.z, r: 7 }))];
    this._c = new THREE.Color();
  }

  ring(B) {
    const a = this.ctx.audio;
    B.vel += 3.2;
    a.bell(B.mesh.position, BELL_PITCH[B.color], 1);
    if (B.color === VILLAGE_SEQ[this.step]) {
      this.step++;
      a.chime(this.beacon.firePos, 0.35 + this.step * 0.05, this.step);
      if (this.step >= VILLAGE_SEQ.length) {
        this.solved = true;
        this.ctx.addTimer(0.8, () => this.ctx.onSolved(0));
      }
    } else {
      this.step = 0;
      this.lock = 4.0;
      this.flash = 1.4;
      this.ctx.addTimer(0.25, () => a.thud(this.beacon.firePos, 0.9));
    }
    this.ctx.requestSave();
  }
  ringTut(B) {
    const a = this.ctx.audio;
    B.vel += 3.5;
    a.bell(B.mesh.position, BELL_PITCH[B.color] * 2, 0.7);
    if (B.color === VTUT_SEQ[this.tStep]) {
      this.tStep++;
      if (this.tStep >= VTUT_SEQ.length) {
        this.tutDone = true;
        this.ctx.addTimer(0.4, () => a.success(this.tutPos, 0.5));
      }
    } else {
      this.tStep = 0;
      this.tLock = 2.0;
      this.tFlash = 1.0;
      this.ctx.addTimer(0.2, () => a.thud(this.tutPos, 0.5));
    }
    this.ctx.requestSave();
  }
  _lampColors(inst, n, step, flash, done, time) {
    const c = this._c;
    for (let i = 0; i < n; i++) {
      if (done) c.setRGB(3.2, 2.1, 0.8);
      else if (flash > 0) {
        const on = Math.sin(flash * 22) > 0;
        c.setRGB(on ? 3.0 : 0.15, on ? 0.35 : 0.05, on ? 0.15 : 0.04);
      } else if (i < step) c.setRGB(2.8, 1.8, 0.7);
      else c.setRGB(0.12, 0.09, 0.07);
      inst.setColorAt(i, c);
    }
    inst.instanceColor.needsUpdate = true;
  }
  update(dt, time) {
    this.lock = Math.max(0, this.lock - dt);
    this.flash = Math.max(0, this.flash - dt);
    this.tLock = Math.max(0, this.tLock - dt);
    this.tFlash = Math.max(0, this.tFlash - dt);
    for (const B of [...this.bells, ...this.tBells]) {
      B.vel += -B.swing * 26 * dt;
      B.vel *= Math.exp(-1.4 * dt);
      B.swing += B.vel * dt;
      B.mesh.rotation.x = B.swing * 0.35;
      // lock: bells hang tilted and still while the village resets
      B.mesh.rotation.z = damp(B.mesh.rotation.z, (B.small ? this.tLock : this.lock) > 0 ? 0.35 : 0, 6, dt);
    }
    this._lampColors(this.lamps, 6, this.step, this.flash, this.solved, time);
    this._lampColors(this.tLamps, 3, this.tStep, this.tFlash, this.tutDone, time);
  }
  save() {
    return { step: this.step, tStep: this.tStep, tutDone: this.tutDone, solved: this.solved };
  }
  load(s) {
    if (!s) return;
    this.step = s.step | 0;
    this.tStep = s.tStep | 0;
    this.tutDone = !!s.tutDone;
    this.solved = !!s.solved;
  }
}
