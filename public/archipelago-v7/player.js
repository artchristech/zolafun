// The apprentice: one skinned, merged mesh (rigid bones) + lantern glass. Walk cycle, idle, lantern raise.
import * as THREE from './three.module.min.js';
import { GeoBuilder, mat, toonMat, clamp, lerp, damp, wrapAngle } from './util.js';
import { walkHeight, resolveCircle, surfaceAt } from './colliders.js';

const B = { root: 0, spine: 1, head: 2, armL: 3, armR: 4, legL: 5, legR: 6 };

function buildBody() {
  const b = new GeoBuilder({ extra: true });
  const coat = '#24406e', coat2 = '#2d4f86', trousers = '#4a3b30', boot = '#3a2a1e', skin = '#f0c49a', hat = '#f2c230', scarf = '#d8402e', shirt = '#efe6cf';
  for (const [bone, sx] of [[B.legL, 1], [B.legR, -1]]) {
    b.box(0.15, 0.14, 0.27, mat(0.11 * sx, 0.07, 0.04), boot, { extra: bone });
    b.cyl(0.075, 0.08, 0.76, 7, mat(0.11 * sx, 0.52, 0), trousers, { extra: bone });
  }
  // coat skirt + body
  b.cyl(0.26, 0.33, 0.34, 9, mat(0, 0.86, 0), coat, { extra: B.root, flat: true });
  b.cyl(0.2, 0.26, 0.52, 9, mat(0, 1.24, 0), coat2, { extra: B.spine, flat: true });
  b.box(0.16, 0.36, 0.04, mat(0, 1.2, 0.235), shirt, { extra: B.spine });
  for (let i = 0; i < 3; i++) b.box(0.04, 0.04, 0.03, mat(0.05, 1.1 + i * 0.1, 0.26), '#d9b44a', { extra: B.spine });
  b.box(0.42, 0.06, 0.32, mat(0, 0.98, 0), '#5b3a22', { extra: B.root }); // belt
  b.box(0.3, 0.32, 0.14, mat(0, 1.2, -0.27), '#7a5a36', { extra: B.spine }); // satchel
  // scarf
  b.cyl(0.17, 0.2, 0.1, 9, mat(0, 1.5, 0), scarf, { extra: B.spine });
  b.box(0.1, 0.32, 0.04, mat(-0.09, 1.34, -0.2, 0.25, 0, 0.15), scarf, { extra: B.spine });
  // head
  b.ico(0.17, 1, mat(0, 1.68, 0.01), skin, { extra: B.head });
  b.box(0.05, 0.05, 0.06, mat(0, 1.66, 0.18), '#e8a57c', { extra: B.head });
  b.box(0.035, 0.05, 0.02, mat(0.065, 1.71, 0.155), '#2a1e1a', { extra: B.head });
  b.box(0.035, 0.05, 0.02, mat(-0.065, 1.71, 0.155), '#2a1e1a', { extra: B.head });
  b.box(0.3, 0.12, 0.08, mat(0, 1.66, -0.14), '#6b3f22', { extra: B.head }); // hair at back
  // sou'wester hat
  b.cyl(0.29, 0.3, 0.03, 12, mat(0, 1.8, -0.03, -0.08, 0, 0), hat, { extra: B.head, flat: true });
  b.cyl(0.14, 0.18, 0.16, 10, mat(0, 1.89, 0), hat, { extra: B.head, flat: true });
  // arms
  for (const [bone, sx] of [[B.armL, 1], [B.armR, -1]]) {
    b.cyl(0.06, 0.07, 0.5, 7, mat(0.27 * sx, 1.18, 0), coat2, { extra: bone });
    b.ico(0.06, 0, mat(0.27 * sx, 0.9, 0), skin, { extra: bone });
  }
  // lantern frame in the right hand
  b.box(0.02, 0.12, 0.02, mat(-0.27, 0.84, 0), '#2b2622', { extra: B.armR });
  b.box(0.17, 0.03, 0.17, mat(-0.27, 0.78, 0), '#3a3028', { extra: B.armR });
  b.box(0.18, 0.03, 0.18, mat(-0.27, 0.58, 0), '#3a3028', { extra: B.armR });
  for (const [dx, dz] of [[0.075, 0.075], [-0.075, 0.075], [0.075, -0.075], [-0.075, -0.075]])
    b.box(0.02, 0.2, 0.02, mat(-0.27 + dx, 0.68, dz), '#3a3028', { extra: B.armR });
  b.cyl(0.0, 0.1, 0.07, 6, mat(-0.27, 0.815, 0), '#3a3028', { extra: B.armR });
  const g = b.build('aBone');
  const bones = g.attributes.aBone;
  const si = new Uint16Array(bones.count * 4), sw = new Float32Array(bones.count * 4);
  for (let i = 0; i < bones.count; i++) { si[i * 4] = bones.getX(i); sw[i * 4] = 1; }
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  g.deleteAttribute('aBone');
  return g;
}

