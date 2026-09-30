import * as THREE from './three.module.min.js';
import { toon, toonUnique } from './materials.js';
import { LAYOUT, groundH } from './terrain.js';
import { makeGlyph } from './glyphs.js';
import { hash2, rng } from './noise.js';
import { Batcher } from './batch.js';

// Beacon 1 — the humming ring. The round slab at the centre shows, in the direction of
// each monolith, the symbol that monolith must wear. Pressing a monolith turns its plate.
export function buildRing(G) {
  const c = LAYOUT.ringC, R = LAYOUT.ringR;
  const h0 = groundH(c[0], c[1]);
  const N = 6;
  const TARGET = [2, 0, 3, 1, 1, 3];
  const state = [0, 1, 0, 2, 3, 0];
  const batch = new Batcher();
  const rand = rng(11);
  const stoneM = toon(0x8f8a7c, { flatShading: true });
  const weedM = toon(0x3f5a3a, { flatShading: true });
  const plateM = toon(0x6f6a5f);
  const inlayM = toon(0xe8cc80, { emissive: 0x3a2808 });
  const glyphM = toonUnique(0xf1d48a, { emissive: new THREE.Color(0xffb444), emissiveIntensity: 0.15, side: THREE.DoubleSide });
  const barnM = toon(0xe9e2cf, { flatShading: true });

  const P = { solved: false, island: 0, monos: [] };

  // barnacle instancing
  const barnGeo = new THREE.ConeGeometry(0.075, 0.1, 6);
  barnGeo.rotateX(Math.PI / 2); // point along +z
  const barnCount = N * 70;
  const barn = new THREE.InstancedMesh(barnGeo, barnM, barnCount);
  barn.castShadow = false; barn.receiveShadow = true;
  let bi = 0;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3();

  for (let i = 0; i < N; i++) {
    const a = i / N * Math.PI * 2 + 0.35;
    const x = c[0] + Math.cos(a) * R, z = c[1] + Math.sin(a) * R;
    const gh = groundH(x, z);
    const yaw = Math.atan2(c[0] - x, c[1] - z); // local +z faces the centre
    const H = 4.2 + rand() * 1.0;
    const geo = new THREE.BoxGeometry(1.5, H, 1.0, 1, 4, 1);
    const pos = geo.attributes.position;
    for (let k = 0; k < pos.count; k++) {
      const px = pos.getX(k), py = pos.getY(k), pz = pos.getZ(k);
      const t = (py + H / 2) / H;
      const j = hash2(Math.round(px * 100) + i * 31, Math.round(py * 100) * 7 + Math.round(pz * 100));
      const taper = 1 - 0.22 * t;
      pos.setXYZ(k, px * taper + (j - 0.5) * 0.12, py + (t > 0.99 ? (j - 0.5) * 0.5 : 0), pz * taper + (j - 0.5) * 0.08);
    }
    geo.computeVertexNormals();
    const mono = new THREE.Group();
    mono.position.set(x, gh - 0.3, z);
    mono.rotation.y = yaw;
    const body = new THREE.Mesh(geo, stoneM);
    body.position.y = H / 2;
    body.castShadow = body.receiveShadow = true;
    mono.add(body);
    const weed = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.7, 1.12), weedM);
    weed.position.y = 0.35;
    mono.add(weed);
    batch.addObject(mono);
    mono.remove(body); mono.remove(weed);

    // barnacles on the lower faces
    mono.updateMatrixWorld(true);
    for (let b = 0; b < 70; b++) {
      const face = Math.floor(rand() * 4);
      const y = 0.55 + Math.pow(rand(), 1.6) * 2.2;
      const t = y / H, taper = 1 - 0.22 * t;
      const u = (rand() - 0.5);
      let lx, lz, nx, nz;
      if (face === 0) { lx = u * 1.4 * taper; lz = 0.5 * taper; nx = 0; nz = 1; }
      else if (face === 1) { lx = u * 1.4 * taper; lz = -0.5 * taper; nx = 0; nz = -1; }
      else if (face === 2) { lx = 0.75 * taper; lz = u * 0.9 * taper; nx = 1; nz = 0; }
      else { lx = -0.75 * taper; lz = u * 0.9 * taper; nx = -1; nz = 0; }
      if (face === 0 && y > 1.7) continue; // keep the plate face readable
      v.set(lx, y, lz).applyMatrix4(mono.matrixWorld);
      const n = new THREE.Vector3(nx, 0, nz).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
      q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
      const sc = 0.7 + rand() * 0.9;
      s.set(sc, sc, sc);
      m4.compose(v, q, s);
      if (bi < barnCount) barn.setMatrixAt(bi++, m4);
    }

    // turning plate with the symbol
    const plate = new THREE.Group();
    plate.position.set(0, 2.45, 0.46);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.14, 20), plateM);
    disc.rotation.x = Math.PI / 2;
    disc.castShadow = true;
    plate.add(disc);
    const glyphs = [];
    for (let t = 0; t < 4; t++) {
      const g = makeGlyph(t, glyphM);
      g.position.z = 0.08;
      g.visible = t === state[i];
      plate.add(g);
      glyphs.push(g);
    }
    mono.add(plate);
    G.scene.add(mono);
    G.physics.addCircle(x, z, 0.95, gh - 2, gh + H, true);

    const front = new THREE.Vector3(c[0] + Math.cos(a) * (R - 1.3), gh + 1.3, c[1] + Math.sin(a) * (R - 1.3));
    const M = { i, plate, glyphs, anim: 0, pending: false, front };
    P.monos.push(M);
    G.interact.add({
      pos: front, radius: 2.4, glyphY: 1.5,
      enabled: () => !P.solved && M.anim === 0,
      action: () => {
        M.anim = 0.0001;
        G.audio.click('stone', front);
      },
    });
  }
  barn.count = bi;
  barn.instanceMatrix.needsUpdate = true;
  barn.computeBoundingSphere();
  G.scene.add(barn);

  // centre slab: the key
  const slab = new THREE.Group();
  slab.position.set(c[0], h0, c[1]);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.85, 0.5, 28), toon(0xb0a791, { flatShading: true }));
  top.position.y = 0.15; top.castShadow = top.receiveShadow = true;
  slab.add(top);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.06, 16), inlayM);
  hub.position.y = 0.42; slab.add(hub);
  for (let i = 0; i < N; i++) {
    const a = i / N * Math.PI * 2 + 0.35;
    const dx = Math.cos(a), dz = Math.sin(a);
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.04, 0.95), inlayM);
    line.position.set(dx * 0.95, 0.41, dz * 0.95);
    line.rotation.y = Math.atan2(dx, dz);
    slab.add(line);
    const g = makeGlyph(TARGET[i], inlayM);
    // lie flat; the symbol's "up" points out toward its monolith
    const holder = new THREE.Group();
    holder.position.set(dx * 1.95, 0.42, dz * 1.95);
    holder.rotation.y = Math.atan2(dx, dz) + Math.PI; // face up, symbol's top toward the monolith
    g.rotation.x = -Math.PI / 2;
    g.scale.setScalar(0.8);
    holder.add(g);
    slab.add(holder);
  }
  batch.addObject(slab);
  batch.build(G.scene);
  G.physics.addCircle(c[0], c[1], 2.3, h0 - 1, h0 + 0.35, false);

  P.center = new THREE.Vector3(c[0], h0, c[1]);
  const checkSolved = () => state.every((sv, i) => sv === TARGET[i]);

  P.update = (dt) => {
    for (const M of P.monos) {
      if (M.anim > 0) {
        const prev = M.anim;
        M.anim += dt / 0.5;
        if (prev < 0.5 && M.anim >= 0.5) {
          state[M.i] = (state[M.i] + 1) % 4;
          M.glyphs.forEach((g, t) => (g.visible = t === state[M.i]));
        }
        M.plate.rotation.x = Math.sin(Math.min(1, M.anim) * Math.PI) * (Math.PI / 2);
        if (M.anim >= 1) {
          M.anim = 0; M.plate.rotation.x = 0;
          if (!P.solved && checkSolved()) { P.solved = true; P.solveT = 0; }
        }
      }
    }
    // hum while standing inside the ring
    const pp = G.player.pos;
    const d = Math.hypot(pp.x - c[0], pp.z - c[1]);
    const inside = d < R - 0.6 ? 1 : Math.max(0, 1 - (d - (R - 0.6)) / 6);
    if (P.solveT !== undefined && P.solveT < 3) {
      P.solveT += dt;
      if (P.solveT >= 0.6 && !P.announced) {
        P.announced = true;
        G.beacons[0].unlock();
        G.input.rumble(0.35, 300);
      }
    }
    const t = G.U.uTime.value;
    const glow = P.solved ? 2.2 + 0.4 * Math.sin(t * 2.0) : 0.15 + inside * (0.35 + 0.3 * Math.sin(t * 3.3));
    glyphM.emissiveIntensity = glow;
    G.audio.setHum(Math.max(inside, P.solved ? 0.25 * Math.max(0, 1 - d / 40) : 0), P.solved ? 1 : 0);
  };

  P.hintTarget = () => {
    for (const M of P.monos) if (state[M.i] !== TARGET[M.i]) return M.front;
    return null;
  };
  P.getState = () => ({ s: state.slice(), solved: P.solved });
  P.setState = (o) => {
    if (!o || !o.s) return;
    for (let i = 0; i < N; i++) state[i] = o.s[i];
    P.monos.forEach((M) => M.glyphs.forEach((g, t) => (g.visible = t === state[M.i])));
    if (o.solved) { P.solved = true; P.announced = true; P.solveT = 3; }
  };
  return P;
}
