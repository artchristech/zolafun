// The five landmark puzzles, each with a small teaching version beside it.
import * as THREE from './three.module.min.js';
import { Builder, G, mat4, toon, damp, clamp } from './util.js';
import { addShape, SHAPE_COLORS, pyramid } from './world.js';
import { terrainH, PEAK } from './terrain.js';
import { addCircle, addBox } from './physics.js';
import { Fire } from './fire.js';
import {
  HOUSES, BOARD_H, HOUSE_SHAPES, VILLAGE_ORDER, V_TUT, TOTEM, RING, RING_TUT, WRECK, WRECK_TUT, BEAM_Y,
  OBS, OBS_TUT, LIGHT, LIGHT_TUT, BEACONS, shutterAngle,
} from './places.js';

const vc = toon({ vertexColors: true });
const UP = new THREE.Vector3(0, 1, 0);

function meshOf(b, scene, shadow = true) {
  const m = new THREE.Mesh(b.build(), vc);
  m.castShadow = shadow; m.receiveShadow = true;
  scene.add(m);
  return m;
}
function glowMat(color, additive = false) {
  const m = new THREE.MeshBasicMaterial({ color, fog: true });
  if (additive) { m.transparent = true; m.blending = THREE.AdditiveBlending; m.depthWrite = false; m.fog = false; }
  m.userData.base = new THREE.Color(color);
  return m;
}
const setGlow = (m, k) => m.color.copy(m.userData.base).multiplyScalar(k);
function local(x, z, yaw) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return (lx, lz) => ({ x: x + lx * c + lz * s, z: z - lx * s + lz * c });
}
function beamMesh(scene, mat, radius = 0.08) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 1, 6, 1, true).translate(0, 0.5, 0), mat);
  m.visible = false; m.frustumCulled = false;
  scene.add(m);
  return m;
}
function setBeam(m, a, b, p) {
  const d = new THREE.Vector3().subVectors(b, a);
  const L = d.length();
  m.position.copy(a);
  m.quaternion.setFromUnitVectors(UP, d.multiplyScalar(1 / L));
  m.scale.set(1, Math.max(0.001, L * p), 1);
  m.visible = p > 0.001;
}

class Puzzle {
  constructor(ctx, idx) {
    this.ctx = ctx; this.idx = idx;
    this.items = [];
    this.tutSolved = false; this.solved = false;
  }
  item(pos, press, active, r = 2.0) { const it = { pos, press, active, r, owner: this }; this.items.push(it); return it; }
  win() {
    this.solved = true;
    this.ctx.sound.solve(this.center3());
    this.ctx.onSolved(this.idx);
  }
  teach() {
    this.tutSolved = true;
    this.ctx.sound.solve(this.tutCenter3());
    this.ctx.changed();
  }
}

// ---------------------------------------------------------------------------------------------
// Village: ring the bells in the order carved on the totem (bottom to top).
class Village extends Puzzle {
  constructor(ctx) {
    super(ctx, 0);
    const { scene } = ctx;
    this.step = 0; this.tutStep = 0; this.lock = 0; this.tutLock = 0;
    this.bells = [];
    const bellGeo = (() => {
      const b = new Builder();
      b.add(new THREE.CylinderGeometry(0.11, 0.27, 0.42, 12, 1), 0xb8862e, mat4(0, -0.33, 0));
      b.add(new THREE.TorusGeometry(0.26, 0.04, 4, 12), 0x9a6a20, mat4(0, -0.54, 0, Math.PI / 2, 0, 0));
      b.add(G.sphere, 0x5a4020, mat4(0, -0.58, 0, 0, 0, 0, 0.07, 0.07, 0.07));
      b.add(G.box, 0x3a2a1a, mat4(0, -0.06, 0, 0, 0, 0, 0.05, 0.14, 0.05));
      return b.build();
    })();
    const mkBell = (x, y, z, yaw, shape, group, lampPos) => {
      const mesh = new THREE.Mesh(bellGeo, vc);
      mesh.position.set(x, y, z); mesh.rotation.y = yaw;
      mesh.castShadow = true; scene.add(mesh);
      const lb = new Builder();
      addShape(lb, shape, mat4(0, 0, 0, 0, 0, 0, 0.75, 0.75, 1), 0xffffff, 0.1);
      const mat = glowMat(SHAPE_COLORS[shape]);
      const lamp = new THREE.Mesh(lb.build(), mat);
      lamp.position.copy(lampPos.p); lamp.rotation.y = lampPos.yaw;
      scene.add(lamp);
      const bell = { mesh, lamp, mat, shape, group, on: false, swing: 0, shake: 0, pos: new THREE.Vector3(x, y - 0.4, z) };
      this.bells.push(bell);
      const it = this.item(new THREE.Vector3(x, y - 1.0, z), () => this.ring(bell),
        () => (group === 'tut' ? !this.tutSolved && this.tutLock <= 0 : this.tutSolved && !this.solved && this.lock <= 0) && !bell.on, 2.1);
      bell.item = it;
      return bell;
    };
    // tutorial: two small bells on a gallows by the beacon knoll
    {
      const b = new Builder();
      for (const tb of V_TUT.bells) {
        const y = terrainH(tb.x, tb.z);
        b.box(0.14, 2.4, 0.14, 0x5a3c22, tb.x, y + 1.2, tb.z);
        b.box(0.1, 0.1, 0.7, 0x5a3c22, tb.x, y + 2.35, tb.z + 0.3);
        addCircle(tb.x, tb.z, 0.2);
        mkBell(tb.x, y + 2.3, tb.z + 0.6, 0, tb.shape, 'tut', { p: new THREE.Vector3(tb.x, y + 1.5, tb.z + 0.1), yaw: 0 });
      }
      meshOf(b, scene);
    }
    // real: one bell per stilt house
    for (const H of HOUSES) {
      const P = local(H.x, H.z, H.yaw);
      const bp = P(-1.0, 3.7), lp = P(-1.0, 3.17);
      mkBell(bp.x, BOARD_H + 2.42, bp.z, H.yaw, HOUSE_SHAPES[H.i], 'real', { p: new THREE.Vector3(lp.x, BOARD_H + 1.55, lp.z), yaw: H.yaw });
    }
    this.area = { x: 0, z: 28, r: 20 };
  }
  center3() { return new THREE.Vector3(0, 6, 34); }
  tutCenter3() { return new THREE.Vector3(-11, 6, 10); }

