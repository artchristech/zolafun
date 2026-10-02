// The toppled observatory on the summit. A fallen dome lies through the broken drum wall; the telescope has been
// re-set on its mount. Azimuth wheel and elevation crank each click one carved notch; the brass lever commits.
// Azimuth is read from the brass floor inlay, elevation from the carving on the fallen dome (two clues, two places).
// A small telescope with its own inlay (azimuth only) teaches the idea.
import * as THREE from './three.module.min.js';
import { GeoBuilder, mat, makeStaticMesh, sceneryMat, toonMat, starGeometry, mulberry32, damp, clamp } from './util.js';
import { SPOT, AZ_STEPS, EL_STEPS, azAngle, elAngle, STAR_AZ, STAR_EL, starDir } from './layout.js';
import { addCircle, addBox } from './colliders.js';
import { exclude } from './foliage.js';
import { addBrazier } from './fire.js';

const FLOOR = 40.0;
const TUT_STEPS = 8;
const TUT_TARGET = 3;
const LOCK = 6;

export class Observatory {
  constructor(ctx) {
    this.ctx = ctx;
    const [cx, cz] = SPOT.summit;
    this.cx = cx; this.cz = cz;
    this.areas = [{ x: cx, z: cz, r: 12 }];
    this.az = 0; this.el = 0; this.solved = false; this.lock = 0;
    this.azShown = 0; this.elShown = 0;
    this.tAz = 0; this.tAzShown = 0; this.tSolved = false; this.tLock = 0;
    this.wheelSpin = 0; this.crankSpin = 0; this.lever = 0; this.tLever = 0;
    const b = new GeoBuilder({ seed: 31 });
    const rng = mulberry32(31);
    const L = (lx, lz) => [cx + lx, cz + lz];
    exclude(cx, cz, 15);

    // ---- floor: rings of slabs
    for (let ring = 0; ring < 5; ring++) {
      const r0 = 1.4 + ring * 1.7;
      const n = 8 + ring * 7;
      for (let i = 0; i < n; i++) {
        const a = ((i + (ring % 2) * 0.5) / n) * Math.PI * 2;
        const [x, z] = L(Math.cos(a) * (r0 + 0.85), Math.sin(a) * (r0 + 0.85));
        if (rng() < 0.06 && ring > 2) continue; // a few missing slabs
        b.box(1.6, 0.2, (Math.PI * 2 * (r0 + 0.85)) / n - 0.08, mat(x, FLOOR - 0.08 + rng() * 0.03, z, 0, -a, 0), ring % 2 ? '#b8ad97' : '#c6bca6', { jitter: 0.08 });
      }
    }
    // ---- broken drum wall (gaps: trail entry, where the dome crashed through, and a breach)
    const gaps = [[68, 100], [140, 182], [292, 312]];
    for (let d = 0; d < 360; d += 9) {
      if (gaps.some(([g0, g1]) => d + 4.5 > g0 && d - 4.5 < g1)) continue;
      const a = (d * Math.PI) / 180;
      const [x, z] = L(Math.cos(a) * 11.2, Math.sin(a) * 11.2);
      const h = 1.2 + Math.abs(Math.sin(d * 0.07) * 2.6) + rng() * 0.8;
      b.box(1.85, h, 0.9, mat(x, FLOOR + h / 2 - 0.1, z, 0, -a + Math.PI / 2, 0), '#a89c88', { jitter: 0.1, top: '#8e9a74' });
      addBox(x, z, 0.95, 0.5, a - Math.PI / 2 + Math.PI, FLOOR - 2, FLOOR + h);
    }
    // rubble
    for (let i = 0; i < 26; i++) {
      const a = rng() * Math.PI * 2, r = 9 + rng() * 5;
      const [x, z] = L(Math.cos(a) * r, Math.sin(a) * r);
      b.ico(0.3 + rng() * 0.4, 0, mat(x, FLOOR + 0.1, z, rng(), rng(), rng()), '#9d927e');
    }

    // ---- the fallen dome, crashed through the wall
    const da = (160 * Math.PI) / 180;
    const [dx, dz] = L(Math.cos(da) * 12.2, Math.sin(da) * 12.2);
    const toMount = new THREE.Vector3(cx - dx, 0, cz - dz).normalize();
    const dg = new THREE.SphereGeometry(4.6, 22, 10, 0.35, Math.PI * 2 - 0.7, 0, Math.PI / 2);
    // dome opening faces -y by default; turn it toward the mount, tipped slightly down
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(toMount.x, -0.25, toMount.z).normalize());
    const domeMat = toonMat({ side: THREE.DoubleSide });
    const dpos = new THREE.Vector3(dx, FLOOR + 3.6, dz);
    const dcol = new Float32Array(dg.attributes.position.count * 3);
    const cA = new THREE.Color('#5fa39a'), cB = new THREE.Color('#4b8a82');
    for (let i = 0; i < dg.attributes.position.count; i++) {
      const c = (Math.floor(i / 23) % 2) ? cA : cB;
      dcol[i * 3] = c.r; dcol[i * 3 + 1] = c.g; dcol[i * 3 + 2] = c.b;
    }
    dg.setAttribute('color', new THREE.BufferAttribute(dcol, 3));
    this.dome = new THREE.Mesh(dg, domeMat);
    this.dome.position.copy(dpos);
    this.dome.quaternion.copy(q);
    this.dome.castShadow = true; this.dome.receiveShadow = true;
    ctx.scene.add(this.dome);
    // rim ring and ribs
    const rim = new THREE.TorusGeometry(4.6, 0.22, 6, 28);
    rim.rotateX(Math.PI / 2);
    const rm = new THREE.Matrix4().compose(dpos, q, new THREE.Vector3(1, 1, 1));
    b.add(rim, rm, '#6b5a3c', {});
    rim.dispose();
    addCircle(dx, dz, 4.3, FLOOR - 2, FLOOR + 8);
    // carved elevation plate standing in the dome mouth, facing the mount
    const right = new THREE.Vector3(toMount.z, 0, -toMount.x);
    const plateC = new THREE.Vector3(dx, FLOOR, dz).addScaledVector(toMount, 4.3);
    const plateM = new THREE.Matrix4().makeBasis(right, new THREE.Vector3(0, 1, 0), toMount).setPosition(plateC.x, plateC.y + 1.6, plateC.z);
    const P = (px, py, pz = 0) => new THREE.Matrix4().copy(plateM).multiply(new THREE.Matrix4().makeTranslation(px, py, pz));
    b.box(3.4, 3.2, 0.25, P(0, 0, 0), '#8a7f6a', {});
    b.box(3.6, 0.25, 0.4, P(0, -1.65, 0), '#6b604e');
    // relief: horizon line, six ticks on a quarter arc from the pivot, star at the right tick, sight line to it
    const piv = [-1.4, -1.3];
    const R = 2.5;
    b.box(R + 0.2, 0.06, 0.08, P(piv[0] + R / 2, piv[1], 0.15), '#3c352c');
    for (let j = 0; j < EL_STEPS; j++) {
      const e = elAngle(j);
      const px = piv[0] + Math.cos(e) * R, py = piv[1] + Math.sin(e) * R;
      b.box(0.36, 0.08, 0.08, new THREE.Matrix4().copy(P(px, py, 0.15)).multiply(new THREE.Matrix4().makeRotationZ(e)), '#3c352c');
    }
    const es = elAngle(STAR_EL);
    const sg = starGeometry(0.32, 0.12);
    b.add(sg, P(piv[0] + Math.cos(es) * (R + 0.45), piv[1] + Math.sin(es) * (R + 0.45), 0.2), '#f2c94c', { flat: true });
    sg.dispose();
    b.box(R, 0.05, 0.06, new THREE.Matrix4().copy(P(piv[0] + Math.cos(es) * R / 2, piv[1] + Math.sin(es) * R / 2, 0.16)).multiply(new THREE.Matrix4().makeRotationZ(es)), '#c9a646');
    b.cyl(0.12, 0.12, 0.12, 8, new THREE.Matrix4().copy(P(piv[0], piv[1], 0.16)).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2)), '#3c352c');
    addBox(plateC.x, plateC.z, 1.8, 0.3, Math.atan2(right.z, right.x), FLOOR - 1, FLOOR + 3.4);

    // ---- brass inlay on the floor: from the mount out along the star's azimuth, ending in a star
    const az = azAngle(STAR_AZ);
    for (let r = 1.6; r < 9.2; r += 0.5) {
      const [x, z] = L(Math.cos(az) * r, Math.sin(az) * r);
      b.box(0.5, 0.06, 0.22, mat(x, FLOOR + 0.04, z, 0, -az, 0), '#d6b04a');
    }
    {
      const [x, z] = L(Math.cos(az) * 9.8, Math.sin(az) * 9.8);
      const g = starGeometry(0.6, 0.06);
      g.rotateX(-Math.PI / 2);
      b.add(g, mat(x, FLOOR + 0.05, z), '#f0cb52', { flat: true });
      g.dispose();
    }

    // ---- mount pier with 16 azimuth notches
    b.cyl(1.0, 1.25, 1.3, 16, mat(cx, FLOOR + 0.65, cz), '#9a8f7c', { flat: true });
    for (let i = 0; i < AZ_STEPS; i++) {
      const a = azAngle(i);
      b.box(0.1, 0.12, 0.28, mat(cx + Math.cos(a) * 1.02, FLOOR + 1.3, cz + Math.sin(a) * 1.02, 0, -a, 0), '#3c352c');
    }
    addCircle(cx, cz, 1.4, FLOOR - 1, FLOOR + 4);
    // rotating yoke + tube (dynamic meshes)
    const yb = new GeoBuilder();
    yb.cyl(0.9, 0.9, 0.2, 16, mat(0, 0.1, 0), '#6a5236', { flat: true });
    yb.box(0.18, 1.5, 0.5, mat(0.75, 0.9, 0), '#7a5e3c');
    yb.box(0.18, 1.5, 0.5, mat(-0.75, 0.9, 0), '#7a5e3c');
    yb.box(0.12, 0.12, 0.5, mat(0, 0.25, 1.05), '#e6c25a'); // pointer over the azimuth notches
    // elevation arc with 6 ticks on the right fork
    for (let j = 0; j < EL_STEPS; j++) {
      const e = elAngle(j);
      yb.box(0.06, 0.06, 0.24, mat(0.86, 1.4 + Math.sin(e) * 0.65, Math.cos(e) * 0.65, -e, 0, 0), '#2e2a24');
    }
    this.yoke = new THREE.Mesh(yb.build(), sceneryMat());
    this.yoke.position.set(cx, FLOOR + 1.3, cz);
    this.yoke.castShadow = true;
    ctx.scene.add(this.yoke);
    const tb = new GeoBuilder();
    const tube = (r0, r1, len, z, col) => tb.cyl(r0, r1, len, 12, mat(0, 0, z, Math.PI / 2, 0, 0), col, {});
    tube(0.36, 0.42, 3.6, 0.6, '#b98d3e');
    tube(0.45, 0.45, 0.3, 2.3, '#6a4a22');
    tube(0.44, 0.44, 0.2, -0.6, '#6a4a22');
    tube(0.2, 0.3, 1.2, -1.7, '#8c6a32');
    tube(0.08, 0.08, 0.4, -2.4, '#3a2c1c');
    tb.box(0.16, 0.16, 0.16, mat(0.7, 0, 0), '#3a2c1c'); tb.box(0.16, 0.16, 0.16, mat(-0.7, 0, 0), '#3a2c1c');
    tb.box(0.06, 0.06, 0.5, mat(0.82, 0.0, 0.45), '#e6c25a'); // elevation pointer
    this.tube = new THREE.Mesh(tb.build(), sceneryMat());
    this.tube.position.set(0, 1.4, 0);
    this.tube.castShadow = true;
    this.yoke.add(this.tube);
    // lens glint
    this.lens = new THREE.Mesh(new THREE.CircleGeometry(0.36, 14), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 0.4, 0.5), fog: false }));
    this.lens.position.set(0, 0, 2.42);
    this.tube.add(this.lens);

    // ---- azimuth wheel, elevation crank, commit lever
    const W = L(2.7, -1.2), C = L(-2.7, -1.0), Lv = L(0.9, 2.9);
    this.wheelPos = new THREE.Vector3(W[0], FLOOR + 1.4, W[1]);
    this.crankPos = new THREE.Vector3(C[0], FLOOR + 1.2, C[1]);
    this.leverPos = new THREE.Vector3(Lv[0], FLOOR + 1.3, Lv[1]);
    b.box(0.3, 1.3, 0.3, mat(W[0], FLOOR + 0.65, W[1]), '#7a6a52');
    b.box(0.3, 1.0, 0.3, mat(C[0], FLOOR + 0.5, C[1]), '#7a6a52');
    b.box(0.5, 0.5, 0.5, mat(Lv[0], FLOOR + 0.25, Lv[1]), '#7a6a52');
    addCircle(W[0], W[1], 0.4, FLOOR - 1, FLOOR + 2, { cam: false });
    addCircle(C[0], C[1], 0.4, FLOOR - 1, FLOOR + 2, { cam: false });
    addCircle(Lv[0], Lv[1], 0.4, FLOOR - 1, FLOOR + 2, { cam: false });
    const wb = new GeoBuilder();
    const ring = new THREE.TorusGeometry(0.6, 0.06, 6, 20);
    wb.add(ring, mat(0, 0, 0), '#6a4a22', {});
    for (let i = 0; i < 6; i++) wb.box(1.2, 0.06, 0.06, mat(0, 0, 0, 0, 0, (i * Math.PI) / 6), '#6a4a22');
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; wb.ico(0.08, 0, mat(Math.cos(a) * 0.66, Math.sin(a) * 0.66, 0), '#c9a646'); }
    ring.dispose();
    this.wheel = new THREE.Mesh(wb.build(), sceneryMat());
    const wg = new THREE.Group();
    wg.position.copy(this.wheelPos).add(new THREE.Vector3(0, 0.2, 0));
    wg.lookAt(cx, wg.position.y, cz);
    wg.add(this.wheel);
    ctx.scene.add(wg);
    const cb = new GeoBuilder();
    cb.box(0.08, 0.7, 0.08, mat(0, 0.3, 0), '#6a4a22');
    cb.box(0.1, 0.1, 0.35, mat(0, 0.62, 0.15), '#c9a646');
    cb.cyl(0.14, 0.14, 0.12, 10, mat(0, 0, 0, 0, 0, Math.PI / 2), '#3a2c1c', {});
    this.crank = new THREE.Mesh(cb.build(), sceneryMat());
    this.crank.position.copy(this.crankPos);
    ctx.scene.add(this.crank);
    const lb = new GeoBuilder();
    lb.box(0.1, 1.2, 0.1, mat(0, 0.6, 0), '#8c6a32');
    lb.ico(0.14, 1, mat(0, 1.25, 0), '#e0b84a');
    this.leverMesh = new THREE.Mesh(lb.build(), sceneryMat());
    this.leverMesh.position.set(Lv[0], FLOOR + 0.5, Lv[1]);
    this.leverMesh.rotation.order = 'YXZ';
    this.leverMesh.rotation.y = Math.atan2(cx - Lv[0], cz - Lv[1]);
    ctx.scene.add(this.leverMesh);

    // ---- tutorial telescope with its own small inlay
    const T = L(6.8, 5.2);
    this.tPos = new THREE.Vector3(T[0], FLOOR + 1.3, T[1]);
    b.cyl(0.35, 0.45, 1.1, 10, mat(T[0], FLOOR + 0.55, T[1]), '#9a8f7c', { flat: true });
    for (let i = 0; i < TUT_STEPS; i++) {
      const a = (i / TUT_STEPS) * Math.PI * 2;
      b.box(0.06, 0.08, 0.16, mat(T[0] + Math.cos(a) * 0.38, FLOOR + 1.1, T[1] + Math.sin(a) * 0.38, 0, -a, 0), '#3c352c');
    }
    const ta = (TUT_TARGET / TUT_STEPS) * Math.PI * 2;
    for (let r = 0.7; r < 2.4; r += 0.35) b.box(0.32, 0.05, 0.12, mat(T[0] + Math.cos(ta) * r, FLOOR + 0.04, T[1] + Math.sin(ta) * r, 0, -ta, 0), '#d6b04a');
    {
      const g = starGeometry(0.3, 0.05); g.rotateX(-Math.PI / 2);
      b.add(g, mat(T[0] + Math.cos(ta) * 2.7, FLOOR + 0.05, T[1] + Math.sin(ta) * 2.7), '#f0cb52', { flat: true }); g.dispose();
    }
    addCircle(T[0], T[1], 0.5, FLOOR - 1, FLOOR + 1.6, { cam: false });
    const sb = new GeoBuilder();
    sb.cyl(0.1, 0.14, 1.0, 8, mat(0, 0.0, 0.2, Math.PI / 2 - 0.25, 0, 0), '#b98d3e', {});
    sb.box(0.05, 0.05, 0.3, mat(0, -0.12, 0.35), '#e6c25a');
    this.tTube = new THREE.Mesh(sb.build(), sceneryMat());
    this.tTube.position.set(T[0], FLOOR + 1.3, T[1]);
    this.tTube.castShadow = true;
    ctx.scene.add(this.tTube);
    const TL = L(8.4, 4.0);
    this.tLeverPos = new THREE.Vector3(TL[0], FLOOR + 0.9, TL[1]);
    b.box(0.3, 0.3, 0.3, mat(TL[0], FLOOR + 0.15, TL[1]), '#7a6a52');
    const tlb = new GeoBuilder();
    tlb.box(0.07, 0.7, 0.07, mat(0, 0.35, 0), '#8c6a32');
    tlb.ico(0.09, 1, mat(0, 0.72, 0), '#e0b84a');
    this.tLeverMesh = new THREE.Mesh(tlb.build(), sceneryMat());
    this.tLeverMesh.position.set(TL[0], FLOOR + 0.3, TL[1]);
    this.tLeverMesh.rotation.order = 'YXZ';
    this.tLeverMesh.rotation.y = Math.atan2(T[0] - TL[0], T[1] - TL[1]);
    ctx.scene.add(this.tLeverMesh);
    this.tGlint = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 0.2, 0.25), fog: false }));
    this.tTube.add(this.tGlint);
    this.tGlint.position.set(0, 0.12, 0.7);

    // ---- beacon
    const [bx, bz] = SPOT.beaconO;
    this.fireY = addBrazier(b, bx, FLOOR, bz, true);
    this.beaconPos = new THREE.Vector3(bx, this.fireY, bz);
    addCircle(bx, bz, 1.1, FLOOR - 1, FLOOR + 4);

    // ---- cairns at the trail hairpins are added by main (shared with the trail); static mesh:
    this.static = makeStaticMesh(b);
    ctx.scene.add(this.static);
  }

  interactables() {
    const busy = () => this.solved || this.lock > 0;
    return [
      { pos: this.wheelPos, r: 1.7, can: () => !busy(), use: () => this.turnAz() },
      { pos: this.crankPos, r: 1.7, can: () => !busy(), use: () => this.turnEl() },
      { pos: this.leverPos, r: 1.6, can: () => !busy(), use: () => this.commit() },
      { pos: this.tPos, r: 1.4, can: () => !this.tSolved && this.tLock <= 0, use: () => this.turnTut() },
      { pos: this.tLeverPos, r: 1.2, can: () => !this.tSolved && this.tLock <= 0, use: () => this.commitTut() },
    ];
  }

  turnAz() { this.az = (this.az + 1) % AZ_STEPS; this.wheelSpin += Math.PI / 4; this.ctx.audio.click(this.wheelPos, 0.8); this.ctx.audio.grind(this.yoke.position); this.ctx.save(); }
  turnEl() { this.el = (this.el + 1) % EL_STEPS; this.crankSpin += Math.PI / 2; this.ctx.audio.click(this.crankPos, 1.1); this.ctx.save(); }
  turnTut() { this.tAz = (this.tAz + 1) % TUT_STEPS; this.ctx.audio.click(this.tPos, 1.4); this.ctx.save(); }

  commit() {
    this.lever = 1;
    this.ctx.audio.clack(this.leverPos);
    if (this.az === STAR_AZ && this.el === STAR_EL) {
      this.solved = true;
      const sd = new THREE.Vector3(...starDir());
      const lensW = new THREE.Vector3();
      this.lens.getWorldPosition(lensW);
      this.ctx.beams.set('star', lensW.clone().addScaledVector(sd, 160), lensW, 0.08, 0);
      this.starBeamT = 0;
      this.ctx.audio.chime(659, this.yoke.position, 0.35);
      setTimeout(() => this.ctx.onSolved([lensW]), 1600);
    } else {
      this.lock = LOCK;
      this.az = 0; this.el = 0; // the mechanism swings back to rest
      this.ctx.audio.thunk(this.leverPos);
      this.ctx.audio.grind(this.yoke.position);
    }
    this.ctx.save();
  }

  commitTut() {
    this.tLever = 1;
    this.ctx.audio.clack(this.tLeverPos);
    if (this.tAz === TUT_TARGET) { this.tSolved = true; this.ctx.audio.chime(880, this.tPos, 0.3); }
    else { this.tLock = 3; this.tAz = 0; this.ctx.audio.thunk(this.tLeverPos); }
    this.ctx.save();
  }

  update(dt, time, night) {
    this.lock = Math.max(0, this.lock - dt);
    this.tLock = Math.max(0, this.tLock - dt);
    // shortest-way animation toward the current notch (resets swing visibly)
    const azT = azAngle(this.az);
    let d = azT - this.azShown;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.azShown += d * (1 - Math.exp(-dt * (this.lock > 0 ? 1.6 : 7)));
    this.elShown = damp(this.elShown, elAngle(this.el), this.lock > 0 ? 1.6 : 7, dt);
    this.yoke.rotation.y = Math.PI / 2 - this.azShown;
    this.tube.rotation.x = -this.elShown;
    const tT = (this.tAz / TUT_STEPS) * Math.PI * 2;
    let td = tT - this.tAzShown; td = Math.atan2(Math.sin(td), Math.cos(td));
    this.tAzShown += td * (1 - Math.exp(-dt * (this.tLock > 0 ? 2 : 8)));
    this.tTube.rotation.y = Math.PI / 2 - this.tAzShown;
    this.wheelSpinShown = damp(this.wheelSpinShown || 0, this.wheelSpin, 8, dt);
    this.wheel.rotation.z = this.wheelSpinShown;
    this.crankSpinShown = damp(this.crankSpinShown || 0, this.crankSpin, 8, dt);
    this.crank.rotation.x = this.crankSpinShown;
    // levers: pulled down then return (slowly while locked)
    this.lever = Math.max(0, this.lever - dt * (this.lock > 0 ? 0.17 : 1.5));
    if (this.solved) this.lever = 1;
    this.leverMesh.rotation.x = -0.9 * Math.min(1, this.lever * 1.3) + 0.35;
    this.tLever = Math.max(0, this.tLever - dt * (this.tLock > 0 ? 0.35 : 1.5));
    if (this.tSolved) this.tLever = 1;
    this.tLeverMesh.rotation.x = -0.9 * Math.min(1, this.tLever * 1.3) + 0.35;
    const g = this.solved ? 5 : 0.3 + night * 0.4;
    this.lens.material.color.setRGB(g * 0.9, g * 0.95, g * 1.1);
    const tg = this.tSolved ? 4 + Math.sin(time * 4) : 0.25;
    this.tGlint.material.color.setRGB(tg, tg * 0.9, tg * 0.6);
    if (this.starBeamT !== undefined && this.starBeamT < 1) {
      this.starBeamT = Math.min(1, this.starBeamT + dt * 0.8);
      const it = this.ctx.beams.items.find((x) => x.id === 'star');
      if (it) it.grow = this.starBeamT;
    }
  }

  getState() { return { az: this.az, el: this.el, solved: this.solved, tAz: this.tAz, tSolved: this.tSolved }; }
  setState(s) {
    if (!s) return;
    this.az = s.az || 0; this.el = s.el || 0; this.solved = !!s.solved; this.tAz = s.tAz || 0; this.tSolved = !!s.tSolved;
    this.azShown = azAngle(this.az); this.elShown = elAngle(this.el); this.tAzShown = (this.tAz / TUT_STEPS) * Math.PI * 2;
    if (this.solved) {
      this.yoke.rotation.y = Math.PI / 2 - this.azShown; this.tube.rotation.x = -this.elShown;
      this.yoke.updateMatrixWorld(true);
      const sd = new THREE.Vector3(...starDir());
      const lensW = new THREE.Vector3();
      this.lens.getWorldPosition(lensW);
      this.ctx.beams.set('star', lensW.clone().addScaledVector(sd, 160), lensW, 0.08, 1);
    }
  }
}
