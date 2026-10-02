// Smoothed third-person camera with collision, plus fading of foliage that hides the player.
import * as THREE from './three.module.min.js';
import { clamp, damp, lerp } from './util.js';
import { rayClear } from './physics.js';

export class FollowCam {
  constructor(camera, records) {
    this.cam = camera;
    this.yaw = Math.PI;
    this.pitch = 0.32;
    this.dist = 5.6;
    this.cur = 5.6;
    this.target = new THREE.Vector3();
    this.pos = new THREE.Vector3();
    this.inited = false;
    this.blend = 1;     // 0 = scripted pose, 1 = follow
    this.script = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
    this.records = records;
    this.grid = new Map();
    for (const r of records) {
      const k = this.key(Math.floor(r.x / 10), Math.floor(r.z / 10));
      if (!this.grid.has(k)) this.grid.set(k, []);
      this.grid.get(k).push(r);
    }
    this.faded = new Set();
    this.dirty = new Set();
  }
  key(i, j) { return i * 10007 + j; }

  rotate(dx, dy) {
    this.yaw -= dx;
    this.pitch = clamp(this.pitch + dy, -0.4, 1.15);
  }

  setScript(pos, look) { this.script.pos.copy(pos); this.script.look.copy(look); }

  update(dt, player, scriptW) {
    const tgt = new THREE.Vector3(player.pos.x, player.pos.y + 1.45, player.pos.z);
    if (!this.inited) { this.target.copy(tgt); this.inited = true; }
    this.target.x = damp(this.target.x, tgt.x, 12, dt);
    this.target.y = damp(this.target.y, tgt.y, 8, dt);
    this.target.z = damp(this.target.z, tgt.z, 12, dt);
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const dir = new THREE.Vector3(Math.sin(this.yaw) * cp, -sp, Math.cos(this.yaw) * cp);
    const want = this.dist;
    const hit = rayClear(this.target.x, this.target.y, this.target.z,
      this.target.x - dir.x * want, this.target.y - dir.y * want, this.target.z - dir.z * want, 0.35);
    const allowed = Math.max(0.5, hit - 0.15);
    if (allowed < this.cur) this.cur = allowed; else this.cur = damp(this.cur, allowed, 2.5, dt);
    this.pos.copy(this.target).addScaledVector(dir, -this.cur);
    // blend with a scripted pose (title, finale)
    const w = scriptW;
    const p = new THREE.Vector3().lerpVectors(this.pos, this.script.pos, w);
    const l = new THREE.Vector3().lerpVectors(this.target, this.script.look, w);
    this.cam.position.copy(p);
    this.cam.lookAt(l);
    this.updateFade(dt, w < 0.5 ? this.target : null);
  }

  updateFade(dt, tgt) {
    const want = new Set();
    if (tgt) {
      const a = this.cam.position, b = tgt;
      const i0 = Math.floor(Math.min(a.x, b.x) / 10) - 1, i1 = Math.floor(Math.max(a.x, b.x) / 10) + 1;
      const j0 = Math.floor(Math.min(a.z, b.z) / 10) - 1, j1 = Math.floor(Math.max(a.z, b.z) / 10) + 1;
      const ab = new THREE.Vector3().subVectors(b, a);
      const L2 = ab.lengthSq() || 1;
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
        const list = this.grid.get(this.key(i, j));
        if (!list) continue;
        for (const r of list) {
          const t = clamp(((r.x - a.x) * ab.x + (r.y - a.y) * ab.y + (r.z - a.z) * ab.z) / L2, 0, 1);
          const px = a.x + ab.x * t, py = a.y + ab.y * t, pz = a.z + ab.z * t;
          const dy = r.tall ? Math.max(0, Math.abs(py - r.y) - r.tall) : py - r.y;
          const d = Math.hypot(px - r.x, dy, pz - r.z);
          if (d < r.r + 0.4) want.add(r);
        }
      }
    }
    for (const r of want) this.faded.add(r);
    for (const r of this.faded) {
      const goal = want.has(r) ? 0.28 : 1;
      r.f = lerp(r.f, goal, Math.min(1, dt * 8));
      if (Math.abs(r.f - goal) < 0.01) r.f = goal;
      const attr = r.mesh.geometry.attributes.aFade;
      attr.array[r.i] = r.f;
      this.dirty.add(attr);
      if (r.f === 1) this.faded.delete(r);
    }
    for (const a of this.dirty) a.needsUpdate = true;
    this.dirty.clear();
  }
}