  ring(bell) {
    const s = this.ctx.sound;
    bell.swing = 1;
    s.bell(bell.shape, bell.pos);
    if (bell.group === 'tut') {
      if (V_TUT.order[this.tutStep] === bell.shape) {
        bell.on = true; this.tutStep++;
        if (this.tutStep === V_TUT.order.length) setTimeout(() => this.teach(), 500);
      } else this.fail('tut');
    } else {
      if (VILLAGE_ORDER[this.step] === bell.shape) {
        bell.on = true; this.step++;
        if (this.step === VILLAGE_ORDER.length) setTimeout(() => this.win(), 600);
      } else this.fail('real');
    }
    this.ctx.changed();
  }
  fail(group) {
    setTimeout(() => this.ctx.sound.wrong(this.bells.find((b) => b.group === group).pos), 250);
    for (const b of this.bells) if (b.group === group) { b.on = false; b.shake = group === 'tut' ? 2 : 4; }
    if (group === 'tut') { this.tutStep = 0; this.tutLock = 2; } else { this.step = 0; this.lock = 4; }
  }
  update(dt, t) {
    this.lock -= dt; this.tutLock -= dt;
    for (const b of this.bells) {
      b.swing = damp(b.swing, 0, 1.5, dt);
      b.shake = Math.max(0, b.shake - dt);
      b.mesh.rotation.x = Math.sin(t * 9) * 0.5 * b.swing + Math.sin(t * 31) * 0.08 * Math.min(1, b.shake);
      const powered = b.group === 'tut' ? true : this.tutSolved;
      let k = b.on ? 3.0 + Math.sin(t * 3 + b.shape) * 0.3 : powered ? 0.35 : 0.08;
      if (b.shake > 0) k = (Math.sin(t * 20) > 0 ? 0.9 : 0.05) * Math.min(1, b.shake);
      if (this.solved && b.group === 'real') k = 3.2;
      if (this.tutSolved && b.group === 'tut') k = 2.4;
      setGlow(b.mat, k);
    }
  }
  hintPoint() { return this.tutSolved ? new THREE.Vector3(TOTEM.x, 5, TOTEM.z) : new THREE.Vector3(V_TUT.totem.x, 5, V_TUT.totem.z); }
  getState() { return { ts: this.tutSolved, s: this.solved, tst: this.tutStep, st: this.step }; }
  setState(o) {
    this.tutSolved = !!o.ts; this.solved = !!o.s; this.tutStep = o.tst || 0; this.step = o.st || 0;
    const tutOn = V_TUT.order.slice(0, this.tutSolved ? 99 : this.tutStep), realOn = VILLAGE_ORDER.slice(0, this.solved ? 99 : this.step);
    for (const b of this.bells) b.on = b.group === 'tut' ? tutOn.includes(b.shape) : realOn.includes(b.shape);
  }
}

// ---------------------------------------------------------------------------------------------
// Monolith ring: linked stones; tune the whole chord to one note.
const HUM = [110, 123.47, 138.59, 164.81];
const LEVEL_COL = [0x3a62d8, 0x34b8c8, 0x7ad04a, 0xf2b83a];
class Ring extends Puzzle {
  constructor(ctx) {
    super(ctx, 1);
    const { scene, sound } = ctx;
    this.s = [2, 0, 1, 3, 1, 0];
    this.t = [1, 0, 1];
    this.lock = 0;
    this.stones = [];
    const y0 = 5;
    const mk = (x, z, yaw, w, d, h0, step, group, i) => {
      const mat = glowMat(0xffffff);
      const band = new THREE.Mesh(new THREE.BoxGeometry(w, 0.2, d), mat);
      band.position.set(x, h0, z); band.rotation.y = yaw;
      scene.add(band);
      const hum = sound.addHum(x, h0 + 1, z, group === 'real' ? 3 : 2);
      const st = { x, z, band, mat, h0, step, group, i, y: h0, hum, pulse: 0 };
      this.stones.push(st);
      this.item(new THREE.Vector3(x, h0 + 0.5, z), () => this.press(st),
        () => this.lock <= 0 && (group === 'tut' ? !this.tutSolved : this.tutSolved && !this.solved), 2.0);
      return st;
    };
    for (let i = 0; i < RING.n; i++) {
      const a = (i / RING.n) * Math.PI * 2;
      const x = RING.x + Math.cos(a) * RING.r, z = RING.z + Math.sin(a) * RING.r;
      mk(x, z, Math.atan2(Math.cos(a), Math.sin(a)), 1.5, 1.05, y0 + 0.7, 0.95, 'real', i);
    }
    for (let i = 0; i < RING_TUT.n; i++) {
      const x = RING_TUT.x + RING_TUT.dir.x * (i - 1) * 2.4, z = RING_TUT.z + RING_TUT.dir.z * (i - 1) * 2.4;
      const y = terrainH(x, z);
      mk(x, z, Math.atan2(RING_TUT.dir.x, RING_TUT.dir.z) + Math.PI / 2, 0.9, 0.7, y + 0.5, 0.5, 'tut', i);
    }
    this.halo = new THREE.Mesh(new THREE.TorusGeometry(RING.r, 0.08, 4, 48), glowMat(0xffd27a));
    this.halo.rotation.x = Math.PI / 2;
    this.halo.position.set(RING.x, y0 + 0.7 + 0.95 * 3, RING.z);
    this.halo.visible = false;
    scene.add(this.halo);
    this.area = { x: RING.x, z: RING.z, r: 16 };
    this.inside = 0; this.nearTut = 0;
  }
  center3() { return new THREE.Vector3(RING.x, 7, RING.z); }
  tutCenter3() { return new THREE.Vector3(RING_TUT.x, 6, RING_TUT.z); }
  levelOf(st) { return st.group === 'real' ? this.s[st.i] : this.t[st.i]; }
  press(st) {
    const arr = st.group === 'real' ? this.s : this.t;
    const n = arr.length;
    const idx = st.group === 'real' ? [st.i - 1, st.i, st.i + 1].map((k) => (k + n) % n) : [st.i - 1, st.i, st.i + 1].filter((k) => k >= 0 && k < n);
    for (const k of idx) arr[k] = (arr[k] + 1) % 4;
    this.lock = 1.1;
    this.ctx.sound.grind(new THREE.Vector3(st.x, st.h0, st.z), 0.9);
    for (const o of this.stones) if (o.group === st.group && idx.includes(o.i)) o.pulse = 1;
    const done = arr.every((v) => v === arr[0]);
    if (done) setTimeout(() => (st.group === 'real' ? this.win() : this.teach()), 1100);
    this.ctx.changed();
  }
  update(dt, t, player) {
    this.lock -= dt;
    const pd = Math.hypot(player.pos.x - RING.x, player.pos.z - RING.z);
    this.inside = damp(this.inside, pd < RING.r - 0.6 ? 1 : pd < RING.r + 2 ? 0.25 : 0, 3, dt);
    const td = Math.hypot(player.pos.x - RING_TUT.x, player.pos.z - RING_TUT.z);
    this.nearTut = damp(this.nearTut, td < 6 ? 1 : 0, 3, dt);
    for (const st of this.stones) {
      const lv = this.levelOf(st);
      const target = st.h0 + lv * st.step;
      st.y = damp(st.y, target, 5, dt);
      st.band.position.y = st.y;
      st.pulse = Math.max(0, st.pulse - dt);
      const freq = HUM[lv];
      const done = st.group === 'real' ? this.solved : this.tutSolved;
      const powered = st.group === 'tut' || this.tutSolved;
      const beat = 0.5 + 0.5 * Math.sin(t * Math.PI * 2 * (freq / 55));
      let k = powered ? 1.1 + beat * 0.9 : 0.15;
      if (done) k = 2.8;
      k += st.pulse * 2;
      st.mat.userData.base.set(LEVEL_COL[lv]);
      setGlow(st.mat, k);
      const g = st.group === 'real' ? (powered ? 0.16 : 0.07) * this.inside : 0.14 * this.nearTut;
      this.ctx.sound.setHum(st.hum, freq, g * (done ? 1.3 : 1));
    }
    this.halo.visible = this.solved;
    if (this.solved) {
      this.halo.position.y = 5 + 0.7 + 0.95 * this.s[0];
      setGlow(this.halo.material, 2.5 + Math.sin(t * 2) * 0.4);
    }
  }
  hintPoint() { return this.tutSolved ? this.center3() : this.tutCenter3(); }
  getState() { return { ts: this.tutSolved, s: this.solved, a: this.s.slice(), t: this.t.slice() }; }
  setState(o) {
    this.tutSolved = !!o.ts; this.solved = !!o.s;
    if (o.a && o.a.length === 6) this.s = o.a.slice();
    if (o.t && o.t.length === 3) this.t = o.t.slice();
    for (const st of this.stones) st.y = st.h0 + this.levelOf(st) * st.step;
  }
}

