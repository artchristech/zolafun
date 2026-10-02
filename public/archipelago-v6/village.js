// Five Lights — stilt village. Sequence puzzle: ring the house bells in the order
// the painted buoys hang on the drying rack. Each right bell lights a lamp on the
// pier gate; a wrong bell snuffs every lamp and silences the bells for a moment.
import * as THREE from './three.module.min.js';
import { toon, mat } from './util.js';
import { VILLAGE as V, ISLANDS } from './layout.js';
import { terrainH, PLATFORMS } from './terrain.js';
import { addBox, addCircle } from './colliders.js';
import { Fire } from './fire.js';
import { Beacon } from './beacon.js';

const WOOD = 0x8a6646, WOOD_D = 0x5e4430, PLANK = 0xa57f55, WALL = 0xd9c7a2;
const BELLS = [392, 466, 523, 622, 698];

export function buildVillage(ctx) {
  const { scene, sound } = ctx;
  const B = ctx.B[0];
  const deck = V.deck;
  // where the pier leaves the beach
  let zStart = 40;
  for (let z = 40; z < 80; z += 0.25) if (terrainH(0, z) < deck) { zStart = z - 2; break; }
  const zEnd = 91.5;
  const pierC = (zStart + zEnd) / 2, pierH = (zEnd - zStart) / 2;
  PLATFORMS.push({ type: 'rect', x: 0, z: pierC, hx: 1.6, hz: pierH, rot: 0, y: deck, surf: 'wood' });
  PLATFORMS.push({ type: 'rect', x: 0, z: 80, hx: 20, hz: 1.4, rot: 0, y: deck, surf: 'wood' });
  const planks = (x0, x1, z0, z1, alongZ) => {
    if (alongZ) {
      for (let x = x0 + 0.25; x < x1; x += 0.5) B.box(0.46, 0.14, z1 - z0, PLANK, x, deck - 0.07, (z0 + z1) / 2);
    } else {
      for (let z = z0 + 0.25; z < z1; z += 0.5) B.box(x1 - x0, 0.14, 0.46, (Math.round(z * 2) % 3) ? PLANK : 0x9a7550, (x0 + x1) / 2, deck - 0.07, z);
    }
  };
  const stilt = (x, z, top = deck - 0.14) => B.cyl(0.13, 0.16, top + 4.6, 5, WOOD_D, x, (top - 4.6) / 2, z);
  planks(-1.6, 1.6, zStart, zEnd, false);
  planks(-20, 20, 78.6, 81.4, true);
  for (let z = zStart + 2; z < zEnd; z += 3) { stilt(-1.5, z); stilt(1.5, z); }
  for (let x = -19; x <= 19; x += 3.2) { stilt(x, 78.7); stilt(x, 81.3); }
  // low rails along the far side of the crosswalk ends
  for (const sx of [-1, 1]) {
    B.box(0.12, 0.9, 0.12, WOOD_D, sx * 20, deck + 0.45, 78.7);
    B.box(0.12, 0.9, 0.12, WOOD_D, sx * 20, deck + 0.45, 81.3);
    B.box(0.08, 0.08, 2.7, WOOD, sx * 20, deck + 0.85, 80);
  }

  // houses
  const posts = [];
  V.houses.forEach((h, i) => {
    const { x, z } = h.c, ry = h.ry, col = V.colors[i];
    const floor = deck + 0.25;
    for (const [sx, sz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) {
      const c = Math.cos(ry), s = Math.sin(ry);
      stilt(x + sx * c + sz * s, z - sx * s + sz * c, floor);
    }
    B.box(5, 0.25, 5, PLANK, x, floor, z, ry);
    B.box(4.6, 2.8, 4.6, WALL, x, floor + 1.5, z, ry);
    // roof
    B.add(new THREE.ConeGeometry(3.9, 2.2, 4), 0x9b4b35, mat(x, floor + 4.0, z, 0, ry + Math.PI / 4, 0));
    B.box(0.5, 1.4, 0.5, 0x7d7268, x + 1.0, floor + 4.3, z - 0.6, ry);
    // painted door + trim facing the walkway (local +z)
    const fx = Math.sin(ry), fz = Math.cos(ry);
    B.box(1.1, 1.9, 0.12, col, x + fx * 2.32, floor + 1.1, z + fz * 2.32, ry);
    B.box(4.8, 0.25, 0.14, col, x + fx * 2.36, floor + 3.0, z + fz * 2.36, ry);
    B.box(0.14, 0.25, 4.8, col, x + Math.cos(ry) * 2.36, floor + 3.0, z - Math.sin(ry) * 2.36, ry);
    B.box(0.14, 0.25, 4.8, col, x - Math.cos(ry) * 2.36, floor + 3.0, z + Math.sin(ry) * 2.36, ry);
    // windows
    for (const sx of [-1, 1]) B.box(0.12, 0.8, 0.9, 0x3b4a5a, x + Math.cos(ry) * 2.32 * sx, floor + 1.7, z - Math.sin(ry) * 2.32 * sx, ry);
    // porch boards to the walkway
    const pz0 = z + fz * 2.5, pz1 = h.post.z;
    const porchC = (pz0 + pz1) / 2, porchH = Math.abs(pz1 - pz0) / 2 + 0.6;
    if (i < 4) {
      PLATFORMS.push({ type: 'rect', x, z: porchC, hx: 1.3, hz: porchH, rot: 0, y: deck, surf: 'wood' });
      planks(x - 1.3, x + 1.3, porchC - porchH, porchC + porchH, true);
    }
    addBox(x, z, 2.5, 2.5, ry, floor - 0.2, floor + 5.2);
    // bell post
    const p = h.post;
    B.box(0.2, 2.3, 0.2, WOOD_D, p.x, deck + 1.15, p.z);
    B.box(0.9, 0.12, 0.12, WOOD_D, p.x, deck + 2.25, p.z);
    // colour flag on the post, matching the door
    B.box(0.05, 0.45, 0.7, col, p.x, deck + 1.85, p.z + 0.38);
    addCircle(p.x, p.z, 0.2, deck, deck + 2.3, true, false);
    const bell = new THREE.Group();
    bell.position.set(p.x + 0.3, deck + 2.18, p.z);
    const bm = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.22, 0.32, 8), toon(0xc59a3a));
    bm.position.y = -0.18; bm.castShadow = true;
    bell.add(bm);
    scene.add(bell);
    posts.push({ i, p, bell, swing: 0 });
  });

  // pier gate with six progress lamps
  const gz = zStart + 3.2;
  B.box(0.3, 4.2, 0.3, WOOD_D, -1.9, deck + 2.1, gz);
  B.box(0.3, 4.2, 0.3, WOOD_D, 1.9, deck + 2.1, gz);
  B.box(4.6, 0.3, 0.35, WOOD, 0, deck + 4.1, gz);
  addCircle(-1.9, gz, 0.25, deck, deck + 4.2); addCircle(1.9, gz, 0.25, deck, deck + 4.2);
  const lamps = [];
  for (let k = 0; k < 6; k++) {
    const lx = -1.6 + k * 0.64;
    B.box(0.03, 0.4, 0.03, 0x222222, lx, deck + 3.75, gz);
    B.cyl(0.11, 0.13, 0.26, 6, 0x3a3a3a, lx, deck + 3.45, gz);
    const f = new Fire(0.3, { embers: false });
    f.group.position.set(lx, deck + 3.3, gz);
    scene.add(f.group);
    lamps.push(f);
  }

  // drying rack: buoys hang in bell order, biggest first, starting at the anchor post
  const r = V.rack, ry = Math.atan2(0.57, 0.82);
  const ux = Math.sin(ry + Math.PI / 2), uz = Math.cos(ry + Math.PI / 2);
  const rh = terrainH(r.x, r.z);
  B.box(0.25, 3.6, 0.25, WOOD_D, r.x - ux * 3.6, rh + 1.8, r.z - uz * 3.6);
  B.box(0.18, 2.6, 0.18, WOOD_D, r.x + ux * 3.4, rh + 1.3, r.z + uz * 3.4);
  B.box(0.12, 0.12, 7.2, WOOD, r.x, rh + 2.55, r.z, ry + Math.PI / 2);
  // anchor leaning on the first post
  B.box(0.12, 1.4, 0.12, 0x3b3b3b, r.x - ux * 3.9, rh + 0.7, r.z - uz * 3.9, 0, 0, 0.2);
  B.add(new THREE.TorusGeometry(0.45, 0.08, 4, 10, Math.PI), 0x3b3b3b, mat(r.x - ux * 3.9, rh + 0.25, r.z - uz * 3.9, Math.PI, ry, 0));
  V.order.forEach((ci, k) => {
    const t = -2.6 + k * 1.05, sz = 0.42 - k * 0.035;
    const bx = r.x + ux * t, bz = r.z + uz * t;
    B.box(0.02, 0.5, 0.02, 0x2a2a2a, bx, rh + 2.3, bz);
    B.add(new THREE.SphereGeometry(sz, 10, 8), V.colors[ci], mat(bx, rh + 2.05 - sz, bz, 0, 0, 0, 1, 1.25, 1));
  });
  addCircle(r.x - ux * 3.6, r.z - uz * 3.6, 0.3, rh, rh + 3.6);
  addCircle(r.x + ux * 3.4, r.z + uz * 3.4, 0.25, rh, rh + 2.6);

  // dressing: moored boats, barrels, nets
  for (const [bx, bz, a] of [[-5, 66, 0.1], [6, 70, -0.15], [-24, 80, 1.5]]) {
    const boat = ctx.makeBoat(false);
    boat.position.set(bx, 0, bz);
    boat.rotation.y = a;
    scene.add(boat);
    ctx.floaters.push(boat);
  }
  for (const [bx, bz] of [[1.2, 62], [-1.1, 63], [16, 79.6], [-17, 80.6]]) B.cyl(0.32, 0.32, 0.8, 7, 0x7b5434, bx, deck + 0.4, bz);
  const beachRocks = [[-30, 30], [28, 40], [-20, 50], [33, 10], [-36, 5]];
  beachRocks.forEach(([bx, bz], i) => B.rock(1.4, 0x8b8378, bx, terrainH(bx, bz) + 0.2, bz, i + 3));

  // beacon on the knoll
  const bh = terrainH(V.beacon.x, V.beacon.z);
  const beacon = new Beacon(scene, V.beacon.x, V.beacon.z, bh);

  const puzzle = {
    index: 0, beacon, solved: false,
    center: new THREE.Vector3(0, deck, 80), focusR: 24,
    progress: 0, lock: 0,
    hint: new THREE.Vector3(0, deck, gz),
  };
  const lightLamps = (instant) => lamps.forEach((f, k) => { f.lit = k < puzzle.progress; if (instant) f.snap(); });
  posts.forEach((P) => {
    ctx.interact({
      pos: new THREE.Vector3(P.p.x, deck + 1.2, P.p.z), r: 2.3, at: 0,
      enabled: () => !puzzle.solved && puzzle.lock <= 0,
      press: () => {
        P.swing = 1;
        const bp = { x: P.p.x, y: deck + 2, z: P.p.z };
        sound.play('bell', bp, BELLS[P.i]);
        if (V.order[puzzle.progress] === P.i) {
          puzzle.progress++;
          lightLamps();
          sound.play('step-ok', { x: 0, y: deck + 3.5, z: gz }, 520 + puzzle.progress * 90);
          if (puzzle.progress === V.order.length) {
            puzzle.solved = true;
            beacon.setState(1);
            sound.play('chime', bp);
            ctx.solved(0);
          }
        } else {
          puzzle.progress = 0;
          lamps.forEach((f) => { f.lit = false; f.intensity = 0; f.apply(); });
          puzzle.lock = 4;
          sound.play('wrong', { x: 0, y: deck + 3.5, z: gz });
          sound.play('splash', bp);
          for (const Q of posts) Q.swing = 0.6;
        }
        ctx.save();
      },
    });
  });
  puzzle.update = (dt) => {
    puzzle.lock = Math.max(0, puzzle.lock - dt);
    for (const P of posts) {
      P.swing = Math.max(0, P.swing - dt * 0.6);
      const shake = puzzle.lock > 0 ? Math.sin(performance.now() * 0.03) * 0.05 : 0;
      P.bell.rotation.z = Math.sin(performance.now() * 0.012) * 0.5 * P.swing + shake;
    }
    for (const f of lamps) f.update(dt, 3);
    beacon.update(dt);
  };
  puzzle.save = () => ({ p: puzzle.progress, s: puzzle.solved });
  puzzle.load = (s) => {
    if (!s) return;
    puzzle.progress = s.p || 0; puzzle.solved = !!s.s;
    if (puzzle.solved) puzzle.progress = V.order.length;
    lightLamps(true);
  };
  puzzle.exclusions = [
    { x: V.beacon.x, z: V.beacon.z, r: 5 }, { x: r.x, z: r.z, r: 6 }, { x: 0, z: zStart, r: 6 },
    { x: V.start.x, z: V.start.z, r: 4 },
  ];
  return puzzle;
}
