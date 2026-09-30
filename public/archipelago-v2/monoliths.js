// Ring of barnacled monoliths. Barnacles only grow at the old waterline, so when every stone
// stands at its true depth all the barnacle bands form one level ring, matching the stones
// that never moved and the altar in the middle. Stand inside and the ring hums; when the
// bands line up, the hum resolves and the beacon is ready.
import * as THREE from './three.module.min.js';
import { toon, addOutline } from './util.js';
import { addBox, addKeepOut, ISLANDS } from './world.js';
import { mulberry32, smoothstep } from './math.js';

const C = { x: ISLANDS.ring.x, z: ISLANDS.ring.z };
const PLATEAU = 6.0;
const NOTCH = 0.7;
const STONE_H = 6.2;
const BASE = PLATEAU - 0.6;
const LINE = PLATEAU + 1.4; // absolute height of the old tide line
const CORRECT = [0, 2, 1, 3, 0, 1, 2];
const FIXED = [true, false, false, false, true, false, false];
const INITIAL = [0, 0, 3, 1, 0, 2, 3];

function stoneGeo(seed) {
  const r = mulberry32(seed);
  const g = new THREE.BoxGeometry(1.5, STONE_H, 1.0, 2, 8, 2);
  const p = g.attributes.position;
  const jit = [];
  for (let i = 0; i < 20; i++) jit.push((r() - 0.5) * 0.14);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const t = (y + STONE_H / 2) / STONE_H;
    const taper = 1 - t * 0.18;
    const k = Math.floor((y + STONE_H / 2) * 1.3) % 20;
    let nx = x * taper + jit[k] * Math.sign(x), nz = z * taper + jit[(k + 7) % 20] * Math.sign(z);
    let ny = y;
    if (t > 0.98) ny += (x > 0 ? 0.2 : -0.1) + jit[k];
    p.setXYZ(i, nx, ny, nz);
  }
  g.translate(0, STONE_H / 2, 0);
  g.computeVertexNormals();
  return g;
}

function barnacleBand(parent, localY, w, d, rng) {
  const band = new THREE.Mesh(new THREE.BoxGeometry(w + 0.12, 0.42, d + 0.12), toon(0xd9d0bd, { unique: true, emissive: new THREE.Color(0, 0, 0) }));
  band.position.y = localY;
  addOutline(band, 0.015);
  parent.add(band);
  const weed = new THREE.Mesh(new THREE.BoxGeometry(w + 0.08, 0.35, d + 0.08), toon(0x4a6a44));
  weed.position.y = localY - 0.38;
  parent.add(weed);
  // barnacle bumps
  const cone = new THREE.ConeGeometry(0.06, 0.09, 5);
  cone.rotateX(Math.PI / 2);
  const n = 70;
  const im = new THREE.InstancedMesh(cone, toon(0xeee6d4), n);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const side = Math.floor(rng() * 4);
    const u = rng() - 0.5;
    const y = localY + (rng() - 0.5) * 0.5;
    const hw = (w + 0.12) / 2, hd = (d + 0.12) / 2;
    let ang;
    if (side === 0) { p.set(u * w, y, hd); ang = 0; }
    else if (side === 1) { p.set(u * w, y, -hd); ang = Math.PI; }
    else if (side === 2) { p.set(hw, y, u * d); ang = Math.PI / 2; }
    else { p.set(-hw, y, u * d); ang = -Math.PI / 2; }
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), ang);
    const sc = 0.6 + rng() * 0.9;
    s.set(sc, sc, sc);
    m.compose(p, q, s);
    im.setMatrixAt(i, m);
  }
  im.instanceMatrix.needsUpdate = true;
  parent.add(im);
  return band;
}

