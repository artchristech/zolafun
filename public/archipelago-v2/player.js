// The lighthouse keeper's apprentice: procedural model, walk / idle / raise-lantern animation, movement.
import * as THREE from './three.module.min.js';
import { toon, addOutline } from './util.js';
import { Fire } from './fire.js';
import { groundH, canStep, resolveCollisions, surfaceAt, state as worldState } from './world.js';
import { clamp, lerp, damp, wrapAngle } from './math.js';

function limb(len, r0, r1, color) {
  const g = new THREE.CylinderGeometry(r1, r0, len, 8);
  g.translate(0, -len / 2, 0);
  const m = new THREE.Mesh(g, toon(color));
  m.castShadow = true;
  addOutline(m, 0.018);
  return m;
}

export class Player {
  constructor(scene) {
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.facing = 0; // yaw of the body, 0 = facing -z
    this.phase = 0;
    this.speed = 0;
    this.idleT = 0;
    this.raise = 0;
    this.raiseT = 0;
    this.lastStepPhase = 0;
    this.onStep = null;
    this.frozen = false;
    this.stuckT = 0;
    this.build(scene);
  }
  build(scene) {
    const root = (this.root = new THREE.Group());
    scene.add(root);
    const hips = (this.hips = new THREE.Group());
    hips.position.y = 0.86;
    root.add(hips);
    // torso: long keeper's coat
    const coatGeo = new THREE.CylinderGeometry(0.19, 0.31, 0.78, 10);
    coatGeo.translate(0, 0.28, 0);
    const coat = new THREE.Mesh(coatGeo, toon(0x2c5f8a));
    coat.castShadow = true;
    addOutline(coat, 0.02);
    const torso = (this.torso = new THREE.Group());
    hips.add(torso);
    torso.add(coat);
    // coat hem flare
    const hem = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.34, 0.16, 10), toon(0x244e73));
    hem.position.y = -0.14;
    hem.castShadow = true;
    torso.add(hem);
    // belt + satchel strap
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.255, 0.265, 0.07, 10), toon(0x5a3a22));
    belt.position.y = 0.08;
    torso.add(belt);
    const strap = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.02, 4, 16), toon(0x6b4a2e));
    strap.rotation.set(0.1, 0, 0.9);
    strap.position.set(0, 0.34, 0);
    torso.add(strap);
    // scarf
    const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.06, 6, 14), toon(0xd9542c));
    scarf.rotation.x = Math.PI / 2;
    scarf.position.y = 0.66;
    torso.add(scarf);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.32, 0.04), toon(0xd9542c));
    tail.position.set(0.08, 0.5, 0.17);
    tail.rotation.z = 0.2;
    torso.add(tail);
    this.scarfTail = tail;
    // head
    const head = (this.head = new THREE.Group());
    head.position.y = 0.8;
    torso.add(head);
    const face = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), toon(0xf1c49b));
    face.castShadow = true;
    face.scale.set(1, 1.05, 1);
    addOutline(face, 0.015);
    head.add(face);
    const hat = new THREE.Mesh(new THREE.SphereGeometry(0.185, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), toon(0xf2b632));
    hat.position.y = 0.03;
    hat.castShadow = true;
    addOutline(hat, 0.015);
    head.add(hat);
    const brim = new THREE.Mesh(new THREE.TorusGeometry(0.165, 0.035, 6, 16), toon(0xe0a02a));
    brim.rotation.x = Math.PI / 2;
    brim.position.y = 0.04;
    head.add(brim);
    const pom = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), toon(0xd9542c));
    pom.position.y = 0.2;
    head.add(pom);
    const eyeMat = toon(0x1a1410);
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.024, 6, 6), eyeMat);
      e.scale.set(0.8, 1.3, 0.6);
      e.position.set(s * 0.062, 0.0, -0.155);
      head.add(e);
    }
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6), toon(0xe7a983));
    nose.position.set(0, -0.04, -0.17);
    head.add(nose);
    // arms
    this.arms = [];
    for (const s of [-1, 1]) {
      const sh = new THREE.Group();
      sh.position.set(s * 0.25, 0.6, 0);
      torso.add(sh);
      const upper = limb(0.3, 0.07, 0.065, 0x2c5f8a);
      sh.add(upper);
      const elbow = new THREE.Group();
      elbow.position.y = -0.3;
      sh.add(elbow);
      const fore = limb(0.27, 0.06, 0.055, 0x2c5f8a);
      elbow.add(fore);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), toon(0xf1c49b));
      hand.position.y = -0.29;
      elbow.add(hand);
      const handPivot = new THREE.Group();
      handPivot.position.y = -0.3;
      elbow.add(handPivot);
      this.arms.push({ sh, elbow, hand: handPivot, side: s });
    }
    // legs
    this.legs = [];
    for (const s of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(s * 0.11, 0, 0);
      hips.add(hip);
      hip.add(limb(0.42, 0.085, 0.075, 0x3b3140));
      const knee = new THREE.Group();
      knee.position.y = -0.42;
      hip.add(knee);
      knee.add(limb(0.36, 0.07, 0.06, 0x3b3140));
      const boot = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.1, 0.24), toon(0x4a2e1c));
      boot.position.set(0, -0.39, -0.04);
      boot.castShadow = true;
      addOutline(boot, 0.015);
      knee.add(boot);
      this.legs.push({ hip, knee, side: s });
    }
    // lantern in the right hand
    const lantern = (this.lantern = new THREE.Group());
    this.arms[1].hand.add(lantern);
    const bail = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.008, 4, 12, Math.PI), toon(0x2a2a2a));
    bail.position.y = -0.02;
    lantern.add(bail);
    const body = new THREE.Group();
    body.position.y = -0.2;
    lantern.add(body);
    this.lanternBody = body;
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.08, 6), toon(0x2f2b28));
    cap.position.y = 0.11;
    body.add(cap);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.04, 6), toon(0x2f2b28));
    base.position.y = -0.09;
    body.add(base);
    for (let i = 0; i < 4; i++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.18, 0.012), toon(0x2f2b28));
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      bar.position.set(Math.cos(a) * 0.075, 0.01, Math.sin(a) * 0.075);
      body.add(bar);
    }
    this.glassMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.7, 0.35).multiplyScalar(1.6), transparent: true, opacity: 0.35, depthWrite: false });
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.16, 8), this.glassMat);
    body.add(glass);
    this.flame = new Fire({ height: 0.13, width: 0.07, embers: 0, boost: 1.2, layers: [{ x: 0, z: 0, s: 1, seed: 3 }] });
    this.flame.group.position.y = -0.07;
    this.flame.set(1, true);
    body.add(this.flame.group);
    this.light = new THREE.PointLight(0xffa850, 2, 22, 1.3);
    this.light.position.y = 0;
    body.add(this.light);
    this.lanternSwing = { a: 0, v: 0, b: 0, bv: 0 };
    this.prevHand = new THREE.Vector3();
  }
  lanternWorldPos(out) { return this.lanternBody.getWorldPosition(out); }
  raiseLantern(dur = 1.6) { this.raiseT = dur; }
  place(x, z, yaw) {
    this.pos.set(x, groundH(x, z), z);
    this.facing = yaw;
    this.root.position.copy(this.pos);
    this.root.rotation.y = yaw;
  }
  update(dt, input, camYaw, night, time) {
    // --- movement ---
    const mv = this.frozen ? { x: 0, y: 0 } : input.move;
    const mag = Math.min(1, Math.hypot(mv.x, mv.y));
    const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
    const rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
    let wx = fx * mv.y + rx * mv.x, wz = fz * mv.y + rz * mv.x;
    const wl = Math.hypot(wx, wz);
    if (wl > 1e-4) { wx /= wl; wz /= wl; }
    const maxSpeed = input.run ? 7.2 : 4.6;
    const targetSpeed = mag * maxSpeed;
    this.vel.x = lerp(this.vel.x, wx * targetSpeed, damp(10, dt));
    this.vel.z = lerp(this.vel.z, wz * targetSpeed, damp(10, dt));
    const sp = Math.hypot(this.vel.x, this.vel.z);
    if (sp > 0.05) {
      const targetYaw = Math.atan2(-this.vel.x, -this.vel.z);
      this.facing += wrapAngle(targetYaw - this.facing) * damp(12, dt);
    }
    // step with walkability checks (slide along axes when blocked)
    const px = this.pos.x, pz = this.pos.z, py = this.pos.y;
    let nx = px + this.vel.x * dt, nz = pz + this.vel.z * dt;
    let moved = true;
    if (!canStep(px, pz, py, nx, nz)) {
      if (canStep(px, pz, py, nx, pz)) nz = pz;
      else if (canStep(px, pz, py, px, nz)) nx = px;
      else { nx = px; nz = pz; moved = false; }
    }
    if (!moved && sp > 0.5) {
      this.stuckT += dt;
      // escape hatch: if we're stuck on unstable ground, allow any downhill move
      if (this.stuckT > 0.6) {
        const tx = px + this.vel.x * dt, tz = pz + this.vel.z * dt;
        const th = groundH(tx, tz);
        if (th <= py + 0.05 && th > worldState.waterY - 0.5) { nx = tx; nz = tz; }
      }
    } else this.stuckT = 0;
    const np = { x: nx, z: nz };
    resolveCollisions(np, 0.35, py, 1.7);
    // do not let collision push us onto unwalkable ground
    if (!canStep(px, pz, py, np.x, np.z) && (np.x !== nx || np.z !== nz)) { np.x = nx; np.z = nz; }
    this.pos.x = np.x; this.pos.z = np.z;
    const gh = groundH(this.pos.x, this.pos.z);
    this.pos.y = gh > this.pos.y ? lerp(this.pos.y, gh, damp(25, dt)) : lerp(this.pos.y, gh, damp(14, dt));
    if (Math.abs(this.pos.y - gh) > 1.5) this.pos.y = gh;
    const actual = Math.hypot(this.pos.x - px, this.pos.z - pz) / Math.max(dt, 1e-4);
    this.speed = lerp(this.speed, actual, damp(12, dt));

    // --- animation ---
    const walk = clamp(this.speed / 4.6, 0, 1.6);
    const stride = 1.35;
    this.phase += (this.speed * dt / stride) * Math.PI;
    // footsteps at each half cycle
    const stepIdx = Math.floor(this.phase / Math.PI);
    if (stepIdx !== this.lastStepPhase) {
      this.lastStepPhase = stepIdx;
      if (walk > 0.15 && this.onStep) this.onStep(surfaceAt(this.pos.x, this.pos.z), clamp(walk, 0.4, 1.2));
    }
    if (walk < 0.1) this.idleT += dt; else this.idleT = 0;
    if (this.raiseT > 0) this.raiseT -= dt;
    this.raise = lerp(this.raise, this.raiseT > 0 ? 1 : 0, damp(this.raiseT > 0 ? 6 : 3, dt));

    const s = Math.sin(this.phase), c = Math.cos(this.phase);
    const w = Math.min(1, walk);
    const idleBreath = Math.sin(time * 1.8) * 0.5 + 0.5;
    this.hips.position.y = 0.86 + Math.abs(c) * 0.05 * w - 0.03 * w + idleBreath * 0.006 * (1 - w);
    this.hips.rotation.y = s * 0.12 * w;
    this.torso.rotation.y = -s * 0.18 * w;
    this.torso.rotation.x = -0.08 * w * (walk > 1.1 ? 1.6 : 1) + 0.01 * idleBreath * (1 - w);
    this.torso.scale.set(1, 1 + idleBreath * 0.012 * (1 - w), 1);
    for (const L of this.legs) {
      const ph = L.side > 0 ? s : -s;
      const phc = L.side > 0 ? c : -c;
      L.hip.rotation.x = ph * 0.62 * w;
      L.knee.rotation.x = -(Math.max(0, -phc) * 1.05 * w + 0.04);
    }
    // idle: look around slowly, shift weight
    const look = Math.sin(time * 0.37) * 0.5 + Math.sin(time * 0.91) * 0.2;
    this.head.rotation.y = lerp(0, look * 0.6, (1 - w) * clamp(this.idleT / 2, 0, 1)) - this.torso.rotation.y * 0.5;
    this.head.rotation.x = lerp(0.04 * s * w, 0.3, this.raise);
    this.hips.position.x = Math.sin(time * 0.5) * 0.015 * (1 - w);
    // arms
    const left = this.arms[0], right = this.arms[1];
    left.sh.rotation.x = s * 0.55 * w;
    left.sh.rotation.z = -0.12 - 0.04 * idleBreath * (1 - w);
    left.elbow.rotation.x = 0.25 + 0.3 * w;
    // lantern arm: held forward slightly, raised when lighting
    const carryX = 0.35 - s * 0.12 * w;
    right.sh.rotation.x = lerp(carryX, 2.55, this.raise);
    right.sh.rotation.z = lerp(0.12, 0.05, this.raise);
    right.elbow.rotation.x = lerp(0.55, 0.15, this.raise);
    // keep lantern hanging down (counter-rotate hand pivot), with pendulum swing
    const armPitch = right.sh.rotation.x + right.elbow.rotation.x;
    const hp = new THREE.Vector3();
    this.lanternBody.getWorldPosition(hp);
    const acc = hp.clone().sub(this.prevHand).divideScalar(Math.max(dt, 1e-3));
    this.prevHand.copy(hp);
    const sw = this.lanternSwing;
    const fwdAcc = acc.x * -Math.sin(this.facing) + acc.z * -Math.cos(this.facing);
    const sideAcc = acc.x * Math.cos(this.facing) - acc.z * Math.sin(this.facing);
    sw.v += (-sw.a * 30 - sw.v * 3 + clamp(fwdAcc, -20, 20) * 0.25) * dt;
    sw.a += sw.v * dt;
    sw.bv += (-sw.b * 30 - sw.bv * 3 - clamp(sideAcc, -20, 20) * 0.25) * dt;
    sw.b += sw.bv * dt;
    sw.a = clamp(sw.a, -0.8, 0.8); sw.b = clamp(sw.b, -0.8, 0.8);
    right.hand.rotation.x = -armPitch + sw.a;
    right.hand.rotation.z = sw.b;
    this.scarfTail.rotation.x = -0.1 - w * 0.6 + Math.sin(time * 6) * 0.08 * w;

    // lantern brightness grows with night, flares when raised
    const flick = 0.9 + Math.sin(time * 13.1) * 0.05 + Math.sin(time * 29.7) * 0.05;
    this.light.intensity = (1.2 + night * 9 + this.raise * 6) * flick;
    this.light.distance = 16 + night * 14;
    this.glassMat.opacity = 0.3 + night * 0.3;

    this.root.position.copy(this.pos);
    this.root.rotation.y = this.facing;
  }
}
