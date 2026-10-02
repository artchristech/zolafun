// Fishing village of stilt houses. Puzzle: light the seven lantern posts in the order the moored boats show
// (shore to sea, by the emblem on each sail). A small three-post version with a toy jetty teaches the rule.
import * as THREE from './three.module.min.js';
import { GeoBuilder, mat, makeStaticMesh, emblemGeometry, EMBLEM_COLORS, mulberry32 } from './util.js';
import { ISL, SPOT } from './layout.js';
import { groundAt } from './terrain.js';
import { addCircle, addBox, addPlatform } from './colliders.js';
import { exclude } from './foliage.js';
import { addBrazier } from './fire.js';

const V = ISL.V;
const LW = (lx, lz) => [V.x + lx, V.z + lz];

const POST_ANG = [20, 62, 118, 160, 205, 250, 330];
const POST_SYM = [4, 1, 6, 0, 3, 5, 2];
const SOL = [3, 0, 5, 1, 6, 2, 4]; // boats from shore outwards
const TUT_SYM = [5, 2, 0];
const TUT_SOL = [2, 0, 5];
const LOCK = 6; // seconds lost on a wrong step
const TUT_LOCK = 3;

const COL_OFF = new THREE.Color(0.16, 0.15, 0.14);
const COL_ON = new THREE.Color(3.2, 1.9, 0.6);
const COL_WET = new THREE.Color(0.03, 0.06, 0.16);
const COL_DONE = new THREE.Color(4.2, 2.6, 0.9);

export class Village {
  constructor(ctx) {
    this.ctx = ctx;
    this.center = new THREE.Vector3(SPOT.villageSquare[0], 2.85, SPOT.villageSquare[1]);
    this.areas = [{ x: this.center.x, z: this.center.z, r: 13 }, { x: V.x - 21, z: V.z + 11, r: 6 }];
    this.prog = 0; this.solved = false; this.lock = 0;
    this.tProg = 0; this.tSolved = false; this.tLock = 0;
    this.flash = 0;
    const b = new GeoBuilder({ seed: 11 });
    const rng = mulberry32(5);
    this.build(b, rng);
    this.static = makeStaticMesh(b);
    ctx.scene.add(this.static);
  }

  build(b, rng) {
    const ctx = this.ctx;
    // ---- square: low curb ring and a well
    const [cx, cz] = SPOT.villageSquare;
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      if (Math.abs(Math.sin(a) - 1) < 0.08 || Math.abs(Math.sin(a) + 1) < 0.08) continue; // openings N/S
      const x = cx + Math.cos(a) * 11.2, z = cz + Math.sin(a) * 11.2;
      b.box(1.6, 0.35, 0.6, mat(x, groundAt(x, z) + 0.1, z, 0, -a + Math.PI / 2, 0), '#a49a88', { jitter: 0.12 });
    }
    b.cyl(1.1, 1.2, 0.8, 10, mat(cx, 3.2, cz), '#9f978a', { flat: true });
    b.cyl(0.85, 0.85, 0.82, 10, mat(cx, 3.25, cz), '#2f4a5c', {});
    b.box(0.12, 1.6, 0.12, mat(cx - 1, 3.9, cz), '#6b4a32'); b.box(0.12, 1.6, 0.12, mat(cx + 1, 3.9, cz), '#6b4a32');
    b.box(2.3, 0.14, 0.14, mat(cx, 4.7, cz), '#6b4a32');
    addCircle(cx, cz, 1.3, 0, 5);
    exclude(cx, cz, 13);

