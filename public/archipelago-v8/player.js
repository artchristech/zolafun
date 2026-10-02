// The lighthouse keeper's apprentice: one skinned mesh (one draw call) with a
// walk cycle, an idle, and a lantern-raise; plus movement against terrain,
// platforms, water depth and solid shapes.
import * as THREE from './three.module.min.js';
import { G, mat } from './geo.js';
import { toon } from './materials.js';
import { Fire } from './fire.js';
import { groundAt } from './terrain.js';
import { resolve } from './colliders.js';
import { BLOCK_DEPTH } from './layout.js';
import { clamp, lerp, wrapAngle } from './util.js';

const B = { root: 0, hips: 1, spine: 2, head: 3, armL: 4, armR: 5, legL: 6, legR: 7, lantern: 8 };

function buildBody() {
  const pos = [], nor = [], col = [], si = [], sw = [];
  const _v = new THREE.Vector3(), _n = new THREE.Matrix3(), _c = new THREE.Color();
  const add = (geo, m, color, bone) => {
    const g = geo.index ? geo.toNonIndexed() : geo;
    _n.getNormalMatrix(m);
    _c.set(color);
    const p = g.attributes.position, n = g.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      _v.fromBufferAttribute(p, i).applyMatrix4(m); pos.push(_v.x, _v.y, _v.z);
      _v.fromBufferAttribute(n, i).applyMatrix3(_n).normalize(); nor.push(_v.x, _v.y, _v.z);
      col.push(_c.r, _c.g, _c.b);
      si.push(bone, 0, 0, 0); sw.push(1, 0, 0, 0);
    }
  };
  const tunic = 0x2f6fb0, trousers = 0xe8dcc0, boot = 0x5a3a22, skin = 0xf0c09a, hair = 0x5a3424, scarf = 0xd64b3a, hat = 0xd64b3a, iron = 0x2c2a2a, belt = 0x6b4a2e;
  for (const s of [1, -1]) {
    const leg = s > 0 ? B.legL : B.legR;
    add(G.box(0.15, 0.13, 0.27), mat(s * 0.1, 0.065, 0.03), boot, leg);
    add(G.cyl(0.075, 0.08, 0.3, 6), mat(s * 0.1, 0.27, 0), boot, leg);
    add(G.cyl(0.085, 0.075, 0.5, 6), mat(s * 0.1, 0.65, 0), trousers, leg);
    const arm = s > 0 ? B.armL : B.armR;
    add(G.cyl(0.07, 0.06, 0.32, 6), mat(s * 0.25, 1.22, 0), tunic, arm);
    add(G.cyl(0.055, 0.05, 0.28, 6), mat(s * 0.25, 0.94, 0), skin, arm);
    add(G.sph(0.06, 6, 4), mat(s * 0.25, 0.8, 0), skin, arm);
    add(G.sph(0.075, 6, 4), mat(s * 0.24, 1.36, 0), tunic, arm);
  }
  add(G.box(0.34, 0.2, 0.22), mat(0, 0.92, 0), trousers, B.hips);
  add(G.cyl(0.21, 0.23, 0.08, 10), mat(0, 1.0, 0), belt, B.hips);
  add(G.box(0.07, 0.07, 0.03), mat(0, 1.0, 0.22), 0xc9a24a, B.hips);
  add(G.cyl(0.17, 0.235, 0.5, 10), mat(0, 1.27, 0), tunic, B.spine);
  add(G.cyl(0.24, 0.27, 0.16, 10), mat(0, 1.0, 0), tunic, B.hips);
  add(G.torus(0.12, 0.05, 5, 10), mat(0, 1.5, 0, Math.PI / 2), scarf, B.spine);
  add(G.box(0.09, 0.26, 0.04), mat(0.06, 1.37, -0.15, 0.2, 0, 0.1), scarf, B.spine);
  add(G.sph(0.165, 10, 8), mat(0, 1.68, 0), skin, B.head);
  add(G.sph(0.172, 10, 6), mat(0, 1.72, -0.03, -0.25, 0, 0, 1, 0.8, 1), hair, B.head);
  add(G.cyl(0.16, 0.18, 0.12, 10), mat(0, 1.82, 0), hat, B.head);
  add(G.cone(0.15, 0.2, 10), mat(0, 1.96, -0.02, -0.25), hat, B.head);
  add(G.sph(0.06, 6, 4), mat(0, 2.05, -0.08), 0xf4efe4, B.head);
  add(G.sph(0.03, 5, 4), mat(0, 1.66, 0.165), 0xe8a882, B.head);
  for (const s of [1, -1]) add(G.box(0.035, 0.05, 0.02), mat(s * 0.065, 1.71, 0.152), 0x1e1712, B.head);
  // lantern hanging from the right hand
  const lx = -0.25, ly = 0.66, lz = 0.06;
  add(G.torus(0.06, 0.012, 3, 8, Math.PI), mat(lx, ly + 0.12, lz), iron, B.lantern);
  add(G.box(0.15, 0.03, 0.15), mat(lx, ly + 0.08, lz), iron, B.lantern);
  add(G.box(0.15, 0.03, 0.15), mat(lx, ly - 0.1, lz), iron, B.lantern);
  add(G.cone(0.1, 0.07, 4), mat(lx, ly + 0.13, lz, 0, Math.PI / 4), iron, B.lantern);
  for (const [dx, dz] of [[-0.065, -0.065], [0.065, -0.065], [-0.065, 0.065], [0.065, 0.065]]) add(G.box(0.015, 0.18, 0.015), mat(lx + dx, ly - 0.01, lz + dz), iron, B.lantern);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  g.computeBoundingSphere();
  g.boundingSphere.radius = 2.5;
  return { g, lanternLocal: new THREE.Vector3(lx, ly - 0.01, lz) };
}

