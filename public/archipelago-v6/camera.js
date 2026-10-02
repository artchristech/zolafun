// Five Lights — smoothed third-person camera that never clips: terrain, buildings
// and trunks pull it in toward the player.
import * as THREE from './three.module.min.js';
import { clamp, damp, dampAngle } from './util.js';
import { terrainH, groundH } from './terrain.js';
import { camBlocked } from './colliders.js';

export class FollowCam {
  constructor(camera) {
    this.cam = camera;
    this.yaw = 0; this.pitch = 0.32;
    this.sYaw = 0; this.sPitch = 0.32;
    this.dist = 6.2; this.curDist = 6.2;
    this.pivot = new THREE.Vector3();
    this.override = null; // {pos, look, k}
  }
  snap(target) {
    this.pivot.set(target.x, target.y + 1.55, target.z);
    this.sYaw = this.yaw; this.sPitch = this.pitch;
    this.curDist = this.dist;
    this.place(1);
  }
  look(dx, dy) {
    this.yaw -= dx;
    this.pitch = clamp(this.pitch + dy, -0.45, 1.15);
  }
  blocked(x, y, z) {
    if (y < terrainH(x, z) + 0.35) return true;
    if (y < groundH(x, z) + 0.2) return true;
    return camBlocked(x, y, z, 0.3);
  }
  update(dt, target) {
    this.pivot.x = damp(this.pivot.x, target.x, 12, dt);
    this.pivot.z = damp(this.pivot.z, target.z, 12, dt);
    this.pivot.y = damp(this.pivot.y, target.y + 1.55, 8, dt);
    this.sYaw = dampAngle(this.sYaw, this.yaw, 16, dt);
    this.sPitch = damp(this.sPitch, this.pitch, 16, dt);
    // march from the pivot outward; stop before the first obstruction
    const cp = Math.cos(this.sPitch), sp = Math.sin(this.sPitch);
    const dx = Math.sin(this.sYaw) * cp, dy = sp, dz = Math.cos(this.sYaw) * cp;
    let free = this.dist;
    const steps = 28;
    for (let i = 1; i <= steps; i++) {
      const d = (i / steps) * this.dist;
      if (this.blocked(this.pivot.x + dx * d, this.pivot.y + dy * d, this.pivot.z + dz * d)) { free = Math.max(0.35, d - 0.35); break; }
    }
    if (free < this.curDist) this.curDist = free;          // pull in at once
    else this.curDist = damp(this.curDist, free, 3, dt);   // ease back out
    this.place(dt);
  }
  place() {
    const cp = Math.cos(this.sPitch), sp = Math.sin(this.sPitch);
    const d = this.curDist;
    const c = this.cam;
    c.position.set(this.pivot.x + Math.sin(this.sYaw) * cp * d, this.pivot.y + sp * d, this.pivot.z + Math.cos(this.sYaw) * cp * d);
    const g = terrainH(c.position.x, c.position.z) + 0.3;
    if (c.position.y < g) c.position.y = g;
    c.lookAt(this.pivot.x, this.pivot.y + 0.15, this.pivot.z);
  }
}