    // ---- lantern posts (real puzzle)
    this.posts = [];
    const lanterns = [];
    POST_ANG.forEach((deg, i) => {
      const a = (deg * Math.PI) / 180;
      const x = cx + Math.cos(a) * 8.2, z = cz + Math.sin(a) * 8.2;
      const y = groundAt(x, z);
      this.addPost(b, x, y, z, a, POST_SYM[i], 1);
      const lp = new THREE.Vector3(x + Math.cos(a) * -0.75, y + 2.05, z + Math.sin(a) * -0.75);
      lanterns.push(lp);
      this.posts.push({ sym: POST_SYM[i], lit: false, lantern: lanterns.length - 1, pos: lp });
    });
    // ---- tutorial: three short posts and a toy jetty
    const [tx, tz] = LW(-21, 11);
    this.tPosts = [];
    TUT_SYM.forEach((sym, i) => {
      const a = (i / 3) * Math.PI * 2 + 0.6;
      const x = tx + Math.cos(a) * 2.3, z = tz + Math.sin(a) * 2.3;
      const y = groundAt(x, z);
      this.addPost(b, x, y, z, a, sym, 0.62);
      const lp = new THREE.Vector3(x + Math.cos(a) * -0.47, y + 1.27, z + Math.sin(a) * -0.47);
      lanterns.push(lp);
      this.tPosts.push({ sym, lit: false, lantern: lanterns.length - 1, pos: lp });
    });
    exclude(tx, tz, 5);
    // lantern glass, instanced
    const lg = new THREE.BoxGeometry(0.26, 0.34, 0.26);
    this.lanternMesh = new THREE.InstancedMesh(lg, new THREE.MeshBasicMaterial({ color: 0xffffff }), lanterns.length);
    const m4 = new THREE.Matrix4();
    lanterns.forEach((p, i) => {
      const s = i >= 7 ? 0.7 : 1;
      m4.makeScale(s, s, s).setPosition(p);
      this.lanternMesh.setMatrixAt(i, m4);
      this.lanternMesh.setColorAt(i, COL_OFF);
      // lantern cage
      b.box(0.32 * s, 0.05, 0.32 * s, mat(p.x, p.y + 0.19 * s, p.z), '#2b2622');
      b.box(0.32 * s, 0.05, 0.32 * s, mat(p.x, p.y - 0.19 * s, p.z), '#2b2622');
    });
    this.lanternCol = lanterns.map(() => COL_OFF.clone());
    this.ctx.scene.add(this.lanternMesh);

    // ---- toy jetty for the tutorial (shore -> sea, westwards)
    const jz = V.z + 13.2;
    const jx0 = V.x - 25, jx1 = V.x - 41;
    const jh = Math.max(2.3, groundAt(jx0, jz) + 0.2);
    this.addDeck(b, (jx0 + jx1) / 2, jz, Math.abs(jx1 - jx0) / 2, 0.9, 0, jh);
    addPlatform((jx0 + jx1) / 2, jz, Math.abs(jx1 - jx0) / 2, 0.9, 0, jh, jh, 'wood');
    // ---- the pier (east), with a ramp up from the village
    const pz = V.z - 3;
    const r0 = V.x + 16, r1 = V.x + 24, p1 = V.x + 64;
    const g0 = groundAt(r0, pz);
    const ph = 2.75;
    addPlatform((r0 + r1) / 2, pz, (r1 - r0) / 2, 1.5, 0, g0 + 0.05, ph, 'wood');
    addPlatform((r1 + p1) / 2, pz, (p1 - r1) / 2, 1.5, 0, ph, ph, 'wood');
    this.addRamp(b, r0, r1, pz, g0 + 0.05, ph);
    this.addDeck(b, (r1 + p1) / 2, pz, (p1 - r1) / 2, 1.5, 0, ph);
    exclude((r0 + p1) / 2, pz, 3);
    exclude(r0 + 4, pz, 4);
    // bollards
    for (let x = r1 + 3; x < p1; x += 5.5) b.cyl(0.14, 0.17, 0.5, 6, mat(x, ph + 0.25, pz + 1.3), '#4a3a2c');
    // pier-end lamp post
    b.box(0.16, 2.2, 0.16, mat(p1 - 0.5, ph + 1.1, pz - 1.2), '#4a3a2c');

    // ---- moored boats: pier boats (7) and toy boats (3) float with the tide in one mesh
    const boats = new GeoBuilder({ seed: 3 });
    SOL.forEach((sym, i) => this.addBoat(boats, r1 + 3.2 + i * 5.5, pz + 3.3, 1, sym, rng));
    TUT_SOL.forEach((sym, i) => this.addBoat(boats, jx0 - 3.5 - i * 4.2, jz - 1.9, 0.5, sym, rng));
    this.boatMesh = makeStaticMesh(boats);
    this.boatMesh.matrixAutoUpdate = true;
    this.ctx.scene.add(this.boatMesh);

    // ---- stilt houses
    const houses = [[30, 11, '#e7dcc4', '#c44a3a'], [32, -14, '#9ccfd0', '#3d5f8a'], [21, -27, '#f0d27a', '#7a4a2e'], [25, 24, '#e8b8a0', '#3f6b4a'], [-9, 31, '#d9e2e6', '#b2533a']];
    this.windows = new GeoBuilder({ seed: 2 });
    for (const [lx, lz, wall, roof] of houses) this.addHouse(b, V.x + lx, V.z + lz, wall, roof);
    this.windowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
    this.windowMesh = new THREE.Mesh(this.windows.build(), this.windowMat);
    this.windowMesh.matrixAutoUpdate = false;
    this.ctx.scene.add(this.windowMesh);

