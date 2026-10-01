// The great lighthouse: hard red/white bands, a ramp spiralling up the tower
// to the gallery, and a lens drum with two rings, each carrying two bullseye
// lenses. At night the four lit beacons are the only lights on the horizon;
// turn each ring (one click = 30 degrees) until every bullseye faces a fire.
import * as THREE from './three.module.min.js';
import { LIGHT } from './layout.js';
import { heightAt, addHelix, addAnnulus, addCircle, addCustomWalk } from './terrain.js';
import { toon, paint, xf, mergeGeoms } from './materials.js';
import { makeBeam } from './beam.js';
import { D2R, damp, dampAngle } from './util.js';

const TAU = Math.PI * 2;
// Lathe sector slab (angles in atan2(z,x) convention)
function sectorSlab(r0, r1, t, th0, dth, segs = 48) {
  const pts = [new THREE.Vector2(r0, 0), new THREE.Vector2(r1, 0), new THREE.Vector2(r1, t), new THREE.Vector2(r0, t), new THREE.Vector2(r0, 0)];
  return new THREE.LatheGeometry(pts, segs, Math.PI / 2 - th0 - dth, dth);
}

export function buildLighthouse(ctx) {
  const { scene, audio } = ctx;
  const x0 = LIGHT.x, z0 = LIGHT.z;
  const y0 = heightAt(x0, z0);
  const yG = y0 + LIGHT.towerH;
  const flatM = toon(0xffffff, { vertexColors: true, flat: true });
  const smoothM = toon(0xffffff, { vertexColors: true });

  // ---- tower with hard bands ----
  const bands = [];
  const nb = 8, bh = LIGHT.towerH / nb;
  const rAt = (y) => LIGHT.baseR + (LIGHT.topR - LIGHT.baseR) * (y / LIGHT.towerH);
  for (let i = 0; i < nb; i++) {
    const g = new THREE.CylinderGeometry(rAt((i + 1) * bh), rAt(i * bh), bh, 32, 1, true).translate(x0, y0 + i * bh + bh / 2, z0);
    bands.push(paint(g, i % 2 ? 0xf4f1ea : 0xd42a22));
  }
  // plinth and door
  bands.push(paint(new THREE.CylinderGeometry(4.35, 4.4, 1.0, 24).translate(x0, y0 - 0.1, z0), 0x8a8478, 0.08));
  bands.push(paint(xf(new THREE.BoxGeometry(1.4, 2.4, 0.4), x0 + Math.cos(270 * D2R) * 4.15, y0 + 1.6, z0 + Math.sin(270 * D2R) * 4.15, 0, 0, 0), 0x3a2a20));
  const tower = new THREE.Mesh(mergeGeoms(bands), smoothM);
  tower.castShadow = true; tower.receiveShadow = true;
  scene.add(tower);
  addCircle(x0, z0, 4.25, y0 - 2, yG - 0.4, true);

  // ---- spiral ramp ----
  const r0 = LIGHT.rampR0, r1 = LIGHT.rampR1, turns = LIGHT.turns, rise = LIGHT.towerH;
  const N = Math.ceil(turns * 64);
  const pos = [], idx = [], col = [];
  const cTop = new THREE.Color(0xb5aa98), cSide = new THREE.Color(0x8a8070);
  const ring = (p, r, y) => { const a = LIGHT.a0 + p * TAU; return [x0 + Math.cos(a) * r, y, z0 + Math.sin(a) * r]; };
  for (let i = 0; i <= N; i++) {
    const p = (i / N) * turns, y = y0 + (rise * p) / turns;
    pos.push(...ring(p, r0, y), ...ring(p, r1, y), ...ring(p, r1, y - 0.35), ...ring(p, r0, y - 0.35));
    for (let k = 0; k < 4; k++) { const c = k < 2 ? cTop : cSide; col.push(c.r, c.g, c.b); }
  }
  for (let i = 0; i < N; i++) {
    const a = i * 4, b = (i + 1) * 4;
    idx.push(a, b, a + 1, a + 1, b, b + 1); // top
    idx.push(a + 1, b + 1, a + 2, a + 2, b + 1, b + 2); // outer
    idx.push(a + 2, b + 2, a + 3, a + 3, b + 2, b + 3); // bottom
    idx.push(a + 3, b + 3, a, a, b + 3, b); // inner
  }
  const rg = new THREE.BufferGeometry();
  rg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  rg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  rg.setIndex(idx);
  rg.computeVertexNormals();
  const ramp = new THREE.Mesh(rg, toon(0xffffff, { vertexColors: true, side: THREE.DoubleSide }));
  ramp.castShadow = true; ramp.receiveShadow = true;
  scene.add(ramp);
  addHelix(x0, z0, r0, r1, y0, rise, LIGHT.a0, turns, 'stone');
  // rail posts, brackets and a hand rope
  const rail = [];
  const railPts = [];
  for (let i = 0; i <= turns * 30; i++) {
    const p = i / 30, y = y0 + (rise * p) / turns;
    const [px, py, pz] = ring(p, r1 - 0.12, y);
    rail.push(paint(xf(new THREE.BoxGeometry(0.1, 1.0, 0.1), px, py + 0.5, pz), 0x5a4a3a));
    if (i % 2 === 0) { const [bx, by, bz] = ring(p, (r0 + rAt(y - y0)) / 2 + 0.1, y - 0.6); rail.push(paint(xf(new THREE.BoxGeometry(0.3, 0.6, 0.3), bx, by, bz), 0x7a7266)); }
    railPts.push(new THREE.Vector3(px, py + 1.0, pz));
  }
  const railMesh = new THREE.Mesh(mergeGeoms(rail), flatM);
  railMesh.castShadow = true;
  scene.add(railMesh);
  const rope = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(railPts), railPts.length * 2, 0.04, 4), toon(0x6a5a40));
  scene.add(rope);

  // ---- gallery (with an opening where the ramp arrives) ----
  const endA = (LIGHT.a0 + turns * TAU) % TAU; // 180 degrees
  const gapStart = endA - 105 * D2R;
  const gal = [
    paint(sectorSlab(2.4, r0, 0.35, 0, TAU).translate(x0, yG - 0.35, z0), 0x9a9284),
    paint(sectorSlab(r0, r1, 0.35, endA, TAU - 105 * D2R).translate(x0, yG - 0.35, z0), 0x9a9284),
  ];
  for (let a = 0; a < 360; a += 10) {
    const ar = a * D2R;
    let rel = ((ar - gapStart) % TAU + TAU) % TAU;
    if (rel < 105 * D2R) continue;
    gal.push(paint(xf(new THREE.BoxGeometry(0.1, 1.0, 0.1), x0 + Math.cos(ar) * (r1 - 0.1), yG + 0.5, z0 + Math.sin(ar) * (r1 - 0.1)), 0x2a2a2a));
  }
  gal.push(paint(sectorSlab(r1 - 0.16, r1 - 0.04, 0.08, endA, TAU - 105 * D2R).translate(x0, yG + 1.0, z0), 0x2a2a2a));
  // lantern cage: pillars, red roof, spire
  for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU + 0.2; gal.push(paint(xf(new THREE.BoxGeometry(0.18, 3.4, 0.18), x0 + Math.cos(a) * LIGHT.cageR, yG + 1.7, z0 + Math.sin(a) * LIGHT.cageR), 0x2a2a2a)); }
  gal.push(paint(new THREE.CylinderGeometry(LIGHT.cageR + 0.3, LIGHT.cageR + 0.3, 0.3, 16).translate(x0, yG + 3.5, z0), 0x2a2a2a));
  gal.push(paint(new THREE.SphereGeometry(LIGHT.cageR + 0.2, 16, 6, 0, TAU, 0, Math.PI / 2).translate(x0, yG + 3.6, z0), 0xc42a22));
  gal.push(paint(new THREE.ConeGeometry(0.15, 1.3, 6).translate(x0, yG + 6.4, z0), 0x2a2a2a));
  gal.push(paint(new THREE.SphereGeometry(0.22, 8, 6).translate(x0, yG + 7.1, z0), 0xc9963a));
  const galMesh = new THREE.Mesh(mergeGeoms(gal), flatM);
  galMesh.castShadow = true; galMesh.receiveShadow = true;
  scene.add(galMesh);
  addAnnulus(x0, z0, 2.4, r0, yG, 'stone');
  addCustomWalk(x0 - r1, x0 + r1, z0 - r1, z0 + r1, (x, z, push) => {
    const dx = x - x0, dz = z - z0, r = Math.hypot(dx, dz);
    if (r < r0 || r > r1) return;
    const rel = ((Math.atan2(dz, dx) - gapStart) % TAU + TAU) % TAU;
    if (rel >= 105 * D2R) push(yG, 'stone');
  });
  addCircle(x0, z0, LIGHT.cageR + 0.15, yG - 0.4, yG + 6, true);

  // ---- lens drum: two rings, two bullseyes each ----
  const bearings = ctx.beaconXZ.slice(0, 4).map((b) => Math.atan2(b.z - z0, b.x - x0));
  const assign = [[0, 2], [1, 3]];
  const ringsG = [];
  const lensMats = [];
  const bullseyeWorld = [null, null, null, null];
  assign.forEach((pair, ri) => {
    const g = new THREE.Group();
    g.position.set(x0, yG + 0.95 + ri * 1.1, z0);
    scene.add(g);
    g.add(new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.07, 5, 32).rotateX(Math.PI / 2), toon(0xc9963a, { emissive: 0x2a1a04 })));
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.5, 6).rotateZ(Math.PI / 2), toon(0xc9963a)));
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.5, 6).rotateX(Math.PI / 2), toon(0xc9963a)));
    for (const b of pair) {
      const th = bearings[b];
      const holder = new THREE.Group();
      holder.position.set(Math.cos(th) * 1.25, 0, Math.sin(th) * 1.25);
      holder.rotation.y = Math.atan2(Math.cos(th), Math.sin(th));
      const lm = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x7aa0b4) });
      lensMats.push(lm);
      const disc = new THREE.Mesh(new THREE.CircleGeometry(0.4, 20), lm);
      disc.position.z = 0.05;
      holder.add(disc);
      holder.add(new THREE.Mesh(mergeGeoms([
        paint(new THREE.TorusGeometry(0.42, 0.05, 4, 20), 0xc9963a), paint(new THREE.TorusGeometry(0.27, 0.025, 4, 16).translate(0, 0, 0.07), 0xe0d0a0),
        paint(new THREE.TorusGeometry(0.14, 0.02, 4, 12).translate(0, 0, 0.08), 0xe0d0a0),
      ]), toon(0xffffff, { vertexColors: true })));
      g.add(holder);
      bullseyeWorld[b] = holder;
    }
    ringsG.push(g);
  });

  // levers on the gallery, one per ring, with a rod up to the ring they turn
  const leverA = [endA + 25 * D2R, endA + 50 * D2R];
  const levers = leverA.map((a, i) => {
    const px = x0 + Math.cos(a) * 3.6, pz = z0 + Math.sin(a) * 3.6;
    const g = new THREE.Group();
    g.position.set(px, yG, pz);
    g.rotation.y = Math.atan2(Math.cos(a), Math.sin(a));
    scene.add(g);
    g.add(new THREE.Mesh(paint(new THREE.BoxGeometry(0.5, 0.5, 0.5).translate(0, 0.25, 0), 0x4a4038), flatM));
    const arm = new THREE.Group();
    arm.position.y = 0.45;
    arm.add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.1, 6).translate(0, 0.55, 0), toon(0x2a2a2a)));
    arm.add(new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6).translate(0, 1.12, 0), toon(i ? 0xd42a22 : 0xf4f1ea)));
    g.add(arm);
    // rod from the lever base to its ring height
    const rodH = 0.95 + i * 1.1;
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, rodH, 5).translate(0, rodH / 2, -0.3), toon(0xc9963a)));
    // matching colour band on the ring
    ringsG[i].add(new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.09, 4, 32, 0.5).rotateX(Math.PI / 2), toon(i ? 0xd42a22 : 0xf4f1ea)));
    return { g, arm, kick: 0, pos: new THREE.Vector3(px, yG + 1.0, pz) };
  });

  const beams = [0, 1, 2, 3].map(() => { const b = makeBeam(0xffd890, 0.09, 3.5, 3); scene.add(b.group); return b; });
  // rotating lighthouse sweep (after lighting)
  const sweep = new THREE.Group();
  sweep.position.set(x0, yG + 1.5, z0);
  scene.add(sweep);
  const sweepGeo = new THREE.ConeGeometry(9, 160, 20, 1, true).translate(0, -80, 0).rotateZ(Math.PI / 2);
  const sweepM = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.85, 0.55).multiplyScalar(0.18), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide });
  for (const s of [0, Math.PI]) { const m = new THREE.Mesh(sweepGeo, sweepM); m.rotation.y = s; m.frustumCulled = false; sweep.add(m); }
  sweep.visible = false;

  const st = { o: LIGHT.starts.slice(), solved: false, solveT: -1 };
  const cur = [0, 0];
  const ringAngle = (i) => st.o[i] * (TAU / LIGHT.ringSteps);
  st.o.forEach((o, i) => { cur[i] = ringAngle(i); });
  const check = () => { if (!st.solved && st.o[0] === 0 && st.o[1] === 0) { st.solved = true; st.solveT = 0; audio.chime(); ctx.save(); } };
  const interactables = levers.map((l, i) => ({
    pos: l.pos, r: 1.9, enabled: () => !st.solved && ctx.litCount() >= 4,
    press() { st.o[i] = (st.o[i] + 1) % LIGHT.ringSteps; l.kick = 1; audio.click(l.pos, 0.8); audio.gear(l.pos); check(); },
  }));

  const tmp = new THREE.Vector3();
  return {
    interactables,
    yG,
    lampXZ: { x: x0, z: z0 },
    hintTarget: () => {
      const a = LIGHT.a0;
      return new THREE.Vector3(x0 + Math.cos(a) * 5.45, y0, z0 + Math.sin(a) * 5.45);
    },
    centre: new THREE.Vector3(x0, y0, z0),
    getState: () => ({ o: st.o.slice(), solved: st.solved }),
    setState(s) {
      if (!s) return;
      if (s.o) st.o = s.o.slice();
      st.solved = !!s.solved;
      st.o.forEach((o, i) => { cur[i] = ringAngle(i); });
      if (st.solved) st.solveT = 99;
    },
    update(dt, player, beacon, camYaw, time, night, beaconsAll) {
      for (let i = 0; i < 2; i++) {
        cur[i] = dampAngle(cur[i], ringAngle(i), 5, dt);
        ringsG[i].rotation.y = cur[i];
        levers[i].kick = damp(levers[i].kick, 0, 5, dt);
        levers[i].arm.rotation.x = -0.5 + levers[i].kick * 1.0;
      }
      const glowK = st.solved ? Math.min(1, st.solveT) : 0;
      lensMats.forEach((m) => m.color.setRGB(0.48 + glowK * 3, 0.63 + glowK * 2.4, 0.7 + glowK * 1.2));
      if (st.solved) {
        st.solveT += dt;
        for (let b = 0; b < 4; b++) {
          bullseyeWorld[b].getWorldPosition(tmp);
          beams[b].setEnds(beaconsAll[b].flamePos, tmp);
          beams[b].setProgress(Math.min(1, Math.max(0, (st.solveT - 0.3 - b * 0.25) / 1.4)));
          beams[b].setStrength(beacon.lit ? 0.0 : 1);
          if (beacon.lit) beams[b].group.visible = false;
        }
        if (st.solveT > 2.6 && !beacon.ready) { beacon.setReady(); ctx.onReady(4); }
      }
      if (beacon.lit) {
        sweep.visible = true;
        sweep.rotation.y = time * 0.5;
        sweepM.color.setRGB(1.0, 0.85, 0.55).multiplyScalar(0.05 + night * 0.2);
      }
    },
  };
}
