// The apprentice: a small cel-shaded figure with a red cap and a lantern.
// Walk cycle, idle breathing/look-around, lantern raise for lighting things,
// ground following, and a smoothed third-person camera that never clips.
import * as THREE from './three.module.min.js';
import { groundAt, heightAt, slopeAt, pushOut, cameraCast } from './terrain.js';
import { toon } from './materials.js';
import { createFire, createGlow } from './fire.js';
import { clamp, damp, dampAngle, lerp, smoothstep } from './util.js';

const SPEED = 6.2;

function limb(len, r0, r1, color) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, len, 8).translate(0, -len / 2, 0), toon(color));
  m.castShadow = true;
  return m;
}

export class Player {
  constructor(scene, audio) {
    this.audio = audio;
    this.x = 0; this.y = 3; this.z = 0; this.visY = 3;
    this.vx = 0; this.vz = 0;
    this.facing = 0;
    this.phase = 0; this.moveAmt = 0; this.time = 0;
    this.raiseT = -1; this.raiseCb = null; this.reachT = -1;
    this.surf = 'sand';
    this.water = 2.4;
    this.idleTime = 0;
    this.faceT = 0; this.faceTimer = 0;
    this.cam = { yaw: Math.PI, pitch: 0.32, dist: 6.4, curDist: 6.4, px: 0, py: 0, pz: 0, sy: Math.PI, sp: 0.32 };
    this.build(scene);
  }

