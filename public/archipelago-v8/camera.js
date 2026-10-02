// Third-person follow camera: smoothed, mouse/stick orbit, pulled in by
// terrain, causeways, platforms, buildings, trunks and props (never through
// them). Foliage between camera and player dithers away in its shader.
import * as THREE from './three.module.min.js';
import { groundAt } from './terrain.js';
import { pointSolid } from './colliders.js';
import { U } from './materials.js';
import { clamp, lerp, wrapAngle } from './util.js';

export class FollowCam {
  constructor(camera) {
    this.cam = camera;
    this.yaw = Math.PI;      // camera sits behind (+z) the player looking -z
    this.pitch = 0.32;
    this.tYaw = this.yaw; this.tPitch = this.pitch;
    this.dist = 6.5;
    this.cur = 6.5;
    this.pivot = new THREE.Vector3();
    this.pos = new THREE.Vector3();
    this.inited = false;
  }
  snap(player) {
    this.pivot.copy(player.pos).add(new THREE.Vector3(0, 1.55, 0));
    this.tYaw = this.yaw = player.yaw + Math.PI;
    this.inited = true;
  }
  look(dx, dy) {
    this.tYaw -= dx;
    this.tPitch = clamp(this.tPitch + dy, -0.45, 1.25);
  }
  // returns the desired pose (pos, target) without writing to the camera
  update(dt, player, water) {
    const want = player.pos.clone().add(new THREE.Vector3(0, 1.55, 0));
    if (!this.inited) this.snap(player);
    this.pivot.lerp(want, 1 - Math.exp(-dt * 12));
    this.yaw += wrapAngle(this.tYaw - this.yaw) * (1 - Math.exp(-dt * 16));
    this.pitch += (this.tPitch - this.pitch) * (1 - Math.exp(-dt * 16));
    const cp = Math.cos(this.pitch);
    const dir = new THREE.Vector3(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp);
    // march outward until something solid is hit
    let hit = this.dist;
    const p = new THREE.Vector3();
    for (let s = 0.35; s <= this.dist; s += 0.2) {
      p.copy(this.pivot).addScaledVector(dir, s);
      const g = groundAt(p.x, p.z, p.y).h;
      if (p.y < g + 0.35 || p.y < water + 0.25 || pointSolid(p.x, p.y, p.z, 0.28)) { hit = Math.max(0.5, s - 0.3); break; }
    }
    if (hit < this.cur) this.cur = hit;
    else this.cur = lerp(this.cur, hit, 1 - Math.exp(-dt * 2.5));
    this.pos.copy(this.pivot).addScaledVector(dir, this.cur);
    U.uFadeA.value.copy(this.pivot);
    U.uFadeB.value.copy(this.pos);
    return { pos: this.pos, target: this.pivot.clone().add(new THREE.Vector3(0, 0.15, 0)) };
  }
}
