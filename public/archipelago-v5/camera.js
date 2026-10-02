// Five Lights — smoothed third-person camera that never clips terrain, buildings or trunks.
import * as THREE from './three.module.min.js';
import { damp, clamp, dampAngle } from './util.js';
import { walkInfo } from './terrain.js';
import { rayHit } from './colliders.js';

export class CameraRig {
  constructor(camera) {
    this.cam = camera;
    this.yaw = 0; this.pitch = 0.32;
    this.dist = 7.5; this.curDist = 7.5;
    this.target = new THREE.Vector3();
    this.pos = new THREE.Vector3();
    this.blend = 1; // 0 = title view, 1 = follow
    this.titlePos = new THREE.Vector3(); this.titleLook = new THREE.Vector3();
    this._o = new THREE.Vector3(); this._d = new THREE.Vector3(); this._look = new THREE.Vector3();
  }
  snap(player) {
    this.target.set(player.pos.x, player.pos.y + 1.55, player.pos.z);
    this.curDist = this.dist;
    this.compute(0, true);
  }
  update(dt, input, player, waterLevel) {
    const sens = 0.0023;
    this.yaw -= input.lookDX * sens;
    this.pitch += input.lookDY * sens;
    this.yaw -= input.lookPadX * 2.6 * dt;
    this.pitch += input.lookPadY * 1.9 * dt;
    this.pitch = clamp(this.pitch, -0.35, 1.2);
    const tx = player.pos.x, ty = player.pos.y + 1.55, tz = player.pos.z;
    this.target.x = damp(this.target.x, tx, 14, dt);
    this.target.y = damp(this.target.y, ty, 8, dt);
    this.target.z = damp(this.target.z, tz, 14, dt);
    this.compute(dt, false, waterLevel);
  }
  compute(dt, instant, waterLevel = -10) {
    const t = this.target;
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const d = this._d.set(Math.sin(this.yaw) * cp, sp, Math.cos(this.yaw) * cp);
    // pull in against solids (buildings, rocks, tree trunks)
    let want = this.dist;
    want = Math.min(want, rayHit(t, d, this.dist, 0.4) - 0.25);
    // and against terrain: march the ray, stop short where it would go underground
    for (let s = 0.5; s <= want; s += 0.35) {
      const x = t.x + d.x * s, y = t.y + d.y * s, z = t.z + d.z * s;
      if (y < walkInfo(x, z).h + 0.45) { want = Math.max(0.6, s - 0.4); break; }
    }
    want = Math.max(want, 0.6);
    // pull in fast, ease back out slowly (smoothed)
    if (instant) this.curDist = want;
    else this.curDist = want < this.curDist ? damp(this.curDist, want, 25, dt) : damp(this.curDist, want, 3, dt);
    const p = this._o.copy(t).addScaledVector(d, this.curDist);
    const g = walkInfo(p.x, p.z).h + 0.45; // terrain, causeways and wooden decks
    if (p.y < g) p.y = g;
    if (p.y < waterLevel + 0.35) p.y = waterLevel + 0.35;
    this.pos.copy(p);
    if (this.blend >= 1) {
      this.cam.position.copy(p);
      this.cam.lookAt(t);
    } else {
      const e = this.blend * this.blend * (3 - 2 * this.blend);
      this.cam.position.copy(this.titlePos).lerp(p, e);
      this._look.copy(this.titleLook).lerp(t, e);
      this.cam.lookAt(this._look);
    }
  }
}
