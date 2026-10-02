// The great lighthouse: hard-edged red and white bands, a hearth room with
// eight shutters at the compass points. Open the shutters that face lit
// beacons (and only those), then light the hearth through the door. A wrong
// pattern lets the wind in: the flame gusts out and every shutter slams shut.
// Teaching version: a little round hut with four shutters, one lit brazier
// and one dead one.
import * as THREE from './three.module.min.js';
import { G, mat, GeoBuilder } from './geo.js';
import { glow } from './materials.js';
import { LIGHT } from './layout.js';
import { terrainAt } from './terrain.js';
import { addCircle, addPlatform } from './colliders.js';
import { DEG } from './util.js';
import { Fire } from './fire.js';

const BASE_Y = 5.5, BAND_H = 3.2, BANDS = 8, R0 = 4.2, R1 = 2.9;
export const LAMP_Y = BASE_Y + BAND_H * BANDS + 1.15;
const radAt = (y) => R0 - (y - BASE_Y) / (BAND_H * BANDS) * (R0 - R1);
const WIN_OFF = new THREE.Color(0.03, 0.03, 0.04), WIN_ON = new THREE.Color(3.0, 1.7, 0.6);

export function buildLighthouse(ctx) {
  const sb = ctx.sb('L');
  const audio = ctx.audio;
  const [cx, cz] = LIGHT.c;
  const red = 0xc8322b, white = 0xf4f0e6, stone = 0x948d80, dark = 0x2c2a2a, shutC = 0x2f7a80;

  // plinth
  sb.add(G.cyl(5.25, 5.5, 0.9, 16), mat(cx, BASE_Y - 0.45, cz), stone, { jitter: 0.08 });
  const oh = 5.25 * Math.cos(Math.PI / 8);
  addPlatform({ x: cx, z: cz, hx: oh, hz: oh, rot: 0, y0: BASE_Y, mat: 'stone' });
  addPlatform({ x: cx, z: cz, hx: oh, hz: oh, rot: Math.PI / 4, y0: BASE_Y, mat: 'stone' });
  // bands (separate cylinders so the colour edges stay hard)
  for (let b = 0; b < BANDS; b++) {
    const y0 = BASE_Y + b * BAND_H, y1 = y0 + BAND_H;
    sb.add(G.cyl(radAt(y1), radAt(y0), BAND_H, 28, true), mat(cx, (y0 + y1) / 2, cz), b % 2 ? red : white);
  }
  addCircle(cx, cz, R0 + 0.05, 0, LAMP_Y + 4);
  // small windows up the tower
  for (let b = 1; b < BANDS; b++) {
    const y = BASE_Y + b * BAND_H + 1.6, a = (b * 97) * DEG, r = radAt(y);
    sb.add(G.box(0.5, 0.8, 0.12), mat(cx + Math.cos(a) * r, y, cz + Math.sin(a) * r, 0, -a + Math.PI / 2), 0x1e2a36);
  }
  // gallery and lamp room
  const GY = BASE_Y + BAND_H * BANDS;
  sb.add(G.cyl(3.9, 3.3, 0.35, 24), mat(cx, GY + 0.05, cz), dark);
  for (let k = 0; k < 20; k++) { const a = k / 20 * Math.PI * 2; sb.add(G.box(0.06, 1.0, 0.06), mat(cx + Math.cos(a) * 3.75, GY + 0.7, cz + Math.sin(a) * 3.75), dark); }
  sb.add(G.torus(3.75, 0.05, 4, 32), mat(cx, GY + 1.2, cz, Math.PI / 2), dark);
  sb.add(G.cyl(2.25, 2.25, 0.5, 16), mat(cx, GY + 0.45, cz), red);
  for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; sb.add(G.box(0.1, 2.3, 0.1), mat(cx + Math.cos(a) * 2.05, GY + 1.85, cz + Math.sin(a) * 2.05), dark); }
  sb.add(G.cyl(2.5, 2.5, 0.2, 16), mat(cx, GY + 3.05, cz), dark);
  sb.add(G.cone(2.5, 1.7, 16), mat(cx, GY + 4.0, cz), 0x7a1f1a);
  sb.add(G.sph(0.3, 8, 6), mat(cx, GY + 4.95, cz), dark);
  sb.add(G.box(0.05, 1.0, 0.05), mat(cx, GY + 5.5, cz), dark);
  sb.add(G.box(0.7, 0.05, 0.2), mat(cx + 0.2, GY + 5.8, cz), dark);
  const glass = new THREE.Mesh(G.cyl(2.0, 2.0, 2.3, 16, true), glow(0x000000));
  glass.material.color.setRGB(0.08, 0.11, 0.14);
  glass.material.side = THREE.DoubleSide;
  glass.position.set(cx, GY + 1.85, cz);
  ctx.scene.add(glass);
  // sweeping beams once lit
  const beamMat = glow(0xfff0c0, 0.9);
  beamMat.transparent = true; beamMat.blending = THREE.AdditiveBlending; beamMat.depthWrite = false; beamMat.side = THREE.DoubleSide;
  const beams = new THREE.Group();
  beams.position.set(cx, LAMP_Y, cz);
  for (const s of [1, -1]) {
    const b = new THREE.Mesh(new THREE.ConeGeometry(7, 110, 16, 1, true), beamMat);
    b.rotation.z = s * Math.PI / 2;
    b.position.x = s * 55;
    beams.add(b);
  }
  beams.visible = false;
  ctx.scene.add(beams);

  // hearth room: eight shutters
  const shutters = [];
  const pending = [];   // delayed consequences of a wrong commit (shutters slamming)
  const WY = BASE_Y + 1.75;
  function makeShutter(px, pz, a, w, h, parentList, onPress, ry, wr) {
    const c = Math.cos(a), s = Math.sin(a);
    sb.add(G.box(w + 0.3, h + 0.3, 0.16), mat(px - c * 0.02, ry, pz - s * 0.02, 0, -a + Math.PI / 2), 0x6b4a2e);
    const win = new THREE.Mesh(G.box(w, h, 0.05), glow(0x000000));
    win.material.color.copy(WIN_OFF);
    win.position.set(px + c * 0.05, ry, pz + s * 0.05);
    win.rotation.y = -a + Math.PI / 2;
    ctx.scene.add(win);
    const hinge = new THREE.Group();
    // hinge on the left edge (seen from outside), panel swings outward
    const tx = -s, tz = c;
    hinge.position.set(px + c * 0.12 + tx * (w / 2), ry, pz + s * 0.12 + tz * (w / 2));
    hinge.rotation.y = -a + Math.PI / 2;
    const pb = new GeoBuilder();
    pb.add(G.box(w, h, 0.07), mat(w / 2, 0, 0), shutC, { jitter: 0.08 });
    for (const yy of [-h * 0.3, h * 0.3]) pb.add(G.box(w * 0.9, 0.07, 0.04), mat(w / 2, yy, 0.05), 0x22585d);
    pb.add(G.box(0.05, h * 0.9, 0.04), mat(w / 2, 0, 0.05, 0, 0, 0.6), 0x22585d);
    const panel = new THREE.Mesh(pb.build(), ctx.toonMat);
    panel.castShadow = true;
    hinge.add(panel);
    ctx.scene.add(hinge);
    const o = { a, hinge, win, open: false, ang: 0, px, pz, ry };
    parentList.push(o);
    ctx.addInteract({ x: px + c * (wr ? 0.9 : 0.7), y: ry - 0.6, z: pz + s * (wr ? 0.9 : 0.7), r: wr ? 1.6 : 1.3, enabled: () => onPress.enabled(), press: () => onPress.press(o) });
    return o;
  }
  const main = { lock: 0, solved: false };
  const mainCtl = {
    enabled: () => !main.solved && main.lock <= 0,
    press: (o) => { o.open = !o.open; audio.shutter([o.px, o.ry, o.pz]); },
  };
  for (let k = 0; k < 8; k++) {
    const a = k * 45 * DEG, r = radAt(WY) + 0.02;
    makeShutter(cx + Math.cos(a) * r, cz + Math.sin(a) * r, a, 1.0, 1.35, shutters, mainCtl, WY, true);
  }
  [0, 3].forEach((k) => { shutters[k].open = true; });
  // door
  const da = 67.5 * DEG, dr = radAt(BASE_Y + 1.2) + 0.02;
  const dx = cx + Math.cos(da) * dr, dz = cz + Math.sin(da) * dr;
  sb.add(G.box(1.6, 2.6, 0.2), mat(dx, BASE_Y + 1.3, dz, 0, -da + Math.PI / 2), 0x7c766c);
  sb.add(G.box(1.2, 2.2, 0.12), mat(dx + Math.cos(da) * 0.08, BASE_Y + 1.12, dz + Math.sin(da) * 0.08, 0, -da + Math.PI / 2), 0x4a3222);
  const hearthGlow = new THREE.Mesh(G.box(0.7, 0.5, 0.05), glow(0x000000));
  hearthGlow.material.color.copy(WIN_OFF);
  hearthGlow.position.set(dx + Math.cos(da) * 0.16, BASE_Y + 0.55, dz + Math.sin(da) * 0.16);
  hearthGlow.rotation.y = -da + Math.PI / 2;
  ctx.scene.add(hearthGlow);
  let flare = 0;
  ctx.addInteract({
    x: dx + Math.cos(da) * 0.8, y: BASE_Y + 1, z: dz + Math.sin(da) * 0.8, r: 1.4, raise: true,
    enabled: () => !main.solved && main.lock <= 0,
    press: () => {
      const want = new Set(LIGHT.correct);
      const ok = shutters.every((s, k) => s.open === want.has(k));
      audio.ignite([dx, BASE_Y + 1, dz], 0.9);
      if (ok) { solveMain(false); return; }
      flare = 1.0;
      main.lock = 6;
      pending.push({ t: 0.7, fn: () => {
        shutters.forEach((s) => { if (s.open) ctx.puffs.burst(s.px, s.ry, s.pz, 5, 0.4); s.open = false; });
        audio.slam([cx, WY, cz]); audio.fizz([dx, BASE_Y + 1, dz]);
        ctx.puffs.burst(dx, BASE_Y + 1.5, dz, 10, 0.6);
      } });
    },
  });
  ctx.exclude(cx, cz, 9);

  // ---- teaching hut
  const [hx, hz] = LIGHT.hut;
  const hy = terrainAt(hx, hz);
  sb.add(G.cyl(1.5, 1.6, 2.1, 12), mat(hx, hy + 1.0, hz), white, { jitter: 0.06 });
  sb.add(G.cone(2.0, 1.5, 12), mat(hx, hy + 2.75, hz), red);
  sb.add(G.cyl(0.18, 0.2, 0.7, 6), mat(hx + 0.5, hy + 3.1, hz + 0.3), stone);
  addCircle(hx, hz, 1.6, hy, hy + 3.5);
  const tshut = [];
  const teach = { lock: 0, solved: false };
  const teachCtl = { enabled: () => !teach.solved && teach.lock <= 0, press: (o) => { o.open = !o.open; audio.shutter([o.px, o.ry, o.pz], 0.6); } };
  for (let k = 0; k < 4; k++) {
    const a = k * 90 * DEG;
    makeShutter(hx + Math.cos(a) * 1.58, hz + Math.sin(a) * 1.58, a, 0.55, 0.65, tshut, teachCtl, hy + 1.2, false);
  }
  [0, 1].forEach((k) => { tshut[k].open = true; });
  const tCorrect = (() => { const a = Math.atan2(LIGHT.lit[1] - hz, LIGHT.lit[0] - hx); return Math.round((a / DEG + 360) / 90) % 4; })();
  const hda = 135 * DEG;
  const hdx = hx + Math.cos(hda) * 1.58, hdz = hz + Math.sin(hda) * 1.58;
  sb.add(G.box(0.8, 1.5, 0.1), mat(hdx, hy + 0.75, hdz, 0, -hda + Math.PI / 2), 0x4a3222);
  const chimney = new Fire(ctx.scene, new THREE.Vector3(hx + 0.5, hy + 3.5, hz + 0.3), 0.45, true);
  let tflare = 0;
  ctx.addInteract({
    x: hdx + Math.cos(hda) * 0.7, y: hy + 0.9, z: hdz + Math.sin(hda) * 0.7, r: 1.2, raise: true,
    enabled: () => !teach.solved && teach.lock <= 0,
    press: () => {
      const ok = tshut.every((s, k) => s.open === (k === tCorrect));
      audio.ignite([hdx, hy + 1, hdz], 0.5);
      if (ok) { solveTeach(false); return; }
      tflare = 1; teach.lock = 3;
      pending.push({ t: 0.6, fn: () => {
        tshut.forEach((s) => { if (s.open) ctx.puffs.burst(s.px, s.ry, s.pz, 4, 0.3); s.open = false; });
        audio.slam([hx, hy + 1, hz], 0.5); audio.fizz([hdx, hy + 1, hdz]);
      } });
    },
  });
  ctx.exclude(hx, hz, 3);
  // braziers: one burning, one dead
  const braz = (x, z) => {
    const y = terrainAt(x, z);
    sb.add(G.cyl(0.18, 0.25, 1.1, 6), mat(x, y + 0.55, z), stone);
    sb.add(G.cyl(0.45, 0.25, 0.3, 8), mat(x, y + 1.2, z), dark);
    addCircle(x, z, 0.4, y, y + 1.4);
    ctx.exclude(x, z, 2);
    return new THREE.Vector3(x, y + 1.3, z);
  };
  const litFire = new Fire(ctx.scene, braz(...LIGHT.lit), 0.65, true);
  litFire.set(1, true);
  braz(...LIGHT.dead);

  function solveMain(instant) {
    if (main.solved) return;
    main.solved = true;
    const want = new Set(LIGHT.correct);
    shutters.forEach((s, k) => { s.open = want.has(k); });
    ctx.onSolved(4, instant);
  }
  function solveTeach(instant) {
    if (teach.solved) return;
    teach.solved = true;
    tshut.forEach((s, k) => { s.open = k === tCorrect; });
    chimney.set(1, instant);
    if (!instant) audio.success(0.6);
    ctx.onTeach(4, instant);
  }
  function setLamp(on) {
    if (on) glass.material.color.setRGB(3.2, 2.4, 1.2); else glass.material.color.setRGB(0.08, 0.11, 0.14);
    beams.visible = on;
  }

  function animShutters(list, dt, glowOn) {
    for (const s of list) {
      const target = s.open ? 1.9 : 0;
      s.ang += (target - s.ang) * Math.min(1, dt * (s.open ? 5 : 9));
      s.hinge.rotation.y = -s.a + Math.PI / 2 - s.ang; // swing outward
      s.win.material.color.copy(glowOn && s.ang > 0.3 ? WIN_ON : WIN_OFF);
    }
  }

  return {
    teachPos: [hx, hy + 1, hz],
    mainPos: [dx, BASE_Y + 1, dz],
    get solved() { return main.solved; },
    get teachSolved() { return teach.solved; },
    solveMain, solveTeach, setLamp,
    lampPos: new THREE.Vector3(cx, LAMP_Y, cz),
    fires: [chimney, litFire],
    forceVisible(v) { beams.visible = v || glass.material.color.r > 1; },
    update(dt, t) {
      for (let i = pending.length - 1; i >= 0; i--) { pending[i].t -= dt; if (pending[i].t <= 0) { const f = pending[i].fn; pending.splice(i, 1); f(); } }
      if (main.lock > 0) main.lock -= dt;
      if (teach.lock > 0) teach.lock -= dt;
      if (flare > 0) flare = Math.max(0, flare - dt * 1.2);
      if (tflare > 0) tflare = Math.max(0, tflare - dt * 1.4);
      animShutters(shutters, dt, main.solved || flare > 0.2);
      animShutters(tshut, dt, teach.solved || tflare > 0.2);
      hearthGlow.material.color.copy(main.solved || flare > 0.2 ? WIN_ON : WIN_OFF);
      if (beams.visible) beams.rotation.y = t * 0.45;
      chimney.update(dt); litFire.update(dt);
    },
  };
}
