// Toppled observatory on the summit. The telescope's bearing is shown by the brass inlay in the
// floor (and the sight post beyond it); its elevation by the brass notch carved on the slab
// beside the fallen dome. Cranks click it between positions; the lever tests the aim.
import * as THREE from './three.module.min.js';
import { OBS, PEAK_TOP, ISLANDS } from './layout.js';
import { groundH } from './ground.js';
import { mat, mul, GeoBuilder, angDiff, damp, mulberry32 } from './util.js';
import { makeBeamMaterial, beamMesh } from './fire.js';

const D = Math.PI / 180;
const AZN = 12, ELS = [8, 22, 36, 50, 64];
const AZ_SOL = 7, EL_SOL = 3, AZ0 = 1, EL0 = 0;
const TAZN = 4, TELS = [15, 40, 65];
const TAZ_SOL = 2, TEL_SOL = 1, TAZ0 = 0, TEL0 = 2;
const bearing = (a, b) => Math.atan2(b.x - a.x, b.z - a.z);

function wheel(r) {
  const b = new GeoBuilder();
  b.add(new THREE.TorusGeometry(r, r * 0.16, 5, 14), mat(), '#c99a3c');
  for (let i = 0; i < 4; i++) b.add(new THREE.BoxGeometry(r * 2, r * 0.12, r * 0.12), mat(0, 0, 0, 0, 0, (i * Math.PI) / 4), '#a07a30');
  b.add(new THREE.CylinderGeometry(r * 0.15, r * 0.15, r * 0.6, 8), mat(r * 0.8, 0, r * 0.25, Math.PI / 2, 0, 0), '#5e4630');
  return b.build();
}
function leverGeo(s) {
  const b = new GeoBuilder();
  b.add(new THREE.BoxGeometry(0.08 * s, 0.9 * s, 0.08 * s), mat(0, 0.45 * s, 0), '#3c3632');
  b.add(new THREE.SphereGeometry(0.1 * s, 8, 6), mat(0, 0.92 * s, 0), '#c8352a');
  return b.build();
}
// quadrant of elevation notches drawn in a local plane (x right, y up), facing +z
function quadrant(b, M, R, angles, solIdx, color, brass) {
  for (let i = 0; i <= 10; i++) {
    const a = (i / 10) * Math.PI / 2;
    b.add(new THREE.BoxGeometry(R * 0.17, 0.04, 0.03), mul(M, mat(Math.cos(a) * R, Math.sin(a) * R, 0, 0, 0, a + Math.PI / 2)), color);
  }
  b.add(new THREE.BoxGeometry(R * 1.05, 0.05, 0.03), mul(M, mat(R * 0.52, 0, 0)), color);
  b.add(new THREE.BoxGeometry(0.05, R * 1.05, 0.03), mul(M, mat(0, R * 0.52, 0)), color);
  angles.forEach((deg, i) => {
    const a = deg * D;
    const sol = i === solIdx;
    const r0 = R * 0.72, r1 = sol ? R * 1.32 : R * 1.12;
    const rm = (r0 + r1) / 2;
    b.add(new THREE.BoxGeometry(r1 - r0, sol ? 0.07 : 0.045, sol ? 0.05 : 0.035), mul(M, mat(Math.cos(a) * rm, Math.sin(a) * rm, 0.005, 0, 0, a)), sol ? brass : color);
    if (sol) b.add(new THREE.OctahedronGeometry(R * 0.11), mul(M, mat(Math.cos(a) * (r1 + R * 0.1), Math.sin(a) * (r1 + R * 0.1), 0.01)), brass);
  });
}

