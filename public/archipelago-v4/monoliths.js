// Ring of barnacled monoliths. Standing inside wakes the hum. Each stone's
// barnacle collar clicks between five carved heights, changing its pitch.
// A stone out of tune with the centre beats - heard as a wobble and seen as a
// flicker at the same rate. All steady = the ring sings and the brazier wakes.
import * as THREE from './three.module.min.js';
import { MONO } from './layout.js';
import { heightAt, addBox, addCircle, addDisc } from './terrain.js';
import { toon, paint, xf, mergeGeoms } from './materials.js';
import { makeBeam } from './beam.js';
import { rng, damp, smoothstep } from './util.js';

const F0 = 98;
const STEP_HZ = 1.7;
const collarY = (p) => 0.9 + p * 0.55;

export function buildMonoliths(ctx) {
  const { scene, audio } = ctx;
  const R = rng(4242);
  const cx = MONO.x, cz = MONO.z;
  const H = heightAt(cx, cz);
  const stoneM = toon(0xffffff, { vertexColors: true, flat: true });
  const stones = [];
  for (let i = 0; i < MONO.n; i++) {
    const a = (i / MONO.n) * Math.PI * 2 + 0.3;
    const x = cx + Math.cos(a) * MONO.ringR, z = cz + Math.sin(a) * MONO.ringR;
    const h = heightAt(x, z);
    const g = new THREE.Group();
    g.position.set(x, h - 0.3, z);
    g.rotation.y = -a - Math.PI / 2; // local +z faces the centre
    const lean = (R() - 0.5) * 0.08;
    g.rotation.z = lean;
    scene.add(g);
    const parts = [paint(new THREE.BoxGeometry(1.5, 6.4, 1.1, 1, 3, 1).translate(0, 3.2, 0), 0x6f7a80, 0.12, i + 1)];
    parts.push(paint(xf(new THREE.BoxGeometry(1.7, 0.5, 1.3), 0, 6.5, 0, 0, 0, (R() - 0.5) * 0.2), 0x5f686e, 0.1, i + 5));
    // barnacles crusting the lower half
    for (let k = 0; k < 34; k++) {
      const side = Math.floor(R() * 4);
      const y = 0.3 + Math.pow(R(), 1.5) * 3.6;
      const u = (R() - 0.5) * 1.3;
      const s = 0.06 + R() * 0.09;
      let px = 0, pz = 0, rx = 0, rz = 0;
      if (side === 0) { px = u; pz = 0.56; rx = Math.PI / 2; }
      else if (side === 1) { px = u; pz = -0.56; rx = -Math.PI / 2; }
      else if (side === 2) { px = 0.76; pz = u * 0.8; rz = -Math.PI / 2; }
      else { px = -0.76; pz = u * 0.8; rz = Math.PI / 2; }
      parts.push(paint(xf(new THREE.ConeGeometry(s, s * 1.4, 6), px, y, pz, rx, 0, rz), 0xe8e0cc, 0.15, k));
    }
    // carved notches on the inner face at the five collar heights
    for (let p = 0; p < MONO.positions; p++) parts.push(paint(xf(new THREE.BoxGeometry(0.5, 0.06, 0.05), 0, collarY(p), 0.57), 0x2e3438));
    const body = new THREE.Mesh(mergeGeoms(parts), stoneM);
    body.castShadow = true; body.receiveShadow = true;
    g.add(body);
    // the sliding collar with glowing barnacles
    const collarM = new THREE.MeshToonMaterial({ color: 0x3d5c5a, emissive: new THREE.Color(0x3ff0d0), emissiveIntensity: 0.2 });
    const cParts = [new THREE.TorusGeometry(1.06, 0.13, 4, 4).rotateX(Math.PI / 2).rotateY(Math.PI / 4).scale(1.0, 1, 0.78)];
    for (let k = 0; k < 14; k++) {
      const t = (k / 14) * Math.PI * 2;
      cParts.push(xf(new THREE.SphereGeometry(0.1 + R() * 0.05, 6, 4), Math.cos(t) * 0.86, 0.08, Math.sin(t) * 0.66));
    }
    const collar = new THREE.Mesh(mergeGeoms(cParts), collarM);
    collar.castShadow = true;
    g.add(collar);
    const ib = new THREE.Vector3(x - Math.cos(a) * 1.3, h + 1.2, z - Math.sin(a) * 1.3);
    addBox(x, z, 0.8, 0.6, g.rotation.y, h - 2, h + 6.5, true);
    stones.push({ g, collar, collarM, a, pos: MONO.starts[i], target: MONO.targets[i], harm: MONO.harmonics[i], cy: collarY(MONO.starts[i]), ib, wx: x, wz: z, bump: 0 });
  }
  // centre stone with a spiral groove
  const centre = new THREE.Mesh(mergeGeoms([
    paint(new THREE.CylinderGeometry(1.3, 1.5, 0.55, 12).translate(0, 0.27, 0), 0x7d878c, 0.1, 3),
  ]), stoneM);
  centre.position.set(cx, H - 0.05, cz); centre.receiveShadow = true; centre.castShadow = true;
  scene.add(centre);
  const spiralPts = [];
  for (let i = 0; i < 60; i++) { const t = i / 59, a = t * Math.PI * 5, r = 0.1 + t * 1.05; spiralPts.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r)); }
  const spiralM = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x3ff0d0) });
  const spiral = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(spiralPts), 80, 0.045, 4), spiralM);
  spiral.position.set(cx, H + 0.52, cz);
  scene.add(spiral);
  addCircle(cx, cz, 1.35, H - 1, H + 0.4, false);

  const beam = makeBeam(0x7ff6e0, 0.05, 4, 4);
  scene.add(beam.group);

  const st = { pos: stones.map((s) => s.pos), solved: false, solveT: -1 };
  let hum = 0;
  const allTuned = () => stones.every((s) => s.pos === s.target);

  const interactables = stones.map((s, i) => ({
    pos: s.ib, r: 2.0, enabled: () => !st.solved,
    press() {
      s.pos = (s.pos + 1) % MONO.positions;
      st.pos[i] = s.pos;
      s.bump = 1;
      audio.stoneGrind(s.ib);
      if (allTuned()) { st.solved = true; st.solveT = 0; ctx.save(); }
    },
  }));

  const humStones = stones.map(() => ({ freq: 0, gain: 0, pan: 0 }));
  const tmp = new THREE.Vector3();
  return {
    interactables,
    hintTarget: () => new THREE.Vector3(cx, H, cz),
    centre: new THREE.Vector3(cx, H, cz),
    getState: () => ({ pos: st.pos.slice(), solved: st.solved }),
    setState(s) {
      if (!s) return;
      if (s.pos) s.pos.forEach((p, i) => { stones[i].pos = p; st.pos[i] = p; stones[i].cy = collarY(p); });
      st.solved = !!s.solved;
      if (st.solved) st.solveT = 99;
    },
    update(dt, player, beacon, camYaw, time) {
      const d = Math.hypot(player.x - cx, player.z - cz);
      const inside = 1 - smoothstep(MONO.ringR - 1.2, MONO.ringR + 1.0, d);
      hum = damp(hum, inside, 2.5, dt);
      const solvedGlow = st.solved ? Math.min(1, st.solveT / 1.5) : 0;
      stones.forEach((s, i) => {
        s.cy = damp(s.cy, collarY(s.pos), 9, dt);
        s.bump = damp(s.bump, 0, 6, dt);
        s.collar.position.y = s.cy + Math.sin(s.bump * 9) * 0.03;
        const delta = (s.pos - s.target) * STEP_HZ;
        const beat = Math.abs(delta);
        const pulse = beat < 0.01 ? 1 : 0.5 + 0.5 * Math.cos(Math.PI * 2 * beat * time);
        const glow = beat < 0.01 ? 1.6 : 0.15 + 1.6 * pulse;
        s.collarM.emissiveIntensity = 0.15 + hum * glow + solvedGlow * 1.5;
        // audio
        const dx = s.wx - player.x, dz = s.wz - player.z, dist = Math.hypot(dx, dz);
        const ang = Math.atan2(dx, -dz) + camYaw; // relative to camera forward
        humStones[i].freq = F0 * s.harm + delta;
        humStones[i].gain = (0.35 + 0.65 * Math.max(0, 1 - dist / 14)) / (s.harm * 0.8 + 0.4);
        humStones[i].pan = Math.max(-1, Math.min(1, Math.sin(ang)));
      });
      spiralM.color.setRGB(0.25 + hum * 1.6 + solvedGlow * 2, 0.9 + hum * 2.6 + solvedGlow * 3, 0.8 + hum * 2.2 + solvedGlow * 2.5);
      audio.setHum(hum, F0, MONO.harmonics, humStones, st.solved ? 1 : 0);
      if (st.solved) {
        st.solveT += dt;
        tmp.set(cx, H + 0.6, cz);
        beam.setEnds(tmp, beacon.flamePos);
        const p = Math.min(1, Math.max(0, (st.solveT - 1.0) / 1.8));
        beam.setProgress(p);
        beam.setStrength(beacon.lit ? 0.3 : 1);
        if (p >= 1 && !beacon.ready) { beacon.setReady(); ctx.onReady(1); }
      }
    },
  };
}
