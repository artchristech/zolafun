// Five Lights — the apprentice: toon model, walk/idle/raise-lantern animation, movement.
import * as THREE from './three.module.min.js';
import { toon, clamp, damp, dampAngle, lerp } from './util.js';
import { groundInfo } from './terrain.js';
import { pushOut } from './colliders.js';
import { Fire } from './fire.js';

function part(geo, color, x, y, z, parent) {
  const m = new THREE.Mesh(geo, toon(color));
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

export class Player {
  constructor(scene) {
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.y = 0; this.fallV = 0;
    this.phase = 0; this.idleT = 0; this.raiseT = 0; this.raiseHold = 0;
    this.stillTime = 0;
    this.surf = 'grass';
    this.onStep = null;
    this.root = new THREE.Group();
    scene.add(this.root);
    const body = this.body = new THREE.Group();
    this.root.add(body);
    // legs
    const legGeo = new THREE.CylinderGeometry(0.075, 0.065, 0.48, 6); legGeo.translate(0, -0.24, 0);
    const bootGeo = new THREE.BoxGeometry(0.14, 0.1, 0.22); bootGeo.translate(0, -0.5, 0.04);
    this.legs = [-1, 1].map((s) => {
      const g = new THREE.Group(); g.position.set(0.1 * s, 0.56, 0); body.add(g);
      part(legGeo, 0x4b3b2e, 0, 0, 0, g);
      part(bootGeo, 0x2b211b, 0, 0, 0, g);
      return g;
    });
    // torso: blue keeper's coat
    this.torso = new THREE.Group(); this.torso.position.y = 0.56; body.add(this.torso);
    part(new THREE.CylinderGeometry(0.2, 0.27, 0.62, 8), 0x2f5c8f, 0, 0.3, 0, this.torso);
    part(new THREE.CylinderGeometry(0.28, 0.3, 0.12, 8), 0xe9d9b0, 0, 0.02, 0, this.torso); // coat hem
    part(new THREE.CylinderGeometry(0.21, 0.21, 0.06, 8), 0x6b4a2b, 0, 0.22, 0, this.torso); // belt
    // head
    this.head = new THREE.Group(); this.head.position.y = 0.72; this.torso.add(this.head);
    part(new THREE.SphereGeometry(0.17, 12, 10), 0xf1c9a0, 0, 0.12, 0, this.head);
    part(new THREE.SphereGeometry(0.175, 12, 8, 0, Math.PI * 2, 0, 1.35), 0x7a4a2a, 0, 0.14, -0.015, this.head); // hair
    const cap = part(new THREE.CylinderGeometry(0.15, 0.19, 0.12, 10), 0xd8402f, 0, 0.3, 0, this.head);
    part(new THREE.BoxGeometry(0.2, 0.025, 0.12), 0x222222, 0, -0.05, 0.14, cap); // visor
    const eyeGeo = new THREE.SphereGeometry(0.025, 6, 4);
    part(eyeGeo, 0x1d1d1d, -0.06, 0.13, 0.15, this.head);
    part(eyeGeo, 0x1d1d1d, 0.06, 0.13, 0.15, this.head);
    part(new THREE.ConeGeometry(0.11, 0.12, 6), 0xffffff, 0, -0.03, 0, this.head).rotation.x = Math.PI; // scarf knot
    // arms
    const armGeo = new THREE.CylinderGeometry(0.06, 0.05, 0.5, 6); armGeo.translate(0, -0.25, 0);
    const handGeo = new THREE.SphereGeometry(0.055, 6, 5); handGeo.translate(0, -0.52, 0);
    this.arms = [-1, 1].map((s) => {
      const g = new THREE.Group(); g.position.set(0.27 * s, 0.56, 0); this.torso.add(g);
      part(armGeo, 0x2f5c8f, 0, 0, 0, g);
      part(handGeo, 0xf1c9a0, 0, 0, 0, g);
      return g;
    });
    // lantern in the right hand
    this.lantern = new THREE.Group();
    this.lantern.position.set(0, -0.6, 0.02);
    this.arms[1].add(this.lantern);
    part(new THREE.TorusGeometry(0.06, 0.012, 4, 10), 0x333333, 0, 0.02, 0, this.lantern).rotation.y = Math.PI / 2;
    part(new THREE.CylinderGeometry(0.07, 0.09, 0.05, 6), 0x3a3a3a, 0, -0.06, 0, this.lantern);
    const glass = part(new THREE.CylinderGeometry(0.075, 0.075, 0.18, 6, 1, true), 0xffe2a0, 0, -0.17, 0, this.lantern);
    glass.material.transparent = true; glass.material.opacity = 0.35; glass.castShadow = false;
    part(new THREE.CylinderGeometry(0.09, 0.09, 0.04, 6), 0x3a3a3a, 0, -0.28, 0, this.lantern);
    this.flame = new Fire(0.16, { lit: true, embers: false, hot: 1.2 });
    this.flame.snap();
    this.flame.group.position.y = -0.26;
    this.lantern.add(this.flame.group);
    this.lanternWorld = new THREE.Vector3();
  }

  place(x, z, yaw = 0) {
    this.pos.set(x, groundInfo(x, z).h, z);
    this.y = this.pos.y;
    this.yaw = yaw;
    this.vel.set(0, 0, 0);
    this.sync();
  }

  raise() { this.raiseHold = 1.4; }
  get raising() { return this.raiseHold > 0 || this.raiseT > 0.05; }

  // move: {x,y} input; camYaw: camera heading; water: current sea level
  update(dt, move, camYaw, water, frozen) {
    const sp = 5.2;
    let tx = 0, tz = 0;
    if (!frozen) {
      const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
      const rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
      tx = (fx * move.y + rx * move.x) * sp;
      tz = (fz * move.y + rz * move.x) * sp;
    }
    this.vel.x = damp(this.vel.x, tx, 10, dt);
    this.vel.z = damp(this.vel.z, tz, 10, dt);
    const speed = Math.hypot(this.vel.x, this.vel.z);
    if (speed > 0.3) this.yaw = dampAngle(this.yaw, Math.atan2(this.vel.x, this.vel.z), 10, dt);

    const cur = groundInfo(this.pos.x, this.pos.z).h;
    const tryMove = (nx, nz) => {
      const g = groundInfo(nx, nz).h;
      if (g < water - 0.12) return false;
      const run = Math.hypot(nx - this.pos.x, nz - this.pos.z) || 1e-4;
      if (g - cur > 0.06 && (g - cur) / run > 0.95) return false; // too steep to climb
      return true;
    };
    const nx = this.pos.x + this.vel.x * dt, nz = this.pos.z + this.vel.z * dt;
    if (tryMove(nx, nz)) { this.pos.x = nx; this.pos.z = nz; }
    else if (tryMove(nx, this.pos.z)) { this.pos.x = nx; this.vel.z *= 0.5; }
    else if (tryMove(this.pos.x, nz)) { this.pos.z = nz; this.vel.x *= 0.5; }
    else { this.vel.x *= 0.2; this.vel.z *= 0.2; }
    const before = { x: this.pos.x, z: this.pos.z };
    pushOut(this.pos, 0.32, this.y);
    if (!tryMove(this.pos.x, this.pos.z)) { this.pos.x = before.x; this.pos.z = before.z; }

    const gi = groundInfo(this.pos.x, this.pos.z);
    this.surf = gi.surf;
    if (gi.h >= this.y - 0.05) { this.y = damp(this.y, gi.h, 18, dt); this.fallV = 0; }
    else { this.fallV += 20 * dt; this.y = Math.max(gi.h, this.y - this.fallV * dt); }
    this.pos.y = this.y;

    // animation
    const moving = speed > 0.4;
    this.stillTime = moving ? 0 : this.stillTime + dt;
    const prev = this.phase;
    this.phase += dt * speed * 1.75;
    if (Math.floor(prev / Math.PI) !== Math.floor(this.phase / Math.PI) && moving && this.onStep) this.onStep(this.surf);
    const k = clamp(speed / sp, 0, 1);
    const s = Math.sin(this.phase);
    this.idleT += dt;
    this.raiseHold = Math.max(0, this.raiseHold - dt);
    this.raiseT = damp(this.raiseT, this.raiseHold > 0 ? 1 : 0, 9, dt);
    this.legs[0].rotation.x = s * 0.75 * k;
    this.legs[1].rotation.x = -s * 0.75 * k;
    const breath = Math.sin(this.idleT * 2.1) * (1 - k);
    this.body.position.y = Math.abs(Math.cos(this.phase)) * 0.06 * k + breath * 0.008;
    this.torso.rotation.x = 0.08 * k + breath * 0.02;
    this.torso.rotation.z = Math.sin(this.idleT * 0.9) * 0.02 * (1 - k);
    this.head.rotation.y = Math.sin(this.idleT * 0.45) * 0.35 * (1 - k) * (1 - this.raiseT);
    this.head.rotation.x = -0.25 * this.raiseT;
    this.arms[0].rotation.x = s * 0.6 * k + breath * 0.04;
    this.arms[0].rotation.z = -0.08;
    // lantern arm: swings when walking, rises overhead when lighting
    const swing = -s * 0.45 * k + Math.sin(this.idleT * 1.7) * 0.05 * (1 - k);
    this.arms[1].rotation.x = lerp(swing, -2.7, this.raiseT);
    this.arms[1].rotation.z = lerp(0.1, 0.25, this.raiseT);
    this.lantern.rotation.x = -this.arms[1].rotation.x + Math.sin(this.idleT * 3) * 0.08 * (1 - this.raiseT);
    this.flame.update(dt);
    this.sync();
  }

  sync() {
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;
    this.root.updateMatrixWorld(true);
    this.lantern.getWorldPosition(this.lanternWorld);
  }
}
