// The apprentice: one skinned, merged mesh with procedural walk / idle / raise-lantern.
import * as THREE from './three.module.min.js';
import { piece, merge, mat4, G, toon, clamp, damp, angDiff } from './util.js';
import { groundAt, resolveSolids } from './physics.js';

const B = { root: 0, hips: 1, spine: 2, head: 3, armL: 4, foreL: 5, armR: 6, foreR: 7, legL: 8, shinL: 9, legR: 10, shinR: 11, lantern: 12 };
const PIVOT = {
  root: [0, 0, 0], hips: [0, 0.93, 0], spine: [0, 1.0, 0], head: [0, 1.45, 0],
  armL: [-0.25, 1.4, 0], foreL: [-0.26, 1.12, 0], armR: [0.25, 1.4, 0], foreR: [0.26, 1.12, 0],
  legL: [-0.1, 0.92, 0], shinL: [-0.1, 0.5, 0], legR: [0.1, 0.92, 0], shinR: [0.1, 0.5, 0], lantern: [0.27, 0.82, 0.02],
};
const PARENT = { hips: 'root', spine: 'hips', head: 'spine', armL: 'spine', foreL: 'armL', armR: 'spine', foreR: 'armR', legL: 'hips', shinL: 'legL', legR: 'hips', shinR: 'legR', lantern: 'foreR' };

function buildGeometry() {
  const parts = [];
  const add = (geo, color, bone, m, emit = 0) => parts.push(piece(geo, color, m, {
    skinIndex: { size: 4, value: [B[bone], 0, 0, 0] }, skinWeight: { size: 4, value: [1, 0, 0, 0] }, emit: { size: 1, value: emit },
  }));
  const COAT = 0x2d4e7a, COAT2 = 0x24406a, SKIN = 0xf0c09a, BOOT = 0x4a3020, PANTS = 0x6b5a48, SCARF = 0xd8463a, HAIR = 0x6a3e22;
  for (const s of [-1, 1]) {
    const leg = s < 0 ? 'legL' : 'legR', shin = s < 0 ? 'shinL' : 'shinR';
    add(G.box, PANTS, leg, mat4(s * 0.1, 0.72, 0, 0, 0, 0, 0.16, 0.42, 0.18));
    add(G.box, PANTS, shin, mat4(s * 0.1, 0.32, 0, 0, 0, 0, 0.15, 0.38, 0.16));
    add(G.box, BOOT, shin, mat4(s * 0.1, 0.07, 0.03, 0, 0, 0, 0.17, 0.14, 0.27));
    const arm = s < 0 ? 'armL' : 'armR', fore = s < 0 ? 'foreL' : 'foreR';
    add(G.box, COAT, arm, mat4(s * 0.26, 1.26, 0, 0, 0, 0, 0.12, 0.32, 0.13));
    add(G.box, COAT2, fore, mat4(s * 0.26, 0.98, 0, 0, 0, 0, 0.11, 0.28, 0.12));
    add(G.sphere, SKIN, fore, mat4(s * 0.26, 0.82, 0, 0, 0, 0, 0.06, 0.07, 0.06));
  }
  add(G.box, COAT2, 'hips', mat4(0, 0.92, 0, 0, 0, 0, 0.36, 0.2, 0.23));
  add(new THREE.CylinderGeometry(0.2, 0.27, 1, 8), COAT, 'hips', mat4(0, 0.8, 0, 0, 0, 0, 1, 0.32, 0.9));
  add(G.box, COAT, 'spine', mat4(0, 1.2, 0, 0, 0, 0, 0.4, 0.44, 0.25));
  add(G.box, 0xd8b048, 'spine', mat4(0, 1.15, 0.128, 0, 0, 0, 0.04, 0.3, 0.01));
  add(G.box, SCARF, 'spine', mat4(0, 1.42, 0, 0, 0, 0, 0.3, 0.08, 0.27));
  add(G.box, SCARF, 'spine', mat4(0.08, 1.3, -0.14, 0.2, 0, 0, 0.08, 0.22, 0.03));
  add(G.sphere, SKIN, 'head', mat4(0, 1.6, 0, 0, 0, 0, 0.15, 0.16, 0.15));
  add(G.sphere, HAIR, 'head', mat4(0, 1.64, -0.03, 0, 0, 0, 0.155, 0.14, 0.15));
  add(G.cyl, 0x22385a, 'head', mat4(0, 1.75, 0, -0.08, 0, 0, 0.15, 0.08, 0.15));
  add(G.box, 0x1a2a44, 'head', mat4(0, 1.72, 0.13, -0.15, 0, 0, 0.2, 0.025, 0.12));
  add(G.sphere, 0xe0a882, 'head', mat4(0, 1.58, 0.15, 0, 0, 0, 0.03, 0.03, 0.03));
  add(G.box, 0x111111, 'head', mat4(-0.055, 1.62, 0.14, 0, 0, 0, 0.025, 0.035, 0.01));
  add(G.box, 0x111111, 'head', mat4(0.055, 1.62, 0.14, 0, 0, 0, 0.025, 0.035, 0.01));
  // lantern
  const lx = 0.27, ly = 0.66, lz = 0.02;
  add(G.box, 0x2a2420, 'lantern', mat4(lx, ly + 0.14, lz, 0, 0, 0, 0.04, 0.08, 0.04));
  add(G.cone, 0x2a2420, 'lantern', mat4(lx, ly + 0.1, lz, 0, 0, 0, 0.11, 0.07, 0.11));
  add(G.box, 0xffc070, 'lantern', mat4(lx, ly, lz, 0, 0, 0, 0.13, 0.15, 0.13), 1);
  add(G.box, 0x2a2420, 'lantern', mat4(lx, ly - 0.09, lz, 0, 0, 0, 0.16, 0.03, 0.16));
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add(G.box, 0x2a2420, 'lantern', mat4(lx + dx * 0.07, ly, lz + dz * 0.07, 0, 0, 0, 0.02, 0.17, 0.02));
  return merge(parts);
}