// ---------------------------------------------------------------------------------------------
// Shipwreck: light the lamp after setting every mirror; the beam shows only for a whole route.
class Wreck extends Puzzle {
  constructor(ctx) {
    super(ctx, 2);
    const { scene, sound } = ctx;
    this.beamMat = glowMat(new THREE.Color(1.0, 0.85, 0.5).multiplyScalar(1), true);
    this.beamMat.userData.base = new THREE.Color(1.0, 0.82, 0.5);
    setGlow(this.beamMat, 4);
    const mkLamp = (x, z, y, scale) => {
      const b = new Builder();
      const g = terrainH(x, z);
      b.box(0.22, y - g - 0.35, 0.22, 0x5a3c22, x, (y + g - 0.35) / 2, z);
      b.box(0.8 * scale, 0.08, 0.8 * scale, 0x2a2420, x, y - 0.35 * scale, z);
      b.box(0.8 * scale, 0.08, 0.8 * scale, 0x2a2420, x, y + 0.42 * scale, z);
      b.box(0.08, 0.8 * scale, 0.8 * scale, 0x2a2420, x - 0.4 * scale, y, z);
      b.box(0.8 * scale, 0.8 * scale, 0.06, 0x2a2420, x, y, z - 0.4 * scale);
      b.box(0.8 * scale, 0.8 * scale, 0.06, 0x2a2420, x, y, z + 0.4 * scale);
      b.add(pyramid, 0x2a2420, mat4(x, y + 0.65 * scale, z, 0, 0, 0, 0.6 * scale, 0.4 * scale, 0.6 * scale));
      b.add(new THREE.TorusGeometry(0.3 * scale, 0.05, 4, 12), 0xc89a40, mat4(x + 0.42 * scale, y, z, 0, Math.PI / 2, 0));
      meshOf(b, scene);
      addCircle(x, z, 0.5);
      const fire = new Fire(0.28 * scale, { embers: 8, gain: 5 });
      fire.group.position.set(x, y - 0.32 * scale, z);
      scene.add(fire.group);
      return { x, z, y, fire, state: 'off', t: 0, audio: sound.addFire(x, y, z) };
    };
    const mkMirror = (x, z, y, start) => {
      const g = terrainH(x, z);
      const b = new Builder();
      b.cyl(0.14, y - g - 0.65, 0x5a3c22, x, (y + g - 0.65) / 2, z, 0, 0, 0, 6);
      b.cyl(0.62, 0.1, 0x8a8478, x, y - 0.68, z, 0, 0, 0, 16);
      for (let k = 0; k < 4; k++) b.add(G.box, 0x3a352c, mat4(x, y - 0.62, z, 0, (k * Math.PI) / 4, 0, 1.22, 0.03, 0.06));
      meshOf(b, scene);
      addCircle(x, z, 0.4);
      const h = new Builder();
      h.add(G.cyl, 0xdfe9f2, mat4(0, 0, 0, Math.PI / 2, 0, 0, 0.5, 0.05, 0.5));
      h.add(new THREE.TorusGeometry(0.52, 0.05, 4, 16), 0x8a6a3a, mat4(0, 0, 0));
      h.add(G.box, 0x8a6a3a, mat4(0, -0.6, 0, 0, 0, 0, 0.08, 0.2, 0.08));
      h.add(G.box, 0xe0b040, mat4(0, -0.565, 0, 0, 0, 0, 1.3, 0.04, 0.08));
      const head = meshOf(h, scene);
      head.position.set(x, y, z);
      head.rotation.y = (start * Math.PI) / 4;
      return { x, z, y, head, pos: start, yaw: head.rotation.y, lock: 0 };
    };
    const mkLens = (x, z, y, yaw) => {
      const g = terrainH(x, z);
      const b = new Builder();
      b.cyl(0.14, y - g - 0.45, 0x5a3c22, x, (y + g - 0.45) / 2, z, 0, 0, 0, 6);
      b.add(new THREE.TorusGeometry(0.45, 0.08, 5, 16), 0xc89a40, mat4(x, y, z, 0, yaw, 0));
      meshOf(b, scene);
      addCircle(x, z, 0.3);
      const mat = glowMat(0x9fe8ff);
      const glass = new THREE.Mesh(new THREE.CircleGeometry(0.4, 16), mat);
      glass.position.set(x, y, z); glass.rotation.y = yaw;
      glass.material.side = THREE.DoubleSide;
      scene.add(glass);
      return { x, z, y, mat };
    };
    // tutorial
    const ty = terrainH(WRECK_TUT.lamp.x, WRECK_TUT.lamp.z) + 1.25;
    this.tLamp = mkLamp(WRECK_TUT.lamp.x, WRECK_TUT.lamp.z, ty, 0.7);
    this.tMirror = mkMirror(WRECK_TUT.mirror.x, WRECK_TUT.mirror.z, ty, WRECK_TUT.start);
    this.tLens = mkLens(WRECK_TUT.lens.x, WRECK_TUT.lens.z, ty, 0);
    this.tBeams = [beamMesh(scene, this.beamMat, 0.05), beamMesh(scene, this.beamMat, 0.05)];
    // real
    this.lamp = mkLamp(WRECK.lamp.x, WRECK.lamp.z, BEAM_Y, 1);
    this.mirrors = WRECK.mirrors.map((m, i) => mkMirror(m.x, m.z, BEAM_Y, WRECK.start[i]));
    this.lens = mkLens(WRECK.target.x - 2.3, WRECK.target.z, BEAM_Y, Math.PI / 2);
    this.beams = [0, 1, 2, 3, 4].map(() => beamMesh(scene, this.beamMat, 0.09));
    // interactions
    const tutOn = () => !this.tutSolved, realOn = () => this.tutSolved && !this.solved;
    this.item(new THREE.Vector3(this.tLamp.x, ty - 0.6, this.tLamp.z), () => this.light(this.tLamp, true), () => tutOn() && this.tLamp.state === 'off', 1.9);
    this.item(new THREE.Vector3(this.tMirror.x, ty - 0.6, this.tMirror.z), () => this.turn(this.tMirror), () => tutOn() && this.tMirror.lock <= 0, 1.9);
    this.item(new THREE.Vector3(this.lamp.x, BEAM_Y - 1.2, this.lamp.z), () => this.light(this.lamp, false), () => realOn() && this.lamp.state === 'off', 2.0);
    for (const m of this.mirrors) this.item(new THREE.Vector3(m.x, BEAM_Y - 1.2, m.z), () => this.turn(m), () => realOn() && m.lock <= 0, 2.0);
    this.beamProg = 0; this.tBeamProg = 0;
    this.path = null; this.tPath = null;
    this.area = { x: WRECK.clearing.x, z: WRECK.clearing.z - 8, r: 30 };
  }
  center3() { return new THREE.Vector3(this.lens.x, BEAM_Y, this.lens.z); }
  tutCenter3() { return new THREE.Vector3(this.tLens.x, this.tLens.y, this.tLens.z); }
  turn(m) {
    m.pos = (m.pos + 1) % 4;
    m.lock = 0.55;
    this.ctx.sound.click(new THREE.Vector3(m.x, m.y, m.z));
    this.ctx.changed();
  }
  light(l, tut) {
    l.state = 'catch'; l.t = 0;
    l.fire.set(0.35);
    this.ctx.player.lift(1.6);
    this.ctx.sound.ignite(new THREE.Vector3(l.x, l.y, l.z), false);
    l.tut = tut;
  }
  trace(start, nodes, target) {
    let p = { x: start.x, z: start.z }, d = { x: 1, z: 0 };
    const path = [new THREE.Vector3(start.x + 0.4, start.y, start.z)];
    const all = [...nodes, target];
    for (let it = 0; it < 12; it++) {
      let best = null, bestA = 1e9;
      for (const n of all) {
        const vx = n.x - p.x, vz = n.z - p.z;
        const along = vx * d.x + vz * d.z;
        if (along < 0.5) continue;
        const lat = Math.abs(vx * d.z - vz * d.x);
        if (lat < 0.7 && along < bestA) { best = n; bestA = along; }
      }
      if (!best) return null;
      path.push(new THREE.Vector3(best.x, best.y, best.z));
      if (best === target) return path;
      const yaw = (best.pos * Math.PI) / 4;
      const nx = Math.sin(yaw), nz = Math.cos(yaw);
      const dn = d.x * nx + d.z * nz;
      if (Math.abs(dn) < 0.3) return null;
      const rx = d.x - 2 * dn * nx, rz = d.z - 2 * dn * nz;
      if (rx * d.x + rz * d.z < -0.9) return null;
      d = { x: Math.round(rx), z: Math.round(rz) };
      p = { x: best.x, z: best.z };
    }
    return null;
  }
  updateLamp(l, dt) {
    l.t += dt;
    if (l.state === 'catch' && l.t > 2.4) {
      l.fire.set(1);
      const path = l.tut ? this.trace(l, [this.tMirror], this.tLens) : this.trace(l, this.mirrors, this.lens);
      if (path) {
        l.state = 'beam';
        if (l.tut) { this.tPath = path; this.tBeamProg = 0.001; } else { this.path = path; this.beamProg = 0.001; }
      } else { l.state = 'burn'; l.t = 0; }
    } else if (l.state === 'burn' && l.t > 3.5) {
      l.state = 'gutter'; l.t = 0; l.fire.set(0);
    } else if (l.state === 'gutter' && l.t > 1.2) l.state = 'off';
    l.fire.update(dt);
    this.ctx.sound.setFire(l.audio, l.fire.lit * 0.4);
  }
  update(dt, t) {
    for (const m of [this.tMirror, ...this.mirrors]) {
      m.lock -= dt;
      const goal = (m.pos * Math.PI) / 4;
      if (goal < m.yaw - 0.01) m.yaw -= Math.PI; // wrap 135 -> 180 (same as 0)
      m.yaw = damp(m.yaw, goal, 9, dt);
      m.head.rotation.y = m.yaw;
    }
    this.updateLamp(this.tLamp, dt);
    this.updateLamp(this.lamp, dt);
    const run = (prog, path, beams, done, setDone) => {
      if (!path || prog <= 0) return prog;
      prog = Math.min(1, prog + dt * 0.8);
      const n = path.length - 1;
      for (let i = 0; i < beams.length; i++) {
        if (i >= n) { beams[i].visible = false; continue; }
        const p = clamp(prog * n - i, 0, 1);
        setBeam(beams[i], path[i], path[i + 1], p);
      }
      if (prog >= 1 && !done) setDone();
      return prog;
    };
    this.tBeamProg = run(this.tBeamProg, this.tPath, this.tBeams, this.tutSolved, () => this.teach());
    this.beamProg = run(this.beamProg, this.path, this.beams, this.solved, () => this.win());
    setGlow(this.tLens.mat, this.tutSolved ? 3 : 0.25);
    setGlow(this.lens.mat, this.solved ? 3.5 : this.tutSolved ? 0.4 : 0.15);
    setGlow(this.beamMat, 3.5 + Math.sin(t * 6) * 0.4);
  }
  hintPoint() { return this.tutSolved ? new THREE.Vector3(this.lamp.x, BEAM_Y, this.lamp.z) : this.tutCenter3(); }
  getState() { return { ts: this.tutSolved, s: this.solved, tm: this.tMirror.pos, m: this.mirrors.map((m) => m.pos) }; }
  setState(o) {
    this.tutSolved = !!o.ts; this.solved = !!o.s;
    if (typeof o.tm === 'number') this.tMirror.pos = o.tm;
    if (o.m) o.m.forEach((p, i) => { if (this.mirrors[i]) this.mirrors[i].pos = p; });
    for (const m of [this.tMirror, ...this.mirrors]) { m.yaw = (m.pos * Math.PI) / 4; m.head.rotation.y = m.yaw; }
    const restore = (l, tut) => {
      const path = tut ? this.trace(l, [this.tMirror], this.tLens) : this.trace(l, this.mirrors, this.lens);
      if (!path) return;
      l.state = 'beam'; l.fire.set(1, true);
      if (tut) { this.tPath = path; this.tBeamProg = 1; this.tBeams.forEach((b, i) => i < path.length - 1 && setBeam(b, path[i], path[i + 1], 1)); }
      else { this.path = path; this.beamProg = 1; this.beams.forEach((b, i) => i < path.length - 1 && setBeam(b, path[i], path[i + 1], 1)); }
    };
    if (this.tutSolved) restore(this.tLamp, true);
    if (this.solved) restore(this.lamp, false);
  }
}

