// Five Lights — the great lighthouse. Eight levers ring its foot, each with a stone
// pointer aimed out to sea; each opens one shutter of the lamp room. Open exactly
// the shutters that face the four burning beacons, then light the brazier at the
// door: the flame climbs the tower and the lamp takes — or sputters out.
import * as THREE from './three.module.min.js';
import { toon, mat } from './util.js';
import { LIGHT as LH, BEACONS, octantFromLighthouse } from './layout.js';
import { terrainH, PLATFORMS } from './terrain.js';
import { addCircle } from './colliders.js';
import { Beacon } from './beacon.js';
import { Fire } from './fire.js';
import { bearingDir } from './peak.js';

const RED = 0xc8322a, WHITE = 0xf3eee4, STONE = 0x9a948a;

export function buildLighthouse(ctx) {
  const { scene, sound } = ctx;
  const B = ctx.B[4];
  const c = LH.c, base = terrainH(c.x, c.z) + 0.06;
  PLATFORMS.push({ type: 'circle', x: c.x, z: c.z, r: 10.5, y: base, surf: 'stone' });
  B.cyl(10.5, 11, 0.8, 32, STONE, c.x, base - 0.4, c.z);
  // tower: eight hard-edged bands
  const bands = 8, H = LH.towerH, bh = H / bands;
  const rAt = (y) => 3.4 - (y / H) * 0.9;
  for (let i = 0; i < bands; i++) {
    const y0 = i * bh, y1 = y0 + bh;
    B.cyl(rAt(y1), rAt(y0), bh, 24, i % 2 ? WHITE : RED, c.x, base + y0 + bh / 2, c.z);
  }
  addCircle(c.x, c.z, 3.5, base - 1, base + H + 6);
  // door facing the village
  B.box(1.3, 2.3, 0.4, 0x4a3426, c.x, base + 1.15, c.z + 3.3);
  B.box(1.7, 0.3, 0.5, WHITE, c.x, base + 2.4, c.z + 3.3);
  // windows up the tower
  for (let i = 1; i < bands; i += 2) B.box(0.5, 0.8, 0.3, 0x2a3540, c.x + Math.sin(i) * rAt(i * bh + 1), base + i * bh + 1.4, c.z + Math.cos(i) * rAt(i * bh + 1), i);
  // gallery and lamp room
  const gy = base + H;
  B.cyl(3.4, 2.6, 0.4, 24, 0x3a3634, c.x, gy + 0.2, c.z);
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2;
    B.box(0.06, 1.0, 0.06, 0x2a2624, c.x + Math.cos(a) * 3.2, gy + 0.9, c.z + Math.sin(a) * 3.2);
  }
  B.add(new THREE.TorusGeometry(3.2, 0.05, 3, 24), 0x2a2624, mat(c.x, gy + 1.4, c.z, Math.PI / 2, 0, 0));
  B.cyl(1.9, 1.9, 0.25, 16, 0x3a3634, c.x, gy + 3.6, c.z);
  B.add(new THREE.ConeGeometry(2.2, 1.8, 16), RED, mat(c.x, gy + 4.6, c.z));
  B.add(new THREE.SphereGeometry(0.25, 8, 6), 0x3a3634, mat(c.x, gy + 5.6, c.z));
  for (let k = 0; k < 8; k++) {
    const d = bearingDir(k + 0.5, 8);
    B.box(0.12, 3.3, 0.12, 0x2a2624, c.x + d.x * 1.85, gy + 1.95, c.z + d.z * 1.85);
  }
  const lampY = gy + 1.4;
  const beacon = new Beacon(scene, c.x, c.z, lampY, { bare: true, size: 2.0 });

  // shutters (one per octant), hinged at the top
  const shutterMat = toon(0x3d4a52);
  const shutters = [];
  for (let k = 0; k < 8; k++) {
    const d = bearingDir(k, 8);
    const g = new THREE.Group();
    g.position.set(c.x + d.x * 1.75, gy + 3.35, c.z + d.z * 1.75);
    g.rotation.y = Math.atan2(d.x, d.z);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(1.3, 2.9, 0.08), shutterMat);
    panel.position.y = -1.45; panel.castShadow = true;
    g.add(panel);
    scene.add(g);
    shutters.push({ g, open: false, shown: 0 });
  }

  // levers with outward pointers
  const levers = [];
  for (let k = 0; k < 8; k++) {
    const d = bearingDir(k, 8), a = Math.atan2(d.x, d.z);
    const x = c.x + d.x * LH.leverR, z = c.z + d.z * LH.leverR;
    B.box(0.5, 0.9, 0.5, STONE, x, base + 0.45, z);
    // pointer stone aimed out to sea
    B.add(new THREE.ConeGeometry(0.35, 1.3, 4), 0x7c766c, mat(x + d.x * 0.9, base + 0.35, z + d.z * 0.9, Math.PI / 2, a, 0, 1, 1, 0.5));
    addCircle(x, z, 0.35, base, base + 1.2, true, false);
    const g = new THREE.Group();
    g.position.set(x, base + 0.9, z);
    g.rotation.y = a;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.9, 0.08), toon(0x2a2624));
    arm.position.y = 0.45; g.add(arm);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.11, 6, 4), toon(0xc59a3a));
    knob.position.y = 0.9; g.add(knob);
    scene.add(g);
    levers.push({ k, x, z, g, shown: 0 });
  }

  // brazier at the door
  const br = LH.brazier, brh = base;
  B.cyl(0.55, 0.4, 0.9, 8, 0x2e2a28, br.x, brh + 0.45, br.z);
  B.add(new THREE.TorusGeometry(0.6, 0.06, 4, 10), 0x2e2a28, mat(br.x, brh + 0.92, br.z, Math.PI / 2, 0, 0));
  addCircle(br.x, br.z, 0.6, base, base + 1);
  const brFire = new Fire(0.9);
  brFire.group.position.set(br.x, brh + 0.95, br.z);
  scene.add(brFire.group);
  // the climbing flame
  const climber = new Fire(0.8, { hot: 1.4 });
  scene.add(climber.group);

  const want = new Set(BEACONS.slice(0, 4).map((p) => octantFromLighthouse(p)));
  const puzzle = {
    index: 4, beacon, solved: false, busy: 0, run: -1,
    center: new THREE.Vector3(c.x, base, c.z), focusR: 14,
    hint: new THREE.Vector3(br.x, base, br.z),
  };
  const correct = () => shutters.every((s, k) => s.open === want.has(k));
  levers.forEach((L) => {
    ctx.interact({
      pos: new THREE.Vector3(L.x, base + 1.0, L.z), r: 1.9, at: 4,
      enabled: () => !puzzle.solved && puzzle.run < 0 && puzzle.busy <= 0,
      press: () => {
        const s = shutters[L.k];
        s.open = !s.open;
        puzzle.busy = 0.45;
        sound.play('clack', { x: L.x, y: base + 1, z: L.z });
        sound.play('clunk', { x: c.x, y: gy + 2, z: c.z });
        ctx.save();
      },
    });
  });
  ctx.interact({
    pos: new THREE.Vector3(br.x, base + 0.9, br.z), r: 2.0, at: 4,
    enabled: () => !puzzle.solved && puzzle.run < 0,
    press: () => {
      ctx.raiseLantern(() => {
        brFire.lit = true;
        sound.play('whoosh', { x: br.x, y: base + 1, z: br.z });
        puzzle.run = 0;
      });
    },
  });
  puzzle.update = (dt) => {
    puzzle.busy = Math.max(0, puzzle.busy - dt);
    shutters.forEach((s, k) => {
      const t = s.open ? 1 : 0;
      s.shown += Math.sign(t - s.shown) * Math.min(Math.abs(t - s.shown), dt * 2.5);
      s.g.rotation.x = -s.shown * 1.35;
      const L = levers[k];
      L.shown += Math.sign(t - L.shown) * Math.min(Math.abs(t - L.shown), dt * 4);
      L.g.rotation.x = L.shown * 1.2 - 0.6;
    });
    if (puzzle.run >= 0) {
      puzzle.run += dt;
      const climbT = puzzle.run - 0.8;
      if (climbT > 0 && climbT < 3) {
        const k = climbT / 3;
        climber.lit = true;
        climber.group.position.set(c.x + Math.sin(k * 18) * rAt(k * H) * 1.02, base + 1 + k * (lampY - base - 1), c.z + Math.cos(k * 18) * rAt(k * H) * 1.02);
      } else if (climbT >= 3 && climber.lit) {
        climber.lit = false; climber.intensity = 0; climber.apply();
        if (correct()) {
          puzzle.solved = true;
          ctx.lightBeacon(4);
          ctx.solved(4);
        } else {
          sound.play('sputter', { x: c.x, y: lampY, z: c.z });
          sound.play('wrong', { x: br.x, y: base + 1, z: br.z });
        }
      }
      if (climbT > 4.5 && !puzzle.solved) {
        brFire.lit = false;
        if (climbT > 5.5) puzzle.run = -1;
      }
    }
    brFire.update(dt, 2);
    climber.update(dt, 4);
    beacon.update(dt);
  };
  puzzle.save = () => ({ o: shutters.map((s) => (s.open ? 1 : 0)), s: puzzle.solved });
  puzzle.load = (s) => {
    if (!s) return;
    if (Array.isArray(s.o)) shutters.forEach((sh, k) => { sh.open = !!s.o[k]; sh.shown = sh.open ? 1 : 0; levers[k].shown = sh.shown; });
    if (s.s) { puzzle.solved = true; brFire.lit = true; brFire.snap(); }
  };
  puzzle.exclusions = [{ x: c.x, z: c.z, r: 12 }];
  puzzle.lampY = lampY;
  return puzzle;
}