export class Player {
  constructor(scene, audio) {
    this.audio = audio;
    const geo = buildBody();
    const bones = [];
    const mk = (parent, x, y, z) => { const bn = new THREE.Bone(); bn.position.set(x, y, z); if (parent) parent.add(bn); bones.push(bn); return bn; };
    this.root = mk(null, 0, 0.95, 0);
    this.spine = mk(this.root, 0, 0.15, 0);
    this.head = mk(this.spine, 0, 0.47, 0);
    this.armL = mk(this.spine, 0.27, 0.32, 0);
    this.armR = mk(this.spine, -0.27, 0.32, 0);
    this.legL = mk(this.root, 0.11, -0.03, 0);
    this.legR = mk(this.root, -0.11, -0.03, 0);
    this.mesh = new THREE.SkinnedMesh(geo, toonMat());
    this.mesh.add(this.root);
    this.mesh.bind(new THREE.Skeleton(bones));
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.group = new THREE.Group();
    this.group.add(this.mesh);
    scene.add(this.group);
    // lantern glass: emissive, rides on the right arm bone
    this.glassMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 1.6, 0.6), fog: false });
    this.glass = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.17, 0.13), this.glassMat);
    this.glass.position.set(0, 0.68 - 1.42, 0);
    this.armR.add(this.glass);

    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.speed = 0;
    this.phase = 0;
    this.lastStepPhase = 0;
    this.raiseT = -1;
    this.idleT = 0;
    this.locked = false;
    this.lanternPos = new THREE.Vector3();
    this.waterLevel = 1.2;
  }

  place(x, z, yaw) {
    this.pos.set(x, 0, z);
    this.pos.y = walkHeight(x, z, 100).h;
    this.yaw = yaw;
  }

  raise() { this.raiseT = 0; }
  get raising() { return this.raiseT >= 0 && this.raiseT < 1.4; }

  canStand(x, z, fromY) {
    const w = walkHeight(x, z, fromY);
    if (w.h < this.waterLevel - 0.15) return null; // deep water
    return w.h;
  }

  update(dt, move, camYaw, time) {
    // movement relative to the camera
    let mx = 0, mz = 0;
    if (!this.locked && !this.raising) {
      const fx = Math.sin(camYaw), fz = Math.cos(camYaw);
      mx = fx * move.y - fz * move.x;
      mz = fz * move.y + fx * move.x;
    }
    const mag = Math.min(1, Math.hypot(mx, mz));
    const target = 5.2 * mag;
    this.speed = damp(this.speed, target, 10, dt);
    if (mag > 0.05) {
      const want = Math.atan2(mx, mz);
      this.yaw += wrapAngle(want - this.yaw) * (1 - Math.exp(-12 * dt));
    }
    const dirx = mag > 0.05 ? mx / mag : Math.sin(this.yaw), dirz = mag > 0.05 ? mz / mag : Math.cos(this.yaw);
    let moved = 0;
    if (this.speed > 0.02) {
      const step = this.speed * dt;
      const tryMove = (dx, dz) => {
        let nx = this.pos.x + dx, nz = this.pos.z + dz;
        [nx, nz] = resolveCircle(nx, nz, 0.35, this.pos.y, 1.7);
        const h = this.canStand(nx, nz, this.pos.y);
        if (h === null) return false;
        const dh = h - this.pos.y;
        const dist = Math.hypot(nx - this.pos.x, nz - this.pos.z) || 1e-4;
        if (dh > 0.45) return false; // ledge up
        if (dh > 0.03 && dh / dist > 0.85) return false; // too steep uphill
        if (dh < -0.9) return false; // ledge down
        if (dh < -0.03 && -dh / dist > 1.15) return false; // too steep downhill
        moved = dist;
        this.pos.x = nx; this.pos.z = nz; this.pos.y = h;
        return true;
      };
      if (!tryMove(dirx * step, dirz * step)) {
        // slide along obstacles: try the two axis components
        if (!tryMove(dirx * step, 0)) tryMove(0, dirz * step);
      }
    }
    // keep glued to the surface (platform heights, tide)
    const w = walkHeight(this.pos.x, this.pos.z, this.pos.y);
    if (Math.abs(w.h - this.pos.y) < 0.5) this.pos.y = damp(this.pos.y, w.h, 20, dt);
    this.actualSpeed = moved / Math.max(dt, 1e-4);

    this.animate(dt, time);
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.yaw;
    this.group.updateMatrixWorld(true);
    this.glass.getWorldPosition(this.lanternPos);
  }

  animate(dt, time) {
    const sp = clamp(this.actualSpeed / 5.2, 0, 1.2);
    const walking = sp > 0.08;
    this.phase += dt * (walking ? 2.0 + sp * 7.0 : 0);
    const s = Math.sin(this.phase), c = Math.cos(this.phase);
    const amp = clamp(sp, 0, 1);
    // footsteps at each foot plant
    const half = Math.floor(this.phase / Math.PI);
    if (walking && half !== this.lastStepPhase) {
      this.lastStepPhase = half;
      this.audio.footstep(surfaceAt(this.pos.x, this.pos.z, this.pos.y), this.pos);
    }
    const breathe = Math.sin(time * 1.8);
    // legs
    this.legL.rotation.x = s * 0.65 * amp;
    this.legR.rotation.x = -s * 0.65 * amp;
    this.root.position.y = 0.95 + Math.abs(c) * 0.06 * amp - 0.03 * amp + breathe * 0.006 * (1 - amp);
    this.root.rotation.y = s * 0.12 * amp;
    this.spine.rotation.y = -s * 0.18 * amp;
    this.spine.rotation.x = 0.06 * amp + breathe * 0.02 * (1 - amp);
    // idle: looks around slowly
    this.idleT = walking ? 0 : this.idleT + dt;
    const look = walking ? 0 : Math.sin(time * 0.45) * 0.45 * clamp(this.idleT - 1.5, 0, 1);
    this.head.rotation.y = damp(this.head.rotation.y, look, 3, dt);
    this.head.rotation.x = damp(this.head.rotation.x, walking ? 0.05 : Math.sin(time * 0.3) * 0.08, 3, dt);
    this.armL.rotation.x = -s * 0.55 * amp;
    this.armL.rotation.z = 0.08 + breathe * 0.02;
    let armRx = s * 0.25 * amp, armRz = -0.12;
    // lantern raise
    if (this.raiseT >= 0) {
      this.raiseT += dt;
      const t = this.raiseT;
      const up = t < 0.35 ? t / 0.35 : t < 1.0 ? 1 : Math.max(0, 1 - (t - 1.0) / 0.4);
      const e = up * up * (3 - 2 * up);
      armRx = lerp(armRx, -2.5, e);
      armRz = lerp(armRz, 0.15, e);
      this.head.rotation.x = lerp(this.head.rotation.x, -0.35, e);
      this.spine.rotation.x = lerp(this.spine.rotation.x, -0.08, e);
      if (t > 1.4) this.raiseT = -1;
    }
    this.armR.rotation.x = damp(this.armR.rotation.x, armRx, 18, dt);
    this.armR.rotation.z = armRz;
    // lantern sways a little on its handle
    this.glass.rotation.z = Math.sin(time * 2.3) * 0.08 + s * 0.12 * amp;
  }
}
