// Fishing village of stilt houses along a pier. Each porch has a bell frame
// with a different number of bells. A float line at the pier's foot hangs its
// floats in groups of one, two, three, four, five - counting outward. Ringing
// houses in that counting order lights them one by one; a wrong ring puts
// every light out with a puff of smoke.
import * as THREE from './three.module.min.js';
import { VILLAGE } from './layout.js';
import { heightAt, addRect, addBox } from './terrain.js';
import { toon, paint, xf, mergeGeoms } from './materials.js';
import { createGlow } from './fire.js';
import { rng, damp } from './util.js';

const ROOFS = [0xd2463c, 0x3a7bd5, 0xe0a630, 0x2fa38f, 0xa9506e];

function bellGeo() {
  const pts = [];
  for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push(new THREE.Vector2(0.06 + 0.16 * Math.pow(t, 1.6) + (t > 0.9 ? 0.03 : 0), -t * 0.32)); }
  return new THREE.LatheGeometry(pts, 10);
}

export function buildVillage(ctx) {
  const { scene, audio } = ctx;
  const R = rng(555);
  const dir = new THREE.Vector2(VILLAGE.dirX, VILLAGE.dirZ).normalize();
  const perp = new THREE.Vector2(-dir.y, dir.x);
  const deck = VILLAGE.deck;
  // find where the pier leaves the land at deck height
  let s0 = 0;
  while (s0 < 80 && heightAt(VILLAGE.x + dir.x * s0, VILLAGE.z + dir.y * s0) > deck - 0.02) s0 += 0.25;
  const P0 = new THREE.Vector2(VILLAGE.x + dir.x * s0, VILLAGE.z + dir.y * s0);
  const at = (along, lat) => new THREE.Vector2(P0.x + dir.x * along + perp.x * lat, P0.y + dir.y * along + perp.y * lat);
  const yaw = Math.atan2(dir.x, dir.y); // rotation.y that points local +z along the pier
  const woodM = toon(0xffffff, { vertexColors: true, flat: true });
  const wood = [], stilts = [];
  const addStilt = (p, top) => {
    const g = heightAt(p.x, p.y);
    const len = top - g + 0.5;
    if (len < 0.2) return;
    stilts.push(paint(xf(new THREE.CylinderGeometry(0.14, 0.17, len, 6), p.x, g - 0.5 + len / 2, p.y), 0x4f3a2a, 0.1));
  };
  const plank = (c, hl, hw, y, color = 0x9b7550) => {
    wood.push(paint(xf(new THREE.BoxGeometry(hw * 2, 0.2, hl * 2), c.x, y - 0.1, c.y, 0, yaw, 0), color, 0.12, Math.floor(c.x * 7)));
  };

  // pier (extends 1.5m back onto land so the join is seamless)
  const L = VILLAGE.pierLen;
  const pc = at(L / 2 - 0.75, 0);
  plank(pc, L / 2 + 0.75, VILLAGE.pierHW, deck);
  addRect(pc.x, pc.y, dir.x, dir.y, L / 2 + 0.75, VILLAGE.pierHW, deck, deck, 'wood');
  addBox(pc.x, pc.y, VILLAGE.pierHW, L / 2 - 1, yaw, -20, deck - 0.6, true);
  for (let a = 2; a <= L; a += 3.5) { addStilt(at(a, -1.3), deck - 0.2); addStilt(at(a, 1.3), deck - 0.2); }
  // plank seams
  for (let a = -1; a < L; a += 0.9) wood.push(paint(xf(new THREE.BoxGeometry(VILLAGE.pierHW * 2, 0.02, 0.04), at(a, 0).x, deck + 0.005, at(a, 0).y, 0, yaw, 0), 0x6a4e36));
  // end platform for the beacon
  const endC = at(L + 3.5, 0);
  plank(endC, 3.5, 3.5, deck, 0x8a8278);
  addRect(endC.x, endC.y, dir.x, dir.y, 3.6, 3.5, deck, deck, 'stone');
  addBox(endC.x, endC.y, 3.5, 3.5, yaw, -20, deck - 0.6, true);
  for (const [a, l] of [[0.5, -3], [0.5, 3], [6.5, -3], [6.5, 3], [3.5, 0]]) addStilt(at(L + a, l), deck - 0.2);
  // rails along the pier, broken where porches join
  const porchAlong = VILLAGE.houseAlong;
  for (let a = 0; a <= L; a += 2) for (const s of [-1, 1]) {
    const nearPorch = porchAlong.some((pa, i) => VILLAGE.sides[i] === s && Math.abs(a - pa) < 2.2);
    if (nearPorch) continue;
    const p = at(a, s * (VILLAGE.pierHW - 0.1));
    wood.push(paint(xf(new THREE.BoxGeometry(0.12, 1.0, 0.12), p.x, deck + 0.5, p.y), 0x5a4232));
  }

  // ---- houses ----
  const houses = [];
  const lampMats = [];
  for (let i = 0; i < 5; i++) {
    const a = porchAlong[i], s = VILLAGE.sides[i];
    const porch = at(a, s * (VILLAGE.pierHW + 1.25));
    plank(porch, 1.5, 1.25, deck + 0.0, 0x8f6c4a);
    // porch: local frame is the pier frame, so hl (along pier) 1.5 and hw (across) 1.25
    addRect(porch.x, porch.y, dir.x, dir.y, 1.5, 1.3, deck, deck, 'wood');
    addBox(porch.x, porch.y, 1.25, 1.5, yaw, -20, deck - 0.6, true);
    const hc = at(a, s * (VILLAGE.pierHW + 2.5 + 2.3));
    addStilt(at(a - 1.2, s * (VILLAGE.pierHW + 2.4)), deck - 0.2); addStilt(at(a + 1.2, s * (VILLAGE.pierHW + 2.4)), deck - 0.2);
    for (const [u, v] of [[-2, -2], [2, -2], [-2, 2], [2, 2], [0, 0]]) addStilt(at(a + u, s * (VILLAGE.pierHW + 4.8) + v), deck);
    const g = new THREE.Group();
    g.position.set(hc.x, deck, hc.y);
    g.rotation.y = yaw + s * Math.PI / 2; // local +z faces the pier
    scene.add(g);
    const roof = new THREE.ConeGeometry(3.7, 2.2, 4).rotateY(Math.PI / 4).translate(0, 4.1, 0);
    const hp = [
      paint(new THREE.BoxGeometry(4.8, 0.3, 4.8).translate(0, 0.0, 0), 0x7a5a3e, 0.1),
      paint(new THREE.BoxGeometry(4.4, 2.9, 4.4).translate(0, 1.6, 0), 0xf1ead8, 0.06, i + 3),
      paint(roof, ROOFS[i], 0.08, i),
      paint(new THREE.BoxGeometry(1.0, 1.9, 0.08).translate(0, 1.1, 2.22), 0x5a3a26),
      paint(new THREE.BoxGeometry(0.25, 3.4, 0.25).translate(1.4, 4.2, -1.2), 0x8a7a6a),
    ];
    // drying fish rack on the side
    hp.push(paint(xf(new THREE.BoxGeometry(0.06, 0.06, 2.4), 2.45, 2.4, 0), 0x5a4232));
    for (let f = 0; f < 4; f++) hp.push(paint(xf(new THREE.ConeGeometry(0.1, 0.5, 4), 2.45, 2.1, -0.9 + f * 0.6, Math.PI, 0, 0), 0xa0a8b0));
    const body = new THREE.Mesh(mergeGeoms(hp), woodM);
    body.castShadow = true; body.receiveShadow = true;
    g.add(body);
    // windows (glow when lit)
    const winM = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x2a2c34) });
    for (const wx of [-1.4, 1.4]) { const w = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), winM); w.position.set(wx, 1.9, 2.21); g.add(w); }
    const sideWin = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.7), winM);
    sideWin.position.set(-2.21, 1.9, 0); sideWin.rotation.y = -Math.PI / 2; g.add(sideWin);
    // porch lantern
    const lanternM = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x3a3020) });
    const lantern = new THREE.Mesh(new THREE.OctahedronGeometry(0.2, 0), lanternM);
    lantern.position.set(1.0, 2.55, 2.5);
    g.add(lantern);
    const glow = createGlow(0xffb060, 0.9, 0.004);
    glow.position.copy(lantern.position);
    g.add(glow);
    addBox(hc.x, hc.y, 2.4, 2.4, g.rotation.y, deck - 1, deck + 5.5, true);
    // bell frame on the porch
    const bf = new THREE.Group();
    const bp = at(a + 0.9, s * (VILLAGE.pierHW + 1.25));
    bf.position.set(bp.x, deck, bp.y);
    bf.rotation.y = yaw + Math.PI / 2; // bar runs across the porch
    scene.add(bf);
    const n = VILLAGE.bells[i];
    const barW = 0.38 * n + 0.3;
    bf.add(new THREE.Mesh(mergeGeoms([
      paint(new THREE.BoxGeometry(0.14, 2.6, 0.14).translate(0, 1.3, -barW / 2), 0x5a4232),
      paint(new THREE.BoxGeometry(0.14, 2.6, 0.14).translate(0, 1.3, barW / 2), 0x5a4232),
      paint(new THREE.BoxGeometry(0.16, 0.16, barW + 0.3).translate(0, 2.6, 0), 0x5a4232),
    ]), woodM));
    const bells = [];
    for (let b = 0; b < n; b++) {
      const piv = new THREE.Group();
      piv.position.set(0, 2.5, -barW / 2 + 0.2 + (b + 0.5) * ((barW - 0.4) / n));
      const bell = new THREE.Mesh(bellGeo(), toon(0xd9a84a, { side: THREE.DoubleSide, emissive: 0x2a1a04 }));
      bell.castShadow = true;
      piv.add(bell);
      bf.add(piv);
      bells.push(piv);
    }
    houses.push({ i, bells, n, winM, lanternM, glow, lit: false, swing: 0, pos: new THREE.Vector3(bp.x, deck + 1.4, bp.y), centre: new THREE.Vector3(hc.x, deck + 2, hc.y), puff: null });
  }

  // ---- float line at the pier's foot: groups of 1..5 floats, counting outward ----
  const fl = [];
  const floatPosts = [];
  for (let k = 0; k <= 5; k++) floatPosts.push(at(0.6 + k * 1.5, -(VILLAGE.pierHW - 0.05)));
  floatPosts.forEach((p) => fl.push(paint(xf(new THREE.BoxGeometry(0.14, 1.4, 0.14), p.x, deck + 0.7, p.y), 0x5a4232)));
  for (let k = 0; k < 5; k++) {
    const a = floatPosts[k], b = floatPosts[k + 1];
    const cnt = k + 1;
    for (let f = 0; f < cnt; f++) {
      const t = (f + 1) / (cnt + 1);
      const x = a.x + (b.x - a.x) * t, z = a.y + (b.y - a.y) * t;
      const sag = Math.sin(t * Math.PI) * 0.25;
      fl.push(paint(xf(new THREE.SphereGeometry(0.13, 8, 6), x, deck + 1.05 - sag, z), f % 2 ? 0xf2efe6 : 0xd8402e));
    }
    const mx = (a.x + b.x) / 2, mz = (a.y + b.y) / 2;
    fl.push(paint(xf(new THREE.CylinderGeometry(0.015, 0.015, 1.5, 3).rotateX(Math.PI / 2), mx, deck + 1.28, mz, 0, yaw, 0), 0xd8c8a0));
  }
  const floatMesh = new THREE.Mesh(mergeGeoms(fl), woodM);
  floatMesh.castShadow = true;
  scene.add(floatMesh);

  const woodMesh = new THREE.Mesh(mergeGeoms(wood), woodM);
  woodMesh.castShadow = true; woodMesh.receiveShadow = true;
  scene.add(woodMesh);
  const stiltMesh = new THREE.Mesh(mergeGeoms(stilts), woodM);
  stiltMesh.castShadow = true;
  scene.add(stiltMesh);

  // pier lanterns that carry the light out to the beacon once solved
  const pierLights = [];
  for (let a = 4; a < L; a += 8) {
    const p = at(a, VILLAGE.pierHW - 0.1);
    const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x30281c) });
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.8, 0.12).translate(0, 0.9, 0), toon(0x5a4232));
    post.position.set(p.x, deck, p.y);
    scene.add(post);
    const lm = new THREE.Mesh(new THREE.OctahedronGeometry(0.18), m);
    lm.position.set(p.x, deck + 1.95, p.y);
    scene.add(lm);
    pierLights.push({ m, along: a });
  }
  // smoke puffs for a wrong ring
  const puffM = new THREE.MeshToonMaterial({ color: 0x8a8a8a, transparent: true, opacity: 0, depthWrite: false });
  houses.forEach((h) => {
    const p = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6, 1), puffM.clone());
    p.position.copy(h.centre); p.position.y += 1.2; p.visible = false;
    scene.add(p);
    h.puff = p; h.puffT = 99;
  });

  const st = { next: 1, lit: [false, false, false, false, false], solved: false, solveT: -1 };
  const ring = (h) => {
    h.swing = 1;
    audio.bells(h.pos, h.n);
    if (st.solved || h.lit) return;
    if (h.n === st.next) {
      h.lit = true; st.lit[h.i] = true; st.next++;
      audio.chimeStep(st.next - 1);
      if (st.next > 5) { st.solved = true; st.solveT = 0; audio.chime(); }
      ctx.save();
    } else {
      // wrong: everything goes dark
      let any = false;
      houses.forEach((o) => { if (o.lit) { any = true; o.puffT = 0; } o.lit = false; st.lit[o.i] = false; });
      st.next = 1;
      h.puffT = 0;
      audio.reset(h.pos, any);
      ctx.save();
    }
  };
  const interactables = houses.map((h) => ({ pos: h.pos, r: 2.0, enabled: () => true, press: () => ring(h) }));
  const beaconXZ = endC;

  return {
    interactables,
    beaconXZ: { x: beaconXZ.x, z: beaconXZ.y },
    deck,
    pierStart: P0,
    dir, perp,
    hintTarget: () => new THREE.Vector3(at(1.5, 0).x, deck, at(1.5, 0).y),
    centre: new THREE.Vector3(at(L / 2, 0).x, deck, at(L / 2, 0).y),
    dockSlots: () => {
      const out = [];
      for (let k = 0; k < 7; k++) { const s = k % 2 ? 1 : -1; const p = at(6 + k * 6, s * 11.8 + s * (k % 3) * 0.6); out.push(new THREE.Vector3(p.x, 0, p.y)); }
      return out;
    },
    getState: () => ({ lit: st.lit.slice(), next: st.next, solved: st.solved }),
    setState(s) {
      if (!s) return;
      st.solved = !!s.solved; st.next = s.next || 1;
      if (s.lit) s.lit.forEach((v, i) => { st.lit[i] = v; houses[i].lit = v; });
      if (st.solved) st.solveT = 99;
    },
    update(dt, player, beacon, camYaw, time, night) {
      for (const h of houses) {
        h.swing = damp(h.swing, 0, 1.6, dt);
        h.bells.forEach((b, k) => { b.rotation.x = Math.sin(time * 9 + k * 1.3) * 0.5 * h.swing; });
        const on = h.lit || (st.solved);
        const k = on ? 1 : 0;
        h.winM.color.setRGB(0.16 + k * (1.6 + night * 1.6), 0.17 + k * (1.1 + night * 1.0), 0.2 + k * (0.45 + night * 0.3));
        h.lanternM.color.setRGB(0.23 + k * 3.5, 0.19 + k * 2.4, 0.13 + k * 0.9);
        h.glow.visible = on;
        h.glow.material.uniforms.uAmount.value = 0.4 + night * 0.9;
        h.puffT += dt;
        if (h.puffT < 1.6) {
          h.puff.visible = true;
          const t = h.puffT / 1.6;
          h.puff.scale.setScalar(0.5 + t * 2.4);
          h.puff.position.y = h.centre.y + 1.2 + t * 2.5;
          h.puff.material.opacity = 0.75 * (1 - t);
        } else h.puff.visible = false;
      }
      if (st.solved) {
        st.solveT += dt;
        pierLights.forEach((pl) => {
          const on = st.solveT * 14 > pl.along ? 1 : 0;
          pl.m.color.setRGB(0.19 + on * 3.2, 0.16 + on * 2.2, 0.11 + on * 0.8);
        });
        if (st.solveT * 14 > L + 2 && !beacon.ready) { beacon.setReady(); ctx.onReady(3); }
      }
    },
  };
}
