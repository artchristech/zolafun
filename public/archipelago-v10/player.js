// The lighthouse keeper's apprentice: one skinned, merged mesh with procedural walk/idle/raise
// animation, a lantern that always hangs upright, and a small cel flame inside it.
import * as THREE from './three.module.min.js';
import { GeoBuilder, mat, damp, angDiff, clamp } from './util.js';
import { groundH, surfaceAt } from './ground.js';
import { WADE, SURF } from './layout.js';

const BONES = [
  ['root', null, [0, 0, 0]],
  ['hips', 'root', [0, 0.82, 0]],
  ['spine', 'hips', [0, 0.98, 0]],
  ['head', 'spine', [0, 1.36, 0]],
  ['uaL', 'spine', [0.25, 1.3, 0]],
  ['faL', 'uaL', [0.25, 1.06, 0]],
  ['uaR', 'spine', [-0.25, 1.3, 0]],
  ['faR', 'uaR', [-0.25, 1.06, 0]],
  ['lantern', 'faR', [-0.25, 0.83, 0]],
  ['thL', 'hips', [0.1, 0.8, 0]],
  ['shL', 'thL', [0.1, 0.43, 0]],
  ['thR', 'hips', [-0.1, 0.8, 0]],
  ['shR', 'thR', [-0.1, 0.43, 0]],
];
const BI = Object.fromEntries(BONES.map((b, i) => [b[0], i]));

function buildApprentice(gradientMap) {
  const g = new GeoBuilder(true);
  const tunic = '#2f8f83', trouser = '#3b4a6b', boot = '#4a2f20', skin = '#f3c6a0', hair = '#5a3720', cap = '#24365e', scarf = '#d8432f', metal = '#2d2a28';
  const add = (geo, m, c, bone) => g.add(geo, m, c, { bone: BI[bone] });
  for (const s of [1, -1]) {
    const L = s > 0 ? 'L' : 'R';
    add(new THREE.BoxGeometry(0.15, 0.1, 0.26), mat(0.1 * s, 0.05, 0.035), boot, 'sh' + L);
    add(new THREE.CylinderGeometry(0.07, 0.065, 0.36, 7), mat(0.1 * s, 0.25, 0), trouser, 'sh' + L);
    add(new THREE.CylinderGeometry(0.085, 0.075, 0.4, 7), mat(0.1 * s, 0.62, 0), trouser, 'th' + L);
    add(new THREE.CylinderGeometry(0.06, 0.058, 0.26, 7), mat(0.25 * s, 1.18, 0), tunic, 'ua' + L);
    add(new THREE.CylinderGeometry(0.054, 0.05, 0.2, 7), mat(0.25 * s, 0.96, 0), tunic, 'fa' + L);
    add(new THREE.SphereGeometry(0.058, 7, 5), mat(0.25 * s, 0.83, 0), skin, 'fa' + L);
  }
  add(new THREE.CylinderGeometry(0.2, 0.26, 0.32, 10), mat(0, 0.78, 0), tunic, 'hips');
  add(new THREE.CylinderGeometry(0.21, 0.21, 0.06, 10), mat(0, 0.95, 0), '#6b4226', 'hips');
  add(new THREE.BoxGeometry(0.08, 0.07, 0.03), mat(0, 0.95, 0.21), '#e8b440', 'hips');
  add(new THREE.CylinderGeometry(0.17, 0.2, 0.36, 10), mat(0, 1.14, 0), tunic, 'spine');
  add(new THREE.CylinderGeometry(0.15, 0.17, 0.08, 10), mat(0, 1.33, 0), scarf, 'spine');
  add(new THREE.BoxGeometry(0.08, 0.26, 0.03), mat(0.06, 1.2, -0.17, 0.2, 0, 0.1), scarf, 'spine');
  add(new THREE.SphereGeometry(0.22, 12, 9), mat(0, 1.56, 0), skin, 'head');
  add(new THREE.SphereGeometry(0.228, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.55), mat(0, 1.585, -0.02, -0.35, 0, 0), hair, 'head');
  for (const s of [1, -1]) add(new THREE.SphereGeometry(0.032, 6, 5), mat(0.075 * s, 1.56, 0.2), '#1a1a1a', 'head');
  add(new THREE.SphereGeometry(0.03, 6, 5), mat(0, 1.51, 0.215), '#e9b18a', 'head');
  add(new THREE.CylinderGeometry(0.2, 0.215, 0.11, 12), mat(0, 1.74, -0.01), cap, 'head');
  add(new THREE.CylinderGeometry(0.15, 0.15, 0.025, 10), mat(0, 1.69, 0.15, 0.1, 0, 0, 1, 1, 0.75), cap, 'head');
  add(new THREE.SphereGeometry(0.035, 6, 5), mat(0, 1.81, -0.01), '#e8b440', 'head');
  // lantern hangs below the right hand
  const lx = -0.25;
  add(new THREE.TorusGeometry(0.055, 0.012, 4, 10, Math.PI), mat(lx, 0.77, 0), metal, 'lantern');
  add(new THREE.ConeGeometry(0.095, 0.08, 6), mat(lx, 0.72, 0), metal, 'lantern');
  add(new THREE.CylinderGeometry(0.07, 0.07, 0.14, 8, 1, true), mat(lx, 0.61, 0), '#ffe9a8', 'lantern');
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    add(new THREE.BoxGeometry(0.014, 0.15, 0.014), mat(lx + Math.sin(a) * 0.072, 0.61, Math.cos(a) * 0.072), metal, 'lantern');
  }
  add(new THREE.CylinderGeometry(0.085, 0.075, 0.035, 8), mat(lx, 0.525, 0), metal, 'lantern');
  const geo = g.build();
  const material = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap });
  const mesh = new THREE.SkinnedMesh(geo, material);
  const bones = BONES.map(([name, parent, p]) => {
    const b = new THREE.Bone();
    b.name = name;
    b.userData.wp = p;
    return b;
  });
  BONES.forEach(([name, parent, p], i) => {
    if (parent) {
      const pi = BI[parent];
      const pp = BONES[pi][2];
      bones[i].position.set(p[0] - pp[0], p[1] - pp[1], p[2] - pp[2]);
      bones[pi].add(bones[i]);
    } else bones[i].position.set(p[0], p[1], p[2]);
  });
  mesh.add(bones[0]);
  mesh.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(bones));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  return { mesh, bones };
}

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = new THREE.Vector3();