    // ---- props: drying racks, barrels, crates, beached rowboats, nets
    const props = [[-8, -12], [12, 8], [-12, 6], [10, -9], [14, 16]];
    for (const [lx, lz] of props) {
      const x = V.x + lx, z = V.z + lz, y = groundAt(x, z);
      const k = rng();
      if (k < 0.35) { // drying rack with fish
        b.box(0.12, 1.8, 0.12, mat(x - 1.3, y + 0.9, z), '#6b4a32'); b.box(0.12, 1.8, 0.12, mat(x + 1.3, y + 0.9, z), '#6b4a32');
        b.box(2.8, 0.08, 0.08, mat(x, y + 1.75, z), '#6b4a32');
        for (let f = 0; f < 6; f++) b.box(0.12, 0.42, 0.05, mat(x - 1.1 + f * 0.44, y + 1.45, z), '#b9c4c8');
        addBox(x, z, 1.4, 0.2, 0, y - 1, y + 1.9, { cam: false });
      } else if (k < 0.7) {
        for (let n = 0; n < 3; n++) b.cyl(0.32, 0.32, 0.8, 8, mat(x + n * 0.7 - 0.7, y + 0.4, z + (n % 2) * 0.5), '#8a5a34', { flat: true });
        addCircle(x, z, 1.2, y - 1, y + 0.9, { cam: false });
      } else {
        b.box(0.9, 0.7, 0.9, mat(x, y + 0.35, z, 0, 0.3, 0), '#a77b4c'); b.box(0.7, 0.55, 0.7, mat(x + 0.2, y + 0.98, z, 0, 0.9, 0), '#b88a58');
        addCircle(x, z, 0.8, y - 1, y + 1.3, { cam: false });
      }
      exclude(x, z, 2.2);
    }
    for (const [lx, lz, a] of [[-14, -32, 0.4], [6, 37, 2.0], [-30, -6, 1.2]]) {
      const x = V.x + lx, z = V.z + lz, y = groundAt(x, z);
      const m = mat(x, y + 0.25, z, 0.15, a, 0.1);
      b.box(3.2, 0.5, 1.1, m, '#7d5636');
      b.box(2.6, 0.06, 0.8, mat(x, y + 0.5, z, 0.15, a, 0.1), '#5a3d26');
      exclude(x, z, 2.5);
    }

