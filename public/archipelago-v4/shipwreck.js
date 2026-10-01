// Shipwreck beached in the forest. Step 1: light the ship's lamp with the
// lantern. Step 2: set the mirrors - each clicks between four carved grooves.
// The beam only exists once the lamp burns AND every mirror on the route is
// right, so it can't be found by sweeping. Cut sightlines through the trees
// show where light could travel; one of them is a dead end.
import * as THREE from './three.module.min.js';
import { SHIP } from './layout.js';
import { heightAt, addBox, addCircle } from './terrain.js';
import { toon, paint, xf, mergeGeoms } from './materials.js';
import { makeBeam } from './beam.js';
import { createFire, createGlow } from './fire.js';
import { rng, damp, dampAngle } from './util.js';

function hullGeometry(L, W, Hh) {
  const g = new THREE.BoxGeometry(2, 1, 2, 8, 5, 20);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i) + 0.5, z = p.getZ(i);
    const t = z; // -1 stern .. 1 bow
    const wf = t > 0 ? Math.sqrt(Math.max(0, 1 - Math.pow(t, 2.2))) : 1 - Math.pow(-t, 4) * 0.45;
    const keel = 0.3 + 0.7 * Math.pow(y, 0.55);
    x *= wf * keel * (W / 2);
    const sheer = 0.25 * t * t + (t > 0.6 ? (t - 0.6) * 0.8 : 0);
    const yy = y * Hh + sheer * Hh * y;
    p.setXYZ(i, x, yy, z * (L / 2));
  }
  g.computeVertexNormals();
  // two-tone: dark tarred bottom, weathered planks above, a pale stripe
  const col = new Float32Array(p.count * 3);
  const a = new THREE.Color(0x3b2a20), b = new THREE.Color(0x8a6444), c = new THREE.Color(0xd8c9a8), e = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) / Hh;
    e.copy(y < 0.35 ? a : (y > 0.78 && y < 0.88 ? c : b));
    if (Math.abs(p.getY(i) - Hh * 1.0) < 0.01 && Math.abs(p.getX(i)) < W * 0.4) e.setHex(0x9a7a56);
    col[i * 3] = e.r; col[i * 3 + 1] = e.g; col[i * 3 + 2] = e.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

