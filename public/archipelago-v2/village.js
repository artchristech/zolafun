// Fishing village of stilt houses. Puzzle: five bells of different sizes hang on the houses;
// a carved board shows a row of fish of different sizes. Ring the bells in the order of the fish.
// Big fish = big bell = low note. Touching the board plays the tune (and clears progress).
import * as THREE from './three.module.min.js';
import { toon, addOutline } from './util.js';
import { terrainH, addPlatform, addBox, addCircle, addKeepOut, addPath, ISLANDS } from './world.js';

const I = ISLANDS.village;
const pol = (r, deg) => {
  const a = (deg * Math.PI) / 180;
  return { x: I.x + Math.cos(a) * r, z: I.z + Math.sin(a) * r, a };
};
const DECK = 1.7;
export const SEQ = [2, 0, 3, 0, 4]; // size indices of the fish on the board, left to right
const HOUSE_SIZE = [2, 0, 4, 1, 3]; // size of the bell on each house
const HOUSE_ANG = [-48, -24, 0, 24, 48];
const PITCH = [880, 740, 587.3, 493.9, 392]; // small bell = high note
const ROOF = [0xc4452f, 0x2f6fa8, 0x3f8f6e, 0xd49a2a, 0x9a4a8a];
const WALL = [0xe8dcc4, 0xd8e2e6, 0xf0e2c8, 0xe2d2c2, 0xdce6d8];

function fishShape(len) {
  const s = new THREE.Shape();
  const h = len * 0.32;
  s.moveTo(-len * 0.5, 0);
  s.quadraticCurveTo(-len * 0.15, h, len * 0.22, h * 0.25);
  s.lineTo(len * 0.5, h * 0.6);
  s.lineTo(len * 0.42, 0);
  s.lineTo(len * 0.5, -h * 0.6);
  s.lineTo(len * 0.22, -h * 0.25);
  s.quadraticCurveTo(-len * 0.15, -h, -len * 0.5, 0);
  return s;
}

function bellGeo() {
  const pts = [[0.02, 0.72], [0.16, 0.7], [0.26, 0.6], [0.3, 0.42], [0.33, 0.22], [0.42, 0.07], [0.5, 0.0], [0.46, -0.02]];
  return new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y - 0.72)), 16);
}

