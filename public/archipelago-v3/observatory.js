import * as THREE from './three.module.min.js';
import { toon, toonUnique } from './materials.js';
import { LAYOUT, groundH, angTo, D2R } from './terrain.js';
import { Batcher } from './batch.js';
import { rng, angleLerp } from './noise.js';

// Beacon 4 — the toppled observatory. The old telescope has been re-set on its mount.
// A brass line in the floor runs toward the great lighthouse and ends at a sighting post
// whose ring (topped with a little lighthouse) sits below eye level: aim along it, low.
export function buildObservatory(G) {
  const c = LAYOUT.obs;
  const h = groundH(c[0], c[1]);
  const batch = new Batcher();
  const rand = rng(909);
  const P = { solved: false, island: 3 };
  const stoneM = toon(0xa69e8c, { flatShading: true }), stone2 = toon(0x8c8577, { flatShading: true });
  const brassM = toon(0xd4a24a), darkM = toon(0x2f2b29), woodM = toon(0x7a5536, { flatShading: true });
  const lookAng = angTo(3, 4); // toward the lighthouse
  const dirOf = (deg) => [Math.cos(deg * D2R), Math.sin(deg * D2R)];
  const at = (deg, r, y = 0) => new THREE.Vector3(c[0] + Math.cos(deg * D2R) * r, h + y, c[1] + Math.sin(deg * D2R) * r);

  // floor
  const floor = new THREE.Mesh(new THREE.CylinderGeometry(9.7, 9.9, 0.5, 36), stone2);
  floor.position.set(c[0], h - 0.22, c[1]); floor.receiveShadow = true;
  batch.addObject(floor);
  // broken ring wall, open toward the trail, the beacon and the lighthouse sightline
  const gaps = [[LAYOUT.trailTopAng, 22], [60, 12], [lookAng, 11]];
  const angDiff = (a, b) => { let d = ((a - b) % 360 + 540) % 360 - 180; return Math.abs(d); };
  for (let a = 0; a < 360; a += 7.2) {
    if (gaps.some(([g, w]) => angDiff(a, g) < w)) continue;
    const hh = 0.5 + rand() * 2.0 + (rand() < 0.12 ? 2.2 : 0);
    const p = at(a, 9.3);
    const blk = new THREE.Mesh(new THREE.BoxGeometry(1.2, hh, 0.9), rand() < 0.5 ? stoneM : stone2);
    blk.position.set(p.x, h + hh / 2 - 0.05, p.z);
    blk.rotation.y = Math.atan2(Math.cos(a * D2R), Math.sin(a * D2R)) + (rand() - 0.5) * 0.08;
    blk.castShadow = blk.receiveShadow = true;
    batch.addObject(blk);
    G.physics.addCircle(p.x, p.z, 0.62, h - 1, h + hh, hh > 1.2);
  }
  // rubble
  for (let i = 0; i < 16; i++) {
    const a = rand() * 360, r = 10.5 + rand() * 5;
    const p = at(a, r);
    const g = groundH(p.x, p.z);
    const rb = new THREE.Mesh(new THREE.DodecahedronGeometry(0.3 + rand() * 0.4), stoneM);
    rb.position.set(p.x, g + 0.1, p.z); rb.rotation.set(rand() * 3, rand() * 3, 0);
    rb.castShadow = true;
    batch.addObject(rb);
  }

  // the fallen dome, lying on its side beside the wall
  const domeAng = -40;
  const dp = at(domeAng, 12.6);
  const dg = groundH(dp.x, dp.z);
  const dome = new THREE.Group();
  dome.position.set(dp.x, dg + 3.0, dp.z);
  dome.rotation.set(1.75, (domeAng + 90) * D2R, 0.25, 'YXZ');
  const domeM = toon(0x6fae98, { side: THREE.DoubleSide, flatShading: true });
  const shell = new THREE.Mesh(new THREE.SphereGeometry(4.6, 24, 10, 0.35, Math.PI * 2 - 0.7, 0, Math.PI / 2), domeM);
  shell.castShadow = shell.receiveShadow = true;
  dome.add(shell);
  const ribM = toon(0x4d8674, { flatShading: true });
  for (let k = 0; k < 6; k++) {
    const rib = new THREE.Mesh(new THREE.TorusGeometry(4.66, 0.1, 4, 18, Math.PI), ribM);
    rib.rotation.y = 0.35 + k * (Math.PI * 2 - 0.7) / 5;
    rib.castShadow = true;
    dome.add(rib);
  }
  const lip = new THREE.Mesh(new THREE.TorusGeometry(4.6, 0.18, 5, 32), ribM);
  lip.rotation.x = Math.PI / 2;
  dome.add(lip);
  batch.addObject(dome);
  G.physics.addCircle(dp.x, dp.z, 4.4, dg - 2, dg + 8, true);
  // a shard of the dome
  const shard = new THREE.Mesh(new THREE.SphereGeometry(4.6, 6, 4, 0, 0.6, 0.2, 0.9), domeM);
  const sp = at(domeAng + 30, 13.5);
  shard.position.set(sp.x, groundH(sp.x, sp.z) - 3.3, sp.z);
  shard.rotation.set(0.3, 1.0, 0.1);
  batch.addObject(shard);

  // telescope on its mount (re-set with timber wedges and rope)
  const pier = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.85, 1.3, 10), stoneM);
  pier.position.set(c[0], h + 0.65, c[1]); pier.castShadow = true;
  batch.addObject(pier);
  for (let i = 0; i < 4; i++) {
    const a = i * 90 + 20;
    const w = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.25, 0.9), woodM);
    const p = at(a, 0.95, 0.12);
    w.position.copy(p); w.rotation.y = a * D2R; w.rotation.z = 0.25;
    batch.addObject(w);
  }
  const rope = new THREE.Mesh(new THREE.TorusGeometry(0.66, 0.06, 5, 20), toon(0xcdb58a));
  rope.rotation.x = Math.PI / 2; rope.position.set(c[0], h + 1.05, c[1]);
  batch.addObject(rope);
  G.physics.addCircle(c[0], c[1], 0.95, h - 1, h + 3.5, true);

  const yawG = new THREE.Group();
  yawG.position.set(c[0], h + 1.3, c[1]);
  const table = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.14, 16), brassM);
  table.position.y = 0.07;
  const forkL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.0, 0.45), brassM); forkL.position.set(-0.55, 0.6, 0);
  const forkR = forkL.clone(); forkR.position.x = 0.55;
  yawG.add(table, forkL, forkR);
  const pitchG = new THREE.Group();
  pitchG.position.y = 0.72;
  const tubeM = toon(0x31405a, { flatShading: false });
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.42, 4.4, 18), tubeM);
  tube.rotation.x = Math.PI / 2; tube.position.z = 0.8;
  const band1 = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.06, 6, 20), brassM); band1.position.z = 2.95;
  const band2 = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.05, 6, 20), brassM); band2.position.z = -1.35;
  const band3 = new THREE.Mesh(new THREE.TorusGeometry(0.39, 0.05, 6, 20), brassM); band3.position.z = 0.8;
  const eye = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.45, 8), brassM); eye.rotation.x = Math.PI / 2; eye.position.z = -1.6;
  const lensM = toonUnique(0x9fd8f0, { emissive: new THREE.Color(0xfff2c0), emissiveIntensity: 0.05 });
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.4, 18), lensM); lens.position.z = 3.01;
  const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.3, 8), darkM); axle.rotation.z = Math.PI / 2;
  pitchG.add(tube, band1, band2, band3, eye, lens, axle);
  yawG.add(pitchG);
  yawG.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  G.scene.add(yawG);

  // settings
  const AZ_STEP = 22.5, AZ_N = 16, AZ_T = 11;
  const ELEVS = [-6, 10, 30], EL_T = 0;
  let az = 3, el = 2;
  const azAngle = (k) => lookAng + (k - AZ_T) * AZ_STEP; // polar degrees
  const yawOf = (deg) => { const d = dirOf(deg); return Math.atan2(d[0], d[1]); };
  let curYaw = yawOf(azAngle(az)), curPitch = -ELEVS[el] * D2R;

  // floor inlay pointing at the lighthouse, and the sighting post
  const inlayM = toonUnique(0xd9a441, { emissive: new THREE.Color(0xffc050), emissiveIntensity: 0.05 });
  const ld = dirOf(lookAng);
  const inlay = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.05, 6.0), inlayM);
  inlay.position.set(c[0] + ld[0] * 4.1, h + 0.04, c[1] + ld[1] * 4.1);
  inlay.rotation.y = Math.atan2(ld[0], ld[1]);
  G.scene.add(inlay);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.7, 3), inlayM);
  tip.rotation.x = Math.PI / 2; tip.position.copy(inlay.position).add(new THREE.Vector3(ld[0] * 3.2, 0, ld[1] * 3.2));
  const tipHolder = new THREE.Group(); tipHolder.position.copy(tip.position); tipHolder.rotation.y = inlay.rotation.y; tip.position.set(0, 0, 0);
  tip.scale.set(1, 1, 0.12); tipHolder.add(tip);
  G.scene.add(tipHolder);
  const pivotY = 1.3 + 0.72;
  const postR = 7.8;
  const ringY = pivotY + Math.tan(ELEVS[EL_T] * D2R) * postR;
  const pp = at(lookAng, postR);
  const post = new THREE.Group();
  post.position.set(pp.x, h, pp.z);
  post.rotation.y = Math.atan2(ld[0], ld[1]);
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.3, ringY - 0.3, 0.3), stoneM); shaft.position.y = (ringY - 0.3) / 2;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.07, 6, 18), brassM); ring.position.y = ringY;
  const mini = new THREE.Group(); mini.position.y = ringY + 0.4;
  for (let k = 0; k < 4; k++) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.1 - k * 0.012, 0.11 - k * 0.012, 0.1, 10), toon(k % 2 ? 0xf3efe6 : 0xc62f2a));
    b.position.y = k * 0.1; mini.add(b);
  }
  const miniTop = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.12, 8), toon(0xc62f2a)); miniTop.position.y = 0.42; mini.add(miniTop);
  post.add(shaft, ring, mini);
  batch.addObject(post);
  G.physics.addCircle(pp.x, pp.z, 0.3, h - 1, h + 3, false);

  // controls: crank wheel (turn) and quadrant lever (tilt)
  const crankAng = LAYOUT.trailTopAng + 45, leverAng = LAYOUT.trailTopAng - 45;
  const mkPed = (deg) => {
    const p = at(deg, 2.5);
    const g = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.0, 0.5), stoneM);
    g.position.set(p.x, h + 0.5, p.z); g.castShadow = true;
    batch.addObject(g);
    G.physics.addCircle(p.x, p.z, 0.4, h - 1, h + 1.2, false);
    return p;
  };
  const cp = mkPed(crankAng), lp = mkPed(leverAng);
  const wheel = new THREE.Group();
  wheel.position.set(cp.x, h + 1.2, cp.z);
  const wd = dirOf(crankAng);
  wheel.rotation.y = Math.atan2(wd[0], wd[1]);
  const wheelInner = new THREE.Group(); wheel.add(wheelInner);
  wheelInner.add(new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.05, 6, 20), brassM));
  for (let k = 0; k < 4; k++) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.05, 0.05), brassM); s.rotation.z = k * Math.PI / 4; wheelInner.add(s); }
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.25, 6), darkM); knob.rotation.x = Math.PI / 2; knob.position.set(0.42, 0, 0.12); wheelInner.add(knob);
  wheelInner.position.z = 0.28;
  G.scene.add(wheel);
  const lever = new THREE.Group();
  lever.position.set(lp.x, h + 1.05, lp.z);
  const ldir = dirOf(leverAng);
  lever.rotation.y = Math.atan2(ldir[0], ldir[1]);
  const quadrant = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.06, 16, 1, false, -Math.PI / 2, Math.PI), brassM);
  quadrant.rotation.x = Math.PI / 2; quadrant.position.z = -0.1;
  lever.add(quadrant);
  for (let k = 0; k < 3; k++) {
    const a = (-40 + k * 40) * D2R;
    const n = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.14, 0.08), darkM);
    n.position.set(Math.sin(a) * 0.55, Math.cos(a) * 0.55, -0.05); n.rotation.z = -a;
    lever.add(n);
  }
  const arm = new THREE.Group(); lever.add(arm);
  const armMesh = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.7, 0.08), darkM); armMesh.position.y = 0.35; arm.add(armMesh);
  const handle = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), toon(0xc62f2a)); handle.position.y = 0.72; arm.add(handle);
  G.scene.add(lever);
  batch.build(G.scene);

  let wheelAng = 0;
  const crankPos = new THREE.Vector3(cp.x, h + 1.1, cp.z), leverPos = new THREE.Vector3(lp.x, h + 1.1, lp.z);
  G.interact.add({
    pos: crankPos, radius: 2.2, glyphY: 1.0, hold: true,
    enabled: () => !P.solved,
    action: () => { az = (az + 1) % AZ_N; wheelAng -= Math.PI / 4; G.audio.click('metal', crankPos); },
  });
  G.interact.add({
    pos: leverPos, radius: 2.2, glyphY: 1.0,
    enabled: () => !P.solved,
    action: () => { el = (el + 1) % 3; G.audio.click('metal', leverPos); G.audio.click('wood', leverPos); },
  });

  P.update = (dt) => {
    curYaw = angleLerp(curYaw, yawOf(azAngle(az)), Math.min(1, dt * 5));
    curPitch += (-ELEVS[el] * D2R - curPitch) * Math.min(1, dt * 5);
    yawG.rotation.y = curYaw;
    pitchG.rotation.x = curPitch;
    wheelInner.rotation.z += (wheelAng - wheelInner.rotation.z) * Math.min(1, dt * 8);
    arm.rotation.z += ((40 - el * 40) * D2R - arm.rotation.z) * Math.min(1, dt * 8);
    if (!P.solved && az === AZ_T && el === EL_T && Math.abs(angleLerp(curYaw, yawOf(azAngle(az)), 1) - curYaw) < 0.02 && Math.abs(curPitch + ELEVS[el] * D2R) < 0.02) {
      P.solved = true;
      G.later(0.4, () => {
        lensM.emissiveIntensity = 3.0; inlayM.emissiveIntensity = 1.6;
        G.beacons[3].unlock(); G.input.rumble(0.3, 250);
      });
    }
  };
  P.hintTarget = () => (P.solved ? null : az !== AZ_T ? crankPos : leverPos);
  P.getState = () => ({ az, el, solved: P.solved });
  P.setState = (o) => {
    if (!o) return;
    if (o.az !== undefined) az = o.az;
    if (o.el !== undefined) el = o.el;
    curYaw = yawOf(azAngle(az)); curPitch = -ELEVS[el] * D2R;
    if (o.solved) { P.solved = true; lensM.emissiveIntensity = 3.0; inlayM.emissiveIntensity = 1.6; }
  };
  return P;
}