export class Player {
  constructor(scene) {
    const { g, lanternLocal } = buildBody();
    const bones = [];
    const mk = (parent, x, y, z) => { const b = new THREE.Bone(); b.position.set(x, y, z); if (parent !== null) bones[parent].add(b); bones.push(b); return b; };
    mk(null, 0, 0, 0);                 // root
    mk(B.root, 0, 0.92, 0);            // hips (world 0.92)
    mk(B.hips, 0, 0.12, 0);            // spine (1.04)
    mk(B.spine, 0, 0.5, 0);            // head (1.54)
    mk(B.spine, 0.25, 0.34, 0);        // armL shoulder (1.38)
    mk(B.spine, -0.25, 0.34, 0);       // armR shoulder
    mk(B.hips, 0.1, -0.02, 0);         // legL hip (0.90)
    mk(B.hips, -0.1, -0.02, 0);        // legR hip
    mk(B.armR, 0, -0.6, 0.06);         // lantern at the hand (0.78)
    this.bones = bones;
    this.mesh = new THREE.SkinnedMesh(g, toon());
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.add(bones[0]);
    this.mesh.updateMatrixWorld(true);
    this.mesh.bind(new THREE.Skeleton(bones));
    scene.add(this.mesh);
    const lb = bones[B.lantern];
    this.flameLocal = lanternLocal.clone().sub(new THREE.Vector3(-0.25, 0.78, 0.06)).add(new THREE.Vector3(0, -0.03, 0));
    this.flame = new Fire(lb, this.flameLocal, 0.1, false);
    this.flame.set(1, true);
    this.lanternWorld = new THREE.Vector3();

    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.vy = 0;
    this.grounded = true;
    this.phase = 0;
    this.walk = 0;
    this.idleT = 0;
    this.raiseT = 0; this.raiseCb = null;
    this.surface = 'sand';
    this.onStep = null;
    this.lastStepSign = 1;
    this.speed = 0;
  }
  place(x, y, z, yaw) { this.pos.set(x, y, z); this.yaw = yaw; this.vel.set(0, 0, 0); this.vy = 0; this.sync(); }
  get raising() { return this.raiseT > 0; }
  raise(cb) { if (this.raiseT > 0) return; this.raiseT = 1.3; this.raiseCb = cb; }