export class Observatory {
  constructor(ctx, beacon) {
    this.ctx = ctx;
    this.beacon = beacon;
    this.solved = false;
    this.tutDone = false;
    this.az = AZ0; this.el = EL0;
    this.taz = TAZ0; this.tel = TEL0;
    this.slew = false;
    this.tSlew = false;
    const b = ctx.batch(3);
    const rng = mulberry32(12);
    const O = OBS.center;
    const top = PEAK_TOP + 0.03;
    this.top = top;
    // ---- floor, grooves, brass inlay, broken walls
    b.add(new THREE.CylinderGeometry(OBS.floorR, OBS.floorR + 0.2, 0.8, 28), mat(O.x, top - 0.4, O.z), '#b9ae9a');
    for (let i = 0; i < AZN; i++) {
      const a = (i / AZN) * Math.PI * 2;
      const sol = i === AZ_SOL;
      const r0 = sol ? 0.9 : 1.3, r1 = sol ? OBS.floorR + 0.1 : OBS.floorR - 0.4;
      const rm = (r0 + r1) / 2;
      b.add(new THREE.BoxGeometry(sol ? 0.18 : 0.07, 0.02, r1 - r0), mat(O.x + Math.sin(a) * rm, top + (sol ? 0.012 : 0.006), O.z + Math.cos(a) * rm, 0, a, 0), sol ? '#e8b440' : '#5a5246');
    }
    // the inlay continues across the summit to a sight post
    const sa = (AZ_SOL / AZN) * Math.PI * 2;
    const sr0 = OBS.floorR + 0.1, sr1 = 9.3;
    for (let r = sr0; r < sr1; r += 0.9) {
      const rm = Math.min(r + 0.45, sr1);
      const px = O.x + Math.sin(sa) * (r + 0.4), pz = O.z + Math.cos(sa) * (r + 0.4);
      b.add(new THREE.BoxGeometry(0.16, 0.06, 0.85), mat(px, groundH(px, pz) + 0.02, pz, 0, sa, 0), '#e8b440');
      void rm;
    }
    const sp = { x: O.x + Math.sin(sa) * 9.8, z: O.z + Math.cos(sa) * 9.8 };
    const spg = groundH(sp.x, sp.z);
    b.add(new THREE.BoxGeometry(0.45, 1.8, 0.45), mat(sp.x, spg + 0.9, sp.z, 0, sa, 0), '#9a907f', { flat: true });
    b.add(new THREE.TorusGeometry(0.32, 0.07, 6, 14), mat(sp.x, spg + 2.15, sp.z, 0, sa, 0), '#e8b440');
    ctx.col.circle(sp.x, sp.z, 0.35, spg - 1, spg + 2.5);
    const walls = [[25, 75], [105, 160], [245, 290], [310, 345]];
    for (const [a0, a1] of walls) {
      for (let a = a0; a < a1; a += 9) {
        const ar = (a + 4.5) * D;
        const h = 0.8 + rng() * 1.8 * (1 - Math.abs((a - (a0 + a1) / 2) / (a1 - a0)));
        const x = O.x + Math.sin(ar) * (OBS.floorR + 0.1), z = O.z + Math.cos(ar) * (OBS.floorR + 0.1);
        b.add(new THREE.BoxGeometry(0.95, h, 0.55), mat(x, top + h / 2 - 0.1, z, 0, ar, 0), rng() < 0.5 ? '#c7bca6' : '#b3a893', { flat: true });
        ctx.col.circle(x, z, 0.5, top - 1, top + h);
      }
    }
    // rubble
    for (let i = 0; i < 12; i++) {
      const a = rng() * Math.PI * 2, r = OBS.floorR + 1 + rng() * 3;
      const x = O.x + Math.sin(a) * r, z = O.z + Math.cos(a) * r;
      const s = 0.2 + rng() * 0.35;
      b.add(new THREE.BoxGeometry(s * 2, s, s * 1.4), mat(x, groundH(x, z) + s * 0.4, z, rng(), rng() * 6, rng()), '#b9ae9a', { flat: true });
    }

    // ---- telescope: pier, rotating mount, tilting tube
    b.add(new THREE.CylinderGeometry(0.62, 0.78, 1.25, 10), mat(O.x, top + 0.62, O.z), '#9a907f', { flat: true });
    ctx.col.circle(O.x, O.z, 0.8, top - 1, top + 2.2);
    this.mount = new THREE.Group();
    this.mount.position.set(O.x, top + 1.25, O.z);
    ctx.scene.add(this.mount);
    const mb = new GeoBuilder();
    mb.add(new THREE.CylinderGeometry(0.8, 0.8, 0.18, 16), mat(0, 0.09, 0), '#7a6a4a');
    mb.add(new THREE.BoxGeometry(0.16, 0.12, 0.7), mat(0, 0.2, 0.75), '#e8b440');
    mb.add(new THREE.ConeGeometry(0.12, 0.25, 6), mat(0, 0.2, 1.15, Math.PI / 2, 0, 0), '#e8b440');
    for (const sx of [-0.45, 0.45]) mb.add(new THREE.BoxGeometry(0.14, 1.1, 0.34), mat(sx, 0.7, 0), '#3c3632');
    quadrant(mb, mat(-0.54, 0.95, 0, 0, -Math.PI / 2, 0), 0.6, ELS, -1, '#2a2622', '#e8b440');
    const mount = new THREE.Mesh(mb.build(), ctx.mats.vc);
    mount.castShadow = true;
    this.mount.add(mount);
    this.tubePivot = new THREE.Group();
    this.tubePivot.position.y = 0.95;
    this.mount.add(this.tubePivot);
    const tb = new GeoBuilder();
    tb.add(new THREE.CylinderGeometry(0.2, 0.27, 3.4, 14), mat(0, 0, 0.7, Math.PI / 2, 0, 0), '#c99a3c');
    for (const z of [-0.7, 0.4, 1.6]) tb.add(new THREE.TorusGeometry(0.25, 0.04, 5, 14), mat(0, 0, z), '#5a4220');
    tb.add(new THREE.CylinderGeometry(0.06, 0.08, 0.35, 8), mat(0, 0, -1.15, Math.PI / 2, 0, 0), '#3c3632');
    tb.add(new THREE.CylinderGeometry(0.1, 0.1, 0.1, 8), mat(0.4, 0, 0, 0, 0, Math.PI / 2), '#3c3632');
    // needle that sweeps across the mount's quadrant
    tb.add(new THREE.BoxGeometry(0.03, 0.03, 0.8), mat(-0.6, 0, 0.42), '#e83a2a');
    tb.add(new THREE.BoxGeometry(0.4, 0.04, 0.04), mat(-0.4, 0, 0.05), '#3c3632');
    const tube = new THREE.Mesh(tb.build(), ctx.mats.vc);
    tube.castShadow = true;
    this.tubePivot.add(tube);
    this.lensMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.35, 0.55, 0.7), fog: false });
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.25, 14), this.lensMat);
    lens.position.z = 2.41;
    this.tubePivot.add(lens);
    this.azA = (this.az / AZN) * Math.PI * 2;
    this.elA = ELS[this.el] * D;
    // cranks & lever
    const azC = new THREE.Vector3(O.x + 1.0, top + 0.75, O.z);
    const elC = new THREE.Vector3(O.x - 1.0, top + 0.75, O.z);
    const lvP = new THREE.Vector3(O.x, top, O.z + 1.6);
    this.azWheel = new THREE.Mesh(wheel(0.3), ctx.mats.vc);
    this.azWheel.position.copy(azC);
    this.azWheel.rotation.y = Math.PI / 2;
    this.elWheel = new THREE.Mesh(wheel(0.26), ctx.mats.vc);
    this.elWheel.position.copy(elC);
    this.elWheel.rotation.y = -Math.PI / 2;
    this.lever = new THREE.Mesh(leverGeo(1), ctx.mats.vc);
    this.lever.position.copy(lvP);
    ctx.scene.add(this.azWheel, this.elWheel, this.lever);
    b.add(new THREE.BoxGeometry(0.4, 0.2, 0.4), mat(lvP.x, top + 0.1, lvP.z), '#3c3632');
    ctx.col.circle(lvP.x, lvP.z, 0.2, top - 1, top + 1);
    this.leverT = 0;
    const can = () => !this.solved && !this.slew;
    ctx.interact.push(
      { pos: azC.clone().setY(top + 0.9), prompt: azC.clone().add(new THREE.Vector3(0.3, 0.5, 0)), reach: 1.6, can, press: () => this.crank(0), puzzle: true },
      { pos: elC.clone().setY(top + 0.9), prompt: elC.clone().add(new THREE.Vector3(-0.3, 0.5, 0)), reach: 1.6, can, press: () => this.crank(1), puzzle: true },
      { pos: lvP.clone().setY(top + 0.9), prompt: lvP.clone().setY(top + 1.4), reach: 1.5, can, press: () => this.test(), puzzle: true },
    );
    // beam from the eyepiece down to the beacon, shown once solved
    this.beamMat = makeBeamMaterial(new THREE.Color(2.4, 2.6, 3.2));
    this.beam = beamMesh(new THREE.Vector3(O.x, top + 2.2, O.z), beacon.firePos, 0.07, this.beamMat);
    this.beam.visible = false;
    ctx.scene.add(this.beam);

    // ---- the fallen dome and the carved elevation slab
    const dg = groundH(OBS.dome.x, OBS.dome.z);
    const db = new GeoBuilder();
    const domeYaw = bearing(OBS.dome, O) + 0.6;
    const DM = mat(OBS.dome.x, dg + 1.3, OBS.dome.z, 1.75, domeYaw, 0.25);
    db.add(new THREE.SphereGeometry(3.6, 20, 8, 0.3, Math.PI * 2 - 0.6, 0, Math.PI / 2), DM, '#5fa08a');
    for (let i = 0; i < 8; i++) db.add(new THREE.TorusGeometry(3.62, 0.07, 4, 16, Math.PI / 2), mul(DM, mat(0, 0, 0, 0, (i / 8) * Math.PI * 2, 0)), '#41715f');
    db.add(new THREE.TorusGeometry(3.6, 0.18, 6, 24), mul(DM, mat(0, 0, 0, Math.PI / 2, 0, 0)), '#7a5a3a');
    const dome = new THREE.Mesh(db.build(), ctx.mats.vcDouble);
    dome.castShadow = true;
    dome.receiveShadow = true;
    ctx.scene.add(dome);
    ctx.col.circle(OBS.dome.x, OBS.dome.z, 3.3, dg - 2, dg + 4);
    // drum ring fragments where the dome used to sit
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.3;
      const x = OBS.dome.x + Math.sin(a) * 4.3 + 1.2, z = OBS.dome.z + Math.cos(a) * 4.3 - 1.5;
      b.add(new THREE.BoxGeometry(1.2, 0.35, 0.4), mat(x, groundH(x, z) + 0.12, z, 0.1, a, 0.2), '#7a5a3a');
    }
    const sg = groundH(OBS.slab.x, OBS.slab.z);
    const slabYaw = bearing(OBS.slab, O);
    const SM = mat(OBS.slab.x, sg, OBS.slab.z, 0, slabYaw, 0);
    b.add(new THREE.BoxGeometry(2.4, 2.1, 0.35), mul(SM, mat(0, 1.05, 0, -0.06, 0, 0)), '#c3b8a3', { flat: true });
    quadrant(b, mul(SM, mat(-0.75, 0.4, 0.2, -0.06, 0, 0)), 1.05, ELS, EL_SOL, '#4a4238', '#e8b440');
    ctx.col.box(OBS.slab.x, OBS.slab.z, 1.2, 0.2, slabYaw, sg - 1, sg + 2.2);

    // ---- tutorial: a small sighting scope with its own inlay and carving
    const T = OBS.tut;
    const tg = groundH(T.x, T.z);
    b.add(new THREE.BoxGeometry(0.7, 1.0, 0.7), mat(T.x, tg + 0.5, T.z), '#9a907f', { flat: true });
    ctx.col.circle(T.x, T.z, 0.45, tg - 1, tg + 1.6);
    // inlay arrow at its foot
    const ta = (TAZ_SOL / TAZN) * Math.PI * 2;
    b.add(new THREE.BoxGeometry(0.12, 0.04, 1.2), mat(T.x + Math.sin(ta) * 1.15, tg + 0.03, T.z + Math.cos(ta) * 1.15, 0, ta, 0), '#e8b440');
    b.add(new THREE.ConeGeometry(0.16, 0.3, 4), mat(T.x + Math.sin(ta) * 1.85, tg + 0.03, T.z + Math.cos(ta) * 1.85, Math.PI / 2, ta, 0), '#e8b440');
    for (let i = 0; i < TAZN; i++) {
      if (i === TAZ_SOL) continue;
      const a = (i / TAZN) * Math.PI * 2;
      b.add(new THREE.BoxGeometry(0.06, 0.03, 0.6), mat(T.x + Math.sin(a) * 0.8, tg + 0.02, T.z + Math.cos(a) * 0.8, 0, a, 0), '#5a5246');
    }
    // carved quadrant on the pedestal face looking at the summit centre
    const faceA = bearing(T, O) ;
    const fq = Math.round(faceA / (Math.PI / 2)) * (Math.PI / 2);
    quadrant(b, mat(T.x + Math.sin(fq) * 0.36 - Math.cos(fq) * 0.2, tg + 0.35, T.z + Math.cos(fq) * 0.36 + Math.sin(fq) * 0.2, 0, fq, 0), 0.3, TELS, TEL_SOL, '#4a4238', '#e8b440');
    this.tMount = new THREE.Group();
    this.tMount.position.set(T.x, tg + 1.0, T.z);
    ctx.scene.add(this.tMount);
    const smb = new GeoBuilder();
    smb.add(new THREE.CylinderGeometry(0.3, 0.3, 0.08, 12), mat(0, 0.04, 0), '#7a6a4a');
    smb.add(new THREE.BoxGeometry(0.06, 0.05, 0.32), mat(0, 0.09, 0.28), '#e8b440');
    for (const sx of [-0.16, 0.16]) smb.add(new THREE.BoxGeometry(0.05, 0.4, 0.12), mat(sx, 0.25, 0), '#3c3632');
    const tmMesh = new THREE.Mesh(smb.build(), ctx.mats.vc);
    this.tMount.add(tmMesh);
    this.tTube = new THREE.Group();
    this.tTube.position.y = 0.38;
    this.tMount.add(this.tTube);
    const stb = new GeoBuilder();
    stb.add(new THREE.CylinderGeometry(0.07, 0.1, 1.0, 10), mat(0, 0, 0.2, Math.PI / 2, 0, 0), '#c99a3c');
    const tt = new THREE.Mesh(stb.build(), ctx.mats.vc);
    this.tTube.add(tt);
    this.tAzA = (this.taz / TAZN) * Math.PI * 2;
    this.tElA = TELS[this.tel] * D;
    // its knobs, lever and lamp
    const side = new THREE.Vector3(Math.cos(fq), 0, -Math.sin(fq));
    const fwd = new THREE.Vector3(Math.sin(fq), 0, Math.cos(fq));
    const k1 = new THREE.Vector3(T.x, tg + 0.7, T.z).addScaledVector(side, 0.45);
    const k2 = new THREE.Vector3(T.x, tg + 0.7, T.z).addScaledVector(side, -0.45);
    this.tK1 = new THREE.Mesh(wheel(0.14), ctx.mats.vc);
    this.tK1.position.copy(k1);
    this.tK1.rotation.y = fq + Math.PI / 2;
    this.tK2 = new THREE.Mesh(wheel(0.12), ctx.mats.vc);
    this.tK2.position.copy(k2);
    this.tK2.rotation.y = fq - Math.PI / 2;
    const tl = new THREE.Vector3(T.x, tg, T.z).addScaledVector(fwd, 1.0).addScaledVector(side, 0.9);
    this.tLever = new THREE.Mesh(leverGeo(0.65), ctx.mats.vc);
    this.tLever.position.copy(tl);
    ctx.scene.add(this.tK1, this.tK2, this.tLever);
    const lampP = new THREE.Vector3(T.x, tg, T.z).addScaledVector(fwd, -0.2).addScaledVector(side, -1.1);
    b.add(new THREE.CylinderGeometry(0.08, 0.1, 1.3, 6), mat(lampP.x, tg + 0.65, lampP.z), '#3c3632');
    b.add(new THREE.CylinderGeometry(0.22, 0.12, 0.18, 8), mat(lampP.x, tg + 1.35, lampP.z), '#3c3632');
    this.tFire = ctx.fires.create({ scale: 0.35, glow: 2.5 });
    this.tFire.group.position.set(lampP.x, tg + 1.42, lampP.z);
    ctx.scene.add(this.tFire.group);
    this.tLeverT = 0;
    const tcan = () => !this.tutDone && !this.tSlew;
    ctx.interact.push(
      { pos: k1.clone(), prompt: k1.clone().setY(tg + 1.2), reach: 1.2, can: tcan, press: () => this.tCrank(0), puzzle: true },
      { pos: k2.clone(), prompt: k2.clone().setY(tg + 1.2), reach: 1.2, can: tcan, press: () => this.tCrank(1), puzzle: true },
      { pos: tl.clone().setY(tg + 0.6), prompt: tl.clone().setY(tg + 1.0), reach: 1.2, can: tcan, press: () => this.tTest(), puzzle: true },
    );
    this.tutPos = new THREE.Vector3(T.x, tg, T.z);
    this.hintPos = new THREE.Vector3(O.x, top, O.z);
    this.zone = [{ x: O.x, z: O.z, r: 7.5 }, { x: T.x, z: T.z, r: 4 }, { x: OBS.slab.x, z: OBS.slab.z, r: 4 }];
    this.spin = [0, 0, 0, 0];
  }
  crank(w) {
    if (w === 0) this.az = (this.az + 1) % AZN;
    else this.el = (this.el + 1) % ELS.length;
    this.spin[w] += Math.PI / 2;
    this.ctx.audio.ratchet(w === 0 ? this.azWheel.position : this.elWheel.position, 1);
    this.ctx.requestSave();
  }
  tCrank(w) {
    if (w === 0) this.taz = (this.taz + 1) % TAZN;
    else this.tel = (this.tel + 1) % TELS.length;
    this.spin[2 + w] += Math.PI / 2;
    this.ctx.audio.ratchet(w === 0 ? this.tK1.position : this.tK2.position, 0.6);
    this.ctx.requestSave();
  }
  test() {
    this.leverT = 1;
    const a = this.ctx.audio;
    a.clank(this.lever.position, 0.8);
    if (this.az === AZ_SOL && this.el === EL_SOL) {
      this.solved = true;
      this.ctx.addTimer(0.6, () => {
        this.lensMat.color.setRGB(3.5, 3.2, 2.4);
        this.beam.visible = true;
        a.success(this.mount.position, 0.8);
      });
      this.ctx.addTimer(2.0, () => this.ctx.onSolved(3));
    } else {
      // wrong: the shutter slams and the counterweight swings the telescope back to rest
      this.az = AZ0;
      this.el = EL0;
      this.slew = true;
      this.ctx.addTimer(0.3, () => a.thud(this.mount.position, 0.8));
    }
    this.ctx.requestSave();
  }
  tTest() {
    this.tLeverT = 1;
    const a = this.ctx.audio;
    a.clank(this.tLever.position, 0.5);
    if (this.taz === TAZ_SOL && this.tel === TEL_SOL) {
      this.tutDone = true;
      this.tFire.ignite();
      this.ctx.addTimer(0.4, () => a.success(this.tutPos, 0.5));
    } else {
      this.taz = TAZ0;
      this.tel = TEL0;
      this.tSlew = true;
      this.ctx.addTimer(0.2, () => a.thud(this.tutPos, 0.5));
    }
    this.ctx.requestSave();
  }
  _approach(cur, target, speed, dt) {
    const d = angDiff(cur, target);
    const step = Math.sign(d) * Math.min(Math.abs(d), speed * dt);
    return cur + step;
  }
  update(dt) {
    const azT = (this.az / AZN) * Math.PI * 2, elT = ELS[this.el] * D;
    const sp = this.slew ? 0.55 : 2.6;
    this.azA = this._approach(this.azA, azT, sp, dt);
    this.elA = this._approach(this.elA, elT, sp * 0.6, dt);
    if (this.slew && Math.abs(angDiff(this.azA, azT)) < 1e-3 && Math.abs(angDiff(this.elA, elT)) < 1e-3) this.slew = false;
    this.mount.rotation.y = this.azA;
    this.tubePivot.rotation.x = -this.elA;
    const tazT = (this.taz / TAZN) * Math.PI * 2, telT = TELS[this.tel] * D;
    const tsp = this.tSlew ? 0.9 : 3.0;
    this.tAzA = this._approach(this.tAzA, tazT, tsp, dt);
    this.tElA = this._approach(this.tElA, telT, tsp * 0.6, dt);
    if (this.tSlew && Math.abs(angDiff(this.tAzA, tazT)) < 1e-3 && Math.abs(angDiff(this.tElA, telT)) < 1e-3) this.tSlew = false;
    this.tMount.rotation.y = this.tAzA;
    this.tTube.rotation.x = -this.tElA;
    // wheels spin on press
    const wheels = [this.azWheel, this.elWheel, this.tK1, this.tK2];
    wheels.forEach((w, i) => {
      w.userData.a = damp(w.userData.a || 0, this.spin[i], 8, dt);
      w.rotation.z = w.userData.a;
    });
    this.leverT = Math.max(0, this.leverT - dt * 1.5);
    this.tLeverT = Math.max(0, this.tLeverT - dt * 1.5);
    this.lever.rotation.x = -Math.sin(this.leverT * Math.PI) * 0.9 + (this.solved ? -0.9 : 0);
    this.tLever.rotation.x = -Math.sin(this.tLeverT * Math.PI) * 0.9 + (this.tutDone ? -0.9 : 0);
  }
  restoreVisuals() {
    this.azA = (this.az / AZN) * Math.PI * 2;
    this.elA = ELS[this.el] * D;
    this.tAzA = (this.taz / TAZN) * Math.PI * 2;
    this.tElA = TELS[this.tel] * D;
    if (this.solved) {
      this.lensMat.color.setRGB(3.5, 3.2, 2.4);
      this.beam.visible = true;
    }
    if (this.tutDone) this.tFire.ignite(true);
  }
  save() {
    return { az: this.az, el: this.el, taz: this.taz, tel: this.tel, solved: this.solved, tutDone: this.tutDone };
  }
  load(o) {
    if (!o) return;
    this.az = (o.az | 0) % AZN;
    this.el = (o.el | 0) % ELS.length;
    this.taz = (o.taz | 0) % TAZN;
    this.tel = (o.tel | 0) % TELS.length;
    this.solved = !!o.solved;
    this.tutDone = !!o.tutDone;
  }
}
