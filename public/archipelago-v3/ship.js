import * as THREE from './three.module.min.js';
import { toon, toonUnique, beamMaterial } from './materials.js';
import { LAYOUT, groundH } from './terrain.js';
import { Fire } from './fire.js';
import { Batcher } from './batch.js';
import { angleLerp, rng } from './noise.js';

function hullGeo(L, W, D, u0, u1) {
  const segs = 14, ring = 10, pos = [], idx = [];
  const prof = (u) => ({
    x: -L / 2 + u * L,
    w: W * Math.pow(Math.max(0.0001, Math.sin(Math.PI * (0.18 + 0.82 * u))), 0.55),
    d: D * (0.8 + 0.2 * Math.sin(Math.PI * u)),
    sh: 0.7 * u * u + 0.5 * (1 - u) * (1 - u),
  });
  for (let i = 0; i <= segs; i++) {
    const p = prof(u0 + (u1 - u0) * i / segs);
    for (let k = 0; k <= ring; k++) {
      const th = -Math.PI / 2 + Math.PI * k / ring;
      pos.push(p.x, -p.d * Math.cos(th) + p.sh, p.w * Math.sin(th));
    }
  }
  for (let i = 0; i < segs; i++) for (let k = 0; k < ring; k++) {
    const a = i * (ring + 1) + k, b = a + ring + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  if (u0 === 0) { // transom
    const p = prof(0);
    const ci = pos.length / 3;
    pos.push(p.x, p.sh - p.d * 0.4, 0);
    for (let k = 0; k < ring; k++) idx.push(ci, k + 1, k);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return { g, prof };
}

// Beacon 2 — the beached ship. Light the ship's lamp, then set three mirrors so the beam
// runs along the pale stone inlay through the trees to the crystal on the beacon.
// The beam only appears once the lamp is lit AND every mirror is set.
export function buildShip(G) {
  const S = LAYOUT.ship;
  const nodes2 = LAYOUT.corridor; // lamp, m1, m2, m3, beacon
  const batch = new Batcher();
  const rand = rng(77);
  const P = { solved: false, island: 1, lampLit: false };

  // ---------------- the wreck ----------------
  const L = 24, W = 3.5, D = 3.2;
  const gC = groundH(S.c[0], S.c[1]);
  const ship = new THREE.Group();
  ship.position.set(S.c[0], gC - 1.2, S.c[1]);
  ship.rotation.set(0.2, 0, -0.05, 'ZXY');
  const hullM = toon(0x6e4629, { side: THREE.DoubleSide, flatShading: true });
  const deckM = toon(0xa27a4f, { flatShading: true });
  const darkM = toon(0x2e2320);
  const ribM = toon(0x5a3a24, { flatShading: true });
  const { g: hg, prof } = hullGeo(L, W, D, 0, 0.62);
  const hull = new THREE.Mesh(hg, hullM); hull.castShadow = hull.receiveShadow = true; ship.add(hull);
  // exposed ribs where the bow broke open
  for (let u = 0.62; u < 0.97; u += 0.05) {
    const p = prof(u);
    const pts = [];
    for (let k = 0; k <= 10; k++) {
      const th = -Math.PI / 2 + Math.PI * k / 10;
      pts.push(new THREE.Vector3(p.x, -p.d * Math.cos(th) + p.sh, p.w * Math.sin(th)));
    }
    const rib = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, 0.13, 5), ribM);
    rib.castShadow = true;
    ship.add(rib);
  }
  const keel = new THREE.Mesh(new THREE.BoxGeometry(L * 0.98, 0.3, 0.3), ribM);
  keel.position.set(0, -D + 0.1, 0); ship.add(keel);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(L * 0.52, 0.16, W * 1.35), deckM);
  deck.position.set(-L / 2 + L * 0.28, 0.2, 0); deck.castShadow = deck.receiveShadow = true; ship.add(deck);
  const castle = new THREE.Mesh(new THREE.BoxGeometry(4.2, 2.1, W * 1.3), deckM);
  castle.position.set(-L / 2 + 2.4, 1.3, 0); castle.castShadow = castle.receiveShadow = true; ship.add(castle);
  for (const z of [-0.9, 0.9]) {
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.6, 0.6), darkM);
    win.position.set(-L / 2 + 0.25, 1.5, z); ship.add(win);
  }
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.25, 9, 8), ribM);
  mast.position.set(1.5, 3.4, 0.4); mast.rotation.set(0.35, 0, -0.65); mast.castShadow = true; ship.add(mast);
  const yard = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 5, 6), ribM);
  yard.position.set(3.6, 5.8, 1.5); yard.rotation.set(1.2, 0.3, 0.2); ship.add(yard);
  const rudder = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.2, 1.2), ribM);
  rudder.position.set(-L / 2 - 0.2, -0.6, 0); ship.add(rudder);
  batch.addObject(ship);
  for (let u = 0.02; u < 0.95; u += 0.16) {
    const p = prof(u);
    G.physics.addCircle(S.c[0] + p.x, S.c[1], Math.min(3.4, p.w + 0.4), gC - 3, gC + 4.5, true);
  }
  // cargo spilled into the clearing
  const barrelM = toon(0x8a5a32, { flatShading: true }), hoopM = toon(0x3b3533);
  for (let i = 0; i < 7; i++) {
    const a = rand() * Math.PI * 2, r = 5 + rand() * 6;
    const x = S.c[0] + 4 + Math.cos(a) * r, z = S.c[1] + Math.sin(a) * r + (Math.sin(a) > 0 ? 3 : -3);
    const b = new THREE.Group();
    const bb = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.0, 10), barrelM);
    const h1 = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.08, 10), hoopM); h1.position.y = 0.3;
    const h2 = h1.clone(); h2.position.y = -0.3;
    b.add(bb, h1, h2);
    const lying = rand() < 0.5;
    b.position.set(x, groundH(x, z) + (lying ? 0.4 : 0.5), z);
    if (lying) { b.rotation.z = Math.PI / 2; b.rotation.y = rand() * 3; }
    b.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    batch.addObject(b);
    G.physics.addCircle(x, z, 0.5, -10, 100, false);
  }

  // ---------------- the lamp ----------------
  const brass = toon(0xcf9a44), glassM = toonUnique(0xf6e7b8, { emissive: new THREE.Color(0xffb050), emissiveIntensity: 0.05 });
  const lampPos = new THREE.Vector3(S.lamp[0], groundH(S.lamp[0], S.lamp[1]), S.lamp[1]);
  const toM1 = new THREE.Vector3(nodes2[1][0] - S.lamp[0], 0, nodes2[1][1] - S.lamp[1]).normalize();
  const lamp = new THREE.Group();
  lamp.position.copy(lampPos);
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.34, 1.7, 0.34), ribM); post.position.y = 0.85; post.castShadow = true;
  const house = new THREE.Group(); house.position.y = 2.0; house.rotation.y = Math.atan2(toM1.x, toM1.z);
  const cage = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), glassM);
  const frameTop = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.45, 4), brass); frameTop.position.y = 0.58; frameTop.rotation.y = Math.PI / 4;
  const frameBot = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.12, 0.8), brass); frameBot.position.y = -0.38;
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.8, 12, 1, true), toon(0xcf9a44, { side: THREE.DoubleSide }));
  barrel.rotation.x = Math.PI / 2; barrel.position.z = 0.7;
  const lensDisc = new THREE.Mesh(new THREE.CircleGeometry(0.2, 14), glassM); lensDisc.position.z = 1.1;
  house.add(cage, frameTop, frameBot, barrel, lensDisc);
  lamp.add(post, house);
  const lampFire = new Fire({ size: [0.36, 0.6], hdr: 1.7, embers: 5, halo: 1.6, emberHeight: 0.6, emberSize: 0.04, haloDay: 0.1 });
  lampFire.group.position.y = 1.72;
  lamp.add(lampFire.group);
  G.scene.add(lamp);
  G.fires.push(lampFire);
  G.lightSources.push({ pos: lampPos.clone().setY(lampPos.y + 2.0), color: new THREE.Color(1, 0.7, 0.35), power: 40, range: 25, fire: lampFire });
  G.physics.addCircle(lampPos.x, lampPos.z, 0.35, -10, 100, false);
  const lampInteract = new THREE.Vector3(lampPos.x, lampPos.y + 1.4, lampPos.z);
  G.interact.add({
    pos: lampInteract, radius: 2.4, glyphY: 1.3,
    enabled: () => !P.lampLit && !G.busy,
    action: () => {
      G.player.raiseLantern();
      G.busy = 1.0;
      G.later(0.55, () => { P.lampLit = true; lampFire.light(); glassM.emissiveIntensity = 1.2; G.audio.ignite(lampPos, false); });
    },
  });

  // ---------------- mirrors ----------------
  const nodes = nodes2.map((p) => new THREE.Vector3(p[0], groundH(p[0], p[1]) + 2.0, p[1]));
  // lens on the beacon, on the side facing the last mirror
  const bPos = nodes[4].clone();
  const fromM3 = new THREE.Vector3(nodes[3].x - bPos.x, 0, nodes[3].z - bPos.z).normalize();
  nodes[4] = new THREE.Vector3(bPos.x + fromM3.x * 1.3, bPos.y, bPos.z + fromM3.z * 1.3);
  nodes[0] = new THREE.Vector3(lampPos.x + toM1.x * 1.1, lampPos.y + 2.0, lampPos.z + toM1.z * 1.1);

  const CORRECT = [1, 2, 0];
  const setting = [0, 0, 2];
  const STEP = 50 * Math.PI / 180;
  const stoneM = toon(0x9d968a, { flatShading: true }), notchM = toon(0x3a3530);
  const silverM = toonUnique(0xdfeaf2, { emissive: new THREE.Color(0xfff0c0), emissiveIntensity: 0.1 });
  const woodM = toon(0x5c3b25);
  const arrowM = toon(0xd9a441);
  P.mirrors = [];
  for (let j = 1; j <= 3; j++) {
    const m = nodes[j];
    const gh = m.y - 2.0;
    const din = new THREE.Vector3().subVectors(m, nodes[j - 1]).setY(0).normalize();
    const dout = new THREE.Vector3().subVectors(nodes[j + 1], m).setY(0).normalize();
    const nc = new THREE.Vector3().subVectors(dout, din).normalize();
    const thc = Math.atan2(nc.x, nc.z);
    const angles = [0, 1, 2].map((k) => thc + (k - CORRECT[j - 1]) * STEP);
    const reflectYaw = (th) => {
      const n = new THREE.Vector3(Math.sin(th), 0, Math.cos(th));
      const r = din.clone().sub(n.clone().multiplyScalar(2 * din.dot(n)));
      return Math.atan2(r.x, r.z);
    };
    const plinth = new THREE.Group();
    plinth.position.set(m.x, gh, m.z);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.85, 0.8, 10), stoneM);
    base.position.y = 0.4; base.castShadow = base.receiveShadow = true;
    plinth.add(base);
    // carved notches show the three positions the pointer can click into
    for (const th of angles) {
      const ry = reflectYaw(th);
      const nt = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 0.28), notchM);
      nt.position.set(Math.sin(ry) * 0.56, 0.81, Math.cos(ry) * 0.56);
      nt.rotation.y = ry;
      plinth.add(nt);
    }
    batch.addObject(plinth);
    const rot = new THREE.Group();
    rot.position.set(m.x, gh + 0.8, m.z);
    const turn = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.12, 12), woodM); turn.position.y = 0.06;
    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.3, 0.12), woodM); armL.position.set(-0.85, 0.75, 0);
    const armR = armL.clone(); armR.position.x = 0.85;
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.78, 0.1, 24), woodM); disc.rotation.x = Math.PI / 2; disc.position.y = 1.2;
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.7, 24), silverM); face.position.set(0, 1.2, 0.056);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.76, 0.05, 6, 24), arrowM); rim.position.set(0, 1.2, 0.03);
    rot.add(turn, armL, armR, disc, face, rim);
    rot.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    const arrow = new THREE.Group();
    arrow.position.set(m.x, gh + 0.8, m.z);
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.5), arrowM); shaft.position.set(0, 0.16, 0.35);
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.26, 4), arrowM); head.rotation.x = Math.PI / 2; head.position.set(0, 0.16, 0.66);
    arrow.add(shaft, head);
    G.scene.add(rot, arrow);
    G.physics.addCircle(m.x, m.z, 0.85, gh - 1, gh + 2.2, true);
    const M = { j, rot, arrow, angles, cur: angles[setting[j - 1]], reflectYaw, anim: 0 };
    rot.rotation.y = M.cur; arrow.rotation.y = reflectYaw(M.cur);
    P.mirrors.push(M);
    M.pos = new THREE.Vector3(m.x, gh + 1.3, m.z);
    G.interact.add({
      pos: M.pos, radius: 2.3, glyphY: 1.6,
      enabled: () => !P.solved,
      action: () => {
        setting[j - 1] = (setting[j - 1] + 1) % 3;
        G.audio.click('metal', M.pos);
        G.audio.click('stone', M.pos);
      },
    });
  }

  // ground inlay: pale flat stones along the old light-road
  const inlayGeo = new THREE.BoxGeometry(0.9, 0.12, 0.6);
  const inlayM = toon(0xe2d6b4, { flatShading: true });
  const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3(1, 1, 1), tmpP = new THREE.Vector3();
  for (let i = 0; i < 4; i++) {
    const a = nodes[i], b = nodes[i + 1];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const yaw = Math.atan2(b.x - a.x, b.z - a.z);
    for (let d = 1.8; d < len - 1.4; d += 1.25) {
      const t = d / len;
      const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
      tmpP.set(x, groundH(x, z) + 0.01, z);
      tmpQ.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw + (rand() - 0.5) * 0.2);
      tmpM.compose(tmpP, tmpQ, tmpS);
      batch.add(inlayGeo, tmpM, inlayM, false, true);
    }
  }

  // crystal lens on the beacon
  const crystalM = toonUnique(0xbfe8ff, { emissive: new THREE.Color(0x9fe0ff), emissiveIntensity: 0.1, flatShading: true });
  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.34), crystalM);
  crystal.position.copy(nodes[4]);
  crystal.scale.y = 1.4;
  G.scene.add(crystal);

  // beam segments (hidden until the whole route is right)
  const beams = [];
  for (let i = 0; i < 4; i++) {
    const a = nodes[i], b = nodes[i + 1];
    const len = a.distanceTo(b);
    const mat = beamMaterial(0xffd890, 4.0);
    mat.uniforms.uReveal.value = 0;
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, len, 8, 1, true), mat);
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3().subVectors(b, a).normalize());
    mesh.visible = false;
    mesh.frustumCulled = false;
    G.scene.add(mesh);
    beams.push(mesh);
  }
  const bFlares = nodes.slice(1).map((n) => {
    const f = new Fire({ size: [0.01, 0.01], embers: 0, halo: 1.2, haloColor: 0xffe2a0, haloDay: 0.6 });
    f.group.position.copy(n); f.group.position.y -= 0.55;
    G.scene.add(f.group);
    G.fires.push(f);
    return f;
  });
  batch.build(G.scene);

  P.beamT = -1;
  const allSet = () => P.mirrors.every((M) => setting[M.j - 1] === CORRECT[M.j - 1]);
  const settled = () => P.mirrors.every((M) => Math.abs(angleLerp(M.cur, M.angles[setting[M.j - 1]], 1) - M.cur) < 0.01);

  P.update = (dt) => {
    for (const M of P.mirrors) {
      const tgt = M.angles[setting[M.j - 1]];
      M.cur = angleLerp(M.cur, tgt, Math.min(1, dt * 7));
      M.rot.rotation.y = M.cur;
      M.arrow.rotation.y = M.reflectYaw(M.cur);
    }
    if (!P.solved && P.lampLit && allSet() && settled()) { P.solved = true; P.beamT = 0; }
    if (P.beamT >= 0 && P.beamT < 4) {
      P.beamT += dt;
      beams.forEach((b, i) => {
        const r = Math.max(0, Math.min(1, (P.beamT - i * 0.5) / 0.5));
        b.material.uniforms.uReveal.value = r;
        b.visible = r > 0;
        if (r > 0.95) bFlares[i].light();
      });
      if (P.beamT >= 2.1 && !P.announced) {
        P.announced = true;
        crystalM.emissiveIntensity = 2.5;
        G.beacons[1].unlock();
        G.input.rumble(0.3, 250);
      }
    }
    silverM.emissiveIntensity = P.solved ? 1.2 : 0.1;
  };
  P.hintTarget = () => {
    if (!P.lampLit) return lampInteract;
    for (const M of P.mirrors) if (setting[M.j - 1] !== CORRECT[M.j - 1]) return M.pos;
    return null;
  };
  P.getState = () => ({ lamp: P.lampLit, m: setting.slice(), solved: P.solved });
  P.setState = (o) => {
    if (!o) return;
    if (o.m) for (let i = 0; i < 3; i++) setting[i] = o.m[i];
    P.mirrors.forEach((M) => { M.cur = M.angles[setting[M.j - 1]]; });
    if (o.lamp) { P.lampLit = true; lampFire.light(true); glassM.emissiveIntensity = 1.2; }
    if (o.solved) {
      P.solved = true; P.announced = true; P.beamT = 10;
      beams.forEach((b) => { b.visible = true; b.material.uniforms.uReveal.value = 1; });
      bFlares.forEach((f) => f.light(true));
      crystalM.emissiveIntensity = 2.5;
    }
  };
  return P;
}
