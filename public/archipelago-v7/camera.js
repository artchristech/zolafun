// Third-person camera: smoothed follow, ray-marched against terrain and collision volumes so it never clips.
import * as THREE from './three.module.min.js';
import { clamp, damp, lerp } from './util.js';
import { groundAt } from './terrain.js';
import { pointBlocked, platforms } from './colliders.js';

export class FollowCam {
  constructor(camera) {
    this.camera = camera;
    this.yaw = 0;
    this.pitch = 0.3;
    this.maxDist = 6.5;
    this.dist = 6.5;
    this.target = new THREE.Vector3();
    this.override = null; // {pos, look, k}
    this._look = new THREE.Vector3();
    this._p = new THREE.Vector3();
    this.minDistSeen = 99;
  }

  snap(playerPos) {
    this.target.set(playerPos.x, playerPos.y + 1.55, playerPos.z);
    this.dist = this.maxDist;
  }

  blocked(x, y, z) {
    if (y < groundAt(x, z) + 0.45) return true;
    // decks and piers are thin slabs: avoid sitting just inside them
    for (const p of platforms) {
      const dx = x - p.x, dz = z - p.z;
      const lx = dx * p.c + dz * p.s, lz = -dx * p.s + dz * p.c;
      if (Math.abs(lx) < p.hx + 0.2 && Math.abs(lz) < p.hz + 0.2) {
        const ph = p.h0 + (p.h1 - p.h0) * ((lx + p.hx) / (2 * p.hx));
        if (y < ph + 0.35 && y > ph - 0.6) return true;
      }
    }
    return pointBlocked(x, y, z, 0.3);
  }

  update(dt, playerPos, look) {
    this.yaw -= look.dx;
    this.pitch = clamp(this.pitch + look.dy, -0.45, 1.25);
    const tx = playerPos.x, ty = playerPos.y + 1.55, tz = playerPos.z;
    this.target.x = damp(this.target.x, tx, 14, dt);
    this.target.y = damp(this.target.y, ty, 9, dt);
    this.target.z = damp(this.target.z, tz, 14, dt);
    const cp = Math.cos(this.pitch);
    const dx = -Math.sin(this.yaw) * cp, dy = Math.sin(this.pitch), dz = -Math.cos(this.yaw) * cp;
    // march from the target outwards to find the free distance
    let free = this.maxDist;
    const step = 0.2;
    for (let s = 0.3; s <= this.maxDist; s += step) {
      if (this.blocked(this.target.x + dx * s, this.target.y + dy * s, this.target.z + dz * s)) { free = Math.max(0.35, s - 0.35); break; }
    }
    // pull in immediately, ease back out
    if (free < this.dist) this.dist = free;
    else this.dist = damp(this.dist, free, 2.5, dt);
    const c = this.camera;
    this._p.set(this.target.x + dx * this.dist, this.target.y + dy * this.dist, this.target.z + dz * this.dist);
    this._look.copy(this.target);
    if (this.override) {
      const o = this.override;
      this._p.lerp(o.pos, o.k);
      this._look.lerp(o.look, o.k);
    }
    c.position.copy(this._p);
    c.lookAt(this._look);
  }

  forward() { return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }
}