export function buildShipwreck(ctx) {
  const { scene, audio } = ctx;
  const R = rng(99);
  const woodM = toon(0xffffff, { vertexColors: true });
  const flatM = toon(0xffffff, { vertexColors: true, flat: true });

  // ---- the hull ----
  const ship = new THREE.Group();
  const gy = heightAt(SHIP.x, SHIP.z);
  ship.position.set(SHIP.x, gy - 1.3, SHIP.z);
  ship.rotation.set(0.05, SHIP.yaw, -0.26);
  scene.add(ship);
  const hull = new THREE.Mesh(hullGeometry(23, 6.6, 4.2), woodM);
  hull.castShadow = true; hull.receiveShadow = true;
  ship.add(hull);
  const deco = [];
  // exposed ribs around a breach on the starboard (+x) side
  for (let k = 0; k < 5; k++) deco.push(paint(xf(new THREE.TorusGeometry(3.0, 0.11, 4, 10, Math.PI * 0.55), 2.2, 2.4, 2.4 + k * 1.1, 0, Math.PI / 2, -0.9), 0x5a4030));
  deco.push(paint(xf(new THREE.PlaneGeometry(4.2, 2.0), 3.18, 1.7, 4.6, 0, Math.PI / 2, 0), 0x140e0a));
  // broken mast and spar
  deco.push(paint(xf(new THREE.CylinderGeometry(0.22, 0.3, 9, 8), 0, 8.0, 2.5, 0.35, 0, 0.1), 0x6a4a30));
  deco.push(paint(xf(new THREE.CylinderGeometry(0.12, 0.12, 6, 6), 0.8, 10.5, 4.0, 0.3, 0.2, 1.4), 0x6a4a30));
  deco.push(paint(xf(new THREE.CylinderGeometry(0.15, 0.2, 7, 6), 0, 5.6, 12.2, 1.1, 0, 0), 0x6a4a30)); // bowsprit
  // deck rail posts
  for (let z = -9; z <= 8; z += 1.5) for (const s of [-1, 1]) deco.push(paint(xf(new THREE.BoxGeometry(0.12, 0.7, 0.12), s * 2.95, 4.5 + 0.02 * z * z * 0.06, z), 0x5a4030));
  const decoM = new THREE.Mesh(mergeGeoms(deco), flatM);
  decoM.castShadow = true;
  ship.add(decoM);
  // tattered sail
  const sailG = new THREE.PlaneGeometry(4.5, 4, 6, 6);
  const sp = sailG.attributes.position;
  for (let i = 0; i < sp.count; i++) sp.setZ(i, (R() - 0.5) * 0.35 + Math.sin(sp.getY(i)) * 0.3);
  sailG.computeVertexNormals();
  const sail = new THREE.Mesh(sailG, toon(0xe6dcc0, { side: THREE.DoubleSide }));
  sail.position.set(0.3, 9.2, 3.2); sail.rotation.set(0.35, 0.4, 0.1);
  sail.castShadow = true;
  ship.add(sail);
  addBox(SHIP.x, SHIP.z, 3.7, 11.6, SHIP.yaw, gy - 2, gy + 8, true);
  addBox(SHIP.x + Math.sin(SHIP.yaw) * 14.5, SHIP.z + Math.cos(SHIP.yaw) * 14.5, 0.5, 3.0, SHIP.yaw, gy - 2, gy + 5, true);
  // crates and a barrel spilled near the breach
  const crates = [];
  for (let i = 0; i < 5; i++) {
    const x = SHIP.x + 5.6 + R() * 2.5, z = SHIP.z - 12 + i * 1.4, s = 0.6 + R() * 0.4;
    crates.push(paint(xf(new THREE.BoxGeometry(s, s, s), x, heightAt(x, z) + s * 0.45, z, 0, R() * 2, R() * 0.2), 0x9a7448, 0.15, i));
    addBox(x, z, s * 0.55, s * 0.55, 0, heightAt(x, z) - 1, heightAt(x, z) + s, false);
  }
  const crM = new THREE.Mesh(mergeGeoms(crates), flatM);
  crM.castShadow = true;
  scene.add(crM);

  // ---- the ship's lamp ----
  const L = SHIP.lamp;
  const lg = heightAt(L.x, L.z);
  const A = SHIP.mirrors[SHIP.route[0]];
  const lampDir = new THREE.Vector3(A.x - L.x, 0, A.z - L.z).normalize();
  const lamp = new THREE.Group();
  lamp.position.set(L.x, lg, L.z);
  lamp.rotation.y = Math.atan2(lampDir.x, lampDir.z);
  scene.add(lamp);
  const brassM = toon(0xc9963a, { emissive: 0x2a1a04 });
  const lampParts = [
    paint(xf(new THREE.BoxGeometry(1.6, 0.5, 1.6), 0, 0.25, 0), 0x6a4a30),
    paint(xf(new THREE.CylinderGeometry(0.55, 0.6, 0.15, 10), 0, 0.6, 0), 0xc9963a),
    paint(xf(new THREE.CylinderGeometry(0.62, 0.55, 0.2, 10), 0, 1.95, 0), 0xc9963a),
    paint(xf(new THREE.ConeGeometry(0.5, 0.5, 10), 0, 2.3, 0), 0xc9963a),
    paint(xf(new THREE.TorusGeometry(0.2, 0.04, 4, 10), 0, 2.65, 0), 0xc9963a),
  ];
  for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; lampParts.push(paint(xf(new THREE.BoxGeometry(0.06, 1.25, 0.06), Math.cos(a) * 0.55, 1.27, Math.sin(a) * 0.55), 0xc9963a)); }
  // lens housing pointing along the sightline
  lampParts.push(paint(xf(new THREE.CylinderGeometry(0.38, 0.45, 0.6, 12).rotateX(Math.PI / 2), 0, 1.27, 0.75), 0xc9963a));
  lamp.add(new THREE.Mesh(mergeGeoms(lampParts), toon(0xffffff, { vertexColors: true })));
  const lensM = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x6f8a96) });
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.34, 16), lensM);
  lens.position.set(0, 1.27, 1.06);
  lamp.add(lens);
  const glassM = new THREE.MeshBasicMaterial({ color: 0x8aa4ae, transparent: true, opacity: 0.35, depthWrite: false });
  lamp.add(new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.2, 10, 1, true).translate(0, 1.27, 0), glassM));
  const lampFire = createFire({ scale: 0.42, intensity: 3, embers: 0 });
  lampFire.group.position.set(0, 0.75, 0);
  lamp.add(lampFire.group);
  const lampGlow = createGlow(0xffb050, 1.2, 0.006);
  lampGlow.position.set(0, 1.3, 0);
  lamp.add(lampGlow);
  addCircle(L.x, L.z, 0.95, lg - 1, lg + 2.6, true);

  // ---- mirrors ----
  const M = SHIP.mirrors;
  const route = SHIP.route;
  const routePts = [L, ...route.map((i) => M[i]), SHIP.beacon];
  const corrIndex = [1, 2, 0, 1];
  const mirrors = M.map((m, i) => {
    const h = heightAt(m.x, m.z);
    let base;
    const ri = route.indexOf(i);
    if (ri >= 0) {
      const prev = routePts[ri], next = routePts[ri + 2];
      const dIn = new THREE.Vector2(m.x - prev.x, m.z - prev.z).normalize();
      const dOut = new THREE.Vector2(next.x - m.x, next.z - m.z).normalize();
      const n = dOut.clone().sub(dIn).normalize();
      base = Math.atan2(n.x, n.y);
    } else {
      base = Math.atan2(M[1].x - m.x, M[1].z - m.z) + 0.4;
    }
    const corr = corrIndex[i];
    const angles = [0, 1, 2, 3].map((j) => base + (j - corr) * (Math.PI / 4));
    const g = new THREE.Group();
    g.position.set(m.x, h, m.z);
    scene.add(g);
    const parts = [
      paint(new THREE.CylinderGeometry(1.05, 1.2, 0.3, 10).translate(0, 0.12, 0), 0x8d867c, 0.1, i + 2),
      paint(new THREE.CylinderGeometry(0.2, 0.26, 1.15, 8).translate(0, 0.85, 0), 0x7d766c, 0.1, i + 4),
    ];
    // carved grooves: one per allowed position
    for (const a of angles) parts.push(paint(xf(new THREE.BoxGeometry(0.07, 0.03, 0.62).translate(0, 0, 0.55), 0, 0.28, 0, 0, a, 0), 0x2a2622));
    const baseMesh = new THREE.Mesh(mergeGeoms(parts), flatM);
    baseMesh.castShadow = true; baseMesh.receiveShadow = true;
    g.add(baseMesh);
    const yoke = new THREE.Group();
    yoke.position.y = 1.4;
    g.add(yoke);
    yoke.add(new THREE.Mesh(mergeGeoms([
      paint(new THREE.TorusGeometry(0.6, 0.06, 4, 20), 0xb8862e),
      paint(xf(new THREE.CylinderGeometry(0.6, 0.6, 0.05, 20).rotateX(Math.PI / 2), 0, 0, -0.04), 0x5a4030),
      paint(xf(new THREE.BoxGeometry(0.08, 0.5, 0.08), 0, -0.55, -0.05), 0xb8862e),
    ]), toon(0xffffff, { vertexColors: true })));
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.56, 20), toon(0xcfe4ec, { emissive: 0x334a55 }));
    face.position.z = 0.005;
    yoke.add(face);
    // pointer at the foot that sits in the active groove
    const ptr = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.35, 4).rotateX(Math.PI / 2).translate(0, 0, 0.75), brassM);
    ptr.position.y = -1.08;
    yoke.add(ptr);
    addCircle(m.x, m.z, 0.65, h - 1, h + 2.1, true);
    const k = m.start;
    yoke.rotation.y = angles[k];
    return { g, yoke, angles, k, corr, cur: angles[k], pos: new THREE.Vector3(m.x, h + 1.4, m.z), route: ri >= 0 };
  });

  const beams = [];
  for (let i = 0; i < routePts.length - 1; i++) { const b = makeBeam(0xffe2a0, 0.07, 4.5, 3.5); scene.add(b.group); beams.push(b); }

  const st = { lamp: false, k: mirrors.map((m) => m.k), solved: false, solveT: -1 };
  const routeSet = () => mirrors.every((m) => !m.route || m.k === m.corr);
  const check = () => { if (!st.solved && st.lamp && routeSet()) { st.solved = true; st.solveT = 0; audio.chime(); ctx.save(); } };

  const lampPos = new THREE.Vector3(L.x, lg + 1.3, L.z);
  const interactables = [
    { pos: lampPos.clone().add(lampDir.clone().multiplyScalar(-0.6)), r: 2.3, lantern: true, enabled: () => !st.lamp,
      press() { ctx.player.raiseLantern(() => { st.lamp = true; audio.ignite(lampPos, 0.4); ctx.save(); check(); }); } },
    ...mirrors.map((m, i) => ({ pos: m.pos, r: 2.1, enabled: () => !st.solved,
      press() { m.k = (m.k + 1) % 4; st.k[i] = m.k; audio.click(m.pos, 1.05); check(); } })),
  ];

  const pts3 = () => {
    const out = [lens.getWorldPosition(new THREE.Vector3())];
    for (const i of route) out.push(mirrors[i].pos);
    return out;
  };
  let lampT = 0;
  return {
    interactables,
    hintTarget: () => new THREE.Vector3(SHIP.clearing.x + 6, heightAt(SHIP.clearing.x + 6, SHIP.clearing.z + 4), SHIP.clearing.z + 4),
    centre: new THREE.Vector3(SHIP.x, gy, SHIP.z),
    getState: () => ({ lamp: st.lamp, k: st.k.slice(), solved: st.solved }),
    setState(s) {
      if (!s) return;
      st.lamp = !!s.lamp; st.solved = !!s.solved;
      if (s.k) s.k.forEach((k, i) => { mirrors[i].k = k; st.k[i] = k; mirrors[i].cur = mirrors[i].angles[k]; });
      if (st.solved) st.solveT = 99;
      if (st.lamp) lampT = 5;
    },
    lampPos,
    isLampLit: () => st.lamp,
    update(dt, player, beacon) {
      for (const m of mirrors) { m.cur = dampAngle(m.cur, m.angles[m.k], 7, dt); m.yoke.rotation.y = m.cur; }
      if (st.lamp) lampT += dt;
      lampFire.setLevel(st.lamp ? Math.min(1, lampT * 1.5) : 0);
      lampGlow.material.uniforms.uAmount.value = st.lamp ? 0.5 + ctx.night() * 0.8 : 0;
      lampGlow.visible = st.lamp;
      const k = st.lamp ? Math.min(1, lampT) : 0;
      lensM.color.setRGB(0.43 + 3.5 * k, 0.54 + 2.6 * k, 0.59 + 1.2 * k);
      if (st.solved) {
        st.solveT += dt;
        const p = pts3();
        p.push(beacon.flamePos);
        for (let i = 0; i < beams.length; i++) {
          beams[i].setEnds(p[i], p[i + 1]);
          beams[i].setProgress(Math.min(1, Math.max(0, (st.solveT - i * 0.45) / 0.45)));
          beams[i].setStrength(beacon.lit ? 0.45 : 1);
        }
        if (st.solveT > beams.length * 0.45 + 0.2 && !beacon.ready) { beacon.setReady(); ctx.onReady(2); }
      }
    },
  };
}