export class Village {
  constructor(ctx) {
    this.ctx = ctx;
    const scene = ctx.scene;
    this.solved = false;
    this.heard = false;
    this.progress = [];
    this.evalT = -1;
    this.playT = -1;
    this.playIdx = 0;
    const wood = toon(0x8a6243), woodDark = toon(0x5e4130), plank = toon(0xa27a52);

    // --- boardwalk arc ---
    const R = 33;
    for (let a = -54; a < 50; a += 6) {
      const mid = a + 3;
      const p = pol(R, mid);
      const rot = p.a + Math.PI / 2;
      addPlatform({ x: p.x, z: p.z, hx: 1.95, hz: 1.3, rot, y0: DECK, surface: 'wood' });
      const m = new THREE.Mesh(new THREE.BoxGeometry(3.9, 0.16, 2.6), plank);
      m.position.set(p.x, DECK - 0.08, p.z);
      m.rotation.y = -rot;
      m.castShadow = m.receiveShadow = true;
      scene.add(m);
      // plank seams
      for (let k = -1; k <= 1; k++) {
        const seam = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, 2.62), woodDark);
        seam.position.set(p.x + Math.cos(rot) * k * 1.2, DECK + 0.005, p.z + Math.sin(rot) * k * 1.2);
        seam.rotation.y = -rot;
        scene.add(seam);
      }
      for (const rr of [R - 1.2, R + 1.2]) {
        const q = pol(rr, a);
        this.stilt(q.x, q.z, DECK - 0.1);
      }
      // rope rail posts on the sea side
      const q = pol(R + 1.25, a);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 1.1, 5), woodDark);
      post.position.set(q.x, DECK + 0.5, q.z);
      scene.add(post);
    }
    // ramp from the square to the boardwalk
    {
      const a0 = -12;
      const r0 = 23.5, r1 = 32.2;
      const p0 = pol(r0, a0), pm = pol((r0 + r1) / 2, a0);
      const y0 = terrainH(p0.x, p0.z) + 0.03;
      const hx = (r1 - r0) / 2;
      addPlatform({ x: pm.x, z: pm.z, hx, hz: 1.2, rot: p0.a, y0, y1: DECK, surface: 'wood' });
      const len = 2 * hx;
      const slope = Math.atan2(DECK - y0, len);
      const m = new THREE.Mesh(new THREE.BoxGeometry(len / Math.cos(slope), 0.16, 2.4), plank);
      m.position.set(pm.x, (y0 + DECK) / 2 - 0.08, pm.z);
      m.rotation.order = 'YXZ';
      m.rotation.y = -p0.a;
      m.rotation.z = slope;
      m.castShadow = m.receiveShadow = true;
      scene.add(m);
      for (const rr of [r0 + 2, r0 + 5, r0 + 8]) {
        const q = pol(rr, a0);
        this.stilt(q.x, q.z, (y0 + (DECK - y0) * ((rr - r0) / len)) - 0.1);
      }
      addPath([[-116, 40], [-108, 39.5], [p0.x - 1.5, p0.z + 0.3]]);
    }

    // --- houses with bells ---
    this.bells = [];
    HOUSE_ANG.forEach((deg, i) => {
      const spur = pol(36.4, deg);
      addPlatform({ x: spur.x, z: spur.z, hx: 2.3, hz: 1.0, rot: spur.a, y0: DECK, surface: 'wood' });
      const sm = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.16, 2.0), plank);
      sm.position.set(spur.x, DECK - 0.08, spur.z);
      sm.rotation.y = -spur.a;
      sm.castShadow = sm.receiveShadow = true;
      scene.add(sm);
      const hc = pol(41.2, deg);
      addPlatform({ x: hc.x, z: hc.z, hx: 2.8, hz: 2.6, rot: hc.a, y0: DECK, surface: 'wood' });
      const floor = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.2, 5.2), plank);
      floor.position.set(hc.x, DECK - 0.1, hc.z);
      floor.rotation.y = -hc.a;
      floor.receiveShadow = floor.castShadow = true;
      scene.add(floor);
      const house = new THREE.Group();
      const bc = pol(41.9, deg);
      house.position.set(bc.x, DECK, bc.z);
      house.rotation.y = -bc.a;
      scene.add(house);
      const body = new THREE.Mesh(new THREE.BoxGeometry(4.2, 3.0, 4.4), toon(WALL[i]));
      body.position.y = 1.5;
      body.castShadow = body.receiveShadow = true;
      addOutline(body, 0.04);
      house.add(body);
      const roofGeo = new THREE.CylinderGeometry(3.0, 3.0, 5.2, 3, 1);
      roofGeo.rotateX(-Math.PI / 2);
      const roof = new THREE.Mesh(roofGeo, toon(ROOF[i]));
      roof.scale.set(0.85, 0.62, 1);
      roof.position.y = 3.0 + 0.93;
      roof.castShadow = true;
      addOutline(roof, 0.05);
      house.add(roof);
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.0, 1.1), woodDark);
      door.position.set(-2.12, 1.0, -0.6);
      house.add(door);
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.8, 0.9), toon(0x28323c));
      win.position.set(-2.12, 1.8, 1.1);
      house.add(win);
      this.houseWindows = this.houseWindows || [];
      this.houseWindows.push(win);
      const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.4, 0.6), toon(0x8c7a6a));
      chimney.position.set(0.8, 4.4, 1.2);
      house.add(chimney);
      for (const [sx, sz] of [[-2.6, -2.4], [-2.6, 2.4], [2.6, -2.4], [2.6, 2.4]]) {
        const w = new THREE.Vector3(sx, 0, sz).applyAxisAngle(new THREE.Vector3(0, 1, 0), -hc.a);
        this.stilt(hc.x + w.x, hc.z + w.z, DECK - 0.2);
      }
      addBox(bc.x, bc.z, 2.2, 2.3, bc.a, -8, DECK + 4.5, { cam: true });
      // bell on a bracket by the porch
      const size = HOUSE_SIZE[i];
      const bp = pol(39.2, deg);
      const tang = { x: -Math.sin(bp.a), z: Math.cos(bp.a) };
      const bx = bp.x + tang.x * 1.75, bz = bp.z + tang.z * 1.75;
      const postM = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 3.6, 6), woodDark);
      postM.position.set(bx + tang.x * 0.6, DECK + 1.8, bz + tang.z * 0.6);
      postM.castShadow = true;
      scene.add(postM);
      addCircle(bx + tang.x * 0.6, bz + tang.z * 0.6, 0.18, -5, DECK + 3.6);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 1.0), woodDark);
      arm.position.set(bx + tang.x * 0.15, DECK + 3.4, bz + tang.z * 0.15);
      arm.rotation.y = -Math.atan2(tang.z, tang.x) + Math.PI / 2;
      scene.add(arm);
      const pivot = new THREE.Group();
      pivot.position.set(bx, DECK + 3.35, bz);
      pivot.rotation.y = -bp.a;
      scene.add(pivot);
      const s = 0.5 + size * 0.2;
      const bell = new THREE.Mesh(bellGeo(), toon(0xc08a3a, { side: THREE.DoubleSide }));
      bell.scale.setScalar(s);
      bell.castShadow = true;
      addOutline(bell, 0.03 / s);
      pivot.add(bell);
      const clapper = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6), toon(0x3a3431));
      clapper.position.y = -0.7 * s;
      pivot.add(clapper);
      const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.9, 4), toon(0xc8b48a));
      rope.position.y = -0.7 * s - 0.5;
      pivot.add(rope);
      const bellObj = { pivot, size, swing: 0, swingV: 0, pos: new THREE.Vector3(bx, DECK + 3.35 - 0.4 * s, bz), house: i };
      this.bells.push(bellObj);
      ctx.register({
        pos: new THREE.Vector3(bx, DECK + 1.0, bz), r: 2.6, promptY: 1.6,
        enabled: () => true,
        press: () => this.ring(bellObj),
        id: 'bell' + i,
      });
      addKeepOut(hc.x, hc.z, 7);
    });

    // --- the carved board ---
    const bx = -103.8, bz = 45.2;
    const by = terrainH(bx, bz);
    const board = new THREE.Group();
    board.position.set(bx, by, bz);
    board.rotation.y = -Math.PI / 2;
    scene.add(board);
    this.boardPos = new THREE.Vector3(bx, by + 1.6, bz);
    for (const sx of [-2.3, 2.3]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.22, 2.9, 0.22), woodDark);
      p.position.set(sx, 1.45, 0);
      p.castShadow = true;
      board.add(p);
    }
    const panel = new THREE.Mesh(new THREE.BoxGeometry(4.5, 1.3, 0.14), toon(0x9a7250));
    panel.position.set(0, 1.75, 0);
    panel.castShadow = panel.receiveShadow = true;
    addOutline(panel, 0.03);
    board.add(panel);
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(4.9, 0.18, 0.3), woodDark);
    lintel.position.set(0, 2.95, 0);
    board.add(lintel);
    addBox(bx, bz, 0.25, 2.45, 0, by - 1, by + 3, { cam: true });
    // start mark: a small carved lantern at the left end
    const mark = new THREE.Mesh(new THREE.OctahedronGeometry(0.12, 0), toon(0xe8b04a));
    mark.position.set(-2.05, 1.75, 0.1);
    board.add(mark);
    this.fish = [];
    this.lamps = [];
    SEQ.forEach((size, i) => {
      const len = 0.34 + size * 0.1;
      const g = new THREE.ExtrudeGeometry(fishShape(len), { depth: 0.05, bevelEnabled: false });
      const mat = toon(0xd9c9a8, { unique: true, emissive: new THREE.Color(0, 0, 0) });
      const f = new THREE.Mesh(g, mat);
      f.position.set(-1.55 + i * 0.78, 1.66, 0.07);
      addOutline(f, 0.012);
      board.add(f);
      this.fish.push(f);
      const lampMat = new THREE.MeshBasicMaterial({ color: 0x30281e });
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), lampMat);
      lamp.position.set(-1.55 + i * 0.78, 2.6, 0.12);
      board.add(lamp);
      this.lamps.push(lamp);
    });
    ctx.register({ pos: new THREE.Vector3(bx - 1.0, by + 0.9, bz), r: 3.0, promptY: 1.5, enabled: () => true, press: () => this.playTune(), id: 'board' });
    addKeepOut(-108, 40, 16);
    addKeepOut(I.x + Math.cos(-0.21) * 28, I.z + Math.sin(-0.21) * 28, 6);
    addPath([[-107, 42], [-106.5, 52], [-106.3, 64]]);

    this.decor(scene);
  }
  stilt(x, z, top) {
    const bottom = Math.min(terrainH(x, z) - 0.5, top - 1);
    const h = top - bottom;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, h, 6), toon(0x5a4030));
    m.position.set(x, bottom + h / 2, z);
    m.castShadow = true;
    this.ctx.scene.add(m);
    // barnacle/weed ring at the old waterline
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.5, 6), toon(0x4d5a40));
    ring.position.set(x, -0.3, z);
    if (bottom < -0.3) this.ctx.scene.add(ring);
  }
  decor(scene) {
    const hull = toon(0x2f5f8a), hull2 = toon(0xb84a32), white = toon(0xe8e0d0);
    const boats = [[-112, 18, 0.4, hull], [-100, 58, 2.2, hull2], [-128, 10, -0.6, hull2]];
    for (const [x, z, r, mat] of boats) {
      const y = terrainH(x, z);
      const g = new THREE.Group();
      g.position.set(x, y + 0.25, z);
      g.rotation.set(0.08, r, 0.12);
      const b = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), toon(mat.color.getHex(), { side: THREE.DoubleSide }));
      b.scale.set(2.1, 0.65, 0.8);
      b.castShadow = true;
      addOutline(b, 0.03);
      g.add(b);
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 1.4), white);
      seat.position.y = -0.1;
      g.add(seat);
      scene.add(g);
      addCircle(x, z, 1.4, y - 1, y + 1.2, { cam: false });
    }
    // barrels & crates on the square
    const barrel = toon(0x8a5a36), crate = toon(0xa07a50);
    const items = [[-110, 33, 'b'], [-110.8, 34, 'b'], [-111, 46, 'c'], [-99.5, 43.5, 'b'], [-114, 47, 'c']];
    for (const [x, z, t] of items) {
      const y = terrainH(x, z);
      const m = t === 'b' ? new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 1, 10), barrel) : new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), crate);
      m.position.set(x, y + 0.5, z);
      m.rotation.y = x;
      m.castShadow = m.receiveShadow = true;
      addOutline(m, 0.02);
      scene.add(m);
      addCircle(x, z, 0.5, y - 1, y + 1);
    }
    // fish drying rack
    const rx = -113, rz = 30, ry = terrainH(rx, rz);
    for (const s of [-1.5, 1.5]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 2.2, 5), toon(0x5e4130));
      p.position.set(rx + s, ry + 1.1, rz);
      scene.add(p);
    }
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 3.2, 5), toon(0x5e4130));
    bar.rotation.z = Math.PI / 2;
    bar.position.set(rx, ry + 2.1, rz);
    scene.add(bar);
    for (let i = 0; i < 6; i++) {
      const f = new THREE.Mesh(new THREE.ExtrudeGeometry(fishShape(0.45), { depth: 0.03, bevelEnabled: false }), toon(0xb8c0c4));
      f.rotation.z = Math.PI / 2;
      f.position.set(rx - 1.2 + i * 0.48, ry + 1.8, rz);
      scene.add(f);
    }
    addBox(rx, rz, 1.6, 0.3, 0, ry - 1, ry + 2.3);
    // hanging lanterns along the boardwalk (they light up when the boats come home)
    this.villageLights = [];
    for (let a = -40; a <= 40; a += 20) {
      const p = pol(34.4, a + 10);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 2.6, 5), toon(0x5e4130));
      post.position.set(p.x, DECK + 1.3, p.z);
      scene.add(post);
      const lampMat = new THREE.MeshBasicMaterial({ color: 0x2a2018 });
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), lampMat);
      lamp.position.set(p.x, DECK + 2.5, p.z);
      scene.add(lamp);
      this.villageLights.push(lamp);
    }
  }
  lightVillage() {
    for (const l of this.villageLights) l.material.color.setRGB(4, 2.2, 0.8);
    for (const w of this.houseWindows) w.material = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.3, 0.5) });
  }
  playTune() {
    const a = this.ctx.audio;
    this.heard = true;
    this.progress = [];
    this.evalT = -1;
    this.playT = 0;
    this.playIdx = 0;
    a.click(this.boardPos, 0.6);
    this.ctx.save();
  }
  ring(b) {
    this.ctx.audio.bell(PITCH[b.size], b.pos, 1);
    b.swingV += 3.2;
    this.ctx.player.raiseLantern(0.5);
    if (this.solved || this.evalT >= 0) return;
    this.playT = -1;
    this.progress.push(b.size);
    if (this.progress.length >= SEQ.length) this.evalT = 1.2;
  }
  update(dt, time) {
    for (const b of this.bells) {
      b.swingV += (-b.swing * 18 - b.swingV * 1.6) * dt;
      b.swing += b.swingV * dt;
      b.pivot.rotation.z = b.swing * 0.5;
    }
    // board lamps show how many bells have been rung
    this.lamps.forEach((l, i) => {
      const on = this.solved || i < this.progress.length;
      const tgt = on ? (this.solved ? 3.5 : 2.2) : 0.12;
      l.material.color.setRGB(tgt * 1.0 + 0.1, tgt * 0.6 + 0.08, tgt * 0.2 + 0.05);
    });
    // melody playback: fish glow in turn
    if (this.playT >= 0) {
      const prev = this.playT;
      this.playT += dt;
      const beat = 0.75;
      const idx = Math.floor(this.playT / beat);
      if (idx !== Math.floor(prev / beat) || prev === 0) {
        if (idx < SEQ.length) this.ctx.audio.chime(PITCH[SEQ[idx]], this.boardPos, 1);
      }
      this.fish.forEach((f, i) => {
        const k = i === idx ? 1 : 0;
        f.material.emissive.setRGB(k * 0.9, k * 0.6, k * 0.25);
      });
      if (idx >= SEQ.length) {
        this.playT = -1;
        this.fish.forEach((f) => f.material.emissive.setRGB(0, 0, 0));
      }
    } else if (this.solved) {
      this.fish.forEach((f, i) => f.material.emissive.setRGB(0.35, 0.25, 0.1));
    }
    if (this.evalT >= 0) {
      this.evalT -= dt;
      if (this.evalT < 0) {
        const ok = this.progress.every((s, i) => s === SEQ[i]);
        if (ok) {
          this.solved = true;
          this.ctx.audio.success(this.boardPos);
          this.ctx.game.primeBeacon(0);
        } else {
          this.ctx.audio.thud(this.boardPos);
          this.progress = [];
        }
        this.ctx.save();
      }
    }
  }
  hint() {
    if (this.solved) return null;
    if (!this.heard) return this.boardPos;
    const n = this.progress.length;
    const prefixOk = this.progress.every((s, i) => s === SEQ[i]);
    if (!prefixOk || n >= SEQ.length) return this.boardPos;
    const want = SEQ[n];
    const b = this.bells.find((bb) => bb.size === want);
    return b ? b.pos : this.boardPos;
  }
  getState() { return { solved: this.solved, heard: this.heard }; }
  setState(s) {
    if (!s) return;
    this.solved = !!s.solved;
    this.heard = !!s.heard;
  }
}