export class Player {
  constructor(ctx) {
    this.ctx = ctx;
    const { mesh, bones } = buildApprentice(ctx.mats.vc.gradientMap);
    this.mesh = mesh;
    this.b = Object.fromEntries(bones.map((b) => [b.name, b]));
    this.group = new THREE.Group();
    this.group.add(mesh);
    ctx.scene.add(this.group);
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.phase = 0;
    this.walkAmt = 0;
    this.raiseT = 0; // seconds into a raise
    this.raising = false;
    this.idleT = 0;
    this.swing = 0;
    this.swingV = 0;
    this.lastStep = 0;
    this.flame = ctx.fires.create({ scale: 0.085, glow: 0.9, embers: false });
    ctx.scene.add(this.flame.group);
    this.flame.ignite(true);
    this.light = new THREE.PointLight(0xffb060, 3, 16, 1.2);
    ctx.scene.add(this.light);
    this.lanternWorld = new THREE.Vector3();
    this.speed = 0;
  }
  place(x, z, yaw) {
    this.pos.set(x, groundH(x, z), z);
    this.yaw = yaw;
    this.vel.set(0, 0, 0);
    this.group.position.copy(this.pos);
    this.group.rotation.y = yaw;
  }
  raise() {
    this.raising = true;
    this.raiseT = 0;
  }
  get busy() {
    return this.raising;
  }
  walkable(x, z, fromH, dist) {
    const h = groundH(x, z);
    const water = this.ctx.water();
    if (water - h > WADE) return false;
    if (dist > 1e-4) {
      const s = (h - fromH) / dist;
      if (s > 0.85 || s < -1.1) return false;
      // no zig-zagging up steep ground: judge the slope of the surface itself
      if (s > 0.02) {
        const e = 0.35;
        const gx = (groundH(x + e, z) - groundH(x - e, z)) / (2 * e);
        const gz = (groundH(x, z + e) - groundH(x, z - e)) / (2 * e);
        if (gx * gx + gz * gz > 0.95 * 0.95) return false;
      }
    }
    return true;
  }
  update(dt, move, camYaw, allowMove) {
    // camera-relative movement
    const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
    const rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
    let mx = fx * move.y + rx * move.x, mz = fz * move.y + rz * move.x;
    const ml = Math.hypot(mx, mz);
    if (ml > 1) { mx /= ml; mz /= ml; }
    if (!allowMove || this.raising) { mx = 0; mz = 0; }
    const SPEED = 5.6;
    this.vel.x = damp(this.vel.x, mx * SPEED, 10, dt);
    this.vel.z = damp(this.vel.z, mz * SPEED, 10, dt);
    const p = this.pos;
    const h0 = groundH(p.x, p.z);
    let nx = p.x + this.vel.x * dt, nz = p.z + this.vel.z * dt;
    const d = Math.hypot(nx - p.x, nz - p.z);
    if (!this.walkable(nx, nz, h0, d)) {
      // slide along whichever axis still works
      const dx = Math.abs(nx - p.x), dz = Math.abs(nz - p.z);
      if (this.walkable(nx, p.z, h0, dx)) { nz = p.z; this.vel.z *= 0.5; }
      else if (this.walkable(p.x, nz, h0, dz)) { nx = p.x; this.vel.x *= 0.5; }
      else { nx = p.x; nz = p.z; this.vel.x *= 0.3; this.vel.z *= 0.3; }
    }
    const q = { x: nx, y: p.y, z: nz };
    this.ctx.col.resolve(q, 0.38, 1.6);
    if (this.walkable(q.x, q.z, h0, Math.hypot(q.x - p.x, q.z - p.z) + 0.05)) {
      p.x = q.x;
      p.z = q.z;
    } else if (this.walkable(nx, nz, h0, d)) {
      // pushed into somewhere unwalkable: keep the unpushed step only if no collider remains
      const t = { x: nx, y: p.y, z: nz };
      this.ctx.col.resolve(t, 0.38, 1.6);
      if (Math.hypot(t.x - nx, t.z - nz) < 1e-3) { p.x = nx; p.z = nz; }
    }
    const gh = groundH(p.x, p.z);
    p.y = damp(p.y, gh, 18, dt);
    if (Math.abs(p.y - gh) > 1.0) p.y = gh;
    const sp = Math.hypot(this.vel.x, this.vel.z);
    this.speed = sp;
    if (sp > 0.3 && !this.raising) this.yaw += angDiff(this.yaw, Math.atan2(this.vel.x, this.vel.z)) * Math.min(1, dt * 12);
    this.group.position.copy(p);
    this.group.rotation.y = this.yaw;
    this.animate(dt, sp);
  }
  animate(dt, sp) {
    const b = this.b;
    const walk = clamp(sp / 5.6, 0, 1);
    this.walkAmt = damp(this.walkAmt, walk, 8, dt);
    const w = this.walkAmt;
    const prev = this.phase;
    this.phase += dt * (2.2 + sp * 1.25);
    // footsteps at each half cycle
    if (w > 0.25 && Math.floor(prev / Math.PI) !== Math.floor(this.phase / Math.PI)) this.footstep();
    this.idleT += dt;
    const t = this.idleT, ph = this.phase;
    const s = Math.sin(ph), c = Math.cos(ph);
    // legs
    b.thL.rotation.x = -s * 0.7 * w;
    b.thR.rotation.x = s * 0.7 * w;
    b.shL.rotation.x = Math.max(0, Math.sin(ph + 1.3)) * 0.95 * w + 0.02;
    b.shR.rotation.x = Math.max(0, -Math.sin(ph + 1.3)) * 0.95 * w + 0.02;
    // body
    b.hips.position.y = 0.82 + (Math.abs(c) * 0.05 - 0.03) * w + Math.sin(t * 1.7) * 0.006 * (1 - w);
    b.hips.rotation.y = s * 0.12 * w;
    b.spine.rotation.y = -s * 0.18 * w;
    b.spine.rotation.x = 0.08 * w + Math.sin(t * 1.7) * 0.025 * (1 - w);
    b.head.rotation.y = Math.sin(t * 0.37) * 0.35 * (1 - w) * (1 - (this.raising ? 1 : 0));
    b.head.rotation.x = Math.sin(t * 0.23) * 0.08 * (1 - w) - 0.05 * w;
    // left arm swings, right arm carries the lantern
    b.uaL.rotation.x = s * 0.55 * w;
    b.uaL.rotation.z = 0.08 + Math.sin(t * 1.7) * 0.02 * (1 - w);
    b.faL.rotation.x = -0.25 - Math.max(0, s) * 0.3 * w;
    let rUp = 0;
    if (this.raising) {
      this.raiseT += dt;
      const T = this.raiseT;
      rUp = T < 0.35 ? T / 0.35 : T < 1.15 ? 1 : Math.max(0, 1 - (T - 1.15) / 0.4);
      rUp = rUp * rUp * (3 - 2 * rUp);
      if (T > 1.6) this.raising = false;
    }
    this.raiseAmt = rUp;
    b.uaR.rotation.x = (-s * 0.18 * w - 0.35) * (1 - rUp) + -2.75 * rUp;
    b.uaR.rotation.z = -0.1 * (1 - rUp) - 0.15 * rUp;
    b.faR.rotation.x = -0.55 * (1 - rUp) - 0.25 * rUp;
    // update matrices, then hang the lantern upright from the hand with a little swing
    this.swingV += (-this.swing * 30 - (sp > 0.3 ? Math.sin(ph * 2) * 4 : 0)) * dt;
    this.swingV *= Math.exp(-3 * dt);
    this.swing += this.swingV * dt;
    this.group.updateMatrixWorld(true);
    b.faR.getWorldQuaternion(_q);
    this.group.getWorldQuaternion(_q2);
    _q2.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), this.swing * 0.5));
    b.lantern.quaternion.copy(_q.invert().multiply(_q2));
    b.lantern.updateMatrixWorld(true);
    // flame + light follow the lantern glass
    _v.set(0, -0.26, 0);
    b.lantern.localToWorld(_v);
    this.lanternWorld.copy(_v);
    this.flame.group.position.copy(_v).add(new THREE.Vector3(0, -0.055, 0));
    this.light.position.copy(_v);
  }
  footstep() {
    const p = this.pos;
    const water = this.ctx.water();
    const h = groundH(p.x, p.z);
    let s = surfaceAt(p.x, p.z);
    if (water > h - 0.02) s = 5;
    this.ctx.audio.footstep(s, p);
  }
}
