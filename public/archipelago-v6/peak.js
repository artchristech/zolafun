// Five Lights — the toppled observatory on the peak. The telescope was re-set on
// its mount; aim it at the guiding star. A brass inlay in the floor gives the
// bearing; a gilded notch on the fallen dome's quadrant gives the elevation. The
// shutter takes several seconds of clockwork to open, so guessing is slow.
import * as THREE from './three.module.min.js';
import { toon, mat } from './util.js';
import { PEAK as P, ISLANDS } from './layout.js';
import { terrainH, PLATFORMS, TRAIL } from './terrain.js';
import { addCircle } from './colliders.js';
import { Beacon } from './beacon.js';

const BRASS = 0xc8a24a, STONE = 0xa7a196, STONE_D = 0x857f74, IRON = 0x34302c;

export function bearingDir(i, n) {
  const b = (i / n) * Math.PI * 2;
  return { x: Math.sin(b), z: -Math.cos(b) };
}

export function buildPeak(ctx) {
  const { scene, sound } = ctx;
  const B = ctx.B[3];
  const I = ISLANDS[3];
  const fl = P.floor, top = terrainH(fl.x, fl.z) + 0.06;
  PLATFORMS.push({ type: 'circle', x: fl.x, z: fl.z, r: fl.r, y: top, surf: 'stone' });
  B.cyl(fl.r, fl.r + 0.2, 0.6, 24, STONE, fl.x, top - 0.3, fl.z);
  // compass ring + the bearing inlay
  for (let i = 0; i < P.azSteps; i++) {
    const d = bearingDir(i, P.azSteps), a = Math.atan2(d.x, d.z);
    B.box(0.12, 0.04, 0.7, BRASS, fl.x + d.x * 5.4, top + 0.02, fl.z + d.z * 5.4, a);
  }
  B.add(new THREE.TorusGeometry(5.4, 0.05, 3, 48), BRASS, mat(fl.x, top + 0.02, fl.z, Math.PI / 2, 0, 0));
  {
    const d = bearingDir(P.targetAz, P.azSteps), a = Math.atan2(d.x, d.z);
    B.box(0.16, 0.04, 4.0, BRASS, fl.x + d.x * 3.2, top + 0.025, fl.z + d.z * 3.2, a);
    B.add(new THREE.ConeGeometry(0.45, 0.9, 3), BRASS, mat(fl.x + d.x * 5.9, top + 0.03, fl.z + d.z * 5.9, Math.PI / 2, a, 0, 1, 1, 0.08));
  }
  // broken drum wall with gaps
  for (let k = 0; k < 30; k++) {
    if (k % 10 > 6) continue;
    const a = (k / 30) * Math.PI * 2;
    const h = 1.2 + ((k * 7) % 5) * 0.35;
    const x = fl.x + Math.cos(a) * (fl.r + 0.4), z = fl.z + Math.sin(a) * (fl.r + 0.4);
    B.box(1.3, h, 0.6, k % 2 ? STONE : STONE_D, x, top + h / 2 - 0.1, z, -a + Math.PI / 2);
    addCircle(x, z, 0.55, top - 1, top + h);
  }
  // the dome, toppled on its side beside the drum
  const dm = P.dome, dh = terrainH(dm.x, dm.z);
  const domeM = mat(dm.x, dh + 2.2, dm.z, 1.2, 0.5, 0.35);
  B.add(new THREE.SphereGeometry(4.2, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0x9fb3bd, domeM);
  B.add(new THREE.SphereGeometry(4.05, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0x5d5650, domeM);
  B.add(new THREE.TorusGeometry(4.15, 0.18, 4, 24), 0x6f6a62, domeM.clone().multiply(mat(0, 0, 0, Math.PI / 2, 0, 0)));
  // dome ribs
  for (let k = 0; k < 8; k++) B.add(new THREE.TorusGeometry(4.25, 0.08, 3, 12, Math.PI / 2), 0x6f7d84, domeM.clone().multiply(mat(0, 0, 0, 0, k * Math.PI / 4, 0)).multiply(mat(0, 0, 0, 0, 0, 0)));
  addCircle(dm.x, dm.z, 3.6, dh - 1, dh + 5);
  // elevation quadrant carved on a slab leaning against the dome lip
  const q = { x: dm.x + 3.6, z: dm.z - 3.4 };
  const qh = terrainH(q.x, q.z), qry = Math.atan2(fl.x - q.x, fl.z - q.z);
  const qm = mat(q.x, qh, q.z, 0, qry, 0);
  const qa = (geo, col, m) => B.add(geo, col, qm.clone().multiply(m));
  qa(new THREE.BoxGeometry(2.6, 2.6, 0.3), STONE_D, mat(0, 1.3, 0));
  qa(new THREE.TorusGeometry(1.9, 0.05, 3, 16, Math.PI / 2), BRASS, mat(-1.1, 0.2, 0.17));
  qa(new THREE.BoxGeometry(2.0, 0.07, 0.05), BRASS, mat(-0.1, 0.2, 0.17));
  for (let i = 0; i < P.elSteps; i++) {
    const a = (i * P.elStepDeg) * Math.PI / 180;
    const gold = i === P.targetEl;
    const len = gold ? 0.7 : 0.35;
    qa(new THREE.BoxGeometry(len, gold ? 0.11 : 0.06, 0.06), gold ? 0xffd25a : 0x3a332c,
      mat(-1.1 + Math.cos(a) * (1.9 - len / 2 + 0.1), 0.2 + Math.sin(a) * (1.9 - len / 2 + 0.1), 0.18, 0, 0, a));
  }
  qa(new THREE.SphereGeometry(0.12, 6, 4), 0xffd25a, mat(-1.1 + Math.cos(P.targetEl * P.elStepDeg * Math.PI / 180) * 2.2, 0.2 + Math.sin(P.targetEl * P.elStepDeg * Math.PI / 180) * 2.2, 0.18));
  addCircle(q.x, q.z, 1.2, qh - 1, qh + 2.6);

  // ---- the telescope, re-set on its mount
  const mx = fl.x, mz = fl.z;
  B.cyl(0.7, 0.9, 1.0, 8, STONE_D, mx, top + 0.5, mz);
  addCircle(mx, mz, 1.0, top - 1, top + 3);
  const az = new THREE.Group(); az.position.set(mx, top + 1.0, mz); scene.add(az);
  const fork = toon(IRON), brass = toon(BRASS);
  const yoke = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.2, 10), fork); yoke.castShadow = true; az.add(yoke);
  for (const s of [-1, 1]) { const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.3, 0.3), fork); arm.position.set(0.45 * s, 0.7, 0); arm.castShadow = true; az.add(arm); }
  // elevation quadrant on the fork, matching the dome's carving
  for (let i = 0; i < P.elSteps; i++) {
    const a = (i * P.elStepDeg) * Math.PI / 180;
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 0.22), brass);
    t.position.set(0.53, 1.25 + Math.sin(a) * 0.5, Math.cos(a) * 0.5);
    t.rotation.x = -a;
    az.add(t);
  }
  const el = new THREE.Group(); el.position.y = 1.25; az.add(el);
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.34, 3.4, 12), brass);
  tube.rotation.x = Math.PI / 2; tube.position.z = 0.6; tube.castShadow = true; el.add(tube);
  const rimMat = toon(IRON);
  for (const zz of [-1.05, 0.4, 2.25]) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.05, 4, 12), rimMat); r.position.z = zz; el.add(r); }
  const pointer = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.55), toon(0xffd25a));
  pointer.position.set(0.5, 0, 0.3); el.add(pointer);
  const iris = new THREE.Mesh(new THREE.CircleGeometry(0.27, 6), toon(0x1c1a18));
  iris.position.z = 2.31; el.add(iris);
  const lensMat = new THREE.MeshBasicMaterial({ color: 0x223344 });
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.24, 12), lensMat);
  lens.position.z = 2.305; el.add(lens);

  // ---- controls: wheel (bearing), crank (elevation), lever (shutter)
  const ctrl = (lx, lz) => ({ x: mx + lx, z: mz + lz });
  const wheelP = ctrl(1.6, 0.6), crankP = ctrl(-1.6, 0.6), leverP = ctrl(0, 1.9);
  B.box(0.3, 1.0, 0.3, IRON, wheelP.x, top + 0.5, wheelP.z);
  B.box(0.3, 0.8, 0.3, IRON, crankP.x, top + 0.4, crankP.z);
  B.box(0.5, 0.25, 0.5, IRON, leverP.x, top + 0.12, leverP.z);
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.05, 4, 12), brass);
  wheel.position.set(wheelP.x, top + 1.1, wheelP.z); wheel.rotation.y = Math.PI / 2; scene.add(wheel);
  const spokes = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.8, 0.06), brass); wheel.add(spokes);
  const crank = new THREE.Group(); crank.position.set(crankP.x, top + 0.85, crankP.z); scene.add(crank);
  const crankArm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.08), fork); crankArm.position.y = 0.2; crank.add(crankArm);
  const crankKnob = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 4), brass); crankKnob.position.y = 0.45; crank.add(crankKnob);
  const lever = new THREE.Group(); lever.position.set(leverP.x, top + 0.25, leverP.z); scene.add(lever);
  const lv = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.0, 0.08), fork); lv.position.y = 0.5; lever.add(lv);
  const lvk = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 4), toon(0xd8402f)); lvk.position.y = 1.0; lever.add(lvk);
  lever.rotation.x = -0.5;
  for (const p of [wheelP, crankP, leverP]) addCircle(p.x, p.z, 0.25, top, top + 1.2, true, false);

  // ---- trail markers: cairns at every turn, small stones along the edges
  TRAIL.forEach((p, i) => {
    if (i === 0 || i === TRAIL.length - 1) return;
    const h = terrainH(p.x, p.z);
    const dx = p.x - I.x, dz = p.z - I.z, l = Math.hypot(dx, dz);
    const cx = p.x + dx / l * 2.3, cz = p.z + dz / l * 2.3;
    B.rock(0.55, 0x8a8174, cx, h + 0.3, cz, i * 3);
    B.rock(0.4, 0x9a9184, cx, h + 0.85, cz, i * 3 + 1);
    B.box(0.12, 1.6, 0.12, 0x5e4430, cx, h + 0.9, cz);
  });
  for (let i = 0; i < TRAIL.length - 1; i++) {
    const a = TRAIL[i], b = TRAIL[i + 1], L = Math.hypot(b.x - a.x, b.z - a.z);
    const ux = (b.x - a.x) / L, uz = (b.z - a.z) / L;
    for (let s = 3; s < L - 2; s += 4.5) {
      for (const side of [-1, 1]) {
        const x = a.x + ux * s - uz * 2.0 * side, z = a.z + uz * s + ux * 2.0 * side;
        B.rock(0.22, 0x8f877a, x, terrainH(x, z) + 0.08, z, i * 100 + s * 3 + side);
      }
    }
  }

  const beacon = new Beacon(scene, P.beacon.x, P.beacon.z, terrainH(P.beacon.x, P.beacon.z));
  const beamMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 2.0, 3.0), transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending });
  const beamGeo = new THREE.CylinderGeometry(0.06, 0.06, 1, 6, 1, true); beamGeo.translate(0, 0.5, 0); beamGeo.rotateX(Math.PI / 2);
  const beam = new THREE.Mesh(beamGeo, beamMat); beam.visible = false; scene.add(beam);

  const puzzle = {
    index: 3, beacon, solved: false,
    azI: 2, elI: 0, azShown: 0, elShown: 0, busy: 0, shutter: 0, wheelSpin: 0, crankSpin: 0, beamT: -1,
    center: new THREE.Vector3(mx, top, mz), focusR: 14,
    hint: new THREE.Vector3(TRAIL[0].x, TRAIL[0].h, TRAIL[0].z),
  };
  const azAngle = (i) => { const d = bearingDir(i, P.azSteps); return Math.atan2(d.x, d.z); };
  puzzle.azShown = azAngle(puzzle.azI);
  ctx.interact({
    pos: new THREE.Vector3(wheelP.x, top + 1.0, wheelP.z), r: 1.7, at: 3,
    enabled: () => !puzzle.solved && puzzle.busy <= 0 && puzzle.shutter <= 0,
    press: () => { puzzle.azI = (puzzle.azI + 1) % P.azSteps; puzzle.busy = 0.55; puzzle.wheelSpin = 1; sound.play('click', puzzle.center); ctx.save(); },
  });
  ctx.interact({
    pos: new THREE.Vector3(crankP.x, top + 0.9, crankP.z), r: 1.7, at: 3,
    enabled: () => !puzzle.solved && puzzle.busy <= 0 && puzzle.shutter <= 0,
    press: () => { puzzle.elI = (puzzle.elI + 1) % P.elSteps; puzzle.busy = 0.55; puzzle.crankSpin = 1; sound.play('click', puzzle.center); ctx.save(); },
  });
  ctx.interact({
    pos: new THREE.Vector3(leverP.x, top + 0.8, leverP.z), r: 1.7, at: 3,
    enabled: () => !puzzle.solved && puzzle.busy <= 0 && puzzle.shutter <= 0,
    press: () => { puzzle.shutter = 4.5; sound.play('clunk', puzzle.center); },
  });

  let tickT = 0;
  puzzle.update = (dt) => {
    puzzle.busy = Math.max(0, puzzle.busy - dt);
    // the telescope swings visibly to each detent
    const ta = azAngle(puzzle.azI);
    let d = ta - puzzle.azShown;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    puzzle.azShown += Math.sign(d) * Math.min(Math.abs(d), dt * 1.4);
    az.rotation.y = puzzle.azShown;
    const te = (puzzle.elI * P.elStepDeg) * Math.PI / 180;
    puzzle.elShown += Math.sign(te - puzzle.elShown) * Math.min(Math.abs(te - puzzle.elShown), dt * 1.2);
    el.rotation.x = -puzzle.elShown;
    if (puzzle.wheelSpin > 0) { puzzle.wheelSpin = Math.max(0, puzzle.wheelSpin - dt * 1.8); wheel.rotation.x += dt * 6; }
    if (puzzle.crankSpin > 0) { puzzle.crankSpin = Math.max(0, puzzle.crankSpin - dt * 1.8); crank.rotation.x += dt * 9; }
    if (puzzle.shutter > 0) {
      puzzle.shutter -= dt;
      lever.rotation.x = 0.5;
      tickT -= dt;
      if (tickT <= 0) { tickT = 0.5; sound.play('tick', puzzle.center); }
      iris.rotation.z += dt * 2;
      const open = Math.min(1, (4.5 - puzzle.shutter) / 3);
      iris.scale.setScalar(1 - open * 0.85);
      if (puzzle.shutter <= 0) {
        const right = puzzle.azI === P.targetAz && puzzle.elI === P.targetEl;
        if (right) {
          puzzle.solved = true;
          puzzle.beamT = 0;
          lensMat.color.setRGB(3, 3.2, 4);
          sound.play('chime', puzzle.center);
          beacon.setState(1);
          ctx.solved(3);
        } else {
          sound.play('clunk', puzzle.center);
          sound.play('sputter', puzzle.center);
          iris.scale.setScalar(1);
          lever.rotation.x = -0.5;
        }
      }
    }
    if (puzzle.beamT >= 0) {
      puzzle.beamT += dt;
      const from = new THREE.Vector3(0, 0, 2.4);
      el.localToWorld(from);
      const to = beacon.top;
      beam.position.copy(from); beam.lookAt(to);
      beam.scale.set(1, 1, Math.max(0.01, Math.min(1, puzzle.beamT / 1.2) * from.distanceTo(to)));
      beam.visible = true;
      beamMat.opacity = 0.5 + 0.3 * Math.sin(puzzle.beamT * 2.3);
    }
    beacon.update(dt);
  };
  puzzle.save = () => ({ a: puzzle.azI, e: puzzle.elI, s: puzzle.solved });
  puzzle.load = (s) => {
    if (!s) return;
    puzzle.azI = (s.a | 0) % P.azSteps; puzzle.elI = (s.e | 0) % P.elSteps;
    puzzle.azShown = azAngle(puzzle.azI); puzzle.elShown = (puzzle.elI * P.elStepDeg) * Math.PI / 180;
    if (s.s) { puzzle.solved = true; puzzle.beamT = 5; lensMat.color.setRGB(3, 3.2, 4); iris.scale.setScalar(0.15); lever.rotation.x = 0.5; }
  };
  puzzle.exclusions = [{ x: I.x, z: I.z, r: 14 }];
  // the guiding star: on the inlay bearing, at the gilded elevation
  const sd = bearingDir(P.targetAz, P.azSteps), se = (P.targetEl * P.elStepDeg) * Math.PI / 180;
  puzzle.starDir = new THREE.Vector3(sd.x * Math.cos(se), Math.sin(se), sd.z * Math.cos(se));
  return puzzle;
}