// ---------------------------------------------------------------------------------------------
// Observatory: aim the re-set telescope (azimuth from the floor inlay, tilt from the carving).
const EL = [5, 20, 35, 50, 65].map((d) => (d * Math.PI) / 180);
class Observatory extends Puzzle {
  constructor(ctx) {
    super(ctx, 3);
    const { scene } = ctx;
    const Y = PEAK.top;
    this.az = OBS.azStart; this.el = OBS.elStart; this.tAz = OBS_TUT.start;
    this.lock = 0; this.tLock = 0; this.leverT = 0; this.tLeverT = 0; this.shake = 0; this.tShake = 0;
    // yoke (turns in azimuth) and tube (tilts)
    const yb = new Builder();
    yb.cyl(0.62, 0.16, 0x6a5a3a, 0, 0.08, 0, 0, 0, 0, 16);
    yb.box(0.14, 1.1, 0.3, 0x4a4036, -0.42, 0.6, 0);
    yb.box(0.14, 1.1, 0.3, 0x4a4036, 0.42, 0.6, 0);
    yb.add(new THREE.TorusGeometry(0.62, 0.03, 3, 20, Math.PI / 2), 0xd8a840, mat4(0.5, 0.95, 0, 0, -Math.PI / 2, 0));
    EL.forEach((a) => yb.add(G.box, 0x2a2420, mat4(0.5, 0.95 + Math.sin(a) * 0.62, Math.cos(a) * 0.62, -a, 0, 0, 0.08, 0.03, 0.12)));
    this.yoke = meshOf(yb, scene);
    this.yoke.position.set(OBS.x, Y + 1.2, OBS.z);
    const tb = new Builder();
    tb.add(G.cyl16, 0x9a7a40, mat4(0, 0, 0.6, Math.PI / 2, 0, 0, 0.26, 3.0, 0.26));
    tb.add(G.cyl16, 0x4a4036, mat4(0, 0, 2.05, Math.PI / 2, 0, 0, 0.32, 0.3, 0.32));
    tb.add(G.cyl, 0x4a4036, mat4(0, 0, -1.0, Math.PI / 2, 0, 0, 0.1, 0.35, 0.1));
    tb.add(G.box, 0xe0b040, mat4(0.47, 0, 0.62, 0, 0, 0, 0.06, 0.06, 0.18));
    this.tube = meshOf(tb, scene);
    this.tube.position.set(0, 0.95, 0);
    this.yoke.add(this.tube);
    this.lensMat = glowMat(0x9fe8ff);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.27, 16), this.lensMat);
    lens.position.set(0, 0, 2.21);
    this.tube.add(lens);
    addCircle(OBS.x, OBS.z, 0.9);
    // control pedestals
    const ped = new Builder();
    const ctl = { az: { x: OBS.x - 1.7, z: OBS.z + 1.5 }, el: { x: OBS.x + 0.2, z: OBS.z + 2.3 }, lev: { x: OBS.x + 2.0, z: OBS.z + 1.1 } };
    for (const k in ctl) { const c = ctl[k]; ped.cyl(0.2, 0.9, 0x8a826e, c.x, Y + 0.45, c.z, 0, 0, 0, 6); addCircle(c.x, c.z, 0.28); }
    meshOf(ped, scene);
    const wheel = (c, col, spokes) => {
      const b = new Builder();
      b.add(new THREE.TorusGeometry(0.32, 0.04, 4, 16), col, mat4(0, 0, 0));
      for (let i = 0; i < spokes; i++) b.add(G.box, col, mat4(0, 0, 0, 0, 0, (i * Math.PI) / spokes, 0.62, 0.04, 0.04));
      b.add(G.box, 0x2a2420, mat4(0.3, 0, 0.1, 0, 0, 0, 0.06, 0.06, 0.2));
      const m = meshOf(b, scene);
      m.position.set(c.x, Y + 1.05, c.z);
      m.rotation.y = Math.atan2(c.x - OBS.x, c.z - OBS.z);
      m.rotation.order = 'YXZ';
      return m;
    };
    this.azWheel = wheel(ctl.az, 0xd8a840, 4);
    this.elWheel = wheel(ctl.el, 0x7aa0c0, 2);
    const lv = new Builder();
    lv.box(0.08, 0.7, 0.08, 0x2a2420, 0, 0.35, 0);
    lv.add(G.sphere, 0xc83a2a, mat4(0, 0.72, 0, 0, 0, 0, 0.1, 0.1, 0.1));
    this.lever = meshOf(lv, scene);
    this.lever.position.set(ctl.lev.x, Y + 0.9, ctl.lev.z);
    this.lever.rotation.y = Math.atan2(ctl.lev.x - OBS.x, ctl.lev.z - OBS.z);
    this.lever.rotation.order = 'YXZ';
    const realOn = () => this.tutSolved && !this.solved && this.lock <= 0;
    this.item(new THREE.Vector3(ctl.az.x, Y + 0.5, ctl.az.z), () => this.turnAz(), realOn, 1.5);
    this.item(new THREE.Vector3(ctl.el.x, Y + 0.5, ctl.el.z), () => this.turnEl(), realOn, 1.5);
    this.item(new THREE.Vector3(ctl.lev.x, Y + 0.5, ctl.lev.z), () => this.pull(), () => realOn() && this.leverT <= 0, 1.5);
    // star beam on success
    this.starMat = glowMat(new THREE.Color(0.8, 0.9, 1.0), true);
    setGlow(this.starMat, 3);
    this.starBeam = beamMesh(scene, this.starMat, 0.06);
    // tutorial sighting tube
    const T = OBS_TUT, ty = terrainH(T.x, T.z);
    const tp = new Builder();
    tp.cyl(0.18, 1.1, 0x8a826e, T.x, ty + 0.55, T.z, 0, 0, 0, 6);
    tp.cyl(0.42, 0.06, 0xa89f8a, T.x, ty + 1.1, T.z, 0, 0, 0, 16);
    const ay = (T.answer * Math.PI * 2) / T.steps;
    tp.add(G.box, 0xf0c040, mat4(T.x + Math.sin(ay) * 0.22, ty + 1.14, T.z + Math.cos(ay) * 0.22, 0, ay, 0, 0.06, 0.02, 0.36));
    tp.add(G.box, 0xf0c040, mat4(T.x + Math.sin(ay) * 0.4, ty + 1.14, T.z + Math.cos(ay) * 0.4, 0, ay + Math.PI / 4, 0, 0.12, 0.02, 0.12));
    for (let i = 0; i < T.steps; i++) { const a = (i * Math.PI * 2) / T.steps; tp.add(G.box, 0x3a352c, mat4(T.x + Math.sin(a) * 0.38, ty + 1.135, T.z + Math.cos(a) * 0.38, 0, a, 0, 0.03, 0.02, 0.08)); }
    // little flag to sight on
    const fy = terrainH(T.flag.x, T.flag.z);
    tp.cyl(0.05, 2.4, 0x5a3c22, T.flag.x, fy + 1.2, T.flag.z, 0, 0, 0, 6);
    tp.add(G.box, 0xd8463a, mat4(T.flag.x + 0.35, fy + 2.1, T.flag.z, 0, 0, 0, 0.7, 0.45, 0.03));
    addCircle(T.flag.x, T.flag.z, 0.15);
    addCircle(T.x, T.z, 0.3);
    // tutorial lever
    tp.cyl(0.08, 0.9, 0x8a826e, T.x + 0.9, ty + 0.45, T.z - 0.3, 0, 0, 0, 6);
    meshOf(tp, scene);
    const st = new Builder();
    st.add(G.cyl, 0x9a7a40, mat4(0, 0.14, 0.15, Math.PI / 2 - 0.12, 0, 0, 0.09, 0.9, 0.09));
    this.tTube = meshOf(st, scene);
    this.tTube.position.set(T.x, ty + 1.15, T.z);
    this.tLensMat = glowMat(0x9fe8ff);
    const tl = new THREE.Mesh(new THREE.CircleGeometry(0.085, 10), this.tLensMat);
    tl.position.set(0, 0.2, 0.61); tl.rotation.x = -0.12;
    this.tTube.add(tl);
    const tlv = new Builder();
    tlv.box(0.05, 0.45, 0.05, 0x2a2420, 0, 0.22, 0);
    tlv.add(G.sphere, 0xc83a2a, mat4(0, 0.46, 0, 0, 0, 0, 0.07, 0.07, 0.07));
    this.tLever = meshOf(tlv, scene);
    this.tLever.position.set(T.x + 0.9, ty + 0.9, T.z - 0.3);
    this.tLever.rotation.order = 'YXZ';
    this.tLever.rotation.y = Math.PI / 2;
    const tutOn = () => !this.tutSolved && this.tLock <= 0;
    this.item(new THREE.Vector3(T.x, ty + 0.5, T.z), () => this.turnTut(), tutOn, 1.4);
    this.item(new THREE.Vector3(T.x + 0.9, ty + 0.5, T.z - 0.3), () => this.pullTut(), () => tutOn() && this.tLeverT <= 0, 1.2);
    this.tYaw = (this.tAz * Math.PI * 2) / T.steps;
    this.yaw = (this.az * Math.PI * 2) / OBS.azSteps;
    this.pitch = EL[this.el];
    this.wheelSpin = { az: 0, el: 0 };
    this.area = { x: OBS.x, z: OBS.z, r: 12 };
  }
  center3() { return new THREE.Vector3(OBS.x, PEAK.top + 2, OBS.z); }
  tutCenter3() { return new THREE.Vector3(OBS_TUT.x, PEAK.top + 1.5, OBS_TUT.z); }
  turnAz() { this.az = (this.az + 1) % OBS.azSteps; this.lock = 0.7; this.wheelSpin.az += Math.PI / 2; this.ctx.sound.grind(this.center3(), 0.7); this.ctx.changed(); }
  turnEl() { this.el = (this.el + 1) % EL.length; this.lock = 0.7; this.wheelSpin.el += Math.PI; this.ctx.sound.grind(this.center3(), 0.7); this.ctx.changed(); }
  pull() {
    this.leverT = 1;
    this.ctx.sound.clunk(this.center3());
    if (this.az === OBS.azAnswer && this.el === OBS.elAnswer) { setTimeout(() => this.win(), 700); this.lock = 99; }
    else {
      this.shake = 1.2; this.lock = 2.0; this.leverT = 6;
      setTimeout(() => { this.el = 0; this.ctx.sound.wrong(this.center3()); this.ctx.changed(); }, 500);
    }
  }
  turnTut() { this.tAz = (this.tAz + 1) % OBS_TUT.steps; this.tLock = 0.5; this.ctx.sound.click(this.tutCenter3()); this.ctx.changed(); }
  pullTut() {
    this.tLeverT = 1;
    this.ctx.sound.clunk(this.tutCenter3());
    if (this.tAz === OBS_TUT.answer) setTimeout(() => this.teach(), 500);
    else { this.tShake = 1; this.tLock = 2.5; this.tLeverT = 2.5; setTimeout(() => this.ctx.sound.wrong(this.tutCenter3()), 300); }
  }
  update(dt, t) {
    this.lock -= dt; this.tLock -= dt;
    this.leverT = Math.max(0, this.leverT - dt); this.tLeverT = Math.max(0, this.tLeverT - dt);
    this.shake = Math.max(0, this.shake - dt); this.tShake = Math.max(0, this.tShake - dt);
    const goalYaw = (this.az * Math.PI * 2) / OBS.azSteps;
    if (goalYaw < this.yaw - 0.5) this.yaw -= Math.PI * 2;
    this.yaw = damp(this.yaw, goalYaw, 4, dt);
    this.pitch = damp(this.pitch, EL[this.el], this.el === 0 ? 6 : 4, dt);
    this.yoke.rotation.y = this.yaw + Math.sin(t * 40) * 0.02 * this.shake;
    this.tube.rotation.x = -this.pitch;
    this.azWheel.rotation.z = damp(this.azWheel.rotation.z, this.wheelSpin.az, 5, dt);
    this.elWheel.rotation.z = damp(this.elWheel.rotation.z, this.wheelSpin.el, 5, dt);
    this.lever.rotation.x = this.leverT > 0 ? -0.9 * Math.min(1, this.leverT * 2) : damp(this.lever.rotation.x, 0, 3, dt);
    const tg = (this.tAz * Math.PI * 2) / OBS_TUT.steps;
    if (tg < this.tYaw - 0.3) this.tYaw -= Math.PI * 2;
    this.tYaw = damp(this.tYaw, tg, 6, dt);
    this.tTube.rotation.y = this.tYaw + Math.sin(t * 40) * 0.05 * this.tShake;
    this.tLever.rotation.x = this.tLeverT > 0 ? -0.9 * Math.min(1, this.tLeverT * 2) : 0;
    setGlow(this.tLensMat, this.tutSolved ? 3 : 0.3);
    setGlow(this.lensMat, this.solved ? 3.5 : this.tutSolved ? 0.4 : 0.15);
    if (this.solved) {
      const o = new THREE.Vector3(0, 0, 2.25).applyMatrix4(this.tube.matrixWorld);
      const dir = new THREE.Vector3(0, 0, 1).transformDirection(this.tube.matrixWorld);
      setBeam(this.starBeam, o, o.clone().addScaledVector(dir, 400), 1);
      setGlow(this.starMat, 1.5 + Math.sin(t * 3) * 0.3);
    }
  }
  hintPoint() {
    if (!this.tutSolved) return this.tutCenter3();
    return this.visitedCarving ? this.center3() : new THREE.Vector3(OBS.carving.x, terrainH(OBS.carving.x, OBS.carving.z) + 1.5, OBS.carving.z);
  }
  getState() { return { ts: this.tutSolved, s: this.solved, ta: this.tAz, a: this.az, e: this.el }; }
  setState(o) {
    this.tutSolved = !!o.ts; this.solved = !!o.s;
    if (typeof o.ta === 'number') this.tAz = o.ta;
    if (typeof o.a === 'number') this.az = o.a;
    if (typeof o.e === 'number') this.el = o.e;
    this.yaw = (this.az * Math.PI * 2) / OBS.azSteps; this.pitch = EL[this.el];
    this.tYaw = (this.tAz * Math.PI * 2) / OBS_TUT.steps;
    if (this.solved) this.lock = 99;
    this.yoke.rotation.y = this.yaw; this.tube.rotation.x = -this.pitch;
    this.yoke.updateMatrixWorld(true);
  }
}

