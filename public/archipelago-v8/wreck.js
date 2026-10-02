// The shipwreck beached in the forest. Light the stern lamp (it burns down and
// gutters out), then click three mirrors between their carved positions so the
// lamp's beam can travel along the cleared sightlines to the beacon. The beam
// only appears when the lamp burns and every mirror is set. Teaching version:
// a small lamp, one mirror and a little brazier by the bow.
import * as THREE from './three.module.min.js';
import { G, mat, between, GeoBuilder, hullGeo } from './geo.js';
import { glow } from './materials.js';
import { WRECK as W, BEACON_XZ } from './layout.js';
import { terrainAt } from './terrain.js';
import { addCircle, addBox, addPlatform } from './colliders.js';
import { lerp } from './util.js';
import { Fire } from './fire.js';

const BURN = 40;

export function buildWreck(ctx, beacon) {
  const sb = ctx.sb('F');
  const audio = ctx.audio;
  const [hx, hz] = W.hull;
  const half = W.len / 2;
  let gmin = 1e9;
  for (let x = hx - half; x <= hx + half; x += 1) for (let z = hz - 2.5; z <= hz + 2.5; z += 1) gmin = Math.min(gmin, terrainAt(x, z));
  const keel = gmin - 0.7, depth = 3.4;
  const deckY = keel + depth - 0.25;
  const plankA = new THREE.Color(0x7a5236), plankB = new THREE.Color(0x684429), moss = new THREE.Color(0x56703a), barn = new THREE.Color(0xc9c2b0);
  const tmp = new THREE.Color();
  sb.add(hullGeo(W.len, W.beam, depth), mat(hx, keel, hz, 0, 0, 0.02), (x, y, z) => {
    const band = Math.floor((y - keel) / 0.38) % 2;
    tmp.copy(band ? plankA : plankB);
    if (y - keel < 1.0) tmp.lerp(moss, 0.55);
    if (y - keel < 0.5 && ((x * 3.1 + z * 1.7) % 1 + 1) % 1 > 0.6) tmp.copy(barn);
    return tmp;
  });
  // deck, cabin, holes, ribs
  sb.add(G.box(W.len - 2.6, 0.2, W.beam - 0.7), mat(hx + 0.5, deckY - 0.1, hz), 0x8d6845, { jitter: 0.1 });
  for (let k = -6; k <= 7; k++) sb.add(G.box(0.04, 0.02, W.beam - 0.75), mat(hx + k, deckY + 0.005, hz), 0x5a3a22);
  sb.add(G.box(2.4, 1.6, 2.4), mat(hx + 4.6, deckY + 0.8, hz, 0, 0, 0.03), 0x8a6240, { jitter: 0.1 });
  sb.add(G.box(2.7, 0.18, 2.7), mat(hx + 4.6, deckY + 1.66, hz, 0.05, 0, 0.06), 0x5a3a22);
  sb.add(G.box(0.08, 0.9, 0.7), mat(hx + 3.38, deckY + 0.6, hz), 0x2b2420);
  addBox(hx + 4.6, hz, 1.25, 1.25, 0, deckY, deckY + 1.8);
  sb.add(G.box(1.6, 1.1, 0.1), mat(hx - 4.5, keel + 1.4, hz + W.beam / 2 - 0.05, 0, 0, 0.2), 0x1e1712);
  for (let k = 0; k < 4; k++) sb.add(G.cyl(0.06, 0.06, 1.6, 4), mat(hx - 5.3 + k * 0.45, keel + 1.4, hz + W.beam / 2 - 0.02, 0, 0, 0.08), 0x6b4a2e);
  // broken mast and tattered sail
  sb.add(G.cyl(0.18, 0.24, 7.5, 7), mat(hx - 1.5, deckY + 3.4, hz, 0.42, 0, 0.12), 0x6b4a2e);
  sb.add(G.cyl(0.08, 0.08, 4.2, 5), mat(hx - 1.5, deckY + 4.6, hz - 1.7, 0.42, 0, Math.PI / 2 + 0.2), 0x6b4a2e);
  sb.add(G.box(0.04, 2.0, 3.2), mat(hx - 1.4, deckY + 3.5, hz - 1.0, 0.45, 0, 0.1), 0xd8ccb0);
  sb.add(G.box(0.04, 1.2, 1.4), mat(hx - 1.2, deckY + 2.2, hz - 0.2, 0.3, 0, 0.25), 0xcfc2a5);
  addCircle(hx - 1.5, hz - 0.2, 0.3, deckY, deckY + 4);
  addBox(hx + 0.6, hz, half - 0.4, W.beam / 2 - 0.25, 0, keel, deckY - 0.15);
  addCircle(hx - half + 1.5, hz, 1.0, keel, deckY + 0.6);
  addPlatform({ x: hx + 0.9, z: hz, hx: 7.6, hz: 2.35, y0: deckY, mat: 'wood' });
  // rails with a gap for the ramp on the south side
  const rail = (x0, x1, z) => {
    const cxr = (x0 + x1) / 2, l = Math.abs(x1 - x0);
    sb.add(G.box(l, 0.08, 0.08), mat(cxr, deckY + 0.9, z), 0x5a3a22);
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1) + 0.01; x += 1.2) sb.add(G.box(0.09, 0.9, 0.09), mat(x, deckY + 0.45, z), 0x5a3a22);
    addBox(cxr, z, l / 2, 0.08, 0, deckY - 0.1, deckY + 1.0);
  };
  rail(hx - 6.6, hx + 8.4, hz - 2.45); // north side (-z) is closed
  rail(hx - 6.6, hx + 2.0, hz + 2.45);
  rail(hx + 4.0, hx + 8.4, hz + 2.45);
  addBox(hx + 8.5, hz, 0.08, 2.45, 0, deckY - 0.1, deckY + 1.0);
  addBox(hx - 6.7, hz, 0.08, 2.45, 0, deckY - 0.1, deckY + 1.0);
  // boarding ramp (gentle) from the forest floor up to the deck gap
  const rz1 = hz + 2.4, rz0 = hz + 8.8, rx = hx + 3.0;
  const ry0 = terrainAt(rx, rz0) + 0.03;
  addPlatform({ x: rx, z: (rz0 + rz1) / 2, hx: (rz0 - rz1) / 2, hz: 0.75, rot: Math.PI / 2, y0: ry0, y1: deckY, mat: 'wood' });
  const rl = rz0 - rz1;
  sb.add(G.box(1.5, 0.12, rl), mat(rx, (ry0 + deckY) / 2 - 0.06, (rz0 + rz1) / 2, Math.atan2(deckY - ry0, rl)), 0x8a6240);
  for (let k = 0; k < 8; k++) { const u = (k + 0.5) / 8; sb.add(G.box(1.55, 0.05, 0.1), mat(rx, lerp(ry0, deckY, 1 - u), lerp(rz0, rz1, 1 - u) + 0.0, 0), 0x5a3a22); }
  ctx.exclude(rx, (rz0 + rz1) / 2, 3);

  // ---- stern lamp
  const lampPos = new THREE.Vector3(W.lamp[0], deckY + 1.75, W.lamp[1]);
  sb.add(G.cyl(0.08, 0.1, 1.6, 6), mat(W.lamp[0] + 0.4, deckY + 0.8, W.lamp[1]), 0x2c2a2a);
  sb.add(G.box(0.5, 0.06, 0.06), mat(W.lamp[0] + 0.2, deckY + 2.2, W.lamp[1]), 0x2c2a2a);
  sb.add(G.box(0.4, 0.05, 0.4), mat(W.lamp[0], deckY + 1.55, W.lamp[1]), 0x2c2a2a);
  sb.add(G.cone(0.3, 0.25, 4), mat(W.lamp[0], deckY + 2.1, W.lamp[1], 0, Math.PI / 4), 0x2c2a2a);
  for (const [dx, dz] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) sb.add(G.box(0.03, 0.5, 0.03), mat(W.lamp[0] + dx, deckY + 1.82, W.lamp[1] + dz), 0x2c2a2a);
  const lamp = makeLamp(lampPos, 0.42);
  ctx.addInteract({ x: W.lamp[0] - 0.6, y: deckY + 1, z: W.lamp[1], r: 1.9, raise: true, enabled: () => !lamp.lit, press: () => lightLamp(lamp) });

  function makeLamp(pos, size) {
    return { pos, lit: false, time: 0, fire: new Fire(ctx.scene, pos, size, false), perm: false };
  }
  function lightLamp(l) {
    l.lit = true; l.time = BURN; l.fire.set(1);
    audio.ignite([l.pos.x, l.pos.y, l.pos.z], 0.5);
  }

  // ---- mirrors
  function mirror(x, z, prev, next, kc, init) {
    const y = terrainAt(x, z);
    const hy = y + 1.65;
    const dpx = prev.x - x, dpz = prev.z - z, dnx = next.x - x, dnz = next.z - z;
    const lp = Math.hypot(dpx, dpz), ln = Math.hypot(dnx, dnz);
    const nx = dpx / lp + dnx / ln, nz = dpz / lp + dnz / ln;
    const phiC = Math.atan2(nx, nz);
    const phis = [0, 1, 2, 3].map((k) => phiC + (k - kc) * Math.PI / 4);
    sb.add(G.cyl(0.8, 0.9, 0.35, 12), mat(x, y + 0.12, z), 0x8e877a, { jitter: 0.1 });
    for (const p of phis) sb.add(G.box(0.07, 0.03, 1.5), mat(x, y + 0.3, z, 0, p), 0x3a342c);
    sb.add(G.cyl(0.1, 0.12, 1.25, 6), mat(x, y + 0.9, z), 0x7a5a2e);
    addCircle(x, z, 0.85, y, y + 2.2);
    const head = new THREE.Group();
    head.position.set(x, hy, z);
    const b = new GeoBuilder();
    b.add(G.box(1.15, 0.08, 0.1), mat(0, -0.5, 0), 0xa8823a);
    b.add(G.box(0.08, 0.6, 0.1), mat(0.55, -0.22, 0), 0xa8823a);
    b.add(G.box(0.08, 0.6, 0.1), mat(-0.55, -0.22, 0), 0xa8823a);
    b.add(G.cyl(0.46, 0.46, 0.08, 16), mat(0, 0, 0, Math.PI / 2), 0xa8823a);
    b.add(G.cyl(0.4, 0.4, 0.02, 16), mat(0, 0, 0.045, Math.PI / 2), 0xeaf3f6);
    b.add(G.cyl(0.4, 0.4, 0.02, 16), mat(0, 0, -0.045, Math.PI / 2), 0xeaf3f6);
    const m = new THREE.Mesh(b.build(), ctx.toonMat);
    m.castShadow = true;
    head.add(m);
    head.rotation.y = phis[init];
    ctx.scene.add(head);
    const mr = { x, z, y: hy, head, phis, kc, idx: init, turning: 0, from: phis[init], pos: new THREE.Vector3(x, hy, z) };
    ctx.addInteract({ x, y: hy - 0.6, z, r: 1.9, enabled: () => mr.turning <= 0 && !mr.locked, press: () => {
      mr.from = mr.head.rotation.y; mr.idx = (mr.idx + 1) % 4; mr.turning = 0.7;
      audio.click([x, hy, z]);
    } });
    ctx.exclude(x, z, 2.6);
    return mr;
  }

  const bx = BEACON_XZ[2];
  const target = beacon.firePos.clone().add(new THREE.Vector3(0, 0.3, 0));
  const nodes = [lampPos, ...W.mirrors.map(([x, z]) => new THREE.Vector3(x, terrainAt(x, z) + 1.65, z)), target];
  const mirrors = W.mirrors.map(([x, z], k) => mirror(x, z, nodes[k], nodes[k + 2], W.mirrorCorrect[k], (W.mirrorCorrect[k] + 2) % 4));
  for (let k = 0; k < nodes.length - 1; k++) ctx.excludeSeg(nodes[k].x, nodes[k].z, nodes[k + 1].x, nodes[k + 1].z, 1.6);
  ctx.exclude(hx, hz, 11);
  ctx.exclude(bx[0], bx[1], 3.5);

  // ---- beam meshes
  const beamMat = glow(0xffe0a0, 3.2);
  beamMat.transparent = true; beamMat.blending = THREE.AdditiveBlending; beamMat.depthWrite = false;
  const haloMat = glow(0xffb060, 0.5);
  haloMat.transparent = true; haloMat.blending = THREE.AdditiveBlending; haloMat.depthWrite = false;
  function beamGroup(pts) {
    const g = new THREE.Group();
    for (let k = 0; k < pts.length - 1; k++) {
      const a = pts[k], b = pts[k + 1];
      const core = new THREE.Mesh(G.cyl(1, 1, 1, 6, true), beamMat);
      core.applyMatrix4(between(a.x, a.y, a.z, b.x, b.y, b.z, 0.06));
      const halo = new THREE.Mesh(G.cyl(1, 1, 1, 8, true), haloMat);
      halo.applyMatrix4(between(a.x, a.y, a.z, b.x, b.y, b.z, 0.22));
      g.add(core, halo);
    }
    g.visible = false;
    ctx.scene.add(g);
    return g;
  }
  const beam = beamGroup(nodes);

  // ---- teaching set
  const [t0x, t0z] = W.teachLamp, [tmx, tmz] = W.teachMirror, [ttx, ttz] = W.teachTarget;
  const t0y = terrainAt(t0x, t0z);
  sb.add(G.cyl(0.08, 0.11, 1.55, 6), mat(t0x, t0y + 0.78, t0z), 0x2c2a2a);
  sb.add(G.box(0.36, 0.05, 0.36), mat(t0x, t0y + 1.5, t0z), 0x2c2a2a);
  sb.add(G.cone(0.26, 0.22, 4), mat(t0x, t0y + 2.0, t0z, 0, Math.PI / 4), 0x2c2a2a);
  for (const [dx, dz] of [[-0.16, -0.16], [0.16, -0.16], [-0.16, 0.16], [0.16, 0.16]]) sb.add(G.box(0.03, 0.42, 0.03), mat(t0x + dx, t0y + 1.72, t0z + dz), 0x2c2a2a);
  addCircle(t0x, t0z, 0.25, t0y, t0y + 2);
  const tlampPos = new THREE.Vector3(t0x, t0y + 1.62, t0z);
  const tlamp = makeLamp(tlampPos, 0.36);
  ctx.addInteract({ x: t0x, y: t0y + 1, z: t0z, r: 1.7, raise: true, enabled: () => !tlamp.lit, press: () => lightLamp(tlamp) });
  const tty = terrainAt(ttx, ttz);
  sb.add(G.cyl(0.35, 0.45, 0.7, 8), mat(ttx, tty + 0.35, ttz), 0x8e877a, { jitter: 0.1 });
  sb.add(G.cyl(0.5, 0.35, 0.25, 8), mat(ttx, tty + 0.8, ttz), 0x2c2a2a);
  addCircle(ttx, ttz, 0.5, tty, tty + 1);
  const tTargetPos = new THREE.Vector3(ttx, tty + 1.0, ttz);
  const tFire = new Fire(ctx.scene, new THREE.Vector3(ttx, tty + 0.85, ttz), 0.7, true);
  const tnodes = [tlampPos, new THREE.Vector3(tmx, terrainAt(tmx, tmz) + 1.65, tmz), tTargetPos];
  const tmirror = mirror(tmx, tmz, tnodes[0], tnodes[2], W.teachCorrect, (W.teachCorrect + 2) % 4);
  for (let k = 0; k < 2; k++) ctx.excludeSeg(tnodes[k].x, tnodes[k].z, tnodes[k + 1].x, tnodes[k + 1].z, 1.4);
  ctx.exclude(t0x, t0z, 2.5); ctx.exclude(ttx, ttz, 2.5);
  const tbeam = beamGroup(tnodes);

  let solved = false, teachSolved = false;
  function solveMain(instant) {
    if (solved) return;
    solved = true;
    lamp.perm = true; lamp.lit = true; lamp.time = BURN; lamp.fire.set(1, instant);
    mirrors.forEach((m) => { m.idx = m.kc; m.turning = 0; m.head.rotation.y = m.phis[m.kc]; m.locked = true; });
    beam.visible = true;
    if (!instant) audio.success();
    ctx.onSolved(2, instant);
  }
  function solveTeach(instant) {
    if (teachSolved) return;
    teachSolved = true;
    tlamp.perm = true; tlamp.lit = true; tlamp.time = BURN; tlamp.fire.set(1, instant);
    tmirror.idx = tmirror.kc; tmirror.turning = 0; tmirror.head.rotation.y = tmirror.phis[tmirror.kc]; tmirror.locked = true;
    tbeam.visible = true;
    tFire.set(1, instant);
    if (!instant) audio.success(0.6);
    ctx.onTeach(2, instant);
  }

  function updLamp(l, dt) {
    if (l.lit && !l.perm) {
      l.time -= dt;
      l.fire.set(Math.max(0.3, Math.min(1, l.time / 10)));
      if (l.time <= 0) { l.lit = false; l.fire.set(0); ctx.puffs.burst(l.pos.x, l.pos.y + 0.2, l.pos.z, 6, 0.3); audio.fizz([l.pos.x, l.pos.y, l.pos.z]); }
    }
    l.fire.update(dt);
  }
  function updMirror(m, dt) {
    if (m.turning > 0) {
      m.turning = Math.max(0, m.turning - dt);
      const to = m.from + Math.PI / 4; // always one carved notch onward (the disc is two-faced)
      const u = 1 - m.turning / 0.7;
      m.head.rotation.y = lerp(m.from, to, u * u * (3 - 2 * u));
      if (m.turning === 0) m.head.rotation.y = m.phis[m.idx];
    }
  }

  return {
    teachPos: [t0x, t0y + 1, t0z],
    mainPos: [hx, deckY + 1, hz],
    get solved() { return solved; },
    get teachSolved() { return teachSolved; },
    solveMain, solveTeach,
    fires: [lamp.fire, tlamp.fire, tFire],
    update(dt) {
      updLamp(lamp, dt); updLamp(tlamp, dt);
      mirrors.forEach((m) => updMirror(m, dt));
      updMirror(tmirror, dt);
      tFire.update(dt);
      if (!solved) {
        const ok = lamp.lit && mirrors.every((m) => m.idx === m.kc && m.turning <= 0);
        beam.visible = ok;
        if (ok) solveMain(false);
      }
      if (!teachSolved) {
        const ok = tlamp.lit && tmirror.idx === tmirror.kc && tmirror.turning <= 0;
        tbeam.visible = ok;
        if (ok) solveTeach(false);
      }
    },
  };
}
