// Shipwreck beached in the forest. Light the ship's lamp; its beam only shows when every
// mirror on the route is turned to its carved position. A wrong route gutters the lamp.
import * as THREE from './three.module.min.js';
import { WRECK, BEACONS, ISLANDS } from './layout.js';
import { groundH } from './ground.js';
import { mat, mul, GeoBuilder, damp, angDiff, mulberry32 } from './util.js';
import { makeBeamMaterial, beamMesh } from './fire.js';

const STEPS = 4;
const bearing = (a, b) => Math.atan2(b.x - a.x, b.z - a.z);

function hullGeometry(L, W, D) {
  const NS = 14, NC = 9;
  const pos = [], idx = [];
  const ring = [];
  for (let i = 0; i <= NS; i++) {
    const u = i / NS;
    const w = W * Math.pow(Math.sin(Math.PI * Math.min(0.97, 0.12 + u * 0.88)), 0.6) * (u > 0.85 ? 1 - (u - 0.85) * 3.5 : 1);
    const d = D * (0.75 + 0.25 * Math.sin(Math.PI * u));
    const row = [];
    for (let j = 0; j <= NC; j++) {
      const th = -Math.PI / 2 + (j / NC) * Math.PI;
      const x = Math.sin(th) * Math.max(w, 0.05);
      const y = -Math.pow(Math.cos(th), 0.7) * d + (u > 0.8 ? (u - 0.8) * 2.5 : 0);
      row.push(pos.length / 3);
      pos.push(x, y, u * L);
    }
    ring.push(row);
  }
  const holes = (i, j) => i >= 2 && i <= 4 && j >= 6 && j <= 8;
  for (let i = 0; i < NS; i++) for (let j = 0; j < NC; j++) {
    if (holes(i, j)) continue;
    const a = ring[i][j], b = ring[i + 1][j], c = ring[i][j + 1], d = ring[i + 1][j + 1];
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function mirrorHead(inA, outA) {
  // local +z is the mirror's facing. inA/outA: arrow angles relative to facing
  const b = new GeoBuilder();
  b.add(new THREE.CylinderGeometry(0.62, 0.62, 0.08, 18), mat(0, 0, 0, Math.PI / 2, 0, 0), '#7a5a36');
  b.add(new THREE.CircleGeometry(0.54, 18), mat(0, 0, 0.045), '#d8f0ff');
  b.add(new THREE.TorusGeometry(0.6, 0.06, 5, 18), mat(0, 0, 0.03), '#c99a3c');
  b.add(new THREE.BoxGeometry(0.12, 0.5, 0.12), mat(0, -0.75, 0), '#5e4630');
  // sighting cap with two brass arrows showing where light comes from and goes to
  b.add(new THREE.CylinderGeometry(0.28, 0.28, 0.05, 12), mat(0, 0.78, 0), '#c99a3c');
  for (const a of [inA, outA]) {
    b.add(new THREE.BoxGeometry(0.05, 0.04, 0.62), mat(Math.sin(a) * 0.31, 0.83, Math.cos(a) * 0.31, 0, a, 0), '#f2c14e');
    b.add(new THREE.ConeGeometry(0.08, 0.18, 6), mat(Math.sin(a) * 0.66, 0.83, Math.cos(a) * 0.66, Math.PI / 2, a, 0), '#f2c14e');
  }
  b.add(new THREE.BoxGeometry(0.06, 0.06, 0.25), mat(0, 0.6, 0), '#c99a3c');
  return b.build();
}

export class Wreck {
  constructor(ctx, beacon) {
    this.ctx = ctx;
    this.beacon = beacon;
    this.solved = false;
    this.tutDone = false;
    this.k = [2, 1, 3];
    this.tk = 2;
    this.lampT = 0;
    this.cool = 0;
    this.tLampT = 0;
    this.tCool = 0;
    const b = ctx.batch(2);
    const rng = mulberry32(3);
    // ---- the ship
    const bow = WRECK.lamp, stern = WRECK.stern;
    const yaw = bearing(stern, bow);
    const L = Math.hypot(bow.x - stern.x, bow.z - stern.z) - 1.2;
    const sg = groundH(stern.x, stern.z);
    const shipM = mat(stern.x, sg + 1.0, stern.z, -0.06, yaw, 0.32);
    const hullColor = (x, y, z, c, out) => out.copy(c).offsetHSL(0, 0, Math.floor(y * 2.5) % 2 === 0 ? 0.04 : -0.03);
    const hb = new GeoBuilder();
    hb.add(hullGeometry(L, 2.7, 2.6), shipM, '#6e4a2e', { colorFn: hullColor });
    const hull = new THREE.Mesh(hb.build(), ctx.mats.vcDouble);
    hull.castShadow = true;
    hull.receiveShadow = true;
    ctx.scene.add(hull);
    // keel ribs showing through the broken planks
    for (let i = 0; i < 3; i++) {
      b.add(new THREE.TorusGeometry(2.3, 0.1, 4, 10, Math.PI), mul(shipM, mat(0, 0, L * (0.16 + i * 0.07), Math.PI, 0, 0, 1, 1.0, 1)), '#4e3522');
    }
    b.add(new THREE.BoxGeometry(4.6, 0.15, L * 0.45), mul(shipM, mat(0, 0.05, L * 0.62)), '#8a6440');
    b.add(new THREE.CylinderGeometry(0.22, 0.28, 4.5, 8), mul(shipM, mat(0, 2.2, L * 0.5)), '#5e4630');
    b.add(new THREE.CylinderGeometry(0.2, 0.22, 9, 8), mat(stern.x + 6, sg + 0.25, stern.z - 4, Math.PI / 2, 0.8, 0), '#5e4630');
    b.add(new THREE.CylinderGeometry(0.12, 0.18, 4, 6), mul(shipM, mat(0, 1.2, L + 1.2, 1.2, 0, 0)), '#5e4630');
    const midA = { x: stern.x + Math.sin(yaw) * L * 0.3, z: stern.z + Math.cos(yaw) * L * 0.3 };
    const midB = { x: stern.x + Math.sin(yaw) * L * 0.72, z: stern.z + Math.cos(yaw) * L * 0.72 };
    ctx.col.box(midA.x, midA.z, 2.6, L * 0.24, yaw, sg - 2, sg + 4);
    ctx.col.box(midB.x, midB.z, 2.2, L * 0.2, yaw, sg - 2, sg + 4);
    ctx.col.circle(stern.x + 6, stern.z - 4, 0.6, sg - 1, sg + 1);

    // ---- ship lamp on its post at the bow
    const lg = groundH(bow.x, bow.z);
    const lampPost = (p, g, scale) => {
      b.add(new THREE.BoxGeometry(0.22 * scale, 2.0 * scale, 0.22 * scale), mat(p.x, g + scale, p.z), '#5e4630');
      b.add(new THREE.BoxGeometry(0.5 * scale, 0.08 * scale, 0.5 * scale), mat(p.x, g + 2.0 * scale, p.z), '#3c3632');
      b.add(new THREE.BoxGeometry(0.5 * scale, 0.08 * scale, 0.5 * scale), mat(p.x, g + 2.65 * scale, p.z), '#3c3632');
      for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.add(new THREE.BoxGeometry(0.04 * scale, 0.65 * scale, 0.04 * scale), mat(p.x + dx * 0.22 * scale, g + 2.32 * scale, p.z + dz * 0.22 * scale), '#3c3632');
      b.add(new THREE.ConeGeometry(0.36 * scale, 0.3 * scale, 4), mat(p.x, g + 2.84 * scale, p.z, 0, Math.PI / 4, 0), '#3c3632');
      ctx.col.circle(p.x, p.z, 0.25 * scale, g - 1, g + 2.9 * scale);
      const f = ctx.fires.create({ scale: 0.3 * scale, glow: 3 * scale, embers: true });
      f.group.position.set(p.x, g + 2.05 * scale, p.z);
      ctx.scene.add(f.group);
      return f;
    };
    this.lampFire = lampPost(bow, lg, 1);
    this.lampPos = new THREE.Vector3(bow.x, lg + 2.3, bow.z);
    ctx.interact.push({
      pos: new THREE.Vector3(bow.x, lg + 1, bow.z),
      prompt: new THREE.Vector3(bow.x, lg + 3.1, bow.z),
      reach: 2.3,
      can: () => !this.solved && this.lampT <= 0 && this.cool <= 0,
      press: (api) => this.lightLamp(api),
      puzzle: true,
    });

    // ---- target plate on the beacon column
    const T = BEACONS[2];
    const route = [bow, ...WRECK.mirrors, T];
    const lastM = WRECK.mirrors[2];
    const tdir = bearing(T, lastM);
    const tg = beacon.base;
    const plate = new THREE.Vector3(T.x + Math.sin(tdir) * 0.85, tg + 2.2, T.z + Math.cos(tdir) * 0.85);
    b.add(new THREE.CylinderGeometry(0.45, 0.45, 0.1, 14), mat(plate.x, plate.y, plate.z, Math.PI / 2, tdir, 0), '#c99a3c');
    this.plateMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.25, 0.2, 0.1), fog: false });
    const plateFace = new THREE.Mesh(new THREE.CircleGeometry(0.32, 14), this.plateMat);
    plateFace.position.copy(plate).add(new THREE.Vector3(Math.sin(tdir) * 0.06, 0, Math.cos(tdir) * 0.06));
    plateFace.rotation.y = tdir;
    ctx.scene.add(plateFace);

    // ---- mirrors
    this.mirrors = [];
    const beamPts = [this.lampPos.clone()];
    WRECK.mirrors.forEach((m, i) => {
      const g = groundH(m.x, m.z);
      const prev = route[i], next = route[i + 2];
      const aIn = bearing(m, prev), aOut = bearing(m, next);
      const bis = aIn + angDiff(aIn, aOut) / 2;
      const head = new THREE.Mesh(mirrorHead(angDiff(bis, aIn), angDiff(bis, aOut)), ctx.mats.vc);
      head.position.set(m.x, g + 2.3, m.z);
      head.castShadow = true;
      ctx.scene.add(head);
      b.add(new THREE.CylinderGeometry(0.3, 0.4, 1.6, 8), mat(m.x, g + 0.8, m.z), '#9a907f', { flat: true });
      // four carved notches on the post top: the positions it clicks between
      for (let s = 0; s < STEPS; s++) {
        const a = bis + (s * Math.PI * 2) / STEPS;
        b.add(new THREE.BoxGeometry(0.08, 0.06, 0.2), mat(m.x + Math.sin(a) * 0.32, g + 1.62, m.z + Math.cos(a) * 0.32, 0, a, 0), '#4a463f');
      }
      ctx.col.circle(m.x, m.z, 0.45, g - 1, g + 3);
      const M = { head, bis, angle: bis + (this.k[i] * Math.PI * 2) / STEPS, g, x: m.x, z: m.z };
      this.mirrors.push(M);
      beamPts.push(new THREE.Vector3(m.x, g + 2.3, m.z));
      ctx.interact.push({
        pos: new THREE.Vector3(m.x, g + 1, m.z),
        prompt: new THREE.Vector3(m.x, g + 3.4, m.z),
        reach: 2.0,
        can: () => !this.solved,
        press: () => this.turn(i),
        puzzle: true,
      });
    });
    beamPts.push(plate.clone());
    const bm = makeBeamMaterial(new THREE.Color(3.0, 2.3, 1.1));
    this.beams = [];
    for (let i = 0; i < beamPts.length - 1; i++) {
      const m = beamMesh(beamPts[i], beamPts[i + 1], 0.09, bm);
      m.visible = false;
      ctx.scene.add(m);
      this.beams.push(m);
    }

    // ---- tutorial: lamp, one mirror, a plate
    const tl = WRECK.tutLamp, tm = WRECK.tutMirror, tt = WRECK.tutTarget;
    const tlg = groundH(tl.x, tl.z);
    this.tLampFire = lampPost(tl, tlg, 0.6);
    this.tLampPos = new THREE.Vector3(tl.x, tlg + 1.4, tl.z);
    ctx.interact.push({
      pos: new THREE.Vector3(tl.x, tlg + 0.8, tl.z),
      prompt: new THREE.Vector3(tl.x, tlg + 2.0, tl.z),
      reach: 1.8,
      can: () => !this.tutDone && this.tLampT <= 0 && this.tCool <= 0,
      press: (api) => this.lightTut(api),
      puzzle: true,
    });
    const tmg = groundH(tm.x, tm.z);
    {
      const aIn = bearing(tm, tl), aOut = bearing(tm, tt);
      const bis = aIn + angDiff(aIn, aOut) / 2;
      const head = new THREE.Mesh(mirrorHead(angDiff(bis, aIn), angDiff(bis, aOut)), ctx.mats.vc);
      head.scale.setScalar(0.65);
      head.position.set(tm.x, tmg + 1.4, tm.z);
      ctx.scene.add(head);
      b.add(new THREE.CylinderGeometry(0.2, 0.26, 0.95, 8), mat(tm.x, tmg + 0.47, tm.z), '#9a907f', { flat: true });
      for (let s = 0; s < STEPS; s++) {
        const a = bis + (s * Math.PI * 2) / STEPS;
        b.add(new THREE.BoxGeometry(0.06, 0.05, 0.14), mat(tm.x + Math.sin(a) * 0.21, tmg + 0.96, tm.z + Math.cos(a) * 0.21, 0, a, 0), '#4a463f');
      }
      ctx.col.circle(tm.x, tm.z, 0.3, tmg - 1, tmg + 2);
      this.tMirror = { head, bis, angle: bis + (this.tk * Math.PI * 2) / STEPS };
      ctx.interact.push({
        pos: new THREE.Vector3(tm.x, tmg + 0.7, tm.z),
        prompt: new THREE.Vector3(tm.x, tmg + 2.1, tm.z),
        reach: 1.6,
        can: () => !this.tutDone,
        press: () => this.turnTut(),
        puzzle: true,
      });
    }
    const ttg = groundH(tt.x, tt.z);
    b.add(new THREE.BoxGeometry(0.25, 1.4, 0.25), mat(tt.x, ttg + 0.7, tt.z), '#9a907f', { flat: true });
    const ttDir = bearing(tt, tm);
    b.add(new THREE.CylinderGeometry(0.3, 0.3, 0.08, 12), mat(tt.x, ttg + 1.4, tt.z, Math.PI / 2, ttDir, 0), '#c99a3c');
    this.tPlateMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.25, 0.2, 0.1), fog: false });
    const tpf = new THREE.Mesh(new THREE.CircleGeometry(0.21, 12), this.tPlateMat);
    tpf.position.set(tt.x + Math.sin(ttDir) * 0.05, ttg + 1.4, tt.z + Math.cos(ttDir) * 0.05);
    tpf.rotation.y = ttDir;
    ctx.scene.add(tpf);
    ctx.col.circle(tt.x, tt.z, 0.25, ttg - 1, ttg + 2);
    this.tBeams = [
      beamMesh(this.tLampPos, new THREE.Vector3(tm.x, tmg + 1.4, tm.z), 0.05, bm),
      beamMesh(new THREE.Vector3(tm.x, tmg + 1.4, tm.z), new THREE.Vector3(tt.x, ttg + 1.4, tt.z), 0.05, bm),
    ];
    for (const m of this.tBeams) {
      m.visible = false;
      ctx.scene.add(m);
    }
    this.tutPos = new THREE.Vector3(tm.x, tmg, tm.z);
    this.hintPos = new THREE.Vector3(bow.x, lg, bow.z);
    this.zone = [
      { x: bow.x, z: bow.z, r: 6 }, { x: tm.x, z: tm.z, r: 7 },
      ...WRECK.mirrors.map((m) => ({ x: m.x, z: m.z, r: 5 })),
    ];
    this.beamShow = -1;
    this.tBeamShow = -1;
  }

  routeOk() {
    return this.k.every((v) => v === 0);
  }
  turn(i) {
    this.k[i] = (this.k[i] + 1) % STEPS;
    this.ctx.audio.click(this.mirrors[i].head.position, 1);
    if (this.lampT > 0) this._gutter(false);
    this.ctx.requestSave();
  }
  turnTut() {
    this.tk = (this.tk + 1) % STEPS;
    this.ctx.audio.click(this.tMirror.head.position, 0.7);
    if (this.tLampT > 0) this._gutter(true);
    this.ctx.requestSave();
  }
  _gutter(tut) {
    if (tut) {
      this.tLampT = 0;
      this.tCool = 2.5;
      this.tLampFire.douse();
      this.ctx.audio.fizzle(this.tLampPos, 0.6);
    } else {
      this.lampT = 0;
      this.cool = 4.0;
      this.lampFire.douse();
      this.ctx.audio.fizzle(this.lampPos, 1);
    }
  }
  lightLamp(api) {
    this.lampT = 99; // busy until lit
    api.raise(() => {
      this.lampFire.ignite();
      this.ctx.audio.ignite(this.lampPos, 0.5);
      if (this.routeOk()) {
        this.solved = true;
        this.beamShow = 0;
        this.ctx.addTimer(2.2, () => this.ctx.onSolved(2));
      } else this.lampT = 3.2;
      this.ctx.requestSave();
    }, this.lampPos);
  }
  lightTut(api) {
    this.tLampT = 99;
    api.raise(() => {
      this.tLampFire.ignite();
      this.ctx.audio.ignite(this.tLampPos, 0.3);
      if (this.tk === 0) {
        this.tutDone = true;
        this.tBeamShow = 0;
        this.ctx.addTimer(0.8, () => this.ctx.audio.success(this.tutPos, 0.5));
      } else this.tLampT = 2.4;
      this.ctx.requestSave();
    }, this.tLampPos);
  }
  update(dt) {
    if (!this.solved && this.lampT > 0 && this.lampT < 50) {
      this.lampT -= dt;
      if (this.lampT <= 0) this._gutter(false);
    }
    if (!this.tutDone && this.tLampT > 0 && this.tLampT < 50) {
      this.tLampT -= dt;
      if (this.tLampT <= 0) this._gutter(true);
    }
    this.cool = Math.max(0, this.cool - dt);
    this.tCool = Math.max(0, this.tCool - dt);
    this.mirrors.forEach((M, i) => {
      const target = M.bis + (this.k[i] * Math.PI * 2) / STEPS;
      M.angle += angDiff(M.angle, target) * Math.min(1, dt * 7);
      M.head.rotation.y = M.angle;
    });
    {
      const M = this.tMirror;
      const target = M.bis + (this.tk * Math.PI * 2) / STEPS;
      M.angle += angDiff(M.angle, target) * Math.min(1, dt * 7);
      M.head.rotation.y = M.angle;
    }
    if (this.beamShow >= 0) {
      this.beamShow += dt;
      this.beams.forEach((m, i) => (m.visible = this.beamShow > i * 0.35));
      if (this.beamShow > this.beams.length * 0.35) this.plateMat.color.setRGB(3.2, 2.4, 1.0);
    }
    if (this.tBeamShow >= 0) {
      this.tBeamShow += dt;
      this.tBeams.forEach((m, i) => (m.visible = this.tBeamShow > i * 0.35));
      if (this.tBeamShow > 0.7) this.tPlateMat.color.setRGB(3.2, 2.4, 1.0);
    }
  }
  restoreVisuals() {
    if (this.solved) {
      this.lampFire.ignite(true);
      this.beamShow = 10;
    }
    if (this.tutDone) {
      this.tLampFire.ignite(true);
      this.tBeamShow = 10;
    }
    this.mirrors.forEach((M, i) => (M.angle = M.bis + (this.k[i] * Math.PI * 2) / STEPS));
    this.tMirror.angle = this.tMirror.bis + (this.tk * Math.PI * 2) / STEPS;
  }
  save() {
    return { k: this.k.slice(), tk: this.tk, solved: this.solved, tutDone: this.tutDone };
  }
  load(o) {
    if (!o) return;
    if (Array.isArray(o.k) && o.k.length === 3) this.k = o.k.map((v) => (v | 0) % STEPS);
    this.tk = (o.tk | 0) % STEPS;
    this.solved = !!o.solved;
    this.tutDone = !!o.tutDone;
  }
}
