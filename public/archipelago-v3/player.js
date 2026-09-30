import * as THREE from './three.module.min.js';
import { toon, toonUnique } from './materials.js';
import { Fire } from './fire.js';
import { groundH, surfaceAt } from './terrain.js';
import { angleLerp } from './noise.js';

const MAX_SPEED = 5.4;

// The lighthouse keeper's apprentice: walk cycle, idle, lantern raise.
export class Player {
  constructor(G) {
    this.G = G;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.vy = 0;
    this.yaw = 0;
    this.phase = 0;
    this.stepSide = 0;
    this.raise = 0;
    this.raiseT = 0;
    this.idleT = 0;
    this.t = 0;
    this.groundY = 0;
    this.onWood = false;
    this.surface = 'grass';
    this.moving = 0;
    this.lanternWorld = new THREE.Vector3();
    this.build();
  }

  build() {
    const coat = toon(0x365c8c), coat2 = toon(0x2c4a72), scarf = toon(0xf2c14e), pants = toon(0x5a4636), boots = toon(0x3a2a20);
    const skin = toon(0xf1c9a5), hair = toon(0x5a3a22), cap = toon(0xc8432f), dark = toon(0x1c1a1a), brass = toon(0xd4a24a);
    const g = this.group = new THREE.Group();
    const body = this.body = new THREE.Group();
    g.add(body);
    const mk = (geo, mat, x, y, z, parent) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; (parent || body).add(m); return m; };
    // legs (pivot at hip)
    this.legs = [-1, 1].map((s) => {
      const hip = new THREE.Group(); hip.position.set(0.13 * s, 0.82, 0); body.add(hip);
      mk(new THREE.CylinderGeometry(0.085, 0.075, 0.62, 6), pants, 0, -0.33, 0, hip);
      mk(new THREE.BoxGeometry(0.17, 0.14, 0.3), boots, 0, -0.73, 0.05, hip);
      return hip;
    });
    this.torso = new THREE.Group(); this.torso.position.y = 0.82; body.add(this.torso);
    mk(new THREE.CylinderGeometry(0.24, 0.31, 0.62, 10), coat, 0, 0.3, 0, this.torso);
    mk(new THREE.CylinderGeometry(0.31, 0.36, 0.22, 10), coat2, 0, 0.02, 0, this.torso);
    mk(new THREE.TorusGeometry(0.19, 0.07, 6, 12), scarf, 0, 0.62, 0, this.torso).rotation.x = Math.PI / 2;
    const tail = mk(new THREE.BoxGeometry(0.1, 0.34, 0.05), scarf, 0.1, 0.45, -0.24, this.torso); tail.rotation.z = 0.25;
    this.scarfTail = tail;
    mk(new THREE.BoxGeometry(0.1, 0.12, 0.05), brass, 0, 0.18, 0.28, this.torso);
    // head
    this.head = new THREE.Group(); this.head.position.y = 0.72; this.torso.add(this.head);
    mk(new THREE.SphereGeometry(0.21, 14, 10), skin, 0, 0.2, 0, this.head);
    mk(new THREE.SphereGeometry(0.215, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), hair, 0, 0.23, -0.02, this.head);
    const capM = mk(new THREE.ConeGeometry(0.2, 0.34, 10), cap, 0, 0.5, -0.04, this.head); capM.rotation.x = -0.35;
    mk(new THREE.SphereGeometry(0.06, 8, 6), toon(0xf4efe6), 0, 0.64, -0.13, this.head);
    for (const s of [-1, 1]) {
      const e = mk(new THREE.SphereGeometry(0.035, 8, 6), dark, 0.075 * s, 0.22, 0.19, this.head); e.scale.set(1, 1.5, 0.6);
    }
    mk(new THREE.SphereGeometry(0.03, 6, 4), toon(0xe0a888), 0, 0.16, 0.21, this.head);
    // arms (pivot at shoulder)
    this.arms = [-1, 1].map((s) => {
      const sh = new THREE.Group(); sh.position.set(0.31 * s, 0.55, 0); this.torso.add(sh);
      mk(new THREE.CylinderGeometry(0.07, 0.06, 0.55, 6), coat, 0, -0.27, 0, sh);
      mk(new THREE.SphereGeometry(0.065, 8, 6), skin, 0, -0.58, 0, sh);
      return sh;
    });
    // lantern in the right hand, hanging from a pivot so it stays upright
    this.lanternPivot = new THREE.Group(); this.lanternPivot.position.y = -0.6; this.arms[1].add(this.lanternPivot);
    const lan = new THREE.Group(); lan.position.y = -0.2; this.lanternPivot.add(lan);
    mk(new THREE.TorusGeometry(0.07, 0.015, 4, 10, Math.PI), brass, 0, 0.13, 0, lan);
    mk(new THREE.CylinderGeometry(0.1, 0.12, 0.05, 8), brass, 0, 0.07, 0, lan);
    mk(new THREE.CylinderGeometry(0.12, 0.12, 0.04, 8), brass, 0, -0.14, 0, lan);
    this.glassM = toonUnique(0xfff1c8, { emissive: new THREE.Color(0xffa040), emissiveIntensity: 0.6, transparent: true, opacity: 0.55 });
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.2, 8, 1, true), this.glassM);
    glass.position.y = -0.04; lan.add(glass);
    for (let k = 0; k < 4; k++) {
      const b = mk(new THREE.BoxGeometry(0.015, 0.2, 0.015), brass, Math.cos(k * 1.57) * 0.1, -0.04, Math.sin(k * 1.57) * 0.1, lan);
      b.castShadow = false;
    }
    this.lanternFire = new Fire({ size: [0.09, 0.15], hdr: 1.7, embers: 0, halo: 0.55, haloDay: 0.05, lit: true });
    this.lanternFire.group.position.y = -0.12;
    lan.add(this.lanternFire.group);
    this.lantern = lan;
    this.G.fires.push(this.lanternFire);
    this.G.scene.add(g);
  }

  raiseLantern(hold = 1.1) { this.raiseT = Math.max(this.raiseT, hold); this.idleT = 0; }

  place(x, z, yaw) {
    const g = this.G.physics.groundAt(x, z);
    this.pos.set(x, g.h, z);
    this.groundY = g.h;
    this.yaw = yaw;
    this.vel.set(0, 0, 0);
  }

  // Can the apprentice stand at (x,z) coming from the current position?
  canStand(x, z) {
    const G = this.G;
    const g = G.physics.groundAt(x, z, this.pos.y);
    if (!g.wood && G.tide.level - g.h > 0.35) return false;
    const dh = g.h - this.groundY;
    if (dh > 0.5) return false;
    if (!g.wood && dh > 0.0) {
      const e = 0.6;
      const gx = (groundH(x + e, z) - groundH(x - e, z)) / (2 * e);
      const gz = (groundH(x, z + e) - groundH(x, z - e)) / (2 * e);
      const mx = x - this.pos.x, mz = z - this.pos.z;
      const ml = Math.hypot(mx, mz) || 1;
      const dir = (gx * mx + gz * mz) / ml;
      const sl = Math.hypot(gx, gz);
      if (dir > 0.85 || (sl > 1.0 && dir > 0.05)) return false;
    }
    return true;
  }

  update(dt, move, camYaw, locked) {
    const G = this.G;
    this.t += dt;
    // camera-relative intent
    const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
    const rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
    let dx = rx * move[0] - fx * move[1], dz = rz * move[0] - fz * move[1];
    const mag = Math.min(1, Math.hypot(dx, dz));
    if (locked) { dx = dz = 0; }
    let sp = MAX_SPEED * (this.raiseT > 0 ? 0.35 : 1);
    const tx = dx * sp, tz = dz * sp;
    const k = Math.min(1, dt * (mag > 0.01 ? 9 : 12));
    this.vel.x += (tx - this.vel.x) * k;
    this.vel.z += (tz - this.vel.z) * k;
    if (mag > 0.05 && !locked) this.idleT = 0; else this.idleT += dt;

    const ox = this.pos.x, oz = this.pos.z;
    let nx = ox + this.vel.x * dt, nz = oz + this.vel.z * dt;
    if (!this.canStand(nx, nz)) {
      if (this.canStand(nx, oz)) { nz = oz; this.vel.z *= 0.5; }
      else if (this.canStand(ox, nz)) { nx = ox; this.vel.x *= 0.5; }
      else { nx = ox; nz = oz; this.vel.x *= 0.2; this.vel.z *= 0.2; }
    }
    [nx, nz] = G.physics.pushOut(nx, nz, this.pos.y + 0.5, 0.35);
    if (!this.canStand(nx, nz)) { nx = ox; nz = oz; }
    const g = G.physics.groundAt(nx, nz, this.pos.y);
    this.pos.x = nx; this.pos.z = nz;
    this.groundY = g.h;
    this.onWood = g.wood;
    if (this.pos.y > g.h + 0.05) {
      this.vy -= 22 * dt;
      this.pos.y = Math.max(g.h, this.pos.y + this.vy * dt);
    } else {
      this.vy = 0;
      this.pos.y += (g.h - this.pos.y) * Math.min(1, dt * 16);
    }
    const moved = Math.hypot(nx - ox, nz - oz);
    const spd = moved / Math.max(dt, 1e-4);
    this.moving += (Math.min(1, spd / MAX_SPEED) - this.moving) * Math.min(1, dt * 10);
    if (spd > 0.3) this.yaw = angleLerp(this.yaw, Math.atan2(this.vel.x, this.vel.z), Math.min(1, dt * 10));

    // footsteps from the walk cycle
    const prevPhase = this.phase;
    this.phase += moved * (Math.PI * 2 / 1.55);
    if (Math.floor(prevPhase / Math.PI) !== Math.floor(this.phase / Math.PI) && spd > 0.6) {
      const water = !g.wood && G.tide.level - g.h > 0.04;
      this.surface = g.wood ? 'wood' : water ? 'water' : surfaceAt(nx, nz, g.h);
      G.audio.footstep(this.surface, nx, this.pos.y, nz);
    }

    // animation
    const s = this.moving;
    const ph = this.phase;
    this.raiseT = Math.max(0, this.raiseT - dt);
    this.raise += ((this.raiseT > 0 ? 1 : 0) - this.raise) * Math.min(1, dt * 7);
    const swing = Math.sin(ph) * 0.65 * s;
    this.legs[0].rotation.x = swing;
    this.legs[1].rotation.x = -swing;
    const breathe = Math.sin(this.t * 2.1);
    this.body.position.y = Math.abs(Math.sin(ph)) * 0.07 * s + breathe * 0.006 * (1 - s);
    this.torso.rotation.x = 0.08 * s;
    this.torso.rotation.z = Math.sin(ph) * 0.04 * s;
    this.torso.scale.y = 1 + breathe * 0.012 * (1 - s);
    this.arms[0].rotation.x = -swing * 0.8 + (1 - s) * Math.sin(this.t * 1.3) * 0.04;
    this.arms[0].rotation.z = -0.1 - (1 - s) * 0.05;
    const armSwing = swing * 0.35 + (1 - s) * Math.sin(this.t * 1.1 + 1) * 0.05;
    this.arms[1].rotation.x = armSwing * (1 - this.raise) - 2.55 * this.raise;
    this.arms[1].rotation.z = 0.12 * (1 - this.raise) + 0.25 * this.raise;
    this.lanternPivot.rotation.x = -this.arms[1].rotation.x + Math.sin(this.t * 3 + ph) * 0.12 * s;
    this.lanternPivot.rotation.z = -this.arms[1].rotation.z;
    // idle: look around now and then
    const look = s < 0.1 ? Math.sin(this.t * 0.45) * 0.5 * Math.min(1, this.idleT / 3) : 0;
    this.head.rotation.y += (look - this.head.rotation.y) * Math.min(1, dt * 3);
    this.head.rotation.x = -0.25 * this.raise;
    this.scarfTail.rotation.x = 0.3 * s + Math.sin(this.t * 4) * 0.08;
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.yaw;
    this.group.updateMatrixWorld(true);
    this.lanternFire.uni.uHDR.value = 1.7 + this.raise * 1.5;
    this.lantern.getWorldPosition(this.lanternWorld);
  }
}
