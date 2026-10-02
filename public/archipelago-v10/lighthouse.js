// The great lighthouse. Four prisms on the terrace must each be turned to sight one of the four
// lit beacons across the water; the lever tests them together.
import * as THREE from './three.module.min.js';
import { LH, BEACON_BEARING, pol } from './layout.js';
import { groundH } from './ground.js';
import { mat, mul, GeoBuilder, angDiff, damp } from './util.js';
import { makeBeamMaterial, beamMesh } from './fire.js';

const STEPS = 10;
const START = [8, 8, 8, 8]; // all four staring at the empty sea
const T_START = 9;
const SOL = BEACON_BEARING.map((b) => Math.round(b / 36));

function prismHead() {
  const b = new GeoBuilder();
  b.add(new THREE.CylinderGeometry(0.42, 0.42, 0.08, 14), mat(0, 0, 0), '#c99a3c');
  for (const sx of [-0.3, 0.3]) b.add(new THREE.BoxGeometry(0.06, 0.6, 0.12), mat(sx, 0.32, 0), '#c99a3c');
  b.add(new THREE.CylinderGeometry(0.06, 0.06, 1.3, 8), mat(0, 0.12, 0.55, Math.PI / 2, 0, 0), '#a07a30');
  b.add(new THREE.ConeGeometry(0.11, 0.22, 8), mat(0, 0.12, 1.25, Math.PI / 2, 0, 0), '#f2c14e');
  b.add(new THREE.TorusGeometry(0.09, 0.025, 4, 10), mat(0, 0.12, -0.15), '#a07a30');
  return b.build();
}
function leverGeo(s) {
  const b = new GeoBuilder();
  b.add(new THREE.BoxGeometry(0.08 * s, 0.9 * s, 0.08 * s), mat(0, 0.45 * s, 0), '#3c3632');
  b.add(new THREE.SphereGeometry(0.1 * s, 8, 6), mat(0, 0.92 * s, 0), '#c8352a');
  return b.build();
}

