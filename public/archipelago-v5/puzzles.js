// Five Lights — the five beacons and the puzzles that earn them.
//  0 village   : sequence of glass floats, order read from the tide pole (bottom → top)
//  1 shipwreck : light the stern lamp, then set three carved mirrors; the beam appears only when all is set
//  2 monoliths : linked stones; tune the ring by ear and eye until no stone beats against the altar
//  3 observatory: aim the re-set telescope; azimuth from the floor inlay/sightline, elevation from the trail tablet
//  4 lighthouse: point each plinth's sight-arm at the beacon its carving depicts
import * as THREE from './three.module.min.js';
import { toon, srgb, clamp, damp, mulberry32, wrapAngle, inst } from './util.js';
import { groundAt, LAYOUT, CAUSEWAYS, ISL } from './terrain.js';
import { addCircle, addBox } from './colliders.js';
import { Fire } from './fire.js';
import { MAT, hullGeometry } from './world.js';

const TAU = Math.PI * 2;
const ry = (a) => -a;
function M(parent, geo, mat, x = 0, y = 0, z = 0, rotY = 0, cast = true) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z); m.rotation.y = rotY; m.castShadow = cast; m.receiveShadow = true;
  parent.add(m); return m;
}
function glowMat(r, g, b) { return new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b) }); }
const beamMat = () => new THREE.MeshBasicMaterial({ color: new THREE.Color(4.0, 3.0, 1.6), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
const UP = new THREE.Vector3(0, 1, 0);
class Beam {
  constructor(parent, a, b, r = 0.14, mat = beamMat()) {
    this.a = a.clone(); this.b = b.clone();
    this.dir = b.clone().sub(a); this.len = this.dir.length(); this.dir.normalize();
    this.mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, 8, 1, true), mat);
    this.mesh.quaternion.setFromUnitVectors(UP, this.dir);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    this.mesh.castShadow = false;
    parent.add(this.mesh);
    this.set(0);
  }
  set(p) {
    this.p = p;
    this.mesh.visible = p > 0.001;
    const l = Math.max(this.len * p, 0.001);
    this.mesh.scale.set(1, l, 1);
    this.mesh.position.copy(this.a).addScaledVector(this.dir, l / 2);
  }
}

function brazier(parent, x, y, z, size = 1, fireSize = 2.2) {
  const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g);
  M(g, new THREE.CylinderGeometry(0.75 * size, 0.95 * size, 1.0 * size, 8), MAT.stone, 0, 0.5 * size, 0);
  M(g, new THREE.CylinderGeometry(1.1 * size, 0.6 * size, 0.55 * size, 10, 1, true), toon(srgb(0.2, 0.18, 0.18), { side: THREE.DoubleSide }), 0, 1.25 * size, 0);
  const coalsMat = glowMat(0.06, 0.05, 0.05);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    M(g, new THREE.DodecahedronGeometry(0.28 * size, 0), coalsMat, Math.cos(a) * 0.45 * size, 1.15 * size, Math.sin(a) * 0.45 * size, a, false);
  }
  M(g, new THREE.DodecahedronGeometry(0.32 * size, 0), coalsMat, 0, 1.2 * size, 0, 0, false);
  const fire = new Fire(fireSize, { embers: 46 });
  fire.group.position.y = 1.2 * size;
  g.add(fire.group);
  addCircle(x, z, 1.0 * size, y - 1, y + 1.6 * size);
  return { group: g, coalsMat, fire, base: new THREE.Vector3(x, y + 1.2 * size, z) };
}

export class Puzzles {
  constructor(scene, world, hooks) {
    this.scene = scene;
    this.world = world;
    this.hooks = hooks; // { sound, player, onBeaconLit, pan(x,z) }
    this.root = new THREE.Group(); scene.add(this.root);
    this.items = []; // interactables
    this.lit = [false, false, false, false, false];
    this.ready = [false, false, false, false, false];
    this.beacons = [];
    this.anim = [];
    this.time = 0;
    this.buildVillage();
    this.buildWreck();
    this.buildRing();
    this.buildObservatory();
    this.buildLighthouse();
  }
  add(item) { this.items.push(item); return item; }
  get litCount() { return this.lit.filter(Boolean).length; }
  sfx(name, x, z, ...a) { const s = this.hooks.sound; if (s[name]) s[name](this.hooks.pan(x, z), ...a); }

  // ---------------------------------------------------------- shared beacon logic
  makeBeacon(i, b) {
    this.beacons[i] = b;
    b.index = i;
    b.lightPos = b.base.clone().add(new THREE.Vector3(0, 1.6, 0));
    return b;
  }
  setReady(i) {
    if (this.ready[i]) return;
    this.ready[i] = true;
    const b = this.beacons[i];
    this.sfx('swell', b.base.x, b.base.z);
  }
  lightBeacon(i, instant = false) {
    if (this.lit[i]) return;
    this.lit[i] = true; this.ready[i] = true;
    const b = this.beacons[i];
    b.fire.setLit(true, instant);
    if (!instant) { this.sfx('ignite', b.base.x, b.base.z); this.hooks.onBeaconLit(i); }
  }
  brazierItem(i, extraOk = () => true) {
    const b = this.beacons[i];
    this.add({
      pos: b.base.clone().add(new THREE.Vector3(0, 0.3, 0)), r: 2.6, kind: 'beacon',
      enabled: () => this.ready[i] && !this.lit[i] && extraOk(),
      act: () => this.hooks.player.raise(() => this.lightBeacon(i)),
    });
  }

