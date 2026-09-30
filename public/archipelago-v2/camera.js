// Smoothed third-person camera that never clips through terrain or buildings.
import * as THREE from './three.module.min.js';
import { cameraRay, groundH } from './world.js';
import { clamp, damp, lerp, wrapAngle } from './math.js';

export class CameraRig {
  constructor(camera) {
    this.cam = camera;
    this.yaw = 0;
    this.pitch = 0.28;
    this.dist = 6.2;
    this.curDist = 6.2;
    this.pivot = new THREE.Vector3();
    this.smoothYaw = 0;
    this.smoothPitch = 0.28;
    this.override = null; // {pos, look, fov, t}
    this.baseFov = 60;
  }
  snap(target, yaw) {
    this.yaw = this.smoothYaw = yaw;
    this.pivot.set(target.x, target.y + 1.55, target.z);
    this.update(0.016, target, { x: 0, y: 0 }, true);
  }
  update(dt, target, look, instant = false) {
    this.yaw -= look.x;
    this.pitch = clamp(this.pitch + look.y, -0.45, 1.25);
    const k = instant ? 1 : damp(18, dt);
    this.smoothYaw += wrapAngle(this.yaw - this.smoothYaw) * k;
    this.smoothPitch += (this.pitch - this.smoothPitch) * k;
    const pk = instant ? 1 : damp(9, dt);
    this.pivot.x = lerp(this.pivot.x, target.x, pk);
    this.pivot.z = lerp(this.pivot.z, target.z, pk);
    this.pivot.y = lerp(this.pivot.y, target.y + 1.55, instant ? 1 : damp(6, dt));

    const cp = Math.cos(this.smoothPitch), spch = Math.sin(this.smoothPitch);
    // direction from pivot to camera (behind the view direction)
    const dx = Math.sin(this.smoothYaw) * cp, dy = spch, dz = Math.cos(this.smoothYaw) * cp;
    // desired distance shrinks a little when looking up from low angles
    let want = this.dist * (this.smoothPitch < 0 ? 1 + this.smoothPitch * 0.9 : 1);
    const hit = cameraRay(this.pivot.x, this.pivot.y, this.pivot.z, dx, dy, dz, want + 0.4);
    const allowed = Math.max(0.3, hit - 0.35);
    // pull in immediately, ease back out
    if (allowed < this.curDist || instant) this.curDist = allowed;
    else this.curDist = lerp(this.curDist, Math.min(want, allowed), damp(2.5, dt));
    this.curDist = Math.min(this.curDist, allowed);
    let px = this.pivot.x + dx * this.curDist, py = this.pivot.y + dy * this.curDist, pz = this.pivot.z + dz * this.curDist;
    const gh = groundH(px, pz) + 0.35;
    if (py < gh) py = gh;
    if (this.override) {
      const o = this.override;
      const f = o.blend;
      this.cam.position.set(lerp(px, o.pos.x, f), lerp(py, o.pos.y, f), lerp(pz, o.pos.z, f));
      const lx = lerp(this.pivot.x, o.look.x, f), ly = lerp(this.pivot.y, o.look.y, f), lz = lerp(this.pivot.z, o.look.z, f);
      this.cam.lookAt(lx, ly, lz);
      this.cam.fov = lerp(this.baseFov, o.fov, f);
      this.cam.updateProjectionMatrix();
      return;
    }
    if (this.cam.fov !== this.baseFov) { this.cam.fov = this.baseFov; this.cam.updateProjectionMatrix(); }
    this.cam.position.set(px, py, pz);
    this.cam.lookAt(this.pivot.x, this.pivot.y + 0.1, this.pivot.z);
  }
}