export class Player {
  constructor(scene) {
    const geo = buildGeometry();
    this.glow = { value: 1 };
    const mat = toon({ vertexColors: true });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uGlow = this.glow;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float emit;\nvarying float vEmit;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEmit = emit;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vEmit;\nuniform float uGlow;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1.0, 0.62, 0.25) * vEmit * uGlow;');
    };
    mat.customProgramCacheKey = () => 'apprentice';
    this.bones = {};
    const list = [];
    for (const name of Object.keys(B)) {
      const b = new THREE.Bone();
      b.name = name;
      this.bones[name] = b;
      list[B[name]] = b;
    }
    for (const name of Object.keys(B)) {
      const b = this.bones[name], p = PIVOT[name];
      if (PARENT[name]) {
        const pp = PIVOT[PARENT[name]];
        b.position.set(p[0] - pp[0], p[1] - pp[1], p[2] - pp[2]);
        this.bones[PARENT[name]].add(b);
      }
    }
    this.mesh = new THREE.SkinnedMesh(geo, mat);
    this.mesh.add(this.bones.root);
    this.mesh.updateMatrixWorld(true);
    this.mesh.bind(new THREE.Skeleton(list));
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);

    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector2();
    this.yaw = 0;
    this.phase = 0;
    this.speed = 0;
    this.raise = 0;
    this.raiseT = 0;
    this.time = 0;
    this.surf = 'grass';
    this.onStep = null;
    this.locked = 0;
    this.lanternWorld = new THREE.Vector3();
    this._g = {};
    this.stillTime = 0;
  }

  place(x, z, yaw, water) {
    groundAt(x, z, water, this._g);
    this.pos.set(x, this._g.h, z);
    this.yaw = yaw;
    this.vel.set(0, 0);
  }

  // lift the lantern for `dur` seconds (lighting something)
  lift(dur = 1.6) { this.raiseT = Math.max(this.raiseT, dur); this.locked = Math.max(this.locked, dur * 0.8); }

  update(dt, mx, mz, water) {
    this.time += dt;
    const WALK = 4.4;
    if (this.locked > 0) { this.locked -= dt; mx = 0; mz = 0; }
    const mag = Math.min(1, Math.hypot(mx, mz));
    const tx = mx * WALK, tz = mz * WALK;
    this.vel.x = damp(this.vel.x, tx, 10, dt);
    this.vel.y = damp(this.vel.y, tz, 10, dt);
    const g = this._g;
    const sp = Math.hypot(this.vel.x, this.vel.y);
    if (sp > 0.01) {
      const cur = groundAt(this.pos.x, this.pos.z, water, {});
      const probe = {};
      const tryMove = (dx, dz) => {
        const nx = this.pos.x + dx, nz = this.pos.z + dz;
        groundAt(nx, nz, water, g);
        if (!g.walk) return false;
        // slope test over a fixed half-metre probe so steep ground can't be crept up
        const dist = Math.hypot(dx, dz) || 1;
        groundAt(this.pos.x + (dx / dist) * 0.5, this.pos.z + (dz / dist) * 0.5, water, probe);
        const rise = probe.h - cur.h;
        if (rise > 0.5) return false;
        if (rise < -0.65) return false;
        if (Math.abs(g.h - cur.h) > 0.4) return false;
        if (g.slope > 1.0 && g.slope > cur.slope - 0.02) return false;
        this.pos.x = nx; this.pos.z = nz;
        return true;
      };
      const dx = this.vel.x * dt, dz = this.vel.y * dt;
      if (!tryMove(dx, dz)) {
        if (!tryMove(dx, 0)) { this.vel.x *= 0.5; }
        if (!tryMove(0, dz)) { this.vel.y *= 0.5; }
      }
      const before = { x: this.pos.x, z: this.pos.z };
      resolveSolids(this.pos, 0.32, this.pos.y);
      groundAt(this.pos.x, this.pos.z, water, g);
      if (!g.walk) { this.pos.x = before.x; this.pos.z = before.z; }
    }
    groundAt(this.pos.x, this.pos.z, water, g);
    this.surf = g.surf;
    const dy = g.h - this.pos.y;
    this.pos.y = Math.abs(dy) > 1.5 ? g.h : damp(this.pos.y, g.h, 18, dt);
    this.speed = damp(this.speed, sp, 8, dt);
    if (mag > 0.1) {
      const want = Math.atan2(this.vel.x, this.vel.y);
      this.yaw += angDiff(this.yaw, want) * Math.min(1, dt * 10);
    }
    this.stillTime = this.speed < 0.2 ? this.stillTime + dt : 0;
    this.animate(dt);
  }

  animate(dt) {
    const b = this.bones;
    const s = clamp(this.speed / 4.4, 0, 1);
    const prev = this.phase;
    this.phase += dt * (4 + 6 * s) * (s > 0.05 ? 1 : 0);
    if (s > 0.15 && Math.floor(prev / Math.PI) !== Math.floor(this.phase / Math.PI) && this.onStep) this.onStep(this.surf, s);
    const ph = this.phase, t = this.time;
    if (this.raiseT > 0) this.raiseT -= dt;
    this.raise = damp(this.raise, this.raiseT > 0 ? 1 : 0, 7, dt);
    const r = this.raise;
    const sw = Math.sin(ph) * s;
    b.legL.rotation.x = -sw * 0.6;
    b.legR.rotation.x = sw * 0.6;
    b.shinL.rotation.x = Math.max(0, Math.cos(ph)) * 0.8 * s + 0.04;
    b.shinR.rotation.x = Math.max(0, -Math.cos(ph)) * 0.8 * s + 0.04;
    const breathe = Math.sin(t * 1.7) * 0.025 * (1 - s);
    b.hips.position.y = PIVOT.hips[1] + Math.abs(Math.cos(ph)) * 0.045 * s - 0.02 * s;
    b.spine.rotation.x = 0.1 * s + breathe - r * 0.15;
    b.spine.rotation.y = Math.sin(ph) * 0.08 * s;
    b.head.rotation.x = -breathe * 0.6 - r * 0.35;
    b.head.rotation.y = Math.sin(t * 0.37) * 0.3 * (1 - s) * (1 - r);
    b.armL.rotation.x = sw * 0.5 + Math.sin(t * 1.7 + 1) * 0.03;
    b.armL.rotation.z = -0.08 - (1 - s) * 0.02;
    b.foreL.rotation.x = -0.25 - s * 0.3;
    const idleR = -0.35 + Math.sin(t * 1.3) * 0.02;
    b.armR.rotation.x = (1 - r) * (idleR - sw * 0.18) + r * -2.55;
    b.armR.rotation.z = 0.08 * (1 - r);
    b.foreR.rotation.x = (1 - r) * -0.35 + r * -0.25;
    // keep the lantern hanging plumb
    b.lantern.rotation.x = -(b.armR.rotation.x + b.foreR.rotation.x + b.spine.rotation.x) + Math.sin(ph * 2) * 0.12 * s;
    b.lantern.rotation.z = -b.armR.rotation.z;
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.yaw;
    this.mesh.updateMatrixWorld(true);
    this.lanternWorld.set(0, -0.12, 0).applyMatrix4(b.lantern.matrixWorld);
  }
}