  // ---------------------------------------------------------- 0: village floats + tide pole
  buildVillage() {
    const V = LAYOUT.village, u = V.u, v = V.v;
    const COLORS = [srgb(0.9, 0.2, 0.16), srgb(1.0, 0.82, 0.2), srgb(0.15, 0.7, 0.68), srgb(0.95, 0.95, 0.92)];
    const ORDER = (this.vOrder = [2, 0, 3, 1]); // bottom → top on the tide pole
    this.vProgress = 0; this.vLock = 0;
    const bz = brazier(this.root, V.platform.x, V.deckH, V.platform.z, 1, 2.2);
    this.makeBeacon(0, bz);
    this.brazierItem(0);
    // floats on posts at the platform corners (corner order ≠ pole order)
    this.floats = [];
    const corners = [[1, 1], [1, -1], [-1, -1], [-1, 1]];
    corners.forEach(([a, b], i) => {
      const px = V.platform.x + u.x * a * 3.9 + v.x * b * 3.9, pz = V.platform.z + u.z * a * 3.9 + v.z * b * 3.9;
      const g = new THREE.Group(); g.position.set(px, V.deckH, pz); this.root.add(g);
      M(g, new THREE.CylinderGeometry(0.13, 0.16, 3.3, 6), MAT.woodDark, 0, 1.65, 0);
      const outA = Math.atan2(v.z * b + u.z * a, v.x * b + u.x * a);
      M(g, new THREE.BoxGeometry(2.5, 0.12, 0.12), MAT.wood, Math.cos(outA) * 1.1, 3.2, Math.sin(outA) * 1.1, ry(outA));
      const hang = new THREE.Group(); hang.position.set(Math.cos(outA) * 2.2, 3.2, Math.sin(outA) * 2.2); g.add(hang);
      M(hang, new THREE.CylinderGeometry(0.02, 0.02, 1.1, 4), MAT.rope, 0, -0.55, 0, 0, false);
      const glass = M(hang, new THREE.SphereGeometry(0.46, 14, 10), toon(COLORS[i].clone().multiplyScalar(0.7)), 0, -1.4, 0);
      const coreMat = glowMat(COLORS[i].r * 0.15, COLORS[i].g * 0.15, COLORS[i].b * 0.15);
      M(hang, new THREE.SphereGeometry(0.3, 10, 8), coreMat, 0, -1.4, 0, 0, false);
      M(hang, new THREE.TorusGeometry(0.47, 0.04, 4, 14), MAT.rope, 0, -1.4, 0, 0, false).rotation.x = Math.PI / 2;
      addCircle(px, pz, 0.25, V.deckH, V.deckH + 3.4, { cam: false });
      const f = { i, g, hang, coreMat, col: COLORS[i], on: false, swing: 0, dunk: 0, worldPos: new THREE.Vector3(px + Math.cos(outA) * 2.2, V.deckH + 1.8, pz + Math.sin(outA) * 2.2) };
      this.floats.push(f);
      this.add({
        pos: f.worldPos, r: 2.8, kind: 'float',
        enabled: () => !this.ready[0] && this.vLock <= 0,
        act: () => this.pressFloat(f),
      });
    });
    // the tide pole: four coloured bands, read from the waterline up (chevrons + leaping fish point upward)
    const P = V.pole, py = groundAt(P.x, P.z);
    const pole = new THREE.Group(); pole.position.set(P.x, py, P.z); this.root.add(pole);
    M(pole, new THREE.CylinderGeometry(0.9, 1.1, 0.5, 8), MAT.stone, 0, 0.25, 0);
    M(pole, new THREE.CylinderGeometry(0.95, 0.95, 0.12, 12), toon(srgb(0.25, 0.45, 0.75)), 0, 0.55, 0); // painted waterline
    M(pole, new THREE.CylinderGeometry(0.22, 0.28, 7.2, 8), MAT.wood, 0, 3.6, 0);
    this.poleBands = [];
    ORDER.forEach((ci, k) => {
      const y = 1.3 + k * 1.35;
      M(pole, new THREE.CylinderGeometry(0.36, 0.36, 0.5, 10), toon(COLORS[ci]), 0, y, 0);
      const gm = glowMat(0, 0, 0);
      const ring = M(pole, new THREE.TorusGeometry(0.38, 0.06, 4, 16), gm, 0, y + 0.3, 0, 0, false);
      ring.rotation.x = Math.PI / 2;
      this.poleBands.push({ gm, col: COLORS[ci] });
      // upward chevrons between bands
      if (k < 3) for (let s = 0; s < 4; s++) {
        const a = (s / 4) * TAU;
        const c = M(pole, new THREE.ConeGeometry(0.12, 0.3, 4), MAT.white, Math.cos(a) * 0.27, y + 0.68, Math.sin(a) * 0.27, 0, false);
        c.rotation.z = 0;
      }
    });
    // carved fish leaping up off the top
    const fish = new THREE.Group(); fish.position.y = 7.5; pole.add(fish);
    const body = M(fish, new THREE.SphereGeometry(0.35, 10, 8), toon(srgb(0.4, 0.62, 0.78)), 0, 0.4, 0); body.scale.set(0.6, 1.4, 0.35);
    M(fish, new THREE.ConeGeometry(0.28, 0.4, 4), toon(srgb(0.4, 0.62, 0.78)), 0, -0.2, 0).rotation.x = Math.PI;
    M(fish, new THREE.SphereGeometry(0.05, 6, 4), MAT.dark, 0.13, 0.7, 0.1, 0, false);
    addCircle(P.x, P.z, 1.1, py - 1, py + 8);
  }
  pressFloat(f) {
    const pan = [f.worldPos.x, f.worldPos.z];
    f.swing = 1;
    const pitches = [523, 659, 392, 784];
    if (this.vOrder[this.vProgress] === f.i) {
      f.on = true; this.vProgress++;
      this.sfx('chime', ...pan, pitches[f.i], 0.6);
      if (this.vProgress >= 4) this.setReady(0);
    } else {
      // wrong: every float drops into the sea and the lights go out; a few seconds lost
      this.sfx('chime', ...pan, pitches[f.i] * 0.94, 0.4);
      this.sfx('wrong', ...pan);
      this.vProgress = 0;
      this.vLock = 4.0;
      for (const o of this.floats) { o.on = false; o.dunk = 4.0; }
    }
  }
  updateVillage(dt) {
    if (this.vLock > 0) this.vLock -= dt;
    const water = this.hooks.water();
    const V = LAYOUT.village;
    let k = 0;
    for (const f of this.floats) {
      f.swing = damp(f.swing, 0, 1.5, dt);
      f.hang.rotation.z = Math.sin(this.time * 7) * 0.35 * f.swing;
      let off = 0;
      if (f.dunk > 0) {
        f.dunk -= dt;
        const t = 1 - f.dunk / 4; // 0→1
        const depth = V.deckH + 1.8 - water + 0.5;
        off = -depth * Math.sin(Math.PI * Math.min(1, t * 1.25));
        if (f.dunk <= 0) off = 0;
      }
      f.hang.position.y = 3.2 + off;
      const lit = f.on || this.ready[0];
      const pulse = lit ? 3.2 + Math.sin(this.time * 3 + f.i) * 0.4 : 0.15;
      f.coreMat.color.copy(f.col).multiplyScalar(pulse);
    }
    // the pole bands light with progress (and stay lit once solved)
    const prog = this.ready[0] ? 4 : this.vProgress;
    this.poleBands.forEach((b, i) => b.gm.color.copy(b.col).multiplyScalar(i < prog ? 3 : 0.05));
  }

