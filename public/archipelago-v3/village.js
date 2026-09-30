import * as THREE from './three.module.min.js';
import { toon, toonUnique } from './materials.js';
import { LAYOUT, ISLANDS, coastR, groundH, D2R } from './terrain.js';
import { Fire } from './fire.js';
import { Batcher } from './batch.js';
import { rng } from './noise.js';

export const VILLAGE_TOP = 4.2;
const COLORS = [0xd8413a, 0xf2c53d, 0x3b76d6, 0x4caf50, 0xf4f1ea];
const SEQ = [2, 0, 4, 1, 3];
const BELLS = [523.3, 587.3, 659.3, 784, 880];

// Beacon 3 — the stilt village. The carved pole by the pier wears five coloured bands,
// bottom to top. Ring the house lanterns in that order: each right one lights its lantern
// and its band; a wrong one snuffs every lantern and darkens the pole.
export function buildVillage(G) {
  const V = ISLANDS[2].c;
  const TOP = VILLAGE_TOP;
  const batch = new Batcher();
  const rand = rng(303);
  const pt = (deg, r) => [V[0] + Math.cos(deg * D2R) * r, V[1] + Math.sin(deg * D2R) * r];
  const angs = LAYOUT.houseAngles;
  const Rc = angs.map((a) => coastR(2, a * D2R));
  const P = { solved: false, island: 2, progress: 0, docks: [] };

  const plankA = toon(0x9c7650, { flatShading: true }), plankB = toon(0x8a6644, { flatShading: true });
  const stiltM = toon(0x4d3524);
  const unitX = new THREE.Vector3(1, 0, 0);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1), p3 = new THREE.Vector3();
  const plankGeo = new THREE.BoxGeometry(0.46, 0.14, 1, 1, 1, 1);
  const stiltGeo = new THREE.CylinderGeometry(0.13, 0.15, 1, 6);

  function addDeck(a, b, hw, ext = 0.4) {
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const len = Math.hypot(dx, dz);
    const ux = dx / len, uz = dz / len;
    const yaw = Math.atan2(dz, dx);
    const cx = (a[0] + b[0]) / 2, cz = (a[1] + b[1]) / 2;
    const hl = len / 2 + ext;
    G.physics.addPlatform(cx, cz, yaw, hl, hw, TOP);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -yaw);
    const n = Math.ceil(hl * 2 / 0.5);
    for (let i = 0; i < n; i++) {
      const t = -hl + (i + 0.5) * (hl * 2 / n);
      p3.set(cx + ux * t, TOP - 0.07, cz + uz * t);
      sc.set(1, 1, hw * 2 * (0.96 + rand() * 0.06));
      m4.compose(p3, q, sc);
      batch.add(plankGeo, m4, i % 3 === 0 ? plankB : plankA, true, true);
    }
    // stilts along both edges
    const px = -uz, pz = ux;
    for (let t = -hl + 0.3; t <= hl - 0.2; t += 2.4) {
      for (const s of [-1, 1]) {
        const x = cx + ux * t + px * s * (hw - 0.12), z = cz + uz * t + pz * s * (hw - 0.12);
        const g = groundH(x, z) - 0.6;
        const h = TOP - 0.12 - g;
        if (h <= 0.1) continue;
        p3.set(x, g + h / 2, z);
        sc.set(1, h, 1);
        m4.compose(p3, new THREE.Quaternion(), sc);
        batch.add(stiltGeo, m4, stiltM, true, false);
      }
    }
  }

  // spine walkway along the old shoreline, piers out to each house
  const spine = angs.map((a, i) => pt(a, Rc[i]));
  for (let i = 0; i < spine.length - 1; i++) addDeck(spine[i], spine[i + 1], 1.1, 0.9);
  // land piers: start where the ground reaches deck height
  for (const a of [(angs[0] + angs[1]) / 2, angs[2], (angs[3] + angs[4]) / 2]) {
    const rc = coastR(2, a * D2R);
    let r = rc - 1;
    for (let k = 0; k < 90; k++) { const p = pt(a, r); if (groundH(p[0], p[1]) >= TOP - 0.05) break; r -= 0.5; }
    addDeck(pt(a, r - 0.6), pt(a, rc - 0.3), 1.0, 0.2);
  }

  const wallM = toon(0xb89a74, { flatShading: true }), wall2 = toon(0xa5876a, { flatShading: true });
  const roofMs = [toon(0x7a4538, { flatShading: true }), toon(0x3f6670, { flatShading: true }), toon(0x6a5a44, { flatShading: true })];
  const darkM = toon(0x2d2522), ironM = toon(0x302c2a);
  const roofGeo = new THREE.CylinderGeometry(3.1, 3.1, 6.0, 3, 1);
  roofGeo.rotateX(-Math.PI / 2); roofGeo.rotateY(Math.PI / 2); roofGeo.scale(1, 0.55, 1);
  const flagGeo = new THREE.BufferGeometry();
  flagGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, -0.9, 0, 1.6, -0.45, 0], 3));
  flagGeo.setIndex([0, 1, 2]);
  flagGeo.computeVertexNormals();
  P.houses = [];
  P.flags = [];

  for (let i = 0; i < 5; i++) {
    const a = angs[i], r0 = Rc[i];
    addDeck(pt(a, r0 - 0.5), pt(a, r0 + 7.2), 0.9, 0.2);
    addDeck(pt(a, r0 + 7.0), pt(a, r0 + 15.0), 3.4, 0);
    const hc = pt(a, r0 + 12.4);
    const dir = [Math.cos(a * D2R), Math.sin(a * D2R)];
    const house = new THREE.Group();
    house.position.set(hc[0], TOP, hc[1]);
    house.rotation.y = Math.atan2(dir[0], dir[1]); // local +z = out to sea, door on -z
    const col = COLORS[i];
    const doorM = toon(col, { flatShading: true });
    const body = new THREE.Mesh(new THREE.BoxGeometry(5.2, 3.2, 4.8), i % 2 ? wallM : wall2);
    body.position.y = 1.6; body.castShadow = body.receiveShadow = true;
    const roof = new THREE.Mesh(roofGeo, roofMs[i % 3]);
    roof.position.y = 3.2 + 0.85; roof.castShadow = true;
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.1, 0.12), doorM);
    door.position.set(-0.4, 1.05, -2.43);
    const trim = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.25, 5.0), doorM);
    trim.position.y = 3.15;
    const win1 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.8, 0.9), darkM); win1.position.set(2.62, 1.8, 0);
    const win2 = win1.clone(); win2.position.x = -2.62;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 2.4, 5), ironM);
    pole.position.set(1.6, 3.2 + 1.9 + 1.0, 0);
    const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.7), ironM);
    bracket.position.set(1.0, 2.55, -2.75);
    house.add(body, roof, door, trim, win1, win2, pole, bracket);
    batch.addObject(house);
    house.clear();
    // flag (animated)
    const flag = new THREE.Mesh(flagGeo, toon(col, { side: THREE.DoubleSide }));
    flag.position.set(1.6, 3.2 + 1.9 + 2.15, 0);
    flag.castShadow = true;
    house.add(flag);
    P.flags.push(flag);
    // lantern
    const glass = toonUnique(0xf8ecc8, { emissive: new THREE.Color(0xffa040), emissiveIntensity: 0.0 });
    const cage = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.44, 0.34), glass);
    cage.position.set(1.0, 2.15, -3.05);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.22, 4), doorM);
    cap.position.set(1.0, 2.48, -3.05); cap.rotation.y = Math.PI / 4;
    house.add(cage, cap);
    const fire = new Fire({ size: [0.22, 0.36], hdr: 1.7, embers: 4, halo: 1.2, emberHeight: 0.4, emberSize: 0.035, haloDay: 0.1 });
    fire.group.position.set(1.0, 1.98, -3.05);
    house.add(fire.group);
    const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(0.35, 1), new THREE.MeshBasicMaterial({ color: 0x9a9690, transparent: true, opacity: 0, depthWrite: false }));
    puff.position.set(1.0, 2.4, -3.05);
    puff.visible = false;
    house.add(puff);
    G.scene.add(house);
    house.updateMatrixWorld(true);
    G.fires.push(fire);
    const lp = new THREE.Vector3(); fire.group.getWorldPosition(lp); lp.y += 0.2;
    G.lightSources.push({ pos: lp, color: new THREE.Color(1, 0.65, 0.3), power: 18, range: 16, fire });
    G.physics.addCircle(hc[0], hc[1], 2.75, TOP - 0.5, TOP + 6, true);
    const ipos = new THREE.Vector3(); house.localToWorld(ipos.set(0.5, 1.2, -3.9));
    const H = { i, fire, glass, puff, puffT: -1, ipos };
    P.houses.push(H);
    G.interact.add({
      pos: ipos, radius: 2.4, glyphY: 1.4,
      enabled: () => !P.solved && !P.resetting,
      action: () => press(H),
    });
    P.docks.push(pt(a + (i % 2 ? 4 : -4), r0 + 23)); // moorings in deep water beyond the houses
  }

  // the carved pole: bands bottom -> top give the order
  const T = LAYOUT.totem;
  const th = groundH(T[0], T[1]);
  const totem = new THREE.Group();
  totem.position.set(T[0], th, T[1]);
  const poleM = toon(0x6b4a32, { flatShading: true });
  const tp = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.38, 7.4, 8), poleM);
  tp.position.y = 3.7; tp.castShadow = true;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.2, 0.5, 8), toon(0x9a9384, { flatShading: true }));
  base.position.y = 0.2; base.castShadow = base.receiveShadow = true;
  totem.add(tp, base);
  batch.addObject(totem);
  totem.clear();
  const rings = [];
  for (let k = 0; k < 5; k++) {
    const c = COLORS[SEQ[k]];
    const m = toonUnique(c, { emissive: new THREE.Color(c), emissiveIntensity: 0, flatShading: true });
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.56, 0.62, 12), m);
    r.position.y = 1.2 + k * 1.1; r.castShadow = true;
    totem.add(r);
    rings.push(m);
  }
  const fishM = toonUnique(0xd9a441, { emissive: new THREE.Color(0xffc060), emissiveIntensity: 0 });
  const fish = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.4, 6), fishM);
  fish.rotation.z = Math.PI / 2; fish.position.set(0, 7.7, 0);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.5, 3), fishM);
  tail.rotation.z = -Math.PI / 2; tail.position.set(-0.85, 7.7, 0);
  totem.add(fish, tail);
  G.scene.add(totem);
  G.physics.addCircle(T[0], T[1], 1.1, th - 1, th + 8, true);

  // bits of village life: an upturned boat and net racks
  const boatM = toon(0x4f7a8a, { flatShading: true });
  for (let k = 0; k < 2; k++) {
    const bp = pt(236 + (k ? 20 : -22), coastR(2, (236 + (k ? 20 : -22)) * D2R) - 20);
    const bg = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 4.2, 10, 1, false, 0, Math.PI), boatM);
    bg.rotation.set(0, rand() * 3, Math.PI / 2);
    bg.position.set(bp[0], groundH(bp[0], bp[1]) + 0.05, bp[1]);
    bg.castShadow = true;
    batch.addObject(bg);
    G.physics.addCircle(bp[0], bp[1], 1.4, -10, 100, false);
  }
  batch.build(G.scene);

  function press(H) {
    G.audio.bell(BELLS[H.i], 0.3, H.ipos);
    G.player.raiseLantern(0.5);
    if (H.i === SEQ[P.progress] && !H.fire.lit) {
      H.fire.light();
      H.glass.emissiveIntensity = 1.4;
      rings[P.progress].emissiveIntensity = 1.8;
      P.progress++;
      if (P.progress === 5) { P.solved = true; G.later(0.9, () => { fishM.emissiveIntensity = 2.0; G.beacons[2].unlock(); G.input.rumble(0.3, 250); }); }
    } else {
      // wrong: brief sputter, then everything goes dark
      P.resetting = true;
      H.fire.light();
      G.later(0.35, () => {
        for (const o of P.houses) {
          if (o.fire.lit || o === H) { o.puffT = 0; o.puff.visible = true; }
          o.fire.snuff(); o.glass.emissiveIntensity = 0;
        }
        for (const r of rings) r.emissiveIntensity = 0;
        P.progress = 0;
        G.audio.snuff(H.ipos);
        P.flash = 0.6;
      });
      G.later(0.9, () => { P.resetting = false; });
    }
  }

  P.update = (dt) => {
    const t = G.U.uTime.value;
    P.flags.forEach((f, i) => { f.rotation.y = Math.sin(t * 2.2 + i) * 0.35; });
    for (const H of P.houses) {
      if (H.puffT >= 0) {
        H.puffT += dt;
        const k = H.puffT / 1.1;
        H.puff.scale.setScalar(0.5 + k * 2.2);
        H.puff.position.y = 2.4 + k * 1.2;
        H.puff.material.opacity = Math.max(0, 0.75 * (1 - k));
        if (k >= 1) { H.puffT = -1; H.puff.visible = false; }
      }
    }
  };
  P.hintTarget = () => (P.solved ? null : P.houses[SEQ[P.progress]].ipos);
  P.getState = () => ({ p: P.progress, solved: P.solved });
  P.setState = (o) => {
    if (!o) return;
    P.progress = o.p || 0;
    for (let k = 0; k < P.progress; k++) {
      const H = P.houses[SEQ[k]];
      H.fire.light(true); H.glass.emissiveIntensity = 1.4; rings[k].emissiveIntensity = 1.8;
    }
    if (o.solved) { P.solved = true; fishM.emissiveIntensity = 2.0; }
  };
  return P;
}