// ---------------------------------------------------------------------------------------------
// Lighthouse: open exactly the shutters that look out on a lit beacon, then pull the lever.
class Lighthouse extends Puzzle {
  constructor(ctx) {
    super(ctx, 4);
    const { scene, sound } = ctx;
    const Y = 5;
    const n = LIGHT.n;
    this.answer = new Array(n).fill(false);
    for (let i = 0; i < 4; i++) {
      const B = BEACONS[i];
      const a = Math.atan2(B.z - LIGHT.z, B.x - LIGHT.x);
      const k = ((Math.round(a / ((Math.PI * 2) / n)) % n) + n) % n;
      this.answer[k] = true;
    }
    this.open = this.answer.map((v) => !v);
    this.lock = 0; this.leverT = 0;
    const panel = new Builder();
    panel.box(1.9, 2.3, 0.12, 0x4a4a52, 0.95, 0, 0);
    for (const yy of [-0.8, 0, 0.8]) panel.box(1.9, 0.12, 0.16, 0x2e2e34, 0.95, yy, 0);
    for (const xx of [0.2, 1.7]) for (const yy of [-1, 1]) panel.add(G.sphere, 0x8a8a90, mat4(xx, yy, 0.09, 0, 0, 0, 0.05, 0.05, 0.05));
    const pg = panel.build();
    this.shutters = [];
    for (let k = 0; k < n; k++) {
      const a = shutterAngle(k, n), dx = Math.cos(a), dz = Math.sin(a);
      const cx = LIGHT.x + dx * LIGHT.shutterR, cz = LIGHT.z + dz * LIGHT.shutterR, yaw = Math.atan2(dx, dz);
      const P = local(cx, cz, yaw);
      const hinge = P(-0.95, 0);
      const m = new THREE.Mesh(pg, vc);
      m.castShadow = m.receiveShadow = true;
      m.position.set(hinge.x, Y + 1.3, hinge.z);
      scene.add(m);
      const sh = { k, m, yaw, ang: this.open[k] ? 1 : 0, lock: 0, c: new THREE.Vector3(cx, Y + 1.2, cz), col: addBox(cx, cz, 0.95, 0.12, yaw, Y - 1, Y + 2.6, false) };
      this.shutters.push(sh);
      this.item(sh.c, () => this.toggle(sh), () => this.tutSolved && !this.solved && this.lock <= 0 && sh.lock <= 0, 2.0);
    }
    // lever by the door
    const lb = new Builder();
    lb.cyl(0.2, 1.0, 0x6e6a62, LIGHT.lever.x, Y + 0.5, LIGHT.lever.z, 0, 0, 0, 6);
    meshOf(lb, scene);
    addCircle(LIGHT.lever.x, LIGHT.lever.z, 0.3);
    const lv = new Builder();
    lv.box(0.08, 0.75, 0.08, 0x2a2420, 0, 0.37, 0);
    lv.add(G.sphere, 0xc83a2a, mat4(0, 0.76, 0, 0, 0, 0, 0.1, 0.1, 0.1));
    const lvg = lv.build();
    this.lever = new THREE.Mesh(lvg, vc);
    this.lever.position.set(LIGHT.lever.x, Y + 1.0, LIGHT.lever.z);
    this.lever.rotation.order = 'YXZ';
    this.lever.rotation.y = LIGHT.door.yaw;
    scene.add(this.lever);
    this.item(new THREE.Vector3(LIGHT.lever.x, Y + 0.6, LIGHT.lever.z), () => this.pull(), () => this.tutSolved && !this.solved && this.leverT <= 0 && this.lock <= 0, 1.6);
    // door glow when solved
    this.doorMat = glowMat(0xffb060);
    const dg = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 2.2), this.doorMat);
    const d = LIGHT.door;
    dg.position.set(d.x + Math.sin(d.yaw) * 0.17, Y + 1.15, d.z + Math.cos(d.yaw) * 0.17);
    dg.rotation.y = d.yaw;
    scene.add(dg);
    // tutorial lantern box with four flaps, facing a burning brazier
    const T = LIGHT_TUT, ty = terrainH(T.x, T.z) + 1.6;
    const box = new Builder();
    for (const [x, z] of [[-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4]]) box.box(0.08, 0.84, 0.08, 0x2a2420, T.x + x, ty, T.z + z);
    box.box(0.9, 0.08, 0.9, 0x2a2420, T.x, ty - 0.42, T.z);
    box.add(pyramid, 0x2a2420, mat4(T.x, ty + 0.62, T.z, 0, 0, 0, 0.7, 0.4, 0.7));
    meshOf(box, scene);
    this.tGlowMat = glowMat(0xffc070);
    const core = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), this.tGlowMat);
    core.position.set(T.x, ty, T.z);
    scene.add(core);
    this.tOpen = [true, true, false, false];
    this.tAnswer = [false, false, false, true];
    const fl = new Builder();
    fl.box(0.74, 0.74, 0.05, 0x5a5a62, 0, -0.37, 0);
    const flg = fl.build();
    this.flaps = [];
    for (let k = 0; k < 4; k++) {
      const a = shutterAngle(k, 4), dx = Math.cos(a), dz = Math.sin(a);
      const m = new THREE.Mesh(flg, vc);
      m.position.set(T.x + dx * 0.42, ty + 0.37, T.z + dz * 0.42);
      m.rotation.order = 'YXZ';
      m.rotation.y = Math.atan2(dx, dz);
      m.castShadow = true;
      scene.add(m);
      const f = { k, m, ang: this.tOpen[k] ? 1 : 0, lock: 0 };
      this.flaps.push(f);
      this.item(new THREE.Vector3(T.x + dx * 0.6, ty - 0.6, T.z + dz * 0.6), () => this.toggleTut(f), () => !this.tutSolved && f.lock <= 0 && this.tLock <= 0, 1.3);
    }
    this.tLock = 0; this.tLeverT = 0;
    const tlv = new THREE.Mesh(lvg, vc);
    const tlb = new Builder();
    const tly = terrainH(T.lever.x, T.lever.z);
    tlb.cyl(0.15, 0.8, 0x6e6a62, T.lever.x, tly + 0.4, T.lever.z, 0, 0, 0, 6);
    meshOf(tlb, scene);
    addCircle(T.lever.x, T.lever.z, 0.25);
    tlv.position.set(T.lever.x, tly + 0.8, T.lever.z);
    tlv.rotation.order = 'YXZ';
    tlv.scale.setScalar(0.7);
    scene.add(tlv);
    this.tLever = tlv;
    this.item(new THREE.Vector3(T.lever.x, tly + 0.5, T.lever.z), () => this.pullTut(), () => !this.tutSolved && this.tLeverT <= 0 && this.tLock <= 0, 1.3);
    const bf = new Fire(0.45, { embers: 14, gain: 6 });
    bf.group.position.set(T.brazier.x, terrainH(T.brazier.x, T.brazier.z) + 1.35, T.brazier.z);
    bf.set(1, true);
    scene.add(bf.group);
    this.brazier = bf;
    sound.setFire(sound.addFire(T.brazier.x, 6.5, T.brazier.z), 0.7);
    this.area = { x: LIGHT.x, z: LIGHT.z, r: 18 };
  }
  center3() { return new THREE.Vector3(LIGHT.x, 7, LIGHT.z); }
  tutCenter3() { return new THREE.Vector3(LIGHT_TUT.x, 6.5, LIGHT_TUT.z); }
  toggle(sh) { this.open[sh.k] = !this.open[sh.k]; sh.lock = 0.7; this.ctx.sound.grind(sh.c, 0.6); this.ctx.changed(); }
  toggleTut(f) { this.tOpen[f.k] = !this.tOpen[f.k]; f.lock = 0.5; this.ctx.sound.click(this.tutCenter3()); this.ctx.changed(); }
  pull() {
    this.leverT = 1.2;
    this.ctx.sound.clunk(this.center3());
    if (this.open.every((v, i) => v === this.answer[i])) setTimeout(() => this.win(), 800);
    else {
      this.lock = 4.5; this.leverT = 4.5;
      setTimeout(() => {
        this.open = this.open.map(() => false);
        this.ctx.sound.wrong(this.center3());
        this.ctx.changed();
      }, 600);
    }
  }
  pullTut() {
    this.tLeverT = 1;
    this.ctx.sound.clunk(this.tutCenter3());
    if (this.tOpen.every((v, i) => v === this.tAnswer[i])) setTimeout(() => this.teach(), 600);
    else {
      this.tLock = 2.5; this.tLeverT = 2.5;
      setTimeout(() => { this.tOpen = [false, false, false, false]; this.ctx.sound.wrong(this.tutCenter3()); this.ctx.changed(); }, 400);
    }
  }
  update(dt, t) {
    this.lock -= dt; this.tLock -= dt;
    this.leverT = Math.max(0, this.leverT - dt); this.tLeverT = Math.max(0, this.tLeverT - dt);
    for (const sh of this.shutters) {
      sh.lock -= dt;
      sh.ang = damp(sh.ang, this.open[sh.k] ? 1 : 0, 6, dt);
      sh.m.rotation.y = sh.yaw + sh.ang * 1.75;
      sh.col.y1 = sh.ang > 0.5 ? -100 : 7.6;
    }
    for (const f of this.flaps) {
      f.lock -= dt;
      f.ang = damp(f.ang, this.tOpen[f.k] ? 1 : 0, 7, dt);
      f.m.rotation.x = -f.ang * 1.6;
    }
    this.lever.rotation.x = this.leverT > 0 ? -0.9 : damp(this.lever.rotation.x, 0, 3, dt);
    this.tLever.rotation.x = this.tLeverT > 0 ? -0.9 : damp(this.tLever.rotation.x, 0, 3, dt);
    setGlow(this.tGlowMat, this.tutSolved ? 3 + Math.sin(t * 4) * 0.3 : 0.12);
    setGlow(this.doorMat, this.solved ? 2.4 + Math.sin(t * 3) * 0.3 : 0.05);
    this.brazier.update(dt);
  }
  hintPoint() { return this.tutSolved ? this.center3() : this.tutCenter3(); }
  getState() { return { ts: this.tutSolved, s: this.solved, to: this.tOpen.slice(), o: this.open.slice() }; }
  setState(o) {
    this.tutSolved = !!o.ts; this.solved = !!o.s;
    if (o.to && o.to.length === 4) this.tOpen = o.to.slice();
    if (o.o && o.o.length === LIGHT.n) this.open = o.o.slice();
    for (const sh of this.shutters) sh.ang = this.open[sh.k] ? 1 : 0;
    for (const f of this.flaps) f.ang = this.tOpen[f.k] ? 1 : 0;
  }
}

