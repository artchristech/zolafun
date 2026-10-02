// Five Lights — the shipwreck in the forest. Light the stern lamp, then set three
// bronze mirrors so its beam can travel to the beacon. Each mirror clicks between
// four carved notches. The old beam scorched its route into the moss; the beam
// only appears once the lamp burns and every mirror on the route is set.
import * as THREE from './three.module.min.js';
import { toon, mat } from './util.js';
import { FOREST as F } from './layout.js';
import { terrainH } from './terrain.js';
import { addBox, addCircle } from './colliders.js';
import { Fire } from './fire.js';
import { Beacon } from './beacon.js';

const CORRECT = [2, 0, 3, 1]; // notch index that is right for each mirror (last = decoy, never on route)

export function buildForest(ctx) {
  const { scene, sound } = ctx;
  const B = ctx.B[2];
  // ---- ship
  const S = F.ship, sh = terrainH(S.x, S.z);
  const ship = new THREE.Group();
  ship.position.set(S.x, sh + 0.6, S.z);
  ship.rotation.set(0, S.ry, 0.22);
  ship.updateMatrixWorld(true);
  const sb = (geo, col, m) => B.add(geo, col, ship.matrixWorld.clone().multiply(m));
  sb(new THREE.CylinderGeometry(2.5, 2.5, 12, 12, 1, true, Math.PI, Math.PI), 0x6a4a32, mat(0, 1.6, 0, 0, 0, Math.PI / 2));
  sb(new THREE.CylinderGeometry(2.42, 2.42, 12, 12, 1, true, Math.PI, Math.PI), 0x4a3424, mat(0, 1.6, 0, 0, 0, Math.PI / 2));
  sb(new THREE.ConeGeometry(2.5, 4, 12, 1, true, Math.PI, Math.PI), 0x6a4a32, mat(-8, 1.6, 0, 0, 0, Math.PI / 2));
  sb(new THREE.BoxGeometry(12, 0.15, 4.6), 0x8a6a48, mat(0, 1.55, 0));
  sb(new THREE.BoxGeometry(0.5, 0.5, 14.5), 0x3b2a1c, mat(-1, -0.6, 0, 0, Math.PI / 2, 0));
  for (let k = -5; k <= 5; k += 1.6) sb(new THREE.TorusGeometry(2.45, 0.12, 4, 10, Math.PI), 0x3b2a1c, mat(k, 1.6, 0, 0, Math.PI / 2, Math.PI));
  sb(new THREE.CylinderGeometry(0.22, 0.3, 9, 7), 0x5a412c, mat(1, 6.5, 0.6, 0.25, 0, 0.35));
  sb(new THREE.BoxGeometry(5, 0.18, 0.18), 0x5a412c, mat(-0.2, 8.5, 0.9, 0, 0.3, 0.35));
  sb(new THREE.BoxGeometry(2.2, 1.4, 3.4), 0x7a5a3c, mat(4.2, 2.3, 0));
  // tattered sail
  sb(new THREE.PlaneGeometry(3.6, 2.6, 1, 1), 0xd8ccb0, mat(0.2, 7.0, 1.1, 0.2, 0.3, 0.35));
  addBox(S.x, S.z, 7.2, 2.6, S.ry, sh - 1, sh + 6);

  // ---- stern lamp on a davit
  const L = F.lamp, lh = terrainH(L.x, L.z);
  B.box(0.25, 3.3, 0.25, 0x3b2a1c, L.x - 0.6, lh + 1.65, L.z);
  B.box(1.2, 0.18, 0.18, 0x3b2a1c, L.x - 0.1, lh + 3.25, L.z);
  B.cyl(0.24, 0.3, 0.55, 6, 0x2c2c2c, L.x + 0.3, lh + 2.7, L.z);
  addCircle(L.x - 0.6, L.z, 0.3, lh, lh + 3.3);
  const lampFire = new Fire(0.55, { hot: 1.2 });
  lampFire.group.position.set(L.x + 0.3, lh + 2.42, L.z);
  scene.add(lampFire.group);
  const lampPos = new THREE.Vector3(L.x + 0.3, lh + 2.7, L.z);

  // ---- mirrors
  const bh = terrainH(F.beacon.x, F.beacon.z);
  const beacon = new Beacon(scene, F.beacon.x, F.beacon.z, bh);
  const route = [lampPos];
  const mirrorDefs = [...F.mirrors, F.decoy];
  const mirrors = mirrorDefs.map((p, i) => {
    const h = terrainH(p.x, p.z);
    const top = new THREE.Vector3(p.x, h + 2.3, p.z);
    if (i < 3) route.push(top);
    B.cyl(0.5, 0.65, 1.5, 8, 0x8d8679, p.x, h + 0.75, p.z);
    B.cyl(0.85, 0.85, 0.12, 12, 0x9f978a, p.x, h + 1.55, p.z);
    addCircle(p.x, p.z, 0.7, h - 1, h + 3);
    return { i, p, h, top, notch: (CORRECT[i] + 1 + (i % 3)) % 4, shown: 0, angles: [] };
  });
  route.push(beacon.top.clone().add(new THREE.Vector3(0, 0.6, 0)));
  const mirrorMat = toon(0xd9b26a);
  const glassMat = new THREE.MeshBasicMaterial({ color: 0xbfd8e0 });
  mirrors.forEach((m, i) => {
    let correct;
    if (i < 3) {
      const a = route[i], b = route[i + 2], c = m.top;
      const d1 = new THREE.Vector3().subVectors(a, c).setY(0).normalize();
      const d2 = new THREE.Vector3().subVectors(b, c).setY(0).normalize();
      const nrm = d1.add(d2).normalize();
      correct = Math.atan2(nrm.x, nrm.z);
    } else correct = 0.4;
    for (let j = 0; j < 4; j++) m.angles.push(correct + (j - CORRECT[i]) * Math.PI / 4);
    // carved notches on the turntable, one for each position
    for (let j = 0; j < 4; j++) {
      const a = m.angles[j];
      B.box(0.09, 0.05, 0.4, 0x3a332c, m.p.x + Math.sin(a) * 0.62, m.h + 1.63, m.p.z + Math.cos(a) * 0.62, a);
    }
    const g = new THREE.Group();
    g.position.set(m.p.x, m.h + 1.6, m.p.z);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.25, 1.35, 0.12), mirrorMat);
    frame.position.y = 0.75; frame.castShadow = true;
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 1.15), glassMat);
    glass.position.set(0, 0.75, 0.07);
    const pointer = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.5), mirrorMat);
    pointer.position.set(0, 0.06, 0.55);
    g.add(frame, glass, pointer);
    scene.add(g);
    m.g = g;
    m.shown = m.angles[m.notch];
    g.rotation.y = m.shown;
  });

  // ---- beam
  const beamMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.0, 2.2, 1.2), transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending });
  const beams = [];
  for (let i = 0; i < route.length - 1; i++) {
    const a = route[i], b = route[i + 1], len = a.distanceTo(b);
    const geo = new THREE.CylinderGeometry(0.07, 0.07, 1, 6, 1, true);
    geo.translate(0, 0.5, 0); geo.rotateX(Math.PI / 2);
    const m = new THREE.Mesh(geo, beamMat);
    m.position.copy(a); m.lookAt(b);
    m.scale.set(1, 1, 0.001); m.visible = false;
    m.userData.len = len;
    scene.add(m);
    beams.push(m);
  }

  const puzzle = {
    index: 2, beacon, solved: false, lampLit: false, beamT: -1, busy: 0,
    center: new THREE.Vector3(F.beacon.x, bh, F.beacon.z), focusR: 30,
    hint: new THREE.Vector3(F.ship.x, sh, F.ship.z),
  };
  const routeSet = () => mirrors.slice(0, 3).every((m, i) => m.notch === CORRECT[i]);
  const tryBeam = () => {
    if (puzzle.lampLit && routeSet() && puzzle.beamT < 0) {
      puzzle.beamT = 0;
      sound.play('whoosh', lampPos);
    }
  };
  ctx.interact({
    pos: lampPos.clone().setY(lh + 1.4), r: 2.6, at: 2,
    enabled: () => !puzzle.lampLit,
    press: () => {
      ctx.raiseLantern(() => {
        puzzle.lampLit = true;
        lampFire.lit = true;
        sound.play('whoosh', lampPos);
        tryBeam();
        ctx.save();
      });
    },
  });
  mirrors.forEach((m) => {
    ctx.interact({
      pos: new THREE.Vector3(m.p.x, m.h + 1.4, m.p.z), r: 2.4, at: 2,
      enabled: () => !puzzle.solved && puzzle.beamT < 0 && puzzle.busy <= 0,
      press: () => {
        m.notch = (m.notch + 1) % 4;
        puzzle.busy = 0.7;
        sound.play('clack', m.top);
        setTimeout(tryBeam, 700);
        ctx.save();
      },
    });
  });

  puzzle.update = (dt) => {
    puzzle.busy = Math.max(0, puzzle.busy - dt);
    for (const m of mirrors) {
      let target = m.angles[m.notch];
      // rotate forward through the notches (the 4th click swings back round)
      let d = target - m.shown;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      m.shown += Math.sign(d) * Math.min(Math.abs(d), dt * 3.5);
      m.g.rotation.y = m.shown;
    }
    if (puzzle.beamT >= 0) {
      puzzle.beamT += dt;
      let t = puzzle.beamT * 12; // metres travelled
      for (const b of beams) {
        const L = b.userData.len;
        const k = Math.max(0, Math.min(1, t / L));
        b.visible = k > 0;
        b.scale.z = Math.max(0.001, k * L);
        t -= L;
      }
      if (t > 0 && !puzzle.solved) {
        puzzle.solved = true;
        beacon.setState(1);
        sound.play('chime', beacon.top);
        ctx.solved(2);
      }
      beamMat.opacity = 0.65 + 0.25 * Math.sin(puzzle.beamT * 3);
    }
    lampFire.update(dt);
    beacon.update(dt);
  };
  puzzle.save = () => ({ l: puzzle.lampLit, m: mirrors.map((m) => m.notch), s: puzzle.solved });
  puzzle.load = (s) => {
    if (!s) return;
    puzzle.lampLit = !!s.l;
    lampFire.lit = puzzle.lampLit; lampFire.snap();
    if (Array.isArray(s.m)) mirrors.forEach((m, i) => { m.notch = (s.m[i] | 0) & 3; m.shown = m.angles[m.notch]; });
    if (s.s) { puzzle.solved = true; puzzle.beamT = 999; }
  };
  puzzle.exclusions = [
    { x: S.x, z: S.z, r: 9 }, { x: L.x, z: L.z, r: 3 }, { x: F.beacon.x, z: F.beacon.z, r: 5 },
    ...mirrorDefs.map((p) => ({ x: p.x, z: p.z, r: 3 })),
  ];
  return puzzle;
}
