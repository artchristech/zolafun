import * as THREE from './three.module.min.js';

// Smoothed third-person camera that pulls in instead of clipping terrain or buildings.
export class CameraRig {
  constructor(G, camera) {
    this.G = G;
    this.cam = camera;
    this.yaw = 0;
    this.pitch = 0.28;
    this.dist = 6.2;
    this.curDist = 6.2;
    this.target = new THREE.Vector3();
    this.pos = new THREE.Vector3();
    this.extra = 0; // finale pull-back
    this.inited = false;
  }

  snap(player) {
    this.target.copy(player.pos).add(new THREE.Vector3(0, 1.55, 0));
    this.yaw = player.yaw + Math.PI;
    this.inited = false;
  }

  update(dt, look, player) {
    this.yaw -= look[0];
    this.pitch = Math.max(-0.45, Math.min(1.15, this.pitch + look[1]));
    const want = new THREE.Vector3(player.pos.x, player.pos.y + 1.55, player.pos.z);
    if (!this.inited) this.target.copy(want);
    this.target.lerp(want, 1 - Math.exp(-dt * 12));
    const desired = this.dist + this.extra;
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const dir = new THREE.Vector3(Math.sin(this.yaw) * cp, sp, Math.cos(this.yaw) * cp);
    // march out from the target and stop before anything solid
    const ph = this.G.physics;
    let free = desired;
    const step = 0.2;
    for (let d = 0.4; d <= desired; d += step) {
      const x = this.target.x + dir.x * d, y = this.target.y + dir.y * d, z = this.target.z + dir.z * d;
      if (ph.camBlocked(x, y, z)) { free = Math.max(0.5, d - 0.35); break; }
    }
    if (free < this.curDist || !this.inited) this.curDist = free;
    else this.curDist += (free - this.curDist) * (1 - Math.exp(-dt * 2.5));
    this.pos.copy(this.target).addScaledVector(dir, this.curDist);
    // final safety: never below ground or the water surface
    const g = ph.groundAt(this.pos.x, this.pos.z, this.pos.y);
    const minY = Math.max(g.h + 0.35, this.G.tide.level + 0.3);
    if (this.pos.y < minY) this.pos.y = minY;
    this.cam.position.copy(this.pos);
    this.cam.lookAt(this.target.x, this.target.y + 0.1 * this.curDist / this.dist, this.target.z);
    this.inited = true;
  }
}