// ---------------------------------------------------------------------------------------------
export class Puzzles {
  constructor(ctx) {
    this.ctx = ctx;
    this.list = [new Village(ctx), new Ring(ctx), new Wreck(ctx), new Observatory(ctx), new Lighthouse(ctx)];
    this.items = this.list.flatMap((p) => p.items);
    // lighting the beacons
    const { beacons, player } = ctx;
    beacons.list.forEach((b, i) => {
      const pos = b.B.great
        ? new THREE.Vector3(LIGHT.door.x + Math.sin(LIGHT.door.yaw) * 0.8, 5.5, LIGHT.door.z + Math.cos(LIGHT.door.yaw) * 0.8)
        : new THREE.Vector3(b.B.x, b.base + 0.5, b.B.z + 1.2);
      this.items.push({
        pos, r: b.B.great ? 1.8 : 2.8, beacon: i,
        active: () => b.ready && !b.lit && !b.igniting,
        press: () => { player.lift(2.2); setTimeout(() => beacons.ignite(i), 500); },
      });
    });
    this.lastPress = -1e9;
  }
  find(player) {
    let best = null, bs = 1e9;
    const fx = Math.sin(player.yaw), fz = Math.cos(player.yaw);
    for (const it of this.items) {
      const dx = it.pos.x - player.pos.x, dz = it.pos.z - player.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > it.r || Math.abs(it.pos.y - player.pos.y) > 3) continue;
      if (!it.active()) continue;
      const facing = d > 0.01 ? (dx * fx + dz * fz) / d : 1;
      const score = d - facing * 0.8;
      if (score < bs) { bs = score; best = it; }
    }
    return best;
  }
  update(dt, t, player) {
    for (const p of this.list) p.update(dt, t, player);
    const C = OBS.carving;
    if (Math.hypot(player.pos.x - C.x, player.pos.z - C.z) < 4) this.list[3].visitedCarving = true;
  }
  near(pos, r = 9) {
    for (const it of this.items) if (it.active() && Math.hypot(it.pos.x - pos.x, it.pos.z - pos.z) < r) return true;
    return false;
  }
  getState() { return this.list.map((p) => p.getState()); }
  setState(arr) { if (Array.isArray(arr)) arr.forEach((o, i) => o && this.list[i] && this.list[i].setState(o)); }
}
