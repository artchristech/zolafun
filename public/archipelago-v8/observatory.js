// The toppled observatory on the peak. Its dome lies broken beside the drum;
// the telescope has been re-set on its mount. The brass inlay in the floor
// marks the bearing (it also lines up with the great lighthouse) and the
// carved stele at the foot of the switchback trail shows the tilt. Clicking
// the wheel and crank then pulling the lever focuses the evening star into
// the beacon; a wrong aim makes the telescope grind slowly back to rest.
// Teaching version: a small sight-scope with its own inlay and a cairn lamp.
import * as THREE from './three.module.min.js';
import { G, mat, between, GeoBuilder, flipped } from './geo.js';
import { glow } from './materials.js';
import { OBS } from './layout.js';
import { terrainAt, TRAIL } from './terrain.js';
import { addCircle, addBox, addPlatform } from './colliders.js';
import { DEG, lerp, easeInOut } from './util.js';
import { Fire } from './fire.js';

export function buildObservatory(ctx) {
  const sb = ctx.sb('P');
  const audio = ctx.audio;
  const [cx, cz] = OBS.c;
  const FY = OBS.y + 0.25;
  const stone = 0x9b9488, stoneD = 0x7c766c, brass = 0xc9a24a, green = 0x2f5d4a, iron = 0x2c2a2a;

  // ---- floor (octagonal walkable platform)
  sb.add(G.cyl(5.6, 5.8, 0.6, 24), mat(cx, OBS.y - 0.05, cz), stone, { jitter: 0.06 });
  for (let k = 0; k < 12; k++) sb.add(G.box(0.05, 0.02, 4.6), mat(cx, FY + 0.003, cz, 0, k * Math.PI / 12), stoneD);
  const oh = 5.6 * Math.cos(Math.PI / 8);
  addPlatform({ x: cx, z: cz, hx: oh, hz: oh, rot: 0, y0: FY, mat: 'stone' });
  addPlatform({ x: cx, z: cz, hx: oh, hz: oh, rot: Math.PI / 4, y0: FY, mat: 'stone' });
  // bearing ticks around the mount, and the single brass inlay
  for (let k = 0; k < 8; k++) {
    const a = k * 45 * DEG;
    sb.add(G.box(0.5, 0.025, 0.07), mat(cx + Math.cos(a) * 1.25, FY + 0.01, cz + Math.sin(a) * 1.25, 0, -a), 0x4a463f);
  }
  const ia = OBS.azCorrect * 45 * DEG, ic = Math.cos(ia), is = Math.sin(ia);
  sb.add(G.box(3.9, 0.03, 0.13), mat(cx + ic * 3.15, FY + 0.012, cz + is * 3.15, 0, -ia), brass);
  for (const r of [0, Math.PI / 2]) sb.add(G.box(0.75, 0.035, 0.14), mat(cx + ic * 5.2, FY + 0.014, cz + is * 5.2, 0, -ia + Math.PI / 4 + r), brass);
  sb.add(G.cyl(0.16, 0.16, 0.04, 8), mat(cx + ic * 5.2, FY + 0.016, cz + is * 5.2), 0xe8c86a);

  // ---- ruined drum wall
  for (let k = 0; k < 24; k++) {
    const deg = k * 15 + 7.5;
    // remnants only; the arc toward the lighthouse (135 deg) stays open as a sightline
    if (!((deg > 85 && deg < 118) || (deg > 152 && deg < 168) || (deg > 190 && deg < 255))) continue;
    const a = deg * DEG, r = 6.0;
    const h = 0.8 + ((k * 7) % 5) * 0.5;
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    sb.add(G.box(1.6, h, 0.55), mat(x, OBS.y + h / 2, z, 0, -a + Math.PI / 2), 0xa59e90, { jitter: 0.12 });
    addBox(x, z, 0.8, 0.3, -a + Math.PI / 2, OBS.y - 1, OBS.y + h);
  }
  for (const [dx, dz, s] of [[-7.5, 4.5, 0.6], [-6.5, -4, 0.5], [3.5, 7.8, 0.45], [-3, 8.2, 0.4]]) {
    const x = cx + dx, z = cz + dz, y = terrainAt(x, z);
    sb.add(G.box(1.2 * s * 2, 0.6 * s * 2, 0.8 * s * 2), mat(x, y + 0.3 * s, z, 0.2, dx, 0.3), 0xa59e90, { jitter: 0.12 });
    addCircle(x, z, 0.8 * s * 1.3, y, y + 0.8);
  }

  // ---- the fallen dome
  {
    const [dx, dz] = OBS.dome;
    const dy = terrainAt(dx, dz) + 1.4;
    const R = 4.8;
    const outer = new THREE.SphereGeometry(R, 22, 9, 0.3, Math.PI * 2 - 0.6, 0, Math.PI / 2);
    const inner = flipped(new THREE.SphereGeometry(R * 0.93, 22, 9, 0.3, Math.PI * 2 - 0.6, 0, Math.PI / 2));
    const M = mat(dx, dy, dz, 0, 0.7, 1.95);
    sb.add(outer, M, 0x6fa596, { jitter: 0.08 });
    sb.add(inner, M, 0x4c4a44);
    sb.add(G.torus(R * 0.965, 0.2, 4, 28), new THREE.Matrix4().multiplyMatrices(M, mat(0, 0, 0, Math.PI / 2)), 0x5a554c);
    for (let k = 0; k < 6; k++) sb.add(G.torus(R + 0.02, 0.07, 3, 12, Math.PI / 2), new THREE.Matrix4().multiplyMatrices(M, mat(0, 0, 0, 0, k * Math.PI / 3 + 0.15, Math.PI / 2)), brass);
    addCircle(dx, dz, R * 0.9, dy - 3, dy + 4);
  }

  // ---- telescope
  sb.add(G.cyl(0.55, 0.75, 1.3, 10), mat(cx, FY + 0.65, cz), stoneD, { jitter: 0.08 });
  sb.add(G.cyl(0.8, 0.8, 0.12, 10), mat(cx, FY + 1.3, cz), brass);
  addCircle(cx, cz, 0.85, FY, FY + 2.2);
  const azG = new THREE.Group();
  azG.position.set(cx, FY + 1.36, cz);
  const fork = new GeoBuilder();
  fork.add(G.cyl(0.62, 0.62, 0.14, 10), mat(0, 0.07, 0), 0x8a7a50);
  fork.add(G.box(0.16, 2.1, 0.16), mat(0, 1.05, 0.5), brass);
  fork.add(G.box(0.16, 2.1, 0.16), mat(0, 1.05, -0.5), brass);
  const forkMesh = new THREE.Mesh(fork.build(), ctx.toonMat);
  forkMesh.castShadow = true;
  azG.add(forkMesh);
  const elG = new THREE.Group();
  elG.position.set(0, 1.95, 0);
  const tube = new GeoBuilder();
  tube.add(G.cyl(0.34, 0.3, 4.4, 14), mat(1.0, 0, 0, 0, 0, -Math.PI / 2), green);
  for (const x of [-1.0, 0.45, 2.05, 3.0]) tube.add(G.cyl(0.37, 0.37, 0.12, 14), mat(x, 0, 0, 0, 0, -Math.PI / 2), brass);
  tube.add(G.cyl(0.42, 0.37, 0.5, 14), mat(3.35, 0, 0, 0, 0, -Math.PI / 2), brass);
  tube.add(G.cyl(0.08, 0.1, 0.5, 6), mat(-1.4, 0, 0, 0, 0, -Math.PI / 2), brass);
  tube.add(G.cyl(0.08, 0.08, 1.2, 6), mat(1.05, 0.45, 0, 0, 0, -Math.PI / 2), green);
  tube.add(G.cyl(0.07, 0.07, 1.0, 6), mat(0, 0, 0, Math.PI / 2), brass);
  const tubeMesh = new THREE.Mesh(tube.build(), ctx.toonMat);
  tubeMesh.castShadow = true;
  elG.add(tubeMesh);
  const lens = new THREE.Mesh(G.cyl(0.3, 0.3, 0.02, 14), glow(0x000000));
  lens.material.color.setRGB(0.05, 0.08, 0.1);
  lens.position.set(3.61, 0, 0); lens.rotation.z = -Math.PI / 2;
  elG.add(lens);
  azG.add(elG);
  ctx.scene.add(azG);
  const starBeamMat = glow(0xcfe4ff, 2.5);
  starBeamMat.transparent = true; starBeamMat.blending = THREE.AdditiveBlending; starBeamMat.depthWrite = false;
  const starBeam = new THREE.Mesh(G.cyl(0.12, 0.3, 90, 8, true), starBeamMat);
  starBeam.position.set(48.7, 0, 0); starBeam.rotation.z = -Math.PI / 2;
  starBeam.visible = false;
  elG.add(starBeam);

  const azInit = (OBS.azCorrect + 4) % 8, elInit = 0;
  const st = { az: azInit, el: elInit, azA: azInit * 45, elA: OBS.elAngles[elInit], azFrom: 0, elFrom: 0, t: 0, mode: 'idle', lock: 0, lever: 0 };
  function applyTelescope() {
    azG.rotation.y = -st.azA * DEG;
    elG.rotation.z = st.elA * DEG;
  }
  applyTelescope();

  // controls: wheel (bearing), crank (tilt), lever (focus)
  const ctl = (dx, dz) => [cx + dx, cz + dz];
  const [wx, wz] = ctl(2.4, -1.4), [kx, kz] = ctl(2.4, 1.4), [lx, lz] = ctl(-0.3, -2.9);
  for (const [px, pz] of [[wx, wz], [kx, kz], [lx, lz]]) {
    sb.add(G.box(0.22, 1.0, 0.22), mat(px, FY + 0.5, pz), iron);
    sb.add(G.box(1, 1, 1), between(px, FY + 0.2, pz, cx, FY + 0.2, cz, 0.06), iron);
    addCircle(px, pz, 0.2, FY, FY + 1.2);
  }
  const wheel = new THREE.Mesh(G.torus(0.32, 0.05, 4, 12), ctx.toonMatFlat(brass));
  wheel.position.set(wx, FY + 1.1, wz);
  wheel.rotation.y = Math.atan2(wx - cx, wz - cz);
  ctx.scene.add(wheel);
  const crank = new THREE.Mesh(G.box(0.08, 0.6, 0.08), ctx.toonMatFlat(brass));
  const crankG = new THREE.Group();
  crankG.position.set(kx, FY + 1.05, kz);
  crankG.rotation.y = Math.atan2(kx - cx, kz - cz);
  crank.position.set(0, 0.25, 0.14);
  crankG.add(crank);
  ctx.scene.add(crankG);
  const lever = new THREE.Mesh(G.box(0.09, 0.9, 0.09), ctx.toonMatFlat(0xb0402e));
  const leverG = new THREE.Group();
  leverG.position.set(lx, FY + 1.0, lz);
  leverG.rotation.y = Math.atan2(lx - cx, lz - cz);
  lever.position.set(0, 0.4, 0);
  leverG.add(lever);
  ctx.scene.add(leverG);
  const busy = () => st.mode !== 'idle' || solved;
  ctx.addInteract({ x: wx, y: FY + 1, z: wz, r: 1.5, enabled: () => !busy(), press: () => {
    st.mode = 'az'; st.t = 0; st.azFrom = st.azA; st.az = (st.az + 1) % 8; audio.click([wx, FY + 1, wz], 0.7);
  } });
  ctx.addInteract({ x: kx, y: FY + 1, z: kz, r: 1.5, enabled: () => !busy(), press: () => {
    st.mode = 'el'; st.t = 0; st.elFrom = st.elA; st.el = (st.el + 1) % 5; audio.click([kx, FY + 1, kz], 0.9);
  } });
  ctx.addInteract({ x: lx, y: FY + 1, z: lz, r: 1.5, enabled: () => !busy(), press: () => {
    st.lever = 1;
    audio.clunk([lx, FY + 1, lz]);
    if (st.az === OBS.azCorrect && st.el === OBS.elCorrect) solveMain(false);
    else {
      st.mode = 'reset'; st.t = 0; st.azFrom = st.azA; st.elFrom = st.elA;
      st.az = azInit; st.el = elInit;
      audio.grind([cx, FY + 2, cz], 1, 4.5);
      ctx.puffs.burst(cx, FY + 2.4, cz, 6, 0.8);
    }
  } });
  ctx.exclude(cx, cz, 15);

  // ---- the elevation stele at the foot of the trail
  {
    const foot = TRAIL[0];
    const ox = foot[0] - cx, oz = foot[1] - cz, ol = Math.hypot(ox, oz);
    const ux = ox / ol, uz = oz / ol;
    const sx = foot[0] + uz * 2.6 + ux * 0.5, sz = foot[1] - ux * 2.6 + uz * 0.5;
    const sy = terrainAt(sx, sz);
    const rot = Math.atan2(ux, uz);
    const c = Math.cos(rot), s = Math.sin(rot);
    const M = (lx2, ly, lz2, rz = 0) => mat(sx + c * lx2 + s * lz2, sy + ly, sz - s * lx2 + c * lz2, 0, rot, rz);
    sb.add(G.box(2.2, 0.4, 0.9), M(0, 0.1, 0), stoneD, { jitter: 0.1 });
    sb.add(G.box(1.9, 2.5, 0.35), M(0, 1.5, 0), stone, { jitter: 0.08 });
    sb.add(G.box(1.7, 0.05, 0.04), M(0, 0.75, 0.19), 0x4a463f);
    const px = -0.45, py = 1.0;
    sb.add(G.box(0.36, 0.25, 0.05), M(px, 0.88, 0.2), 0x4a463f);
    for (let k = 0; k < 5; k++) {
      const a = OBS.elAngles[k] * DEG;
      sb.add(G.box(0.22, 0.05, 0.04), M(px + Math.cos(a) * 1.25, py + Math.sin(a) * 1.25, 0.19, a), k === OBS.elCorrect ? brass : 0x4a463f);
    }
    const ea = OBS.elAngles[OBS.elCorrect] * DEG;
    sb.add(G.box(1.0, 0.12, 0.05), M(px + Math.cos(ea) * 0.45, py + Math.sin(ea) * 0.45, 0.21, ea), brass);
    sb.add(G.box(0.16, 0.16, 0.05), M(px + Math.cos(ea) * 1.55, py + Math.sin(ea) * 1.55, 0.21, Math.PI / 4), 0xe8c86a);
    addBox(sx, sz, 1.1, 0.45, rot, sy, sy + 2.8);
    ctx.exclude(sx, sz, 2.5);
  }

  // ---- teaching sight-scope
  const [tx, tz] = OBS.teach;
  const ty = terrainAt(tx, tz);
  sb.add(G.cyl(1.4, 1.5, 0.12, 16), mat(tx, ty + 0.02, tz), stone);
  sb.add(G.cyl(0.25, 0.35, 1.0, 8), mat(tx, ty + 0.55, tz), stoneD);
  addCircle(tx, tz, 0.4, ty, ty + 1.6);
  for (let k = 0; k < 4; k++) { const a = k * 90 * DEG; sb.add(G.box(0.35, 0.02, 0.06), mat(tx + Math.cos(a) * 0.7, ty + 0.09, tz + Math.sin(a) * 0.7, 0, -a), 0x4a463f); }
  const [qx, qz] = OBS.cairn;
  const qa = Math.atan2(qz - tz, qx - tx);
  const tCorrect = Math.round((qa / DEG + 360) / 90) % 4;
  sb.add(G.box(0.55, 0.025, 0.08), mat(tx + Math.cos(qa) * 1.05, ty + 0.095, tz + Math.sin(qa) * 1.05, 0, -qa), brass);
  sb.add(G.box(0.22, 0.03, 0.22), mat(tx + Math.cos(qa) * 1.33, ty + 0.1, tz + Math.sin(qa) * 1.33, 0, -qa + Math.PI / 4), brass);
  const qy = terrainAt(qx, qz);
  sb.add(G.box(0.9, 0.5, 0.8), mat(qx, qy + 0.25, qz, 0, 0.3), stoneD, { jitter: 0.1 });
  sb.add(G.box(0.7, 0.4, 0.6), mat(qx, qy + 0.7, qz, 0, -0.2), stone, { jitter: 0.1 });
  sb.add(G.cyl(0.32, 0.22, 0.2, 8), mat(qx, qy + 1.0, qz), iron);
  addCircle(qx, qz, 0.6, qy, qy + 1.2);
  const tFire = new Fire(ctx.scene, new THREE.Vector3(qx, qy + 1.05, qz), 0.45, true);
  const tG = new THREE.Group();
  tG.position.set(tx, ty + 1.12, tz);
  const tb = new GeoBuilder();
  tb.add(G.cyl(0.12, 0.1, 1.2, 10), mat(0.3, 0, 0, 0, 0, -Math.PI / 2), green);
  tb.add(G.cyl(0.14, 0.14, 0.08, 10), mat(0.88, 0, 0, 0, 0, -Math.PI / 2), brass);
  tb.add(G.box(0.2, 0.14, 0.2), mat(0, -0.06, 0), brass);
  const tMesh = new THREE.Mesh(tb.build(), ctx.toonMat);
  tMesh.castShadow = true;
  tG.add(tMesh);
  ctx.scene.add(tG);
  const tInit = (tCorrect + 2) % 4;
  const ts = { idx: tInit, a: tInit * 90, from: 0, t: 0, mode: 'idle', lever: 0 };
  tG.rotation.y = -ts.a * DEG;
  const [tlx, tlz] = [tx - 1.1, tz - 0.9];
  sb.add(G.box(0.16, 0.8, 0.16), mat(tlx, ty + 0.4, tlz), iron);
  addCircle(tlx, tlz, 0.15, ty, ty + 1);
  const tLever = new THREE.Mesh(G.box(0.07, 0.6, 0.07), ctx.toonMatFlat(0xb0402e));
  const tLeverG = new THREE.Group();
  tLeverG.position.set(tlx, ty + 0.8, tlz);
  tLever.position.set(0, 0.27, 0);
  tLeverG.add(tLever);
  ctx.scene.add(tLeverG);
  const tbusy = () => ts.mode !== 'idle' || tSolved;
  ctx.addInteract({ x: tx + 0.2, y: ty + 1, z: tz + 0.2, r: 1.3, enabled: () => !tbusy(), press: () => {
    ts.mode = 'turn'; ts.t = 0; ts.from = ts.a; ts.idx = (ts.idx + 1) % 4; audio.click([tx, ty + 1, tz], 1.2);
  } });
  ctx.addInteract({ x: tlx, y: ty + 0.8, z: tlz, r: 1.2, enabled: () => !tbusy(), press: () => {
    ts.lever = 1;
    audio.clunk([tlx, ty + 1, tlz], 0.6);
    if (ts.idx === tCorrect) solveTeach(false);
    else { ts.mode = 'reset'; ts.t = 0; ts.from = ts.a; ts.idx = tInit; audio.grind([tx, ty + 1, tz], 0.5, 2.5); }
  } });

  let solved = false, tSolved = false;
  function solveMain(instant) {
    if (solved) return;
    solved = true;
    st.az = OBS.azCorrect; st.el = OBS.elCorrect; st.azA = st.az * 45; st.elA = OBS.elAngles[st.el]; st.mode = 'idle';
    applyTelescope();
    lens.material.color.setRGB(2.2, 2.6, 3.2);
    starBeam.visible = true;
    if (!instant) audio.success();
    ctx.onSolved(3, instant);
  }
  function solveTeach(instant) {
    if (tSolved) return;
    tSolved = true;
    ts.idx = tCorrect; ts.a = tCorrect * 90; ts.mode = 'idle';
    tG.rotation.y = -ts.a * DEG;
    tFire.set(1, instant);
    if (!instant) audio.success(0.6);
    ctx.onTeach(3, instant);
  }

  return {
    teachPos: [tx, ty + 1, tz],
    mainPos: [cx, FY + 1, cz],
    get solved() { return solved; },
    get teachSolved() { return tSolved; },
    solveMain, solveTeach,
    fires: [tFire],
    update(dt, t) {
      if (st.mode === 'az') {
        st.t += dt / 0.9;
        st.azA = lerp(st.azFrom, st.azFrom + 45, easeInOut(Math.min(1, st.t)));
        wheel.rotation.z += dt * 6;
        if (st.t >= 1) { st.azA = st.az * 45; st.mode = 'idle'; }
      } else if (st.mode === 'el') {
        st.t += dt / 0.8;
        st.elA = lerp(st.elFrom, OBS.elAngles[st.el], easeInOut(Math.min(1, st.t)));
        crankG.rotation.x += dt * 7;
        if (st.t >= 1) { st.elA = OBS.elAngles[st.el]; st.mode = 'idle'; }
      } else if (st.mode === 'reset') {
        st.t += dt / 5.0;
        const u = easeInOut(Math.min(1, st.t));
        let to = azInit * 45;
        while (to < st.azFrom) to += 360;
        st.azA = lerp(st.azFrom, to, u);
        st.elA = lerp(st.elFrom, OBS.elAngles[elInit], u);
        if (st.t >= 1) { st.azA = azInit * 45; st.elA = OBS.elAngles[elInit]; st.mode = 'idle'; }
      }
      applyTelescope();
      if (st.lever > 0) st.lever = Math.max(0, st.lever - dt * 0.8);
      leverG.rotation.x = -0.9 * Math.sin(Math.min(1, st.lever) * Math.PI);
      if (solved) { const k = 0.85 + 0.15 * Math.sin(t * 2); starBeamMat.color.setRGB(1.8 * k, 2.2 * k, 3.0 * k); }
      // teaching scope
      if (ts.mode === 'turn' || ts.mode === 'reset') {
        ts.t += dt / (ts.mode === 'turn' ? 0.7 : 2.5);
        let to = ts.mode === 'turn' ? ts.from + 90 : tInit * 90;
        if (ts.mode === 'reset') while (to < ts.from) to += 360;
        ts.a = lerp(ts.from, to, easeInOut(Math.min(1, ts.t)));
        if (ts.t >= 1) { ts.a = ts.idx * 90; ts.mode = 'idle'; }
        tG.rotation.y = -ts.a * DEG;
      }
      if (ts.lever > 0) ts.lever = Math.max(0, ts.lever - dt * 0.8);
      tLeverG.rotation.x = -0.9 * Math.sin(Math.min(1, ts.lever) * Math.PI);
      tFire.update(dt);
    },
  };
}