  // move: world-space desired direction (x,z) with magnitude 0..1
  update(dt, mx, mz, water, t) {
    const locked = this.raiseT > 0;
    const SPEED = 5.2;
    const want = locked ? 0 : Math.min(1, Math.hypot(mx, mz));
    const tx = locked ? 0 : mx * SPEED, tz = locked ? 0 : mz * SPEED;
    const acc = want > 0.01 ? 10 : 12;
    this.vel.x += (tx - this.vel.x) * Math.min(1, dt * acc);
    this.vel.z += (tz - this.vel.z) * Math.min(1, dt * acc);
    const sp = Math.hypot(this.vel.x, this.vel.z);
    if (want > 0.05) {
      const ty = Math.atan2(mx, mz);
      this.yaw += wrapAngle(ty - this.yaw) * Math.min(1, dt * 10);
    }
    // horizontal step with ground checks
    const tryMove = (nx, nz) => {
      const p = { x: nx, z: nz };
      resolve(p, 0.34, this.pos.y + 0.3, this.pos.y + 1.75);
      const g = groundAt(p.x, p.z, this.pos.y);
      if (g.h < water - BLOCK_DEPTH) return null;
      const dist = Math.hypot(p.x - this.pos.x, p.z - this.pos.z);
      const rise = g.h - this.pos.y;
      // platforms may be stepped onto; natural ground must not be steeper than 45 deg
      if (this.grounded && rise > (g.plat ? 0.45 : dist * 1.05 + 0.02)) return null;
      return { x: p.x, z: p.z, h: g.h, surf: g.surf };
    };
    const steps = Math.max(1, Math.ceil(sp * dt / 0.25));
    let moved = 0;
    for (let s = 0; s < steps; s++) {
      const dx = this.vel.x * dt / steps, dz = this.vel.z * dt / steps;
      let r = tryMove(this.pos.x + dx, this.pos.z + dz);
      if (!r && Math.abs(dx) > 1e-5) r = tryMove(this.pos.x + dx, this.pos.z);
      if (!r && Math.abs(dz) > 1e-5) r = tryMove(this.pos.x, this.pos.z + dz);
      if (!r) r = tryMove(this.pos.x, this.pos.z); // still let colliders push us out
      if (r) {
        moved += Math.hypot(r.x - this.pos.x, r.z - this.pos.z);
        this.pos.x = r.x; this.pos.z = r.z;
        this.surface = r.surf;
      }
    }
    // vertical
    const g = groundAt(this.pos.x, this.pos.z, this.pos.y).h;
    if (this.grounded && this.pos.y - g < 0.6 && this.pos.y - g > -0.6) { this.pos.y = g; this.vy = 0; }
    else if (this.pos.y > g) {
      this.grounded = false;
      this.vy -= 22 * dt;
      this.pos.y += this.vy * dt;
      if (this.pos.y <= g) { this.pos.y = g; this.vy = 0; this.grounded = true; if (this.onStep) this.onStep(this.surface, 1.6); }
    } else { this.pos.y = g; this.vy = 0; this.grounded = true; }

    this.speed = dt > 0 ? moved / dt : 0;
    this.animate(dt, t);
    this.sync();
  }

  animate(dt, t) {
    const b = this.bones;
    const w = clamp(this.speed / 5.2, 0, 1);
    this.walk = lerp(this.walk, w, Math.min(1, dt * 8));
    this.phase += dt * (3.0 + this.speed * 1.55);
    const s = Math.sin(this.phase), c = Math.cos(this.phase);
    const wk = this.walk;
    // footsteps on each swing reversal
    const sign = s >= 0 ? 1 : -1;
    if (sign !== this.lastStepSign) { this.lastStepSign = sign; if (wk > 0.25 && this.grounded && this.onStep) this.onStep(this.surface, wk); }
    // raise
    let raise = 0;
    if (this.raiseT > 0) {
      const prev = this.raiseT;
      this.raiseT = Math.max(0, this.raiseT - dt);
      const u = 1 - this.raiseT / 1.3;
      raise = Math.sin(Math.min(1, u) * Math.PI);
      raise = Math.min(1, raise * 1.6);
      if (prev > 0.65 && this.raiseT <= 0.65 && this.raiseCb) { const cb = this.raiseCb; this.raiseCb = null; cb(); }
    }
    const idle = 1 - wk;
    const breath = Math.sin(t * 1.7);
    b[B.legL].rotation.x = s * 0.62 * wk;
    b[B.legR].rotation.x = -s * 0.62 * wk;
    b[B.hips].position.y = 0.92 + Math.abs(c) * 0.05 * wk - 0.02 * wk + breath * 0.004 * idle;
    b[B.hips].rotation.y = s * 0.12 * wk;
    b[B.spine].rotation.y = -s * 0.16 * wk + Math.sin(t * 0.37) * 0.06 * idle;
    b[B.spine].rotation.x = 0.08 * wk + breath * 0.025 * idle;
    b[B.head].rotation.y = Math.sin(t * 0.43) * 0.45 * idle * (1 - raise);
    b[B.head].rotation.x = -0.05 * wk + Math.sin(t * 0.29) * 0.06 * idle - raise * 0.35;
    b[B.armL].rotation.x = -s * 0.55 * wk + breath * 0.03 * idle;
    b[B.armL].rotation.z = 0.12 + 0.04 * idle;
    const armRBase = -0.35 + s * 0.18 * wk + breath * 0.02 * idle;
    b[B.armR].rotation.x = lerp(armRBase, -2.75, raise);
    b[B.armR].rotation.z = lerp(-0.12, 0.25, raise);
    // keep the lantern hanging down, swinging a little
    const swing = Math.sin(this.phase * 2) * 0.12 * wk + Math.sin(t * 1.3) * 0.05 * idle;
    b[B.lantern].rotation.x = -b[B.armR].rotation.x - b[B.spine].rotation.x + swing;
    b[B.lantern].rotation.z = -b[B.armR].rotation.z;
  }

  sync() {
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.yaw;
    this.mesh.updateMatrixWorld(true);
    this.flame.mesh.getWorldPosition(this.lanternWorld);
  }
}