    // ---- beacon on the knoll
    const [bx, bz] = SPOT.beaconV;
    const by = groundAt(bx, bz);
    this.fireY = addBrazier(b, bx, by, bz, true);
    this.beaconPos = new THREE.Vector3(bx, this.fireY, bz);
    addCircle(bx, bz, 1.1, by - 1, by + 4);
    exclude(bx, bz, 6);
  }

  addPost(b, x, y, z, a, sym, s) {
    b.cyl(0.11 * s, 0.14 * s, 2.7 * s, 6, mat(x, y + 1.35 * s, z), '#6e4f35');
    b.box(0.9 * s, 0.1 * s, 0.1 * s, mat(x - Math.cos(a) * 0.4 * s, y + 2.55 * s, z - Math.sin(a) * 0.4 * s, 0, -a, 0), '#5a3f2a');
    b.box(0.03, 0.3 * s, 0.03, mat(x - Math.cos(a) * 0.75 * s, y + 2.37 * s, z - Math.sin(a) * 0.75 * s), '#2b2622');
    b.cyl(0.32 * s, 0.4 * s, 0.25 * s, 8, mat(x, y + 0.12 * s, z), '#8f877a', { flat: true });
    const g = emblemGeometry(sym);
    b.add(g, mat(x, y + 3.05 * s, z, 0, -a, 0, 0.75 * s), EMBLEM_COLORS[sym], { flat: true });
    g.dispose();
    addCircle(x, z, 0.3 * s + 0.1, y - 1, y + 3 * s, { cam: false });
  }

  addDeck(b, x, z, hx, hz, ang, h) {
    const n = Math.round(hx * 2 / 0.6);
    for (let i = 0; i < n; i++) {
      const px = x - hx + (i + 0.5) * (hx * 2 / n);
      b.box(0.55, 0.12, hz * 2, mat(px, h - 0.06, z), i % 3 ? '#a07a52' : '#8f6a45', { jitter: 0.1 });
    }
    for (let px = x - hx + 0.6; px <= x + hx; px += 3.2) {
      for (const sz of [-1, 1]) {
        const pz = z + sz * (hz - 0.15);
        const g = groundAt(px, pz);
        b.cyl(0.15, 0.17, h - g + 3, 6, mat(px, (h + g - 3) / 2, pz), '#5d4630');
      }
    }
    b.box(hx * 2, 0.1, 0.1, mat(x, h - 0.2, z - hz), '#6e5038');
    b.box(hx * 2, 0.1, 0.1, mat(x, h - 0.2, z + hz), '#6e5038');
  }

  addRamp(b, x0, x1, z, h0, h1) {
    const n = 12;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const x = x0 + (x1 - x0) * t;
      b.box((x1 - x0) / n + 0.02, 0.12, 3, mat(x, h0 + (h1 - h0) * t - 0.06, z, 0, 0, Math.atan2(h1 - h0, x1 - x0)), '#9a7550', { jitter: 0.08 });
    }
  }

  addBoat(b, x, z, s, sym, rng) {
    // hull along x, floating at y=0 (mesh is lifted to the water level)
    const hull = rng() < 0.5 ? '#c8553d' : '#3d6f9a';
    b.box(3.4 * s, 0.7 * s, 1.4 * s, mat(x, 0.1 * s, z), hull);
    b.box(3.5 * s, 0.12 * s, 1.5 * s, mat(x, 0.48 * s, z), '#e8dcc0');
    b.cyl(0.0, 0.72 * s, 1.1 * s, 4, mat(x + 2.2 * s, 0.15 * s, z, 0, 0, -Math.PI / 2, 1, 1, 0.7), hull, { flat: true });
    b.box(2.8 * s, 0.06 * s, 1.1 * s, mat(x - 0.1 * s, 0.4 * s, z), '#7a5a3a');
    b.cyl(0.05 * s, 0.07 * s, 3.4 * s, 5, mat(x + 0.3 * s, 2.1 * s, z), '#5a4030');
    // sail faces the pier (normal along z), emblem on both faces
    b.box(1.9 * s, 2.3 * s, 0.05, mat(x - 0.45 * s, 2.25 * s, z), '#f3ead6');
    const g = emblemGeometry(sym);
    b.add(g, mat(x - 0.45 * s, 2.3 * s, z, 0, 0, 0, 1.25 * s, 1.25 * s, 0.35), EMBLEM_COLORS[sym], { flat: true });
    g.dispose();
  }

  addHouse(b, x, z, wall, roof) {
    const ctx = this.ctx;
    const a = Math.atan2(z - V.z, x - V.x); // local +x points out to sea
    const c = Math.cos(a), s = Math.sin(a);
    const land = [x - c * 3.6, z - s * 3.6];
    const h = Math.max(2.3, groundAt(land[0], land[1]) + 0.3);
    const R = (lx, lz) => [x + lx * c - lz * s, z + lx * s + lz * c];
    // deck & stilts
    addPlatform(x, z, 3.4, 3.4, a, h, h, 'wood');
    for (let i = 0; i < 9; i++) {
      const [px, pz] = R(-3.1 + i * 0.775, 0);
      b.box(0.7, 0.12, 6.8, mat(px, h - 0.06, pz, 0, -a, 0), i % 2 ? '#a07a52' : '#8f6a45', { jitter: 0.1 });
    }
    for (const lx of [-3, 0, 3]) for (const lz of [-3, 3]) {
      const [px, pz] = R(lx, lz);
      const g = groundAt(px, pz);
      b.cyl(0.16, 0.2, h - g + 3, 6, mat(px, (h + g - 3) / 2, pz), '#5d4630');
    }
    // house body (sits toward the sea side of the deck)
    const [hx, hz] = R(1.0, 0);
    b.box(3.4, 2.7, 3.8, mat(hx, h + 1.35, hz, 0, -a, 0), wall, { jitter: 0.04 });
    b.box(3.6, 0.2, 4.0, mat(hx, h + 0.1, hz, 0, -a, 0), '#6e5038');
    // gable roof: triangular prism along local z
    const rg = new THREE.CylinderGeometry(2.6, 2.6, 4.6, 3, 1);
    rg.rotateX(Math.PI / 2);
    b.add(rg, mat(hx, h + 3.35, hz, 0, -a, 0, 1, 0.62, 1), roof, { flat: true });
    rg.dispose();
    // door facing the village, windows on the sides
    const [dx, dz] = R(-0.72, 0);
    b.box(0.08, 1.7, 0.9, mat(dx, h + 0.85, dz, 0, -a, 0), '#4a2f22');
    for (const lz of [-1.95, 1.95]) {
      const [wx, wz] = R(1.0, lz);
      this.windows.box(0.8, 0.7, 0.06, mat(wx, h + 1.6, wz, 0, -a, 0), '#ffffff');
    }
    // a net hanging off the deck rail and a lamp hook
    const [nx, nz] = R(-1.8, 3.3);
    b.box(1.6, 1.0, 0.04, mat(nx, h + 0.4, nz, 0, -a, 0), '#5a6b5e');
    addBox(hx, hz, 1.75, 1.95, a, h - 0.5, h + 4.5);
    exclude(x, z, 5);
  }

  interactables() {
    const out = [];
    this.posts.forEach((p, i) => out.push({
      pos: p.pos, r: 2.1, lights: true,
      can: () => !this.solved && this.lock <= 0 && !p.lit,
      use: () => this.press(i, false),
    }));
    this.tPosts.forEach((p, i) => out.push({
      pos: p.pos, r: 1.5, lights: true,
      can: () => !this.tSolved && this.tLock <= 0 && !p.lit,
      use: () => this.press(i, true),
    }));
    return out;
  }

  press(i, tut) {
    const A = this.ctx.audio;
    const posts = tut ? this.tPosts : this.posts;
    const sol = tut ? TUT_SOL : SOL;
    const p = posts[i];
    const prog = tut ? this.tProg : this.prog;
    if (p.sym === sol[prog]) {
      p.lit = true;
      A.chime(392 * Math.pow(2, (prog * 2) / 12), p.pos, 0.28);
      if (tut) this.tProg++; else this.prog++;
      if ((tut ? this.tProg : this.prog) === sol.length) {
        if (tut) { this.tSolved = true; A.chime(784, p.pos, 0.3); }
        else { this.solved = true; this.flash = 1.5; this.ctx.onSolved(this.posts.map((q) => q.pos)); }
      }
    } else {
      for (const q of posts) q.lit = false;
      if (tut) { this.tProg = 0; this.tLock = TUT_LOCK; } else { this.prog = 0; this.lock = LOCK; }
      A.hiss(p.pos);
      A.thunk(p.pos);
    }
    this.ctx.save();
  }

  update(dt, time, night, water) {
    this.lock = Math.max(0, this.lock - dt);
    this.tLock = Math.max(0, this.tLock - dt);
    this.flash = Math.max(0, this.flash - dt);
    const setC = (list, lock, total, solved) => {
      for (const p of list) {
        let target;
        if (lock > 0) target = COL_WET.clone().lerp(COL_OFF, 1 - lock / total);
        else if (p.lit) target = solved ? COL_DONE : COL_ON;
        else target = COL_OFF;
        const c = this.lanternCol[p.lantern];
        if (lock > 0 && lock > total - 0.05) c.copy(target);
        c.lerp(target, Math.min(1, dt * 6));
        const fl = p.lit ? 0.9 + 0.1 * Math.sin(time * 12 + p.lantern) : 1;
        this.lanternMesh.setColorAt(p.lantern, c.clone().multiplyScalar(fl * (p.lit ? 1 + night * 0.6 : 1)));
      }
    };
    setC(this.posts, this.lock, LOCK, this.solved);
    setC(this.tPosts, this.tLock, TUT_LOCK, this.tSolved);
    this.lanternMesh.instanceColor.needsUpdate = true;
    // boats float with the tide
    this.boatMesh.position.y = water + 0.05 + Math.sin(time * 1.3) * 0.04;
    this.boatMesh.rotation.z = Math.sin(time * 0.9) * 0.004;
    // windows glow as night falls
    const w = 0.25 + night * 2.6;
    this.windowMat.color.setRGB(w * 1.0, w * 0.72, w * 0.36);
  }

  getState() { return { prog: this.prog, solved: this.solved, lit: this.posts.map((p) => p.lit), tProg: this.tProg, tSolved: this.tSolved, tLit: this.tPosts.map((p) => p.lit) }; }
  setState(s) {
    if (!s) return;
    this.prog = s.prog || 0; this.solved = !!s.solved; this.tProg = s.tProg || 0; this.tSolved = !!s.tSolved;
    (s.lit || []).forEach((v, i) => { if (this.posts[i]) this.posts[i].lit = v; });
    (s.tLit || []).forEach((v, i) => { if (this.tPosts[i]) this.tPosts[i].lit = v; });
  }
}
