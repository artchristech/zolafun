// Smoothed third-person camera that never passes through terrain, buildings, trunks or props.
import * as THREE from './three.module.min.js';
import { groundH } from './ground.js';
import { damp, clamp } from './util.js';

export class CameraRig {
  constructor(camera, colliders, waterFn) {
    this.cam = camera;
    this.col = colliders;
    this.water = waterFn;
    this.yaw = 0;
    this.pitch = 0.32;
    this.dist = 6.2;
    this.cur = 6.2;
    this.pivot = new THREE.Vector3();
    this.pivotS = null;
    this.look = new THREE.Vector3();
  }
  addLook(dx, dy) {
    this.yaw -= dx;
    this.pitch = clamp(this.pitch + dy, -0.45, 1.25);
  }
  snap(target) {
    this.pivotS = target.clone().add(new THREE.Vector3(0, 1.45, 0));
    this.cur = this.dist;
  }
  // terrain + collider hit distance along a ray from the pivot
  _hit(o, dir, maxT) {
    let t = this.col.ray(o.x, o.y, o.z, dir.x, dir.y, dir.z, maxT, 0.3);
    const steps = 28;
    for (let i = 1; i <= steps; i++) {
      const s = (i / steps) * t;
      const x = o.x + dir.x * s, y = o.y + dir.y * s, z = o.z + dir.z * s;
      if (y < groundH(x, z) + 0.3) {
        t = Math.max(0, s - t / steps);
        break;
      }
    }
    return t;
  }
  update(dt, target) {
    const want = target.clone().add(new THREE.Vector3(0, 1.45, 0));
    if (!this.pivotS) this.pivotS = want.clone();
    this.pivotS.x = damp(this.pivotS.x, want.x, 12, dt);
    this.pivotS.y = damp(this.pivotS.y, want.y, 8, dt);
    this.pivotS.z = damp(this.pivotS.z, want.z, 12, dt);
    const cp = Math.cos(this.pitch);
    const dir = new THREE.Vector3(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp);
    const hit = this._hit(this.pivotS, dir, this.dist + 0.3);
    const allowed = Math.max(0.6, hit - 0.25);
    // push in instantly, ease back out
    if (allowed < this.cur) this.cur = allowed;
    else this.cur = damp(this.cur, Math.min(allowed, this.dist), 2.5, dt);
    const pos = this.pivotS.clone().addScaledVector(dir, this.cur);
    const wl = this.water() + 0.35;
    if (pos.y < wl) pos.y = wl;
    this.cam.position.copy(pos);
    this.look.copy(this.pivotS);
    this.cam.lookAt(this.look);
  }
}