export class Lighthouse {
  constructor(ctx, beacons) {
    this.ctx = ctx;
    this.beacons = beacons;
    this.solved = false;
    this.tutDone = false;
    this.k = START.slice();
    this.tk = T_START;
    this.lock = false;
    this.tLock = false;
    this.topLit = false;
    const b = ctx.batch(4);
    const H0 = LH.terraceH;
    // terrace with radial paving
    const pave = (x, y, z, c, out) => {
      const r = Math.hypot(x, z), a = Math.atan2(x, z);
      const cell = Math.floor(r / 1.6) * 7 + Math.floor((a + Math.PI) / (Math.PI * 2) * Math.max(6, Math.floor(r * 2.2)));
      return out.copy(c).offsetHSL(0, 0, ((cell * 37) % 7) * 0.012 - 0.03);
    };
    b.add(new THREE.CylinderGeometry(LH.terraceR, LH.terraceR + 0.6, 1.4, 48, 6), mat(0, H0 - 0.68, 0), '#c2b7a2', { colorFn: pave });
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      if (Math.abs(angDiff(a, LH.doorBearing * Math.PI / 180)) < 0.16) continue;
      b.add(new THREE.BoxGeometry(1.2, 0.35, 0.5), mat(Math.sin(a) * (LH.terraceR - 0.3), H0 + 0.15, Math.cos(a) * (LH.terraceR - 0.3), 0, a, 0), '#a39a8c', { flat: true });
    }
    // banded tower: each band its own ring so the red/white edges stay hard
    const base = H0;
    const bands = 9, bandH = 3.2, r0 = 4.6, r1 = 3.1;
    b.add(new THREE.CylinderGeometry(5.0, 5.3, 1.2, 28), mat(0, base + 0.5, 0), '#9a907f', { flat: true });
    for (let i = 0; i < bands; i++) {
      const ya = base + 1.1 + i * bandH, yb = ya + bandH;
      const ra = r0 + (r1 - r0) * (i / bands), rb = r0 + (r1 - r0) * ((i + 1) / bands);
      b.add(new THREE.CylinderGeometry(rb, ra, bandH, 28, 1, true), mat(0, (ya + yb) / 2, 0), i % 2 ? '#f3eee2' : '#c8262c');
    }
    const topY = base + 1.1 + bands * bandH;
    this.topY = topY;
    b.add(new THREE.CylinderGeometry(4.3, 3.2, 0.5, 28), mat(0, topY + 0.2, 0), '#33302e');
    b.add(new THREE.TorusGeometry(4.15, 0.06, 4, 32), mat(0, topY + 1.4, 0, Math.PI / 2, 0, 0), '#33302e');
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      b.add(new THREE.BoxGeometry(0.07, 1.0, 0.07), mat(Math.sin(a) * 4.15, topY + 0.95, Math.cos(a) * 4.15), '#33302e');
    }
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      b.add(new THREE.BoxGeometry(0.12, 3.0, 0.12), mat(Math.sin(a) * 2.42, topY + 1.95, Math.cos(a) * 2.42), '#2b2826');
    }
    b.add(new THREE.ConeGeometry(3.0, 2.3, 16), mat(0, topY + 4.6, 0), '#b8242a', { flat: true });
    b.add(new THREE.SphereGeometry(0.35, 8, 6), mat(0, topY + 5.9, 0), '#33302e');
    // door and windows
    const da = (LH.doorBearing * Math.PI) / 180;
    b.add(new THREE.BoxGeometry(1.5, 2.6, 0.6), mat(Math.sin(da) * 4.65, base + 2.4, Math.cos(da) * 4.65, 0, da, 0), '#3a2a20');
    b.add(new THREE.BoxGeometry(1.9, 0.3, 0.7), mat(Math.sin(da) * 4.7, base + 3.8, Math.cos(da) * 4.7, 0, da, 0), '#9a907f');
    for (let i = 0; i < 4; i++) {
      const a = da + 1.2 + i * 1.7;
      const y = base + 7 + i * 6;
      const r = r0 + (r1 - r0) * ((y - base) / (bands * bandH)) + 0.02;
      b.add(new THREE.BoxGeometry(0.6, 1.1, 0.2), mat(Math.sin(a) * r, y, Math.cos(a) * r, 0, a, 0), '#2b3546');
    }
    ctx.col.circle(0, 0, 5.2, base - 2, topY + 6);
    // lantern room glass, brightens when lit
    this.glassMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 0.82, 0.55), transparent: true, opacity: 0.55, fog: false, depthWrite: false });
    this.glass = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 3.0, 16, 1, true), this.glassMat);
    this.glass.position.y = topY + 1.95;
    this.glass.renderOrder = 3;
    ctx.scene.add(this.glass);
    this.topFire = ctx.fires.create({ scale: 2.2, glow: 26 });
    this.topFire.group.position.set(0, topY + 0.5, 0);
    ctx.scene.add(this.topFire.group);
    this.topPos = new THREE.Vector3(0, topY + 2.0, 0);
    // sweeping beams
    const sb = new THREE.ConeGeometry(5, 70, 16, 1, true);
    sb.translate(0, -35, 0);
    sb.rotateX(-Math.PI / 2);
    const sweepGeo = new THREE.BufferGeometry();
    {
      const g1 = sb.clone(), g2 = sb.clone().rotateY(Math.PI);
      const p = [...g1.attributes.position.array, ...g2.attributes.position.array];
      sweepGeo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
      const i1 = Array.from(g1.index.array), off = g1.attributes.position.count;
      sweepGeo.setIndex([...i1, ...Array.from(g2.index.array).map((v) => v + off)]);
    }
    this.sweep = new THREE.Mesh(sweepGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 0.45, 0.25), transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    this.sweep.position.y = topY + 1.9;
    this.sweep.renderOrder = 6;
    this.sweep.visible = false;
    ctx.scene.add(this.sweep);

    // ---- prisms
    const headGeo = prismHead();
    const crystalGeo = new THREE.OctahedronGeometry(0.3, 0);
    crystalGeo.scale(1, 1.5, 1);
    const makePrism = (p, scale, onPress, canFn) => {
      const g = groundH(p.x, p.z);
      b.add(new THREE.CylinderGeometry(0.42 * scale, 0.55 * scale, 1.1 * scale, 10), mat(p.x, g + 0.55 * scale, p.z), '#9a907f', { flat: true });
      b.add(new THREE.CylinderGeometry(0.75 * scale, 0.75 * scale, 0.06, 20), mat(p.x, g + 1.12 * scale, p.z), '#5a4220');
      for (let s = 0; s < STEPS; s++) {
        const a = (s / STEPS) * Math.PI * 2;
        b.add(new THREE.BoxGeometry(0.05, 0.05, 0.22 * scale), mat(p.x + Math.sin(a) * 0.62 * scale, g + 1.16 * scale, p.z + Math.cos(a) * 0.62 * scale, 0, a, 0), '#e8b440');
      }
      ctx.col.circle(p.x, p.z, 0.55 * scale, g - 1, g + 2);
      const head = new THREE.Mesh(headGeo, ctx.mats.vc);
      head.position.set(p.x, g + 1.2 * scale, p.z);
      head.scale.setScalar(scale);
      head.castShadow = true;
      ctx.scene.add(head);
      const cm = new THREE.MeshToonMaterial({ color: '#9ff0ff', emissive: new THREE.Color(0.1, 0.3, 0.35), gradientMap: ctx.mats.vc.gradientMap });
      const crystal = new THREE.Mesh(crystalGeo, cm);
      crystal.position.set(0, 0.42, 0);
      head.add(crystal);
      ctx.interact.push({
        pos: new THREE.Vector3(p.x, g + 1.0, p.z),
        prompt: new THREE.Vector3(p.x, g + 2.2 * scale, p.z),
        reach: 1.8,
        can: canFn,
        press: onPress,
        puzzle: true,
      });
      return { head, crystal, cm, g, angle: 0, x: p.x, z: p.z };
    };
    this.prisms = LH.prismBearings.map((br, i) => {
      const P = makePrism(pol(br, LH.prismR), 1, () => this.turn(i), () => !this.solved && !this.lock);
      P.angle = (this.k[i] / STEPS) * Math.PI * 2;
      return P;
    });
    this.tPrism = makePrism(LH.tutPrism, 0.7, () => this.turnTut(), () => !this.tutDone && !this.tLock);
    this.tPrism.angle = (this.tk / STEPS) * Math.PI * 2;
    // levers
    const mkLever = (p, s) => {
      const g = groundH(p.x, p.z);
      b.add(new THREE.BoxGeometry(0.4 * s, 0.2, 0.4 * s), mat(p.x, g + 0.1, p.z), '#3c3632');
      const m = new THREE.Mesh(leverGeo(s), ctx.mats.vc);
      m.position.set(p.x, g, p.z);
      m.rotation.y = Math.atan2(-p.x, -p.z);
      ctx.scene.add(m);
      ctx.col.circle(p.x, p.z, 0.25 * s, g - 1, g + 1);
      return { m, g, t: 0 };
    };
    this.lever = mkLever(LH.lever, 1);
    this.tLever = mkLever(LH.tutLever, 0.7);
    ctx.interact.push({
      pos: new THREE.Vector3(LH.lever.x, this.lever.g + 0.8, LH.lever.z),
      prompt: new THREE.Vector3(LH.lever.x, this.lever.g + 1.4, LH.lever.z),
      reach: 1.6,
      can: () => !this.solved && !this.lock,
      press: () => this.test(),
      puzzle: true,
    });
    ctx.interact.push({
      pos: new THREE.Vector3(LH.tutLever.x, this.tLever.g + 0.6, LH.tutLever.z),
      prompt: new THREE.Vector3(LH.tutLever.x, this.tLever.g + 1.1, LH.tutLever.z),
      reach: 1.4,
      can: () => !this.tutDone && !this.tLock,
      press: () => this.tTest(),
      puzzle: true,
    });
    // tutorial lamp
    const tlp = LH.tutLamp, tlg = groundH(tlp.x, tlp.z);
    b.add(new THREE.CylinderGeometry(0.08, 0.1, 1.4, 6), mat(tlp.x, tlg + 0.7, tlp.z), '#3c3632');
    b.add(new THREE.CylinderGeometry(0.24, 0.12, 0.18, 8), mat(tlp.x, tlg + 1.45, tlp.z), '#3c3632');
    ctx.col.circle(tlp.x, tlp.z, 0.2, tlg - 1, tlg + 1.6);
    this.tFire = ctx.fires.create({ scale: 0.4, glow: 2.8 });
    this.tFire.group.position.set(tlp.x, tlg + 1.52, tlp.z);
    ctx.scene.add(this.tFire.group);
    // beams from the beacons to the prisms
    this.beamMat = makeBeamMaterial(new THREE.Color(2.6, 1.7, 0.7), 0.8);
    this.beams = [];
    this.tBeam = null;
    this.beamT = -1;
    this.tutPos = new THREE.Vector3(LH.tutPrism.x, this.tPrism.g, LH.tutPrism.z);
    this.hintPos = new THREE.Vector3(0, H0, 0);
    this.zone = [{ x: 0, z: 0, r: 12.5 }];
  }
  turn(i) {
    this.k[i] = (this.k[i] + 1) % STEPS;
    this.ctx.audio.click(this.prisms[i].head.position, 0.9);
    this.ctx.requestSave();
  }
  turnTut() {
    this.tk = (this.tk + 1) % STEPS;
    this.ctx.audio.click(this.tPrism.head.position, 0.6);
    this.ctx.requestSave();
  }
  _beamTo(prism, k, radius) {
    const bi = SOL.indexOf(k);
    const src = this.beacons[bi].firePos;
    const dst = prism.head.position.clone().add(new THREE.Vector3(0, 0.42 * prism.head.scale.x, 0));
    const m = beamMesh(src, dst, radius, this.beamMat);
    this.ctx.scene.add(m);
    return m;
  }
  test() {
    const a = this.ctx.audio;
    this.lever.t = 1;
    a.clank(this.lever.m.position, 0.8);
    const set = new Set(this.k);
    const ok = set.size === 4 && SOL.every((s) => set.has(s));
    if (ok) {
      this.solved = true;
      this.beams = this.prisms.map((P, i) => {
        const m = this._beamTo(P, this.k[i], 0.12);
        m.visible = false;
        return m;
      });
      this.beamT = 0;
      this.ctx.addTimer(2.6, () => this.ctx.onSolved(4));
    } else {
      this.lock = true;
      this.k = START.slice();
      this.flick = 1.2;
      this.ctx.addTimer(0.3, () => a.thud(this.lever.m.position, 0.9));
    }
    this.ctx.requestSave();
  }
  tTest() {
    const a = this.ctx.audio;
    this.tLever.t = 1;
    a.clank(this.tLever.m.position, 0.5);
    if (SOL.includes(this.tk)) {
      this.tutDone = true;
      this.tBeam = this._beamTo(this.tPrism, this.tk, 0.07);
      this.tFire.ignite();
      this.ctx.addTimer(0.5, () => a.success(this.tutPos, 0.5));
    } else {
      this.tLock = true;
      this.tk = T_START;
      this.tFlick = 0.8;
      this.ctx.addTimer(0.2, () => a.thud(this.tutPos, 0.5));
    }
    this.ctx.requestSave();
  }
  lightTop(instant = false) {
    this.topLit = true;
    this.topFire.ignite(instant);
    this.sweep.visible = true;
    this.glassMat.color.setRGB(3.0, 2.4, 1.2);
    this.glassMat.opacity = 0.75;
    this.ctx.audio.fireLoop(this.topPos, 2.2);
    if (!instant) this.ctx.audio.ignite(this.topPos, 1.5);
  }
  update(dt, time) {
    let allDone = true;
    this.prisms.forEach((P, i) => {
      const target = (this.k[i] / STEPS) * Math.PI * 2;
      const d = angDiff(P.angle, target);
      const sp = this.lock ? 2.0 : 6.0;
      P.angle += Math.sign(d) * Math.min(Math.abs(d), sp * dt);
      if (Math.abs(d) > 1e-3) allDone = false;
      P.head.rotation.y = P.angle;
      P.crystal.rotation.y = time * 0.6;
      const glow = this.solved ? 1.4 : this.flick > 0 ? (Math.sin(time * 40) > 0 ? 0.05 : 0.6) : 0.35;
      P.cm.emissive.setRGB(0.25 * glow, 0.75 * glow, 0.85 * glow);
    });
    if (this.lock && allDone) this.lock = false;
    this.flick = Math.max(0, (this.flick || 0) - dt);
    {
      const P = this.tPrism;
      const target = (this.tk / STEPS) * Math.PI * 2;
      const d = angDiff(P.angle, target);
      P.angle += Math.sign(d) * Math.min(Math.abs(d), (this.tLock ? 3 : 6) * dt);
      if (this.tLock && Math.abs(d) < 1e-3) this.tLock = false;
      P.head.rotation.y = P.angle;
      P.crystal.rotation.y = time * 0.6;
      this.tFlick = Math.max(0, (this.tFlick || 0) - dt);
      const glow = this.tutDone ? 1.4 : this.tFlick > 0 ? (Math.sin(time * 40) > 0 ? 0.05 : 0.6) : 0.35;
      P.cm.emissive.setRGB(0.25 * glow, 0.75 * glow, 0.85 * glow);
    }
    for (const L of [this.lever, this.tLever]) {
      L.t = Math.max(0, L.t - dt * 1.5);
    }
    this.lever.m.rotation.x = -Math.sin(this.lever.t * Math.PI) * 0.9 + (this.solved ? -0.9 : 0);
    this.tLever.m.rotation.x = -Math.sin(this.tLever.t * Math.PI) * 0.9 + (this.tutDone ? -0.9 : 0);
    if (this.beamT >= 0) {
      this.beamT += dt;
      this.beams.forEach((m, i) => (m.visible = this.beamT > 0.3 + i * 0.45));
    }
    if (this.topLit) this.sweep.rotation.y = time * 0.5;
  }
  restoreVisuals() {
    this.prisms.forEach((P, i) => (P.angle = (this.k[i] / STEPS) * Math.PI * 2));
    this.tPrism.angle = (this.tk / STEPS) * Math.PI * 2;
    if (this.solved) {
      this.beams = this.prisms.map((P, i) => this._beamTo(P, this.k[i], 0.12));
      this.beamT = 99;
    }
    if (this.tutDone) {
      this.tBeam = this._beamTo(this.tPrism, this.tk, 0.07);
      this.tFire.ignite(true);
    }
  }
  save() {
    return { k: this.k.slice(), tk: this.tk, solved: this.solved, tutDone: this.tutDone };
  }
  load(o) {
    if (!o) return;
    if (Array.isArray(o.k) && o.k.length === 4) this.k = o.k.map((v) => (v | 0) % STEPS);
    this.tk = (o.tk | 0) % STEPS;
    this.solved = !!o.solved;
    this.tutDone = !!o.tutDone;
  }
}