  build(scene) {
    const root = new THREE.Group();
    this.root = root;
    scene.add(root);
    const coat = 0x2f7f9a, coatD = 0x23627a, skin = 0xf2c7a0, cap = 0xd8473a, scarf = 0xf2c14e, boot = 0x4a3426, trouser = 0x5a4a3a;
    const hips = new THREE.Group(); hips.position.y = 0.86; root.add(hips); this.hips = hips;
    const torso = new THREE.Group(); hips.add(torso); this.torso = torso;
    const add = (parent, mesh, x, y, z) => { mesh.position.set(x, y, z); mesh.castShadow = true; parent.add(mesh); return mesh; };
    add(torso, new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.29, 0.6, 10), toon(coat)), 0, 0.3, 0);
    add(torso, new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 0.34, 10), toon(coatD)), 0, -0.1, 0);
    add(torso, new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.04, 4, 12).rotateX(Math.PI / 2), toon(0x3a2a1e)), 0, 0.06, 0);
    add(torso, new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.07, 6, 12).rotateX(Math.PI / 2), toon(scarf)), 0, 0.6, 0);
    const tail = add(torso, new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.32, 0.05).translate(0, -0.16, 0), toon(scarf)), 0.08, 0.6, -0.17);
    this.scarfTail = tail;
    const head = new THREE.Group(); head.position.y = 0.82; torso.add(head); this.head = head;
    add(head, new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 10), toon(skin)), 0, 0, 0);
    add(head, new THREE.Mesh(new THREE.SphereGeometry(0.215, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), toon(cap)), 0, 0.03, -0.01);
    add(head, new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.035, 4, 14).rotateX(Math.PI / 2), toon(0xf4efe4)), 0, 0.04, -0.01);
    add(head, new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), toon(0xf4efe4)), 0, 0.24, -0.06);
    for (const s of [-1, 1]) add(head, new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 4), toon(0x1a1410)), 0.075 * s, 0.0, 0.18);
    add(head, new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 4), toon(0xe8a888)), 0, -0.04, 0.2);
    // arms
    const arm = (side) => {
      const sh = new THREE.Group(); sh.position.set(0.28 * side, 0.52, 0); torso.add(sh);
      sh.add(limb(0.3, 0.075, 0.065, coat));
      const fore = new THREE.Group(); fore.position.y = -0.3; sh.add(fore);
      fore.add(limb(0.27, 0.062, 0.055, coat));
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), toon(skin)); hand.position.y = -0.3; hand.castShadow = true; fore.add(hand);
      return { sh, fore };
    };
    this.armL = arm(-1); this.armR = arm(1);
    // legs
    const leg = (side) => {
      const hip = new THREE.Group(); hip.position.set(0.12 * side, 0.86, 0); root.add(hip);
      hip.add(limb(0.42, 0.09, 0.075, trouser));
      const knee = new THREE.Group(); knee.position.y = -0.42; hip.add(knee);
      knee.add(limb(0.38, 0.072, 0.065, trouser));
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.24).translate(0, -0.06, 0.04), toon(boot)); b.position.y = -0.36; b.castShadow = true; knee.add(b);
      return { hip, knee };
    };
    this.legL = leg(-1); this.legR = leg(1);
    // lantern in the right hand
    const lantern = new THREE.Group();
    lantern.position.y = -0.34;
    this.armR.fore.add(lantern);
    this.lantern = lantern;
    const brass = toon(0xc9963a, { emissive: 0x2a1a04 });
    const lp = [
      [new THREE.CylinderGeometry(0.1, 0.12, 0.04, 8), -0.06], [new THREE.CylinderGeometry(0.11, 0.1, 0.04, 8), -0.34], [new THREE.ConeGeometry(0.1, 0.08, 8), -0.04 + 0.04],
    ];
    for (const [g, y] of lp) { const m = new THREE.Mesh(g, brass); m.position.y = y; lantern.add(m); }
    for (let k = 0; k < 4; k++) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.28, 0.018), brass); const a = k * Math.PI / 2 + Math.PI / 4; m.position.set(Math.cos(a) * 0.09, -0.2, Math.sin(a) * 0.09); lantern.add(m); }
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 4, 10, Math.PI), brass); handle.position.y = 0.0; lantern.add(handle);
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.26, 8, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.1, 0.5), transparent: true, opacity: 0.45, depthWrite: false }));
    glass.position.y = -0.2; lantern.add(glass);
    this.glassMat = glass.material;
    this.flame = createFire({ scale: 0.1, intensity: 3.5, embers: 6, rise: 2.5 });
    this.flame.group.position.y = -0.31;
    this.flame.setLevel(1);
    lantern.add(this.flame.group);
    this.lanternGlow = createGlow(0xffb060, 0.5, 0.003);
    this.lanternGlow.position.y = -0.2;
    lantern.add(this.lanternGlow);
    root.traverse((o) => { if (o.isMesh && o.material && !o.material.transparent && !o.material.isShaderMaterial) o.castShadow = true; });
  }

  place(x, z, yaw) {
    this.x = x; this.z = z;
    const g = groundAt(x, z, 999);
    this.y = g.h; this.visY = g.h;
    this.facing = yaw;
    this.cam.yaw = this.cam.sy = yaw + Math.PI;
    this.cam.px = x; this.cam.py = this.y + 1.5; this.cam.pz = z;
  }

  raiseLantern(cb) {
    if (this.raiseT >= 0) return false;
    this.raiseT = 0; this.raiseCb = cb;
    this.audio.whoosh();
    return true;
  }
  reach() { if (this.raiseT < 0) this.reachT = 0; }
  faceTo(x, z) { this.faceT = Math.atan2(x - this.x, z - this.z); this.faceTimer = 1.2; }

  tryMove(nx, nz) {
    const g = groundAt(nx, nz, this.y);
    const dy = g.h - this.y;
    if (dy > 0.45) return false;
    if (dy < -0.6) return false;
    if (g.terrain && dy > 0.002 && slopeAt(nx, nz) > 0.95) return false;
    if (g.h < this.water - 0.32) return false;
    return g;
  }

  update(dt, input, locked) {
    this.time += dt;
    const c = this.cam;
    // look
    c.yaw -= input.lookX; c.pitch = clamp(c.pitch + input.lookY, -0.42, 1.15);
    c.sy = dampAngle(c.sy, c.yaw, 22, dt); c.sp = damp(c.sp, c.pitch, 22, dt);
    // move relative to camera
    let mx = input.moveX, my = input.moveY;
    const ml = Math.hypot(mx, my);
    if (ml > 1) { mx /= ml; my /= ml; }
    if (this.raiseT >= 0 || locked) { mx = 0; my = 0; }
    const fx = -Math.sin(c.sy), fz = -Math.cos(c.sy);
    const rx = -fz, rz = fx;
    const tvx = (fx * my + rx * mx) * SPEED, tvz = (fz * my + rz * mx) * SPEED;
    this.vx = damp(this.vx, tvx, 10, dt); this.vz = damp(this.vz, tvz, 10, dt);
    const sp = Math.hypot(this.vx, this.vz);
    if (sp > 0.05) {
      const ox = this.x, oz = this.z;
      let nx = ox + this.vx * dt, nz = oz + this.vz * dt;
      let g = this.tryMove(nx, nz);
      if (!g) { g = this.tryMove(nx, oz); if (g) nz = oz; else { g = this.tryMove(ox, nz); if (g) nx = ox; } }
      if (g) {
        const p = { x: nx, z: nz };
        pushOut(p, 0.35, this.y);
        const g2 = (p.x !== nx || p.z !== nz) ? this.tryMove(p.x, p.z) : g;
        if (g2) { this.x = p.x; this.z = p.z; this.y = g2.h; this.surf = g2.surf; }
      }
      const moved = Math.hypot(this.x - ox, this.z - oz) / Math.max(dt, 1e-4);
      if (moved < sp * 0.3) { this.vx *= 0.5; this.vz *= 0.5; }
      if (sp > 0.6) { this.facing = dampAngle(this.facing, Math.atan2(this.vx, this.vz), 12, dt); this.faceTimer = 0; }
    } else {
      // keep glued to the ground (tide / platforms)
      const g = groundAt(this.x, this.z, this.y);
      if (Math.abs(g.h - this.y) < 0.6) { this.y = g.h; this.surf = g.surf; }
    }
    if (this.faceTimer > 0) { this.faceTimer -= dt; this.facing = dampAngle(this.facing, this.faceT, 10, dt); }
    this.visY = damp(this.visY, this.y, 16, dt);
    this.animate(dt, sp);
    this.updateCamera(dt);
  }

  animate(dt, sp) {
    const amt = clamp(sp / SPEED, 0, 1);
    this.moveAmt = damp(this.moveAmt, amt, 10, dt);
    const a = this.moveAmt;
    const prev = Math.sin(this.phase);
    this.phase += dt * (3.2 + sp * 1.05);
    const s = Math.sin(this.phase);
    if (a > 0.25 && Math.sign(s) !== Math.sign(prev)) this.audio.footstep(this.surf, 0.4 + a * 0.6);
    const t = this.time;
    this.root.position.set(this.x, this.visY, this.z);
    this.root.rotation.y = this.facing;
    // legs
    this.legL.hip.rotation.x = s * 0.65 * a;
    this.legR.hip.rotation.x = -s * 0.65 * a;
    this.legL.knee.rotation.x = Math.max(0, -Math.cos(this.phase)) * 0.9 * a;
    this.legR.knee.rotation.x = Math.max(0, Math.cos(this.phase)) * 0.9 * a;
    // body
    const breathe = Math.sin(t * 2.1) * (1 - a);
    this.hips.position.y = 0.86 + Math.abs(Math.cos(this.phase)) * 0.06 * a - 0.03 * a + breathe * 0.008;
    this.torso.rotation.x = 0.1 * a;
    this.torso.rotation.y = s * 0.12 * a;
    this.torso.scale.set(1 + breathe * 0.012, 1 + breathe * 0.01, 1 + breathe * 0.012);
    // idle look-around
    const look = (1 - a) * (Math.sin(t * 0.37) * 0.45 + Math.sin(t * 0.13) * 0.3);
    this.head.rotation.y = damp(this.head.rotation.y, look, 3, dt);
    this.scarfTail.rotation.x = 0.2 + a * 0.6 + Math.sin(t * 3 + this.phase) * 0.15;
    // arms
    this.armL.sh.rotation.x = -s * 0.55 * a + Math.sin(t * 1.3) * 0.03 * (1 - a);
    this.armL.sh.rotation.z = -0.12;
    this.armL.fore.rotation.x = -0.25 - 0.25 * a;
    let rArm = s * 0.25 * a - 0.15, rFore = -0.35, headUp = 0;
    // left-arm reach for pressing things
    if (this.reachT >= 0) {
      this.reachT += dt;
      const k = Math.sin(clamp(this.reachT / 0.45, 0, 1) * Math.PI);
      this.armL.sh.rotation.x = lerp(this.armL.sh.rotation.x, -1.4, k);
      this.armL.fore.rotation.x = lerp(this.armL.fore.rotation.x, -0.2, k);
      if (this.reachT > 0.45) this.reachT = -1;
    }
    if (this.raiseT >= 0) {
      this.raiseT += dt;
      const T = this.raiseT;
      const k = T < 0.5 ? smoothstep(0, 0.5, T) : T < 1.25 ? 1 : 1 - smoothstep(1.25, 1.75, T);
      rArm = lerp(rArm, -2.75, k); rFore = lerp(rFore, -0.15, k); headUp = -0.35 * k;
      if (T > 0.55 && this.raiseCb) { const cb = this.raiseCb; this.raiseCb = null; cb(); }
      if (T > 1.75) this.raiseT = -1;
      this.flame.setIntensity(3.5 + k * 3);
    } else this.flame.setIntensity(3.5);
    this.armR.sh.rotation.x = rArm;
    this.armR.sh.rotation.z = 0.12;
    this.armR.fore.rotation.x = rFore;
    this.head.rotation.x = headUp;
    // keep the lantern hanging, with a little swing
    this.lantern.rotation.x = -(rArm + rFore) - this.torso.rotation.x + Math.sin(this.phase * 2) * 0.12 * a + Math.sin(t * 1.7) * 0.04;
    this.lantern.rotation.z = -0.12 + Math.sin(t * 1.1) * 0.05;
  }

  updateCamera(dt) {
    const c = this.cam;
    c.px = damp(c.px, this.x, 12, dt); c.pz = damp(c.pz, this.z, 12, dt); c.py = damp(c.py, this.visY + 1.5, 9, dt);
    const cp = Math.cos(c.sp);
    const dx = Math.sin(c.sy) * cp, dy = Math.sin(c.sp), dz = Math.cos(c.sy) * cp;
    const want = c.dist * (1 + Math.max(0, c.sp - 0.6) * 0.3);
    const allowed = cameraCast(c.px, c.py, c.pz, dx, dy, dz, want);
    if (allowed < c.curDist) c.curDist = damp(c.curDist, allowed, 30, dt); else c.curDist = damp(c.curDist, allowed, 2.5, dt);
    c.curDist = Math.min(c.curDist, allowed + 0.15);
    let x = c.px + dx * c.curDist, y = c.py + dy * c.curDist, z = c.pz + dz * c.curDist;
    y = Math.max(y, heightAt(x, z) + 0.4, this.water + 0.3);
    c.x = x; c.y = y; c.z = z;
  }

  applyCamera(camera) {
    const c = this.cam;
    camera.position.set(c.x, c.y, c.z);
    camera.lookAt(c.px, c.py + 0.1, c.pz);
  }
}
