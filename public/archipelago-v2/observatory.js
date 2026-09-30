// The toppled observatory on the summit. The dome has fallen beside the ruined drum; the telescope
// has been re-set on a new pier. A brass inlay in the floor runs to a slot in the wall carved with a
// ring of stones - the sightline to the monolith beacon. A carving on the pier shows the tube tipped
// slightly down. Aim, then look through the eyepiece: the light of the ring's beacon is gathered and
// the summit beacon is ready.
import * as THREE from './three.module.min.js';
import { toon, addOutline } from './util.js';
import { addBox, addCircle, addKeepOut, PEAK, SUMMIT_Y, BEACONS, groundH } from './world.js';
import { wrapAngle } from './math.js';

const C = { x: PEAK.x, y: SUMMIT_Y, z: PEAK.z };
const PITCHES = [(20 * Math.PI) / 180, 0, (-7 * Math.PI) / 180];
const WALL_R = 7;
const TOL = (2.5 * Math.PI) / 180;
const deg = (d) => (d * Math.PI) / 180;

export class Observatory {
  constructor(ctx) {
    this.ctx = ctx;
    const scene = ctx.scene;
    this.solved = false;
    this.pitchIdx = 0;
    this.pivotPos = new THREE.Vector3(C.x, C.y + 2.5, C.z);
    // target: the monolith ring beacon
    const b = BEACONS[1];
    const ty = groundH(b.x, b.z) + 4.3;
    this.target = new THREE.Vector3(b.x, ty, b.z);
    const dx = b.x - C.x, dz = b.z - C.z;
    this.targetAz = Math.atan2(dz, dx);
    this.targetPitchIdx = 2;
    this.az = this.targetAz - deg(110);
    this.holdT = 0;
    this.azDir = -1; // each new grab of the crank turns the other way
    this.look = null;
    const stone = toon(0xb2aa9c), stoneDark = toon(0x8c8478), brass = toon(0xc9a24a), iron = toon(0x3a3431);

    // floor
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(WALL_R + 0.3, WALL_R + 0.5, 0.4, 40), toon(0xa39b8e));
    floor.position.set(C.x, C.y - 0.17, C.z);
    floor.receiveShadow = true;
    scene.add(floor);
    // floor tiles ring pattern
    const ringInlay = new THREE.Mesh(new THREE.RingGeometry(2.2, 2.35, 48), brass);
    ringInlay.rotation.x = -Math.PI / 2;
    ringInlay.position.set(C.x, C.y + 0.04, C.z);
    scene.add(ringInlay);
    // brass inlay line from the pier to the wall slot
    const inlayLen = WALL_R - 1.4;
    const inlay = new THREE.Mesh(new THREE.BoxGeometry(inlayLen, 0.03, 0.14), toon(0xe2b650, { emissive: new THREE.Color(0.15, 0.1, 0.02) }));
    const mid = 1.3 + inlayLen / 2;
    inlay.position.set(C.x + Math.cos(this.targetAz) * mid, C.y + 0.045, C.z + Math.sin(this.targetAz) * mid);
    inlay.rotation.y = -this.targetAz;
    scene.add(inlay);
    // star at the end of the inlay
    const star = new THREE.Mesh(new THREE.CircleGeometry(0.45, 8), toon(0xe2b650, { emissive: new THREE.Color(0.15, 0.1, 0.02) }));
    star.rotation.x = -Math.PI / 2;
    star.position.set(C.x + Math.cos(this.targetAz) * (WALL_R - 0.9), C.y + 0.05, C.z + Math.sin(this.targetAz) * (WALL_R - 0.9));
    scene.add(star);
    const star2 = star.clone();
    star2.rotation.z = Math.PI / 8;
    star2.scale.setScalar(0.8);
    scene.add(star2);
    // other faint radial lines (decoys), dark stone, much less striking
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.2;
      if (Math.abs(wrapAngle(a - this.targetAz)) < 0.3) continue;
      const l = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.02, 0.08), stoneDark);
      l.position.set(C.x + Math.cos(a) * 4.2, C.y + 0.035, C.z + Math.sin(a) * 4.2);
      l.rotation.y = -a;
      scene.add(l);
    }

    // ruined drum wall with a deliberate slot on the sightline and a collapsed side where the dome fell
    const seg = deg(10);
    for (let a = 0; a < Math.PI * 2 - 1e-3; a += seg) {
      const m = a + seg / 2;
      const md = ((m * 180) / Math.PI + 360) % 360;
      if (md > 205 && md < 250) continue;
      if (Math.abs(wrapAngle(m - this.targetAz)) < deg(9)) continue;
      const hgt = 1.6 + Math.abs(Math.sin(a * 3.7)) * 2.2 + (Math.abs(wrapAngle(m - this.targetAz)) < deg(25) ? 1.2 : 0);
      const w = 2 * WALL_R * Math.sin(seg / 2) + 0.05;
      const blk = new THREE.Mesh(new THREE.BoxGeometry(w, hgt, 0.7), stone);
      const x = C.x + Math.cos(m) * WALL_R, z = C.z + Math.sin(m) * WALL_R;
      blk.position.set(x, C.y + hgt / 2, z);
      blk.rotation.y = -m + Math.PI / 2;
      blk.castShadow = blk.receiveShadow = true;
      addOutline(blk, 0.04);
      scene.add(blk);
      addBox(x, z, w / 2, 0.4, m + Math.PI / 2, C.y - 2, C.y + hgt, { cam: true });
    }
    // rubble in the gap
    for (let i = 0; i < 9; i++) {
      const a = deg(208 + i * 4.5);
      const r = WALL_R + 0.5 + (i % 3) * 0.8;
      const rb = new THREE.Mesh(new THREE.DodecahedronGeometry(0.35 + (i % 4) * 0.12, 0), stone);
      rb.position.set(C.x + Math.cos(a) * r, C.y + 0.2, C.z + Math.sin(a) * r);
      rb.rotation.set(i, i * 2, i * 3);
      rb.castShadow = true;
      scene.add(rb);
    }
    // sightline slot: two tall posts and a lintel carved with a ring of stones
    const px = [-1, 1].map((s) => this.targetAz + s * deg(6.5));
    for (const a of px) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.7, 5.0, 0.8), stone);
      const x = C.x + Math.cos(a) * WALL_R, z = C.z + Math.sin(a) * WALL_R;
      post.position.set(x, C.y + 2.5, z);
      post.rotation.y = -a + Math.PI / 2;
      post.castShadow = true;
      addOutline(post, 0.04);
      scene.add(post);
      addBox(x, z, 0.4, 0.45, a + Math.PI / 2, C.y - 2, C.y + 5, { cam: true });
    }
    const lintel = new THREE.Group();
    lintel.position.set(C.x + Math.cos(this.targetAz) * WALL_R, C.y + 5.2, C.z + Math.sin(this.targetAz) * WALL_R);
    lintel.rotation.y = -this.targetAz - Math.PI / 2;
    scene.add(lintel);
    const lb = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.6, 0.9), stone);
    lb.castShadow = true;
    addOutline(lb, 0.04);
    lintel.add(lb);
    // carved ring glyph facing inward
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const nub = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.14, 0.06), toon(0x5c5448));
      nub.position.set(Math.cos(a) * 0.18, Math.sin(a) * 0.18, 0.47);
      lintel.add(nub);
    }
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 4), toon(0xe2b650));
    flame.position.set(0, 0, 0.47);
    lintel.add(flame);

    // fallen dome
    const domeA = deg(285), domeR = 13;
    const dcx = C.x + Math.cos(domeA) * domeR, dcz = C.z + Math.sin(domeA) * domeR;
    const dome = new THREE.Group();
    dome.position.set(dcx, C.y + 1.6, dcz);
    dome.rotation.set(0, -domeA, 0);
    scene.add(dome);
    const shellMat = toon(0x5fa58f, { side: THREE.DoubleSide });
    const shell = new THREE.Mesh(new THREE.SphereGeometry(6.2, 36, 14, 0.35, Math.PI * 2 - 0.7, 0, Math.PI / 2 - 0.1), shellMat);
    shell.rotation.set(0, 0, -1.95);
    shell.castShadow = shell.receiveShadow = true;
    addOutline(shell, 0.06);
    dome.add(shell);
    for (let i = 0; i < 6; i++) {
      const rib = new THREE.Mesh(new THREE.TorusGeometry(6.25, 0.12, 5, 24, Math.PI / 2), toon(0x3f7a68));
      rib.rotation.set(0, (i / 6) * Math.PI * 2 + 0.6, 0);
      const holder = new THREE.Group();
      holder.rotation.set(0, 0, -1.95);
      holder.add(rib);
      rib.rotation.x = Math.PI / 2;
      rib.rotation.z = (i / 6) * Math.PI * 2 + 0.6;
      dome.add(holder);
    }
    const rim = new THREE.Mesh(new THREE.TorusGeometry(6.2, 0.22, 6, 40), toon(0x3f7a68));
    const rimHolder = new THREE.Group();
    rimHolder.rotation.set(0, 0, -1.95);
    rim.rotation.x = Math.PI / 2;
    rimHolder.add(rim);
    dome.add(rimHolder);
    addCircle(dcx, dcz, 5.8, C.y - 2, C.y + 8, { cam: true });
    addKeepOut(C.x, C.z, 22);

    // pier and telescope
    const pier = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.95, 1.3, 10), toon(0xc2baa8));
    pier.position.set(C.x, C.y + 0.65, C.z);
    pier.castShadow = pier.receiveShadow = true;
    addOutline(pier, 0.04);
    scene.add(pier);
    addCircle(C.x, C.z, 1.0, C.y - 1, C.y + 1.5, { cam: false });
    const azRing = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.06, 6, 32), brass);
    azRing.rotation.x = Math.PI / 2;
    azRing.position.set(C.x, C.y + 1.25, C.z);
    scene.add(azRing);
    // carving on the pier: a tube tipped down toward a ring of stones
    const plaque = new THREE.Group();
    const pa = this.targetAz + Math.PI; // faces the person standing behind the telescope
    plaque.position.set(C.x + Math.cos(pa) * 0.9, C.y + 0.7, C.z + Math.sin(pa) * 0.9);
    plaque.rotation.y = -pa + Math.PI / 2;
    scene.add(plaque);
    const slab = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.7, 0.1), toon(0xd8d0c0));
    plaque.add(slab);
    const relTube = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.07, 0.05), toon(0x7a6a50));
    relTube.position.set(-0.08, 0.12, 0.06);
    relTube.rotation.z = -0.28;
    plaque.add(relTube);
    const horizon = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.02, 0.04), toon(0x9a8e7a));
    horizon.position.set(0, 0.2, 0.055);
    plaque.add(horizon);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const st = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.07, 0.04), toon(0x7a6a50));
      st.position.set(0.3 + Math.cos(a) * 0.08, -0.14 + Math.sin(a) * 0.03, 0.07);
      plaque.add(st);
    }

    // signs of the telescope having been hauled back up: shear-legs, rope, wedges, a fresh pier cap
    const timber = toon(0x7a5a3a), rope = toon(0xc8b48a);
    const legA = this.targetAz - Math.PI / 2;
    const T = { x: C.x + Math.cos(legA) * 4.8, z: C.z + Math.sin(legA) * 4.8 };
    const apex = new THREE.Vector3(T.x, C.y + 4.6, T.z);
    for (let i = 0; i < 3; i++) {
      const fa = legA + (i / 3) * Math.PI * 2;
      const foot = new THREE.Vector3(T.x + Math.cos(fa) * 1.3, C.y, T.z + Math.sin(fa) * 1.3);
      const len = foot.distanceTo(apex);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, len, 6), timber);
      leg.position.copy(foot).lerp(apex, 0.5);
      leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), apex.clone().sub(foot).normalize());
      leg.castShadow = true;
      scene.add(leg);
    }
    addCircle(T.x, T.z, 1.0, C.y - 1, C.y + 4);
    const hang = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 2.6, 4), rope);
    hang.position.set(T.x, C.y + 3.3, T.z);
    scene.add(hang);
    const block = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.35, 0.18), timber);
    block.position.set(T.x, C.y + 1.9, T.z);
    scene.add(block);
    const hook = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.025, 4, 10, Math.PI * 1.4), toon(0x3a3431));
    hook.position.set(T.x, C.y + 1.6, T.z);
    scene.add(hook);
    const coilA = this.targetAz + Math.PI * 0.75;
    const coil = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.09, 6, 16), rope);
    coil.rotation.x = Math.PI / 2;
    coil.position.set(C.x + Math.cos(coilA) * 3.3, C.y + 0.1, C.z + Math.sin(coilA) * 3.3);
    scene.add(coil);
    const coil2 = coil.clone();
    coil2.position.y += 0.15;
    coil2.scale.setScalar(0.8);
    scene.add(coil2);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      const wedge = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.12, 0.2), timber);
      wedge.position.set(C.x + Math.cos(a) * 0.85, C.y + 1.24, C.z + Math.sin(a) * 0.85);
      wedge.rotation.y = -a;
      scene.add(wedge);
    }
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.08, 10), toon(0xe0d8c8));
    cap.position.set(C.x, C.y + 1.28, C.z);
    scene.add(cap);

    this.turntable = new THREE.Group();
    this.turntable.position.set(C.x, C.y + 1.3, C.z);
    scene.add(this.turntable);
    for (const s of [-1, 1]) {
      const fork = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.3, 0.14), iron);
      fork.position.set(0, 0.65, s * 0.45);
      fork.castShadow = true;
      this.turntable.add(fork);
    }
    const needle = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.05, 0.08), toon(0xe24a2a));
    needle.position.set(0.9, -0.05, 0);
    this.turntable.add(needle);
    this.tubePivot = new THREE.Group();
    this.tubePivot.position.y = 1.2;
    this.turntable.add(this.tubePivot);
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.26, 4.6, 16), brass);
    tube.rotation.z = -Math.PI / 2;
    tube.position.x = 0.7;
    tube.castShadow = true;
    addOutline(tube, 0.03);
    this.tubePivot.add(tube);
    for (const x of [-1.3, 0.2, 2.2, 3.0]) {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.37, 0.37, 0.12, 16), toon(0x8a6a2a));
      band.rotation.z = Math.PI / 2;
      band.position.x = x;
      this.tubePivot.add(band);
    }
    this.objMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 0.25, 0.3) });
    const objective = new THREE.Mesh(new THREE.CircleGeometry(0.33, 16), this.objMat);
    objective.rotation.y = Math.PI / 2;
    objective.position.x = 3.01;
    this.tubePivot.add(objective);
    const eye = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.4, 8), iron);
    eye.rotation.z = Math.PI / 2;
    eye.position.x = -1.8;
    this.tubePivot.add(eye);

    // crank wheel (hold to turn) and pitch lever
    const crankA = this.targetAz + Math.PI + deg(55);
    const crankPos = { x: C.x + Math.cos(crankA) * 2.4, z: C.z + Math.sin(crankA) * 2.4 };
    const cpost = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 1.1, 8), iron);
    cpost.position.set(crankPos.x, C.y + 0.55, crankPos.z);
    scene.add(cpost);
    this.crank = new THREE.Group();
    this.crank.position.set(crankPos.x, C.y + 1.15, crankPos.z);
    scene.add(this.crank);
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.05, 6, 20), brass);
    wheel.rotation.x = Math.PI / 2;
    this.crank.add(wheel);
    for (let i = 0; i < 3; i++) {
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.04, 0.05), brass);
      spoke.rotation.y = (i / 3) * Math.PI;
      this.crank.add(spoke);
    }
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.25, 6), iron);
    knob.position.set(0.38, 0.12, 0);
    this.crank.add(knob);
    // a brass gear-rod from the crank to the pier so the connection reads
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.5, 6), brass);
    rod.position.set((crankPos.x + C.x) / 2, C.y + 1.05, (crankPos.z + C.z) / 2);
    rod.rotation.set(0, -crankA, Math.PI / 2);
    scene.add(rod);
    addCircle(crankPos.x, crankPos.z, 0.25, C.y - 1, C.y + 1.4);
    ctx.register({
      pos: new THREE.Vector3(crankPos.x, C.y + 1.0, crankPos.z), r: 2.0, promptY: 0.9,
      enabled: () => !this.solved && !this.look, press: () => { this.holdT = 0; this.azDir = -this.azDir; }, hold: (dt) => this.turnAz(dt), id: 'crank',
    });
    const leverA = this.targetAz + Math.PI - deg(55);
    const leverPos = { x: C.x + Math.cos(leverA) * 2.4, z: C.z + Math.sin(leverA) * 2.4 };
    const quad = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.04, 4, 16, Math.PI * 0.6), brass);
    quad.position.set(leverPos.x, C.y + 0.6, leverPos.z);
    quad.rotation.y = -leverA;
    quad.rotation.z = Math.PI * 0.2;
    scene.add(quad);
    const lbase = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.4), iron);
    lbase.position.set(leverPos.x, C.y + 0.25, leverPos.z);
    scene.add(lbase);
    this.lever = new THREE.Group();
    this.lever.position.set(leverPos.x, C.y + 0.5, leverPos.z);
    this.lever.rotation.y = -leverA;
    scene.add(this.lever);
    const lstick = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.9, 6), iron);
    lstick.position.y = 0.45;
    this.lever.add(lstick);
    const lknob = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), toon(0xe24a2a));
    lknob.position.y = 0.92;
    this.lever.add(lknob);
    this.leverArm = this.lever;
    addCircle(leverPos.x, leverPos.z, 0.3, C.y - 1, C.y + 1.4);
    ctx.register({
      pos: new THREE.Vector3(leverPos.x, C.y + 1.0, leverPos.z), r: 2.0, promptY: 0.9,
      enabled: () => !this.solved && !this.look, press: () => this.cyclePitch(), id: 'lever',
    });
    this.eyeIP = new THREE.Vector3();
    ctx.register({
      pos: this.eyeIP, r: 1.9, promptY: 1.4,
      enabled: () => !this.solved && !this.look, press: () => this.startLook(), id: 'eyepiece',
    });
    this.pitch = PITCHES[this.pitchIdx];
    this.pitchShown = this.pitch;
    this.applyPose();
    // telescope-to-beacon light line
    this.gather = 0;
  }
  applyPose() {
    this.turntable.rotation.y = -this.az;
    this.tubePivot.rotation.z = this.pitchShown;
    const back = { x: -Math.cos(this.az), z: -Math.sin(this.az) };
    this.eyeIP.set(C.x + back.x * 2.3, C.y + 1.0, C.z + back.z * 2.3);
  }
  turnAz(dt) {
    this.holdT += dt;
    const speed = this.holdT < 0.7 ? deg(4) : deg(16);
    this.az += speed * dt * this.azDir;
    this.crank.rotation.y -= speed * dt * 12 * this.azDir;
    this._tick = (this._tick || 0) + speed * dt;
    if (this._tick > deg(3)) { this._tick = 0; this.ctx.audio.click(this.pivotPos, 1.4); }
    this.applyPose();
    this.ctx.saveSoon();
  }
  cyclePitch() {
    this.pitchIdx = (this.pitchIdx + 1) % PITCHES.length;
    this.pitch = PITCHES[this.pitchIdx];
    this.ctx.audio.click(this.pivotPos, 0.6);
    this.ctx.audio.grind(this.pivotPos, 0.4);
    this.ctx.save();
  }
  aligned() {
    return Math.abs(wrapAngle(this.az - this.targetAz)) < TOL && this.pitchIdx === this.targetPitchIdx;
  }
  startLook() {
    const dir = new THREE.Vector3(Math.cos(this.az) * Math.cos(this.pitch), Math.sin(this.pitch), Math.sin(this.az) * Math.cos(this.pitch));
    const eyeWorld = this.pivotPos.clone().addScaledVector(dir, -1.9);
    this.look = { t: 0, dur: 4.2, pos: eyeWorld.clone().add(new THREE.Vector3(0, 0.05, 0)), look: eyeWorld.clone().addScaledVector(dir, 100), fov: 6, success: this.aligned() && this.ctx.game.lit[1], flared: false };
    this.ctx.player.frozen = true;
    this.ctx.audio.click(this.pivotPos, 0.5);
  }
  update(dt, time, night) {
    // animate pitch
    this.pitchShown += (this.pitch - this.pitchShown) * Math.min(1, dt * 4);
    const lz = [-0.55, 0, 0.5][this.pitchIdx];
    this.lever.rotation.z += (lz - this.lever.rotation.z) * Math.min(1, dt * 8);
    this.applyPose();
    const L = this.look;
    if (L) {
      L.t += dt;
      const inT = Math.min(1, L.t / 0.6), outT = Math.min(1, (L.dur - L.t) / 0.6);
      const blend = Math.max(0, Math.min(inT, outT));
      this.ctx.camRig.override = { pos: L.pos, look: L.look, fov: L.fov, blend: blend * blend * (3 - 2 * blend) };
      this.ctx.post.eyepiece = blend;
      if (L.success && L.t > 1.6 && !L.flared) {
        L.flared = true;
        this.ctx.flash(1.2);
        this.ctx.audio.success(this.pivotPos);
        this.ctx.audio.whoosh(this.pivotPos, 0.6);
      }
      if (L.t >= L.dur) {
        this.look = null;
        this.ctx.camRig.override = null;
        this.ctx.post.eyepiece = 0;
        this.ctx.player.frozen = false;
        if (L.success) {
          this.solved = true;
          this.gather = 1;
          const obj = this.pivotPos.clone().add(new THREE.Vector3(Math.cos(this.az) * 3, Math.sin(this.pitch) * 3, Math.sin(this.az) * 3));
          this.ctx.spark(this.ctx.game.beacons[3].lightPos, obj, () => this.ctx.game.primeBeacon(3));
          this.ctx.save();
        }
      }
    }
    const lit = this.solved ? 1 : 0;
    this.objMat.color.setRGB(0.2 + lit * 3, 0.25 + lit * 2, 0.3 + lit * 0.8);
  }
  hint() {
    if (this.solved) return null;
    if (Math.abs(wrapAngle(this.az - this.targetAz)) >= TOL) return this.crank.position.clone();
    if (this.pitchIdx !== this.targetPitchIdx) return this.lever.position.clone().add(new THREE.Vector3(0, 0.6, 0));
    return this.eyeIP.clone().add(new THREE.Vector3(0, 1.2, 0));
  }
  getState() { return { solved: this.solved, az: this.az, p: this.pitchIdx }; }
  setState(s) {
    if (!s) return;
    this.solved = !!s.solved;
    if (typeof s.az === 'number') this.az = s.az;
    if (typeof s.p === 'number') { this.pitchIdx = s.p % PITCHES.length; this.pitch = this.pitchShown = PITCHES[this.pitchIdx]; }
    this.applyPose();
  }
}