  // ---------------------------------------------------------- 1: shipwreck lamp + mirrors
  buildWreck() {
    const F = LAYOUT.forest;
    const gy = (p) => groundAt(p.x, p.z);
    const H = 1.7;
    // lamp on a post at the stern
    const lg = new THREE.Group(); lg.position.set(F.lamp.x, gy(F.lamp), F.lamp.z); this.root.add(lg);
    M(lg, new THREE.CylinderGeometry(0.14, 0.18, H + 0.2, 6), MAT.woodDark, 0, (H + 0.2) / 2, 0);
    M(lg, new THREE.BoxGeometry(0.7, 0.08, 0.7), MAT.brass, 0, H - 0.35, 0);
    M(lg, new THREE.BoxGeometry(0.7, 0.08, 0.7), MAT.brass, 0, H + 0.45, 0);
    for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) M(lg, new THREE.BoxGeometry(0.06, 0.8, 0.06), MAT.brass, a * 0.32, H + 0.05, b * 0.32, 0, false);
    M(lg, new THREE.ConeGeometry(0.55, 0.45, 4), MAT.brass, 0, H + 0.7, 0, Math.PI / 4);
    this.lampFire = new Fire(0.6, { embers: 6, glow: 0.8 });
    this.lampFire.group.position.y = H - 0.3;
    lg.add(this.lampFire.group);
    addCircle(F.lamp.x, F.lamp.z, 0.45, gy(F.lamp) - 1, gy(F.lamp) + H + 1, { cam: false });
    this.lampLit = false;
    const lampPos = new THREE.Vector3(F.lamp.x, gy(F.lamp) + H, F.lamp.z);
    this.add({ pos: lampPos, r: 2.4, kind: 'lamp', enabled: () => !this.lampLit, act: () => this.hooks.player.raise(() => { this.lampLit = true; this.lampFire.setLit(true); this.sfx('ignite', F.lamp.x, F.lamp.z, 0.4); }) });
    // beacon on a rocky knoll
    const by = gy(F.beacon);
    M(this.root, new THREE.DodecahedronGeometry(1.8, 0), MAT.stoneDark, F.beacon.x, by + 0.2, F.beacon.z, 0.4).scale.y = 0.6;
    const bz = brazier(this.root, F.beacon.x, by + 0.9, F.beacon.z, 1, 2.2);
    this.makeBeacon(1, bz);
    // mirrors
    const route = [lampPos, ...F.mirrors.map((m) => new THREE.Vector3(m.x, gy(m) + H, m.z)), bz.base.clone().add(new THREE.Vector3(0, 0.4, 0))];
    this.route = route;
    const rng = mulberry32(77);
    this.mirrors = F.mirrors.map((m, k) => {
      const p = route[k + 1], prev = route[k], next = route[k + 2];
      const a = new THREE.Vector3().subVectors(prev, p).setY(0).normalize(), b = new THREE.Vector3().subVectors(next, p).setY(0).normalize();
      const n = a.add(b).normalize();
      const correctA = Math.atan2(n.z, n.x);
      const opts = [correctA, correctA + 0.75, correctA - 0.75];
      const perm = [[0, 1, 2], [1, 0, 2], [2, 1, 0], [1, 2, 0]][Math.floor(rng() * 4)];
      const options = perm.map((i) => opts[i]);
      const correct = options.indexOf(correctA);
      const g = new THREE.Group(); g.position.set(m.x, gy(m), m.z); this.root.add(g);
      M(g, new THREE.CylinderGeometry(0.85, 1.0, 0.6, 10), MAT.stone, 0, 0.3, 0);
      // carved notches on the base, one per allowed position
      for (const oa of options) M(g, new THREE.BoxGeometry(0.4, 0.05, 0.12), MAT.dark, Math.cos(oa) * 0.7, 0.61, Math.sin(oa) * 0.7, ry(oa), false);
      M(g, new THREE.CylinderGeometry(0.1, 0.12, H - 0.6, 6), MAT.woodDark, 0, 0.6 + (H - 0.6) / 2, 0);
      const head = new THREE.Group(); head.position.y = H; g.add(head);
      M(head, new THREE.BoxGeometry(0.16, 1.25, 1.25), MAT.woodDark, -0.05, 0, 0);
      M(head, new THREE.BoxGeometry(0.04, 1.05, 1.05), glowMat(1.1, 1.2, 1.3), 0.06, 0, 0, 0, false);
      // brass pointer on the base collar shows which notch it sits in
      M(head, new THREE.ConeGeometry(0.12, 0.45, 4), MAT.brass, 0.5, -H + 0.68, 0, 0).rotation.z = -Math.PI / 2;
      addCircle(m.x, m.z, 0.9, gy(m) - 1, gy(m) + H + 0.8);
      const st = { g, head, options, correct, idx: (correct + 1) % 3, shown: 0, pos: p };
      st.shown = options[st.idx];
      this.add({ pos: p.clone(), r: 2.4, kind: 'mirror', enabled: () => !this.lit[1] && !this.beamGoing, act: () => {
        st.idx = (st.idx + 1) % 3; this.sfx('click', m.x, m.z); this.checkWreck();
      } });
      return st;
    });
    // pale flagstones trace the route the light must travel
    const fg = new THREE.CylinderGeometry(0.45, 0.5, 0.12, 6);
    const flags = [];
    for (let k = 0; k < route.length - 1; k++) {
      const a = route[k], b = route[k + 1];
      const L = Math.hypot(b.x - a.x, b.z - a.z);
      for (let s = 1.6; s < L - 1.2; s += 1.5) flags.push([a.x + (b.x - a.x) * (s / L), a.z + (b.z - a.z) * (s / L)]);
    }
    const im = new THREE.InstancedMesh(fg, toon(srgb(0.88, 0.85, 0.76)), flags.length);
    const m4 = new THREE.Matrix4();
    flags.forEach(([x, z], i) => { m4.makeRotationY(i * 1.3); m4.setPosition(x, groundAt(x, z) + 0.02, z); im.setMatrixAt(i, m4); });
    im.receiveShadow = true;
    this.root.add(im);
    // beams (hidden until the whole route is set with the lamp lit)
    this.beams = [];
    for (let k = 0; k < route.length - 1; k++) this.beams.push(new Beam(this.root, route[k], route[k + 1], 0.12));
    this.beamGoing = false; this.beamT = 0;
  }
  checkWreck() {
    if (this.lit[1] || this.beamGoing) return;
    if (this.lampLit && this.mirrors.every((m) => m.idx === m.correct)) { this.beamGoing = true; this.beamT = 0; }
  }
  updateWreck(dt) {
    this.lampFire.update(dt, this.hooks.night());
    for (const m of this.mirrors) {
      m.shown = m.shown + wrapAngle(m.options[m.idx] - m.shown) * (1 - Math.exp(-10 * dt));
      m.head.rotation.y = ry(m.shown);
    }
    if (!this.beamGoing && !this.lit[1]) this.checkWreck();
    if (this.beamGoing || this.lit[1]) {
      this.beamT += dt * 1.6;
      const n = this.beams.length;
      this.beams.forEach((b, k) => b.set(clamp(this.beamT - k, 0, 1)));
      if (this.beamT >= n && !this.lit[1]) { this.beamGoing = false; this.lightBeacon(1); }
    }
  }

  // ---------------------------------------------------------- 2: humming monolith ring
  buildRing() {
    const R = LAYOUT.ring, C = R.c;
    const y = groundAt(C.x, C.z);
    this.ringN = 5; this.ringTarget = 2;
    this.levels = [0, 0, 0, 0, 0];
    // start = solved minus the effect of three presses (stone 1 once, stone 3 twice),
    // so a listener who follows the linkage can tune it in a handful of presses
    this.levels = [1, 1, 4, 0, 0];
    this.stones = [];
    const bandGeo = new THREE.BoxGeometry(1.85, 0.22, 1.25);
    const barn = new THREE.SphereGeometry(0.16, 6, 4);
    const barnMat = toon(srgb(0.86, 0.84, 0.76));
    for (let k = 0; k < 5; k++) {
      const a = Math.PI / 2 + (k / 5) * TAU;
      const x = C.x + Math.cos(a) * R.radius, z = C.z + Math.sin(a) * R.radius;
      const gy = groundAt(x, z);
      const g = new THREE.Group(); g.position.set(x, gy, z); g.rotation.y = ry(a + Math.PI / 2); this.root.add(g);
      const st = M(g, new THREE.BoxGeometry(1.6, 6.4, 1.0), toon(srgb(0.5, 0.52, 0.55)), 0, 3.0, 0);
      st.rotation.z = (k % 2 ? 1 : -1) * 0.04;
      M(g, new THREE.BoxGeometry(1.3, 0.6, 0.8), toon(srgb(0.5, 0.52, 0.55)), 0, 6.4, 0).rotation.z = 0.2;
      // five carved grooves = the five pitches
      for (let l = 0; l < 5; l++) M(g, new THREE.BoxGeometry(1.64, 0.07, 1.04), MAT.dark, 0, 1 + l, 0, 0, false);
      // barnacles crusting the base
      const bl = [];
      for (let b = 0; b < 30; b++) {
        const onFace = Math.random() < 0.5, by = Math.random() * Math.random() * 2.4;
        const x = onFace ? (Math.random() - 0.5) * 1.6 : (Math.random() < 0.5 ? -0.82 : 0.82);
        const z = onFace ? (Math.random() < 0.5 ? -0.52 : 0.52) : (Math.random() - 0.5) * 1.0;
        bl.push({ x, y: by, z, sx: 0.7 + Math.random() * 0.6, sy: 0.5, sz: 0.7 + Math.random() * 0.6 });
      }
      inst(g, barn, barnMat, bl);
      const bandMat = glowMat(0.2, 1.4, 1.3);
      const band = M(g, bandGeo, bandMat, 0, 1 + this.levels[k], 0, 0, false);
      addBox(x, z, 0.8, 0.5, a + Math.PI / 2, gy - 1, gy + 7);
      const s = { k, g, band, bandMat, shown: this.levels[k], pulse: 0, pos: new THREE.Vector3(x, gy + 1.6, z) };
      this.stones.push(s);
      // interact from inside the ring
      const ip = new THREE.Vector3(C.x + Math.cos(a) * (R.radius - 1.5), gy + 1.6, C.z + Math.sin(a) * (R.radius - 1.5));
      this.add({ pos: ip, r: 2.2, kind: 'stone', enabled: () => !this.ready[2], act: () => {
        this.ringPress(k); this.sfx('click', x, z);
        for (const j of [k - 1, k, k + 1]) this.stones[(j + 5) % 5].pulse = 1;
        for (const v of this.veins) if (v.a === k || v.b === k) v.pulse = 1;
        if (this.levels.every((l) => l === this.ringTarget)) this.setReady(2);
      } });
    }
    // glowing veins in the ground link each stone to its neighbours
    this.veins = [];
    for (let k = 0; k < 5; k++) {
      const A = this.stones[k].g.position, B = this.stones[(k + 1) % 5].g.position;
      const mid = A.clone().add(B).multiplyScalar(0.5);
      const L = A.distanceTo(B);
      const vm = glowMat(0.05, 0.3, 0.28);
      const vein = M(this.root, new THREE.BoxGeometry(L - 1.4, 0.06, 0.18), vm, mid.x, groundAt(mid.x, mid.z) + 0.05, mid.z, ry(Math.atan2(B.z - A.z, B.x - A.x)), false);
      this.veins.push({ a: k, b: (k + 1) % 5, vm, pulse: 0, mesh: vein });
    }
    // the altar obelisk: the reference pitch, its band fixed in the middle groove
    const ag = new THREE.Group(); ag.position.set(C.x, y, C.z); this.root.add(ag);
    M(ag, new THREE.CylinderGeometry(0.55, 0.75, 6.0, 6), toon(srgb(0.42, 0.44, 0.48)), 0, 3.0, 0);
    for (let l = 0; l < 5; l++) M(ag, new THREE.CylinderGeometry(0.6, 0.6, 0.07, 6), MAT.dark, 0, 1 + l, 0, 0, false);
    this.altarMat = glowMat(0.3, 1.6, 1.5);
    M(ag, new THREE.CylinderGeometry(0.66, 0.66, 0.22, 6), this.altarMat, 0, 1 + this.ringTarget, 0, 0, false);
    M(ag, new THREE.CylinderGeometry(1.4, 1.6, 0.4, 6), MAT.stone, 0, 0.2, 0);
    addCircle(C.x, C.z, 0.9, y - 1, y + 6.5);
    // beacon on a cairn outside the ring
    const B = R.beacon, by = groundAt(B.x, B.z);
    const bz = brazier(this.root, B.x, by, B.z, 1.1, 2.4);
    this.makeBeacon(2, bz);
    this.brazierItem(2);
  }
  ringPress(k, silent = false) {
    for (const j of [k - 1, k, k + 1]) { const i = (j + 5) % 5; this.levels[i] = (this.levels[i] + 1) % 5; }
  }
  ringFreq(l) { return 196 * (1 + (l - this.ringTarget) * 0.022); }
  updateRing(dt, playerPos) {
    const C = LAYOUT.ring.c;
    const d = Math.hypot(playerPos.x - C.x, playerPos.z - C.z);
    const snd = this.hooks.sound;
    snd.ensureHum && snd.ensureHum(5);
    const solved = this.ready[2];
    const vol = (d < 10.5 ? 0.55 : 0.55 * Math.max(0, 1 - (d - 10.5) / 30)) * (solved ? 0.5 : 1);
    snd.setHum && snd.setHum(this.levels.map((l) => this.ringFreq(l)), vol);
    const f0 = this.ringFreq(this.ringTarget);
    for (const s of this.stones) {
      const l = this.levels[s.k];
      // band slides when its level changes; wrapping 4→0 drops it back to the bottom groove
      if (l < s.shown - 0.5) s.shown = damp(s.shown, l, 6, dt); else s.shown = damp(s.shown, l, 8, dt);
      s.band.position.y = 1 + s.shown;
      // flicker at the beat frequency it makes against the altar: still when in tune
      const beat = Math.abs(this.ringFreq(l) - f0);
      const fl = beat < 0.01 ? 1 : 0.55 + 0.45 * Math.cos(TAU * beat * this.time);
      s.pulse = damp(s.pulse, 0, 3, dt);
      const g = (solved ? 2.4 : 1.3) * fl + s.pulse * 2;
      s.bandMat.color.setRGB(0.2 * g, 1.1 * g, 1.0 * g);
    }
    for (const v of this.veins) { v.pulse = damp(v.pulse, 0, 2.5, dt); const g = 0.25 + v.pulse * 2.5 + (solved ? 1.2 : 0); v.vm.color.setRGB(0.1 * g, 1.0 * g, 0.9 * g); }
    this.altarMat.color.setRGB(0.35 * 1.8, 1.8, 1.6);
  }

  // ---------------------------------------------------------- 3: observatory telescope
  buildObservatory() {
    const P = LAYOUT.peak, S = P.c;
    const y = groundAt(S.x, S.z) + 0.15;
    this.az = 0; this.el = 0; this.azShown = 0; this.elShown = 0; this.obsSwingBack = 0;
    const g = new THREE.Group(); g.position.set(S.x, y, S.z); this.root.add(g);
    // azimuth ring of 12 notches, the inlaid brass line + star marks the sightline
    inst(g, new THREE.BoxGeometry(0.5, 0.04, 0.1), MAT.dark, Array.from({ length: P.azSteps }, (_, i) => {
      const a = (i / P.azSteps) * TAU; return { x: Math.cos(a) * 2.4, y: 0.02, z: Math.sin(a) * 2.4, ry: ry(a) };
    }));
    const ta = (P.azTarget / P.azSteps) * TAU;
    const inlayMat = toon(srgb(0.95, 0.75, 0.3), { emissive: srgb(0.35, 0.22, 0.05) });
    M(g, new THREE.BoxGeometry(4.6, 0.04, 0.2), inlayMat, Math.cos(ta) * 4.1, 0.03, Math.sin(ta) * 4.1, ry(ta), false);
    const star = new THREE.Group(); star.position.set(Math.cos(ta) * 6.7, 0.04, Math.sin(ta) * 6.7); g.add(star);
    for (let i = 0; i < 4; i++) M(star, new THREE.BoxGeometry(1.2, 0.04, 0.18), inlayMat, 0, 0, 0, (i * Math.PI) / 4, false).scale.x = i % 2 ? 0.6 : 1;
    // pedestal + rotating fork + tube
    M(g, new THREE.CylinderGeometry(0.6, 0.95, 1.5, 10), MAT.stoneDark, 0, 0.75, 0);
    const azG = (this.azG = new THREE.Group()); azG.position.y = 1.5; g.add(azG);
    M(azG, new THREE.CylinderGeometry(0.7, 0.7, 0.2, 12), MAT.brass, 0, 0.1, 0);
    for (const s of [-0.55, 0.55]) M(azG, new THREE.BoxGeometry(0.25, 1.2, 0.12), MAT.brass, 0, 0.7, s);
    const elG = (this.elG = new THREE.Group()); elG.position.y = 1.15; azG.add(elG);
    const tube = new THREE.CylinderGeometry(0.34, 0.42, 4.4, 14, 1, true); tube.rotateZ(-Math.PI / 2);
    M(elG, tube, toon(srgb(0.2, 0.32, 0.42), { side: THREE.DoubleSide }), 0.6, 0, 0);
    for (const x of [-1.5, 0.6, 2.75]) M(elG, new THREE.TorusGeometry(0.42, 0.06, 5, 16), MAT.brass, x, 0, 0, Math.PI / 2, false);
    const ep = new THREE.CylinderGeometry(0.1, 0.12, 0.5, 8); ep.rotateZ(-Math.PI / 2);
    M(elG, ep, MAT.brass, -1.85, 0, 0);
    this.lensMat = glowMat(0.2, 0.25, 0.3);
    const lens = new THREE.CircleGeometry(0.36, 16); lens.rotateY(Math.PI / 2);
    M(elG, lens, this.lensMat, 2.78, 0, 0, 0, false);
    // elevation quadrant on the fork (4 marks)
    for (let i = 0; i < 4; i++) {
      const a = (P.elSteps[i] * Math.PI) / 180;
      const t = M(azG, new THREE.BoxGeometry(0.28, 0.05, 0.05), MAT.dark, Math.cos(a) * 0.95, 1.15 + Math.sin(a) * 0.95, 0.7, 0, false);
      t.rotation.z = a;
    }
    addCircle(S.x, S.z, 1.0, y - 1, y + 3.2);
    // controls: crank (azimuth) and lever (elevation) either side of the pedestal
    const toB = Math.atan2(P.beacon.z - S.z, P.beacon.x - S.x);
    const ca = toB + Math.PI / 2 + 0.3, la = toB - Math.PI / 2 - 0.3;
    this.crank = new THREE.Group(); this.crank.position.set(Math.cos(ca) * 0.95, 0.9, Math.sin(ca) * 0.95); this.crank.rotation.y = ry(ca); g.add(this.crank);
    M(this.crank, new THREE.TorusGeometry(0.35, 0.05, 5, 12), MAT.brass, 0.05, 0, 0, Math.PI / 2, false);
    M(this.crank, new THREE.BoxGeometry(0.06, 0.06, 0.7), MAT.brass, 0.05, 0, 0, 0, false);
    this.lever = new THREE.Group(); this.lever.position.set(Math.cos(la) * 0.95, 0.8, Math.sin(la) * 0.95); this.lever.rotation.y = ry(la); g.add(this.lever);
    this.leverArm = M(this.lever, new THREE.BoxGeometry(0.08, 0.9, 0.08), MAT.brass, 0.1, 0.4, 0, 0, false);
    M(this.leverArm, new THREE.SphereGeometry(0.1, 6, 4), MAT.red, 0, 0.45, 0, 0, false);
    const locked = () => this.ready[3] || this.obsSwingBack > 0;
    this.add({ pos: new THREE.Vector3(S.x + Math.cos(ca) * 1.2, y + 1.0, S.z + Math.sin(ca) * 1.2), r: 1.7, kind: 'crank', enabled: () => !locked(), act: () => {
      this.az = (this.az + 1) % P.azSteps; this.sfx('creak', S.x, S.z, 0.4);
    } });
    this.add({ pos: new THREE.Vector3(S.x + Math.cos(la) * 1.2, y + 1.0, S.z + Math.sin(la) * 1.2), r: 1.7, kind: 'lever', enabled: () => !locked(), act: () => {
      this.el = (this.el + 1) % P.elSteps.length; this.sfx('click', S.x, S.z);
    } });
    this.eyeItem = this.add({ pos: new THREE.Vector3(), r: 1.6, kind: 'eyepiece', enabled: () => !locked(), act: () => this.lookThrough() });
    this.obsY = y;
    // the beacon on the summit edge, overlooking the lighthouse
    const B = P.beacon, by = groundAt(B.x, B.z);
    const bz = brazier(this.root, B.x, by, B.z, 1.1, 2.6);
    this.makeBeacon(3, bz);
    this.brazierItem(3);
    // carved tablet on the trail: a quadrant with the telescope drawn at the right tilt
    const T = P.tablet, tyy = groundAt(T.x, T.z);
    const tg = new THREE.Group(); tg.position.set(T.x, tyy, T.z); tg.rotation.y = ry(T.face); this.root.add(tg);
    M(tg, new THREE.BoxGeometry(0.45, 2.4, 2.4), MAT.stone, 0, 1.2, 0);
    const face = new THREE.Group(); face.position.set(0.24, 0.55, -0.9); tg.add(face);
    M(face, new THREE.BoxGeometry(0.04, 0.06, 1.8), MAT.dark, 0, 0, 0.9, 0, false); // horizon line
    for (let i = 0; i < 4; i++) {
      const a = (P.elSteps[i] * Math.PI) / 180;
      const tk = M(face, new THREE.BoxGeometry(0.04, 0.05, 0.3), MAT.dark, 0, Math.sin(a) * 1.6, Math.cos(a) * 1.6, 0, false);
      tk.rotation.x = -a;
    }
    const ea = (P.elSteps[P.elTarget] * Math.PI) / 180;
    const rod = M(face, new THREE.BoxGeometry(0.06, 0.12, 1.5), inlayMat, 0, Math.sin(ea) * 0.75, Math.cos(ea) * 0.75, 0, false);
    rod.rotation.x = -ea;
    const st2 = new THREE.Group(); st2.position.set(0.02, Math.sin(ea) * 1.75, Math.cos(ea) * 1.75); face.add(st2);
    for (let i = 0; i < 2; i++) { const b = M(st2, new THREE.BoxGeometry(0.04, 0.3, 0.06), inlayMat, 0, 0, 0, 0, false); b.rotation.x = (i * Math.PI) / 2; }
    addBox(T.x, T.z, 0.3, 1.2, T.face, tyy - 1, tyy + 2.4);
  }
  lookThrough() {
    const P = LAYOUT.peak, S = P.c;
    if (this.az === P.azTarget && this.el === P.elTarget) {
      this.setReady(3);
      this.sfx('chime', S.x, S.z, 988, 0.5);
    } else {
      // not on the star: the old mount slips and swings back to rest
      this.sfx('creak', S.x, S.z, 1.4);
      this.obsSwingBack = 1.6;
      this.az = 0; this.el = 0;
    }
  }
  updateObservatory(dt) {
    const P = LAYOUT.peak, S = P.c;
    const azA = (this.az / P.azSteps) * TAU;
    const elA = (P.elSteps[this.el] * Math.PI) / 180;
    const k = this.obsSwingBack > 0 ? 2.5 : 7;
    if (this.obsSwingBack > 0) this.obsSwingBack -= dt;
    this.azShown = this.azShown + wrapAngle(azA - this.azShown) * (1 - Math.exp(-k * dt));
    this.elShown = damp(this.elShown, elA, k, dt);
    this.azG.rotation.y = ry(this.azShown);
    this.elG.rotation.z = this.elShown;
    this.crank.rotation.x = this.azShown * 3;
    this.leverArm.rotation.z = -0.5 + this.elShown * 1.6;
    // eyepiece world position follows the tube
    const back = -1.85;
    const ex = Math.cos(this.azShown) * Math.cos(this.elShown) * back, ez = Math.sin(this.azShown) * Math.cos(this.elShown) * back;
    this.eyeItem.pos.set(S.x + ex, this.obsY + 2.65 + Math.sin(this.elShown) * back, S.z + ez);
    const on = this.ready[3];
    const n = this.hooks.night();
    this.lensMat.color.setRGB(on ? 2.5 : 0.2 + n * 0.1, on ? 2.3 : 0.25, on ? 1.8 : 0.3);
  }

  // ---------------------------------------------------------- 4: the great lighthouse
  buildLighthouse() {
    const L = LAYOUT.light, C = L.c;
    const lh = this.world.lighthouse;
    // top fire inside the lantern room
    const top = new THREE.Vector3(C.x, lh.top + 0.8, C.z);
    const fire = new Fire(3.4, { embers: 60, glow: 1.8 });
    fire.group.position.copy(top);
    this.root.add(fire.group);
    this.makeBeacon(4, { group: fire.group, fire, coalsMat: glowMat(0, 0, 0), base: top.clone() });
    // rotating beam cones for after it's lit
    this.lhBeam = new THREE.Group(); this.lhBeam.position.copy(top).add(new THREE.Vector3(0, 1.2, 0)); this.root.add(this.lhBeam);
    const cone = new THREE.CylinderGeometry(0.6, 9, 120, 16, 1, true); cone.rotateZ(Math.PI / 2); cone.translate(60, 0, 0);
    this.lhBeamMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 0.5, 0.3), transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    for (const s of [0, Math.PI]) { const m = M(this.lhBeam, cone, this.lhBeamMat, 0, 0, 0, s, false); m.frustumCulled = false; }
    this.lhBeam.visible = false;
    // door basin where the flame is fed in
    const dd = L.doorDir;
    const bx = C.x + dd.x * 7.2, bz = C.z + dd.z * 7.2;
    this.basin = brazier(this.root, bx, groundAt(bx, bz), bz, 0.8, 1.3);
    this.add({ pos: this.basin.base.clone().add(new THREE.Vector3(0, 0.2, 0)), r: 2.4, kind: 'basin', enabled: () => this.ready[4] && !this.lit[4] && !this.climb, act: () => this.hooks.player.raise(() => {
      this.basin.fire.setLit(true); this.sfx('ignite', bx, bz, 0.6); this.climb = { t: 0 };
    }) });
    // the climbing flame
    this.climber = new Fire(0.9, { embers: 20, glow: 1.2 });
    this.climber.group.visible = false;
    this.root.add(this.climber.group);
    // plinths with sight-arms; each carries a little carving of the landmark it must point to
    const ASSIGN = (this.assign = [2, 0, 3, 1]);
    const rng = mulberry32(5);
    const tickGeo = new THREE.BoxGeometry(0.22, 0.03, 0.05);
    this.plinths = L.plinths.map((p, i) => {
      const y = groundAt(p.x, p.z);
      const g = new THREE.Group(); g.position.set(p.x, y, p.z); this.root.add(g);
      M(g, new THREE.BoxGeometry(1.3, 1.5, 1.3), MAT.stone, 0, 0.75, 0);
      inst(g, tickGeo, MAT.dark, Array.from({ length: 16 }, (_, k) => {
        const a = (k / 16) * TAU; return { x: Math.cos(a) * 0.85, y: 1.52, z: Math.sin(a) * 0.85, ry: ry(a) };
      }));
      M(g, new THREE.CylinderGeometry(0.95, 0.95, 0.06, 16), MAT.stoneDark, 0, 1.5, 0, 0, false);
      const arm = new THREE.Group(); arm.position.y = 1.75; g.add(arm);
      M(arm, new THREE.BoxGeometry(2.6, 0.12, 0.16), MAT.brass, 0.6, 0, 0);
      M(arm, new THREE.TorusGeometry(0.28, 0.05, 5, 14), MAT.brass, 1.95, 0.05, 0, Math.PI / 2, false);
      M(arm, new THREE.BoxGeometry(0.4, 0.3, 0.3), MAT.woodDark, -0.75, 0, 0);
      M(arm, new THREE.CylinderGeometry(0.2, 0.2, 0.3, 8), MAT.brass, 0, 0, 0, 0, false);
      // the landmark carving on a fixed cap above the pivot
      const icon = new THREE.Group(); icon.position.y = 2.1; g.add(icon);
      M(icon, new THREE.CylinderGeometry(0.06, 0.06, 0.35, 5), MAT.stoneDark, 0, -0.15, 0, 0, false);
      this.makeIcon(icon, ASSIGN[i]);
      // target notch: bearing from this plinth to its beacon
      const tb = this.beacons[ASSIGN[i]].base;
      let ang = Math.atan2(tb.z - p.z, tb.x - p.x); if (ang < 0) ang += TAU;
      const target = Math.round(ang / (TAU / 16)) % 16;
      let notch = Math.floor(rng() * 16); if (notch === target) notch = (notch + 5) % 16;
      addCircle(p.x, p.z, 0.95, y - 1, y + 2.4);
      const st = { g, arm, target, notch, shown: (notch / 16) * TAU, ringPos: new THREE.Vector3(), beam: null, y };
      this.add({ pos: new THREE.Vector3(p.x, y + 1.6, p.z), r: 2.3, kind: 'plinth', enabled: () => !this.ready[4], act: () => {
        st.notch = (st.notch + 1) % 16; this.sfx('click', p.x, p.z); this.checkLighthouse();
      } });
      return st;
    });
    this.lhBeamsT = 0;
  }
  makeIcon(g, which) {
    const s = 0.42;
    const stone = MAT.stone;
    if (which === 0) { // stilt house
      M(g, new THREE.BoxGeometry(0.5 * s * 2, 0.4 * s * 2, 0.5 * s * 2), MAT.white, 0, 0.3, 0, 0, false);
      const r = new THREE.ConeGeometry(0.5 * s * 2, 0.35, 4); M(g, r, MAT.red, 0, 0.68, 0, Math.PI / 4, false);
      for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) M(g, new THREE.CylinderGeometry(0.02, 0.02, 0.25, 4), MAT.woodDark, a * 0.15, 0.02, b * 0.15, 0, false);
    } else if (which === 1) { // ship
      const h = new THREE.Mesh(hullGeometry(0.9, 0.2, 0.22, 8, 5), toon(srgb(0.45, 0.32, 0.22), { side: THREE.DoubleSide }));
      h.position.y = 0.3; g.add(h);
      M(g, new THREE.CylinderGeometry(0.02, 0.02, 0.6, 4), MAT.woodDark, 0, 0.55, 0, 0, false);
      M(g, new THREE.PlaneGeometry(0.35, 0.3), MAT.sail, 0.02, 0.6, 0, Math.PI / 2, false);
    } else if (which === 2) { // ring of stones
      for (let k = 0; k < 5; k++) { const a = (k / 5) * TAU; M(g, new THREE.BoxGeometry(0.08, 0.32, 0.06), stone, Math.cos(a) * 0.22, 0.25, Math.sin(a) * 0.22, ry(a), false); }
      M(g, new THREE.CylinderGeometry(0.03, 0.04, 0.3, 5), stone, 0, 0.24, 0, 0, false);
    } else { // dome + telescope
      M(g, new THREE.SphereGeometry(0.25, 10, 6, 0, TAU, 0, Math.PI / 2), toon(srgb(0.55, 0.62, 0.66)), -0.1, 0.1, 0, 0, false);
      const t = M(g, new THREE.CylinderGeometry(0.04, 0.05, 0.5, 6), MAT.brass, 0.15, 0.35, 0, 0, false); t.rotation.z = -0.9;
    }
  }
  checkLighthouse() {
    if (this.ready[4]) return;
    const ok = this.plinths.every((p, i) => p.notch === p.target && this.lit[this.assign[i]]);
    if (ok) { this.ready[4] = true; this.lhBeamsGo = true; this.lhBeamsT = 0; this.sfx('swell', LAYOUT.light.c.x, LAYOUT.light.c.z); }
  }
  updateLighthouse(dt) {
    for (const p of this.plinths) {
      const a = (p.notch / 16) * TAU;
      p.shown = p.shown + wrapAngle(a - p.shown) * (1 - Math.exp(-9 * dt));
      p.arm.rotation.y = ry(p.shown);
      p.ringPos.set(p.g.position.x + Math.cos(p.shown) * 1.95, p.y + 1.8, p.g.position.z + Math.sin(p.shown) * 1.95);
    }
    if (this.ready[4] && !this.plBeams) {
      // beams from each answering beacon to its plinth's sight-ring
      this.plBeams = this.plinths.map((p, i) => new Beam(this.root, this.beacons[this.assign[i]].lightPos, new THREE.Vector3(p.g.position.x + Math.cos((p.target / 16) * TAU) * 1.95, p.y + 1.8, p.g.position.z + Math.sin((p.target / 16) * TAU) * 1.95), 0.22));
    }
    if (this.plBeams) { this.lhBeamsT = Math.min(1, this.lhBeamsT + dt * 0.5); for (const b of this.plBeams) b.set(this.lhBeamsT); }
    // basin coals glow once the plinths are answered
    const n = this.hooks.night();
    this.basin.fire.update(dt, n);
    this.basin.coalsMat.color.setRGB(...(this.ready[4] && !this.lit[4] ? [1.6 + Math.sin(this.time * 4) * 0.5, 0.35, 0.08] : [0.06, 0.05, 0.05]));
    if (this.climb) {
      this.climb.t += dt;
      const t = Math.min(1, this.climb.t / 4.0);
      const C = LAYOUT.light.c;
      const r = 5.0 - t * 1.6, a = LAYOUT.light.doorAng + t * TAU * 1.5;
      const top = this.beacons[4].base;
      const by = groundAt(C.x, C.z);
      this.climber.group.visible = true; this.climber.setLit(true, true);
      this.climber.group.position.set(C.x + Math.cos(a) * r, by + 1 + t * (top.y - by - 1), C.z + Math.sin(a) * r);
      this.climber.update(dt, n);
      if (t >= 1) { this.climb = null; this.climber.group.visible = false; this.lightBeacon(4); }
    }
    if (this.lit[4]) {
      this.lhBeam.visible = true;
      this.lhBeam.rotation.y += dt * 0.5;
      this.lhBeamMat.opacity = 0.12 + n * 0.25;
      this.world.lighthouse.glassMat.color.setRGB(2.4, 1.8, 1.0);
    }
  }

  // ---------------------------------------------------------- frame
  update(dt, playerPos) {
    this.time += dt;
    const n = this.hooks.night();
    this.updateVillage(dt);
    this.updateWreck(dt);
    this.updateRing(dt, playerPos);
    this.updateObservatory(dt);
    this.updateLighthouse(dt);
    for (let i = 0; i < 5; i++) {
      const b = this.beacons[i];
      b.fire.update(dt, n);
      if (i === 4) continue;
      const c = this.lit[i] ? [1.8, 0.6, 0.15] : this.ready[i] ? [1.4 + Math.sin(this.time * 4 + i) * 0.5, 0.3, 0.06] : [0.06, 0.05, 0.05];
      b.coalsMat.color.setRGB(...c);
    }
  }

  // ---------------------------------------------------------- hints: places, never steps
  hintTarget(visited) {
    const s = this.lit.findIndex((l) => !l);
    if (s < 0) return null;
    const lists = this.hintLists();
    if (this.ready[s]) return s === 4 ? this.basin.base : this.beacons[s].base;
    for (const p of lists[s]) if (!visited.has(p)) return p;
    return lists[s][lists[s].length - 1];
  }
  hintLists() {
    if (this._hl) return this._hl;
    const mid = CAUSEWAYS.map((c) => ({ x: (c.a.x + c.b.x) / 2, z: (c.a.z + c.b.z) / 2 }));
    const V = LAYOUT.village, F = LAYOUT.forest, R = LAYOUT.ring, P = LAYOUT.peak, L = LAYOUT.light;
    this._hl = [
      [V.pole, V.platform],
      [mid[0], F.lamp],
      [mid[1], R.c],
      [mid[2], P.trailStart, P.tablet, P.c],
      [mid[3], L.c],
    ];
    return this._hl;
  }
  hintList() { return this.hintLists().flat(); }

  // ---------------------------------------------------------- save / load
  serialize() {
    return {
      lit: this.lit, ready: this.ready, vProgress: this.vProgress, lampLit: this.lampLit,
      mirrors: this.mirrors.map((m) => m.idx), levels: this.levels, az: this.az, el: this.el,
      notches: this.plinths.map((p) => p.notch),
    };
  }
  load(s) {
    if (!s) return;
    try {
      if (Array.isArray(s.levels) && s.levels.length === 5) this.levels = s.levels.slice();
      if (Array.isArray(s.mirrors)) s.mirrors.forEach((v, i) => { if (this.mirrors[i]) this.mirrors[i].idx = v % 3; });
      if (Array.isArray(s.notches)) s.notches.forEach((v, i) => { if (this.plinths[i]) { this.plinths[i].notch = v % 16; this.plinths[i].shown = (v / 16) * TAU; } });
      this.az = s.az | 0; this.el = s.el | 0;
      this.vProgress = s.vProgress | 0;
      this.floats.forEach((f) => (f.on = this.vOrder.indexOf(f.i) < this.vProgress));
      if (s.lampLit) { this.lampLit = true; this.lampFire.setLit(true, true); }
      (s.ready || []).forEach((r, i) => { if (r) this.ready[i] = true; });
      (s.lit || []).forEach((l, i) => { if (l) this.lightBeacon(i, true); });
      if (this.lit[1]) { this.beamT = 99; }
      if (this.lit[4]) this.basin.fire.setLit(true, true);
    } catch (e) { console.warn('save load failed', e); }
  }
}
