// Five Lights — the lighthouse keeper's apprentice: model, animation, movement.
import * as THREE from './three.module.min.js';
import { toon, srgb, damp, dampAngle, clamp } from './util.js';
import { walkInfo, WADE } from './terrain.js';
import { resolve } from './colliders.js';
import { Fire } from './fire.js';

export class Player {
  constructor(scene) {
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.phase = 0;
    this.moveAmt = 0;
    this.raiseT = -1;
    this.raiseCb = null;
    this.stillTime = 0;
    this.surface = 1;
    this.onStep = null;
    this.waterLevel = 2.4;
    this.build(scene);
  }
  build(scene) {
    const g = (this.root = new THREE.Group());
    const coat = toon(srgb(0.18, 0.33, 0.56)), coatDark = toon(srgb(0.13, 0.22, 0.4)), skin = toon(srgb(0.98, 0.78, 0.62));
    const red = toon(srgb(0.86, 0.22, 0.18)), yellow = toon(srgb(0.98, 0.8, 0.25)), boot = toon(srgb(0.3, 0.2, 0.15)), trousers = toon(srgb(0.62, 0.55, 0.42));
    const black = toon(0x111111), brass = toon(srgb(0.85, 0.65, 0.28)), glass = new THREE.MeshBasicMaterial({ color: srgb(1.0, 0.85, 0.5) });
    const mesh = (geo, mat, x = 0, y = 0, z = 0, parent = g) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };
    this.body = new THREE.Group(); g.add(this.body);
    const b = this.body;
    this.torso = mesh(new THREE.CylinderGeometry(0.26, 0.33, 0.68, 10), coat, 0, 1.3, 0, b);
    mesh(new THREE.CylinderGeometry(0.34, 0.44, 0.38, 10), coatDark, 0, 0.92, 0, b);
    mesh(new THREE.TorusGeometry(0.22, 0.07, 6, 12), yellow, 0, 1.66, 0, b).rotation.x = Math.PI / 2;
    // scarf tail
    mesh(new THREE.BoxGeometry(0.1, 0.32, 0.05), yellow, 0.12, 1.5, -0.24, b).rotation.z = 0.2;
    this.head = new THREE.Group(); this.head.position.set(0, 1.9, 0); b.add(this.head);
    mesh(new THREE.SphereGeometry(0.25, 14, 10), skin, 0, 0, 0, this.head);
    mesh(new THREE.SphereGeometry(0.035, 6, 4), black, -0.085, 0.03, 0.22, this.head);
    mesh(new THREE.SphereGeometry(0.035, 6, 4), black, 0.085, 0.03, 0.22, this.head);
    mesh(new THREE.SphereGeometry(0.05, 6, 4), toon(srgb(0.95, 0.6, 0.5)), 0, -0.04, 0.25, this.head);
    const cap = mesh(new THREE.SphereGeometry(0.27, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), red, 0, 0.04, 0, this.head);
    cap.scale.set(1, 0.9, 1);
    mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.08, 12), toon(srgb(0.7, 0.15, 0.13)), 0, 0.06, 0, this.head);
    mesh(new THREE.SphereGeometry(0.08, 8, 6), toon(srgb(0.98, 0.95, 0.88)), 0, 0.3, -0.05, this.head);
    // limbs
    const limb = (x, y, len, r, mat, handMat) => {
      const p = new THREE.Group(); p.position.set(x, y, 0); b.add(p);
      mesh(new THREE.CylinderGeometry(r, r * 0.85, len, 7), mat, 0, -len / 2, 0, p);
      if (handMat) mesh(new THREE.SphereGeometry(r * 1.15, 7, 5), handMat, 0, -len - 0.02, 0, p);
      return p;
    };
    this.armL = limb(-0.38, 1.6, 0.58, 0.075, coat, skin);
    this.armR = limb(0.38, 1.6, 0.58, 0.075, coat, skin);
    this.legL = limb(-0.15, 0.88, 0.8, 0.095, trousers);
    this.legR = limb(0.15, 0.88, 0.8, 0.095, trousers);
    mesh(new THREE.BoxGeometry(0.17, 0.12, 0.3), boot, 0, -0.84, 0.05, this.legL);
    mesh(new THREE.BoxGeometry(0.17, 0.12, 0.3), boot, 0, -0.84, 0.05, this.legR);
    // lantern in the right hand
    const L = (this.lantern = new THREE.Group());
    L.position.set(0, -0.66, 0); this.armR.add(L);
    mesh(new THREE.TorusGeometry(0.07, 0.012, 4, 10, Math.PI), brass, 0, 0.0, 0, L);
    mesh(new THREE.CylinderGeometry(0.06, 0.13, 0.08, 8), brass, 0, -0.07, 0, L);
    const gl = mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.22, 8, 1, true), glass, 0, -0.22, 0, L); gl.castShadow = false;
    mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.04, 8), brass, 0, -0.34, 0, L);
    this.lanternFire = new Fire(0.22, { embers: 0, glow: 0.5, seed: 2 });
    this.lanternFire.group.position.set(0, -0.3, 0);
    this.lanternFire.setLit(true, true);
    L.add(this.lanternFire.group);
    this.lanternPoint = new THREE.Object3D(); this.lanternPoint.position.set(0, -0.22, 0); L.add(this.lanternPoint);
    scene.add(g);
  }
  place(x, z, yaw = 0) {
    const w = walkInfo(x, z);
    this.pos.set(x, w.h, z); this.yaw = yaw; this.vel.set(0, 0, 0);
    this.root.position.copy(this.pos); this.root.rotation.y = yaw;
  }
  raise(cb) { if (this.raiseT >= 0) return false; this.raiseT = 0; this.raiseCb = cb; return true; }
  get busy() { return this.raiseT >= 0; }

  // walkable if not too deep and not too steep; the slope is judged over ~0.6m ahead so
  // tiny creases in the heightfield never stop the apprentice, while real ledges do
  canStand(x, z, fromH, dist) {
    const w = walkInfo(x, z);
    if (w.h < this.waterLevel - WADE) return null;
    if (dist > 1e-4) {
      const dx = (x - this.pos.x) / dist, dz = (z - this.pos.z) / dist;
      const ahead = walkInfo(x + dx * 0.6, z + dz * 0.6).h;
      if ((Math.max(w.h, ahead) - fromH) / (dist + 0.6) > 1.1) return null;
    }
    return w;
  }

  update(dt, input, camYaw, time) {
    let mx = input.moveX, my = input.moveY;
    if (this.busy) { mx = 0; my = 0; }
    const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
    const rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
    const speed = 6.2;
    const tx = (fx * my + rx * mx) * speed, tz = (fz * my + rz * mx) * speed;
    this.vel.x = damp(this.vel.x, tx, 9, dt); this.vel.z = damp(this.vel.z, tz, 9, dt);
    const sp = Math.hypot(this.vel.x, this.vel.z);
    if (sp > 0.05) {
      const cur = this.pos;
      const nx = cur.x + this.vel.x * dt, nz = cur.z + this.vel.z * dt;
      const d = sp * dt;
      let ok = this.canStand(nx, nz, cur.y, d);
      let px = nx, pz = nz;
      if (!ok) {
        // slide along whichever axis is free
        const a = this.canStand(nx, cur.z, cur.y, Math.abs(this.vel.x * dt));
        const b = a ? null : this.canStand(cur.x, nz, cur.y, Math.abs(this.vel.z * dt));
        if (a) { px = nx; pz = cur.z; ok = a; this.vel.z *= 0.5; }
        else if (b) { px = cur.x; pz = nz; ok = b; this.vel.x *= 0.5; }
      }
      if (ok) {
        const r = resolve(px, pz, 0.38, cur.y, 1.8);
        const w2 = this.canStand(r.x, r.z, cur.y, Math.hypot(r.x - cur.x, r.z - cur.z));
        if (w2) { cur.x = r.x; cur.z = r.z; }
      } else { this.vel.x *= 0.3; this.vel.z *= 0.3; }
      this.yaw = dampAngle(this.yaw, Math.atan2(this.vel.x, this.vel.z), 12, dt);
    }
    const w = walkInfo(this.pos.x, this.pos.z);
    const gy = w.h;
    this.surface = w.h < this.waterLevel - 0.02 ? 5 : w.surf;
    this.pos.y = Math.abs(gy - this.pos.y) > 2 ? gy : damp(this.pos.y, gy, 16, dt);
    this.animate(dt, sp, time);
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;
    const moving = sp > 0.5;
    this.stillTime = moving || this.busy ? 0 : this.stillTime + dt;
  }

  animate(dt, sp, time) {
    const amt = clamp(sp / 6.2, 0, 1);
    this.moveAmt = damp(this.moveAmt, amt, 10, dt);
    const m = this.moveAmt;
    const prev = Math.sin(this.phase);
    this.phase += dt * (3.2 + sp * 1.25);
    const s = Math.sin(this.phase);
    if (m > 0.2 && Math.sign(prev) !== Math.sign(s) && this.onStep) this.onStep(this.surface, m);
    this.legL.rotation.x = s * 0.7 * m;
    this.legR.rotation.x = -s * 0.7 * m;
    this.armL.rotation.x = -s * 0.6 * m;
    this.armL.rotation.z = -0.08;
    this.body.position.y = Math.abs(Math.cos(this.phase)) * 0.07 * m - 0.03 * m;
    this.body.rotation.y = s * 0.08 * m;
    this.body.rotation.x = 0.06 * m;
    // idle: breathing and a slow look around
    const idle = 1 - m;
    this.torso.scale.set(1, 1 + Math.sin(time * 1.7) * 0.02 * idle, 1);
    this.head.rotation.y = Math.sin(time * 0.45) * 0.35 * idle;
    this.head.rotation.x = Math.sin(time * 0.31 + 1) * 0.06 * idle;
    this.head.position.y = 1.9 + Math.sin(time * 1.7) * 0.012 * idle;
    // right arm carries the lantern forward; raises it when lighting
    let ra = -0.35 + s * 0.2 * m + Math.sin(time * 1.3) * 0.03 * idle;
    if (this.raiseT >= 0) {
      this.raiseT += dt;
      const t = this.raiseT;
      const up = t < 0.4 ? t / 0.4 : t < 1.2 ? 1 : Math.max(0, 1 - (t - 1.2) / 0.45);
      const e = up * up * (3 - 2 * up);
      ra = ra + (-2.75 - ra) * e;
      this.armR.rotation.z = 0.25 * e;
      if (t > 0.55 && this.raiseCb) { const cb = this.raiseCb; this.raiseCb = null; cb(); }
      if (t > 1.65) this.raiseT = -1;
    } else this.armR.rotation.z = 0.06;
    this.armR.rotation.x = ra;
    // keep the lantern hanging plumb
    this.lantern.rotation.x = -ra - this.body.rotation.x;
    this.lantern.rotation.z = -this.armR.rotation.z;
  }
}