export class Monoliths {
  constructor(ctx) {
    this.ctx = ctx;
    const scene = ctx.scene;
    this.solved = false;
    this.center = new THREE.Vector3(C.x, PLATEAU, C.z);
    const rng = mulberry32(77);
    const mat = toon(0x8c948c);
    this.stones = [];
    // stone floor ring
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(12.5, 12.8, 0.3, 40), toon(0xa29c90));
    floor.position.set(C.x, PLATEAU - 0.1, C.z);
    floor.receiveShadow = true;
    scene.add(floor);
    const inner = new THREE.Mesh(new THREE.RingGeometry(5.5, 6.0, 40), toon(0x8a8478));
    inner.rotation.x = -Math.PI / 2;
    inner.position.set(C.x, PLATEAU + 0.06, C.z);
    scene.add(inner);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + 0.17;
      const x = C.x + Math.cos(a) * 9.5, z = C.z + Math.sin(a) * 9.5;
      const g = new THREE.Group();
      g.position.set(x, BASE - INITIAL[i] * NOTCH, z);
      g.rotation.y = -a - Math.PI / 2;
      scene.add(g);
      const mesh = new THREE.Mesh(stoneGeo(100 + i), mat);
      mesh.castShadow = mesh.receiveShadow = true;
      addOutline(mesh, 0.05);
      g.add(mesh);
      const bandLocal = LINE - BASE + CORRECT[i] * NOTCH;
      const band = barnacleBand(g, bandLocal, 1.5 * (1 - (bandLocal / STONE_H) * 0.18), 1.0 * (1 - (bandLocal / STONE_H) * 0.18), rng);
      // spiral glyph carved on the inner face of fixed stones
      if (FIXED[i]) {
        const glyph = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.05, 4, 16), toon(0x5c6258));
        glyph.position.set(0, 4.6, 0.46);
        g.add(glyph);
      }
      const st = { i, g, a, x, z, level: INITIAL[i], y: BASE - INITIAL[i] * NOTCH, anim: 0, band, fixed: FIXED[i] };
      this.stones.push(st);
      addBox(x, z, 0.8, 0.55, a + Math.PI / 2, PLATEAU - 8, PLATEAU + 10, { cam: true });
      if (!FIXED[i]) {
        const ip = new THREE.Vector3(C.x + Math.cos(a) * 7.9, PLATEAU + 1.2, C.z + Math.sin(a) * 7.9);
        ctx.register({ pos: ip, r: 2.3, promptY: 1.2, enabled: () => !this.solved && st.anim <= 0, press: () => this.sink(st), id: 'stone' + i });
      }
    }
    // altar in the middle, with its barnacle band at the tide line
    const altar = new THREE.Group();
    altar.position.set(C.x, PLATEAU - 0.3, C.z);
    scene.add(altar);
    const am = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.95, 2.6, 7), mat);
    am.position.y = 1.3;
    am.castShadow = am.receiveShadow = true;
    addOutline(am, 0.04);
    altar.add(am);
    this.altarBand = new THREE.Mesh(new THREE.CylinderGeometry(0.86, 0.9, 0.42, 7), toon(0xd9d0bd, { unique: true, emissive: new THREE.Color(0, 0, 0) }));
    this.altarBand.position.y = LINE - (PLATEAU - 0.3);
    addOutline(this.altarBand, 0.015);
    altar.add(this.altarBand);
    const weed = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.88, 0.35, 7), toon(0x4a6a44));
    weed.position.y = this.altarBand.position.y - 0.38;
    altar.add(weed);
    addBox(C.x, C.z, 0.9, 0.9, 0, PLATEAU - 2, PLATEAU + 3, { cam: true });
    addKeepOut(C.x, C.z, 16);
    this.glow = 0;
  }
  sink(st) {
    const prev = st.level;
    st.level = (st.level + 1) % 4;
    st.from = st.y;
    st.to = BASE - st.level * NOTCH;
    st.anim = 1;
    this.ctx.audio.grind(new THREE.Vector3(st.x, PLATEAU + 2, st.z), prev === 3 ? 1.3 : 0.9);
    this.ctx.save();
  }
  allCorrect() { return this.stones.every((s) => s.level === CORRECT[s.i]); }
  humLevel(p) {
    const d = Math.hypot(p.x - C.x, p.z - C.z);
    return smoothstep(15, 7, d) * (Math.abs(p.y - PLATEAU) < 4 ? 1 : 0);
  }
  update(dt, time, playerPos) {
    for (const s of this.stones) {
      if (s.anim > 0) {
        s.anim = Math.max(0, s.anim - dt / 0.9);
        const t = 1 - s.anim;
        const e = t * t * (3 - 2 * t);
        s.y = s.from + (s.to - s.from) * e;
        s.g.position.y = s.y + (s.anim > 0 ? Math.sin(time * 60) * 0.015 : 0);
      }
    }
    const inside = Math.hypot(playerPos.x - C.x, playerPos.z - C.z) < 8.2 && Math.abs(playerPos.y - PLATEAU) < 3;
    if (!this.solved && inside && this.allCorrect() && this.stones.every((s) => s.anim <= 0)) {
      this.solved = true;
      this.ctx.audio.success(this.center);
      this.ctx.game.primeBeacon(1);
      this.ctx.save();
    }
    this.glow += ((this.solved ? 1 : 0) - this.glow) * Math.min(1, dt * 0.8);
    const pulse = this.glow * (0.6 + 0.4 * Math.sin(time * 2.2));
    for (const s of this.stones) s.band.material.emissive.setRGB(0.1 * pulse, 0.55 * pulse, 0.5 * pulse);
    this.altarBand.material.emissive.setRGB(0.1 * pulse, 0.55 * pulse, 0.5 * pulse);
  }
  hint() {
    if (this.solved) return null;
    for (const s of this.stones) {
      if (!s.fixed && s.level !== CORRECT[s.i]) return new THREE.Vector3(s.x, PLATEAU + 2.5, s.z);
    }
    return this.center.clone().setY(PLATEAU + 1);
  }
  getState() { return { solved: this.solved, levels: this.stones.map((s) => s.level) }; }
  setState(st) {
    if (!st) return;
    this.solved = !!st.solved;
    if (Array.isArray(st.levels)) {
      this.stones.forEach((s, i) => {
        if (s.fixed) return;
        s.level = (st.levels[i] | 0) % 4;
        s.y = BASE - s.level * NOTCH;
        s.g.position.y = s.y;
      });
    }
  }
}
