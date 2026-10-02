// Five Lights — the humming ring. Five barnacled monoliths each sing one note of a
// chord; the centre altar sings it true. A stone that is out of tune beats against
// the altar: its glowing band throbs at the beat rate and sits above (sharp) or
// below (flat) the carved true line. Pressing a stone turns it and both neighbours
// one notch sharper; at the top a stone wraps round to flat.
import * as THREE from './three.module.min.js';
import { mat, smoothstep, clamp } from './util.js';
import { RING } from './layout.js';
import { terrainH } from './terrain.js';
import { addCircle } from './colliders.js';
import { Beacon } from './beacon.js';

const TONES = [110, 138.59, 164.81, 220, 277.18];
const DETUNE = [0, 1, 2, -1];       // notch -> detune steps
const CENTS = 32;
const BAND_STEP = 0.5;

export function buildRing(ctx) {
  const { scene, sound } = ctx;
  const B = ctx.B[1];
  const c = RING.c, n = RING.stones;
  const base = terrainH(c.x, c.z);
  const trueY = base + 2.3;
  const stones = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    const x = c.x + Math.cos(a) * RING.r, z = c.z + Math.sin(a) * RING.r;
    const ry = -a + Math.PI / 2;
    B.box(1.7, 4.6, 1.1, 0x7f8a86, x, base + 2.1, z, ry);
    B.box(1.3, 0.6, 0.9, 0x8e9894, x, base + 4.6, z, ry, 0.1);
    // carved true line
    B.box(1.78, 0.08, 1.18, 0x2c3330, x, trueY, z, ry);
    // barnacles
    for (let k = 0; k < 16; k++) {
      const h = base + 0.3 + ((k * 37) % 17) / 17 * 1.6;
      const side = (k % 4) - 1.5;
      const bx = x + Math.cos(ry) * side * 0.45 + Math.sin(ry) * (k % 2 ? 0.58 : -0.58);
      const bz = z - Math.sin(ry) * side * 0.45 + Math.cos(ry) * (k % 2 ? 0.58 : -0.58);
      B.add(new THREE.ConeGeometry(0.12 + (k % 3) * 0.04, 0.14, 5), k % 3 ? 0xd9d2bf : 0x6e7a6a, mat(bx, h, bz, Math.PI / 2 * (k % 2 ? 1 : -1), ry, 0));
    }
    addCircle(x, z, 1.05, base - 1, base + 5);
    const bandMat = new THREE.MeshBasicMaterial({ color: 0x66ddcc });
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.07, 4, 16), bandMat);
    band.rotation.set(Math.PI / 2, 0, ry);
    band.scale.set(1.15, 0.78, 1);
    band.position.set(x, trueY, z);
    scene.add(band);
    const emit = sound.emitter('hum', x, base + 2, z, { freq: TONES[i], level: 0, ref: 4 });
    stones.push({ i, x, z, ry, band, bandMat, notch: 0, shown: 0, emit, pulse: 0 });
  }
  // altar: the reference
  B.cyl(1.0, 1.3, 1.6, 7, 0x7f8a86, c.x, base + 0.8, c.z);
  B.cyl(1.15, 1.0, 0.2, 7, 0x8e9894, c.x, base + 1.7, c.z);
  addCircle(c.x, c.z, 1.25, base - 1, base + 1.8);
  const altarBand = new THREE.Mesh(new THREE.TorusGeometry(1.08, 0.06, 4, 18), new THREE.MeshBasicMaterial({ color: 0xffe6a8 }));
  altarBand.rotation.x = Math.PI / 2;
  altarBand.position.set(c.x, base + 1.45, c.z);
  scene.add(altarBand);
  const ref = TONES.map((f) => sound.emitter('hum', c.x, base + 1.5, c.z, { freq: f, level: 0, ref: 4 }));
  // stone path ring
  for (let k = 0; k < 28; k++) {
    const a = (k / 28) * Math.PI * 2;
    B.box(1.4, 0.12, 0.9, 0x9a968c, c.x + Math.cos(a) * 12.2, base + 0.04, c.z + Math.sin(a) * 12.2, -a);
  }

  // scramble: a few presses away from true, never solved
  const press = (i, notches) => {
    for (const d of [-1, 0, 1]) { const s = notches[(i + d + n) % n]; notches[(i + d + n) % n] = (s + 1) % 4; }
  };
  const start = [0, 0, 0, 0, 0];
  for (const i of [2, 2, 4]) press(i, start);
  stones.forEach((s, i) => { s.notch = s.shown = start[i]; });

  const bh = terrainH(RING.beacon.x, RING.beacon.z);
  const beacon = new Beacon(scene, RING.beacon.x, RING.beacon.z, bh);
  const puzzle = {
    index: 1, beacon, solved: false, busy: 0,
    center: new THREE.Vector3(c.x, base, c.z), focusR: 16,
    hint: new THREE.Vector3(c.x, base, c.z),
  };
  const freqOf = (s) => TONES[s.i] * Math.pow(2, DETUNE[s.notch] * CENTS / 1200);
  const check = () => {
    if (stones.every((s) => s.notch === 0)) {
      puzzle.solved = true;
      beacon.setState(1);
      sound.play('chime', { x: c.x, y: base + 2, z: c.z });
      ctx.solved(1);
    }
  };
  stones.forEach((s) => {
    ctx.interact({
      pos: new THREE.Vector3(s.x, base + 1.6, s.z), r: 2.6, at: 1,
      enabled: () => !puzzle.solved && puzzle.busy <= 0,
      press: () => {
        const notches = stones.map((t) => t.notch);
        press(s.i, notches);
        stones.forEach((t, k) => { t.notch = notches[k]; });
        for (const d of [-1, 0, 1]) {
          const t = stones[(s.i + d + n) % n];
          sound.play('grind', { x: t.x, y: base + 1, z: t.z });
          sound.setFreq(t.emit, freqOf(t));
        }
        puzzle.busy = 1.3;
        setTimeout(check, 1300);
        ctx.save();
      },
    });
  });
  stones.forEach((s) => sound.setFreq(s.emit, freqOf(s)));

  let t = 0;
  puzzle.update = (dt, player) => {
    t += dt;
    puzzle.busy = Math.max(0, puzzle.busy - dt);
    const d = Math.hypot(player.x - c.x, player.z - c.z);
    const inside = 1 - smoothstep(RING.r - 0.5, RING.r + 5, d);
    const near = 1 - smoothstep(10, 34, d);
    for (const s of stones) {
      // band glides to its notch height (wrapping top to bottom through the stone)
      const target = DETUNE[s.notch];
      s.shown += clamp(target - s.shown, -dt * 2.4, dt * 2.4);
      s.band.position.y = trueY + s.shown * BAND_STEP;
      const fs = TONES[s.i] * Math.pow(2, s.shown * CENTS / 1200);
      const beat = Math.abs(fs - TONES[s.i]);
      s.pulse += beat * dt;
      const throb = 0.5 + 0.5 * Math.cos(s.pulse * Math.PI * 2);
      const lum = puzzle.solved ? 2.2 + 0.4 * Math.sin(t * 2) : (0.45 + 1.4 * (s.notch === 0 ? 1 : throb)) * (0.6 + inside);
      if (puzzle.solved) s.bandMat.color.setRGB(1.0 * lum, 0.86 * lum, 0.55 * lum);
      else s.bandMat.color.setRGB(0.35 * lum, 0.95 * lum, 0.85 * lum);
      s.emit.level = (near * 0.25 + inside * 0.9) * (puzzle.solved ? 1.4 : 1);
    }
    for (const e of ref) e.level = (near * 0.15 + inside * 0.6) * (puzzle.solved ? 1.4 : 1);
    altarBand.material.color.setRGB(1, 0.9, 0.66).multiplyScalar(1.0 + inside * 0.8);
    beacon.update(dt);
  };
  puzzle.save = () => ({ n: stones.map((s) => s.notch), s: puzzle.solved });
  puzzle.load = (sv) => {
    if (!sv) return;
    if (Array.isArray(sv.n) && sv.n.length === n) stones.forEach((s, i) => { s.notch = sv.n[i] & 3; s.shown = DETUNE[s.notch]; sound.setFreq(s.emit, freqOf(s)); });
    puzzle.solved = !!sv.s;
  };
  stones.forEach((s) => { s.shown = DETUNE[s.notch]; });
  puzzle.exclusions = [{ x: c.x, z: c.z, r: 14 }, { x: RING.beacon.x, z: RING.beacon.z, r: 4 }];
  return puzzle;
}
