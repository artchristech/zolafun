// Toppled observatory on the peak. The telescope has been re-set on its mount;
// its two carved wheels click through fixed positions. The aim is read from
// the world: a brass inlay + two sighting stones give the bearing, a carved
// fan inside the fallen dome gives the elevation (two clues, two places).
import * as THREE from './three.module.min.js';
import { OBS } from './layout.js';
import { heightAt, addDisc, addBox, addCircle } from './terrain.js';
import { toon, paint, xf, mergeGeoms } from './materials.js';
import { makeBeam } from './beam.js';
import { D2R, rng, dampAngle, damp } from './util.js';

const STONE = 0xbcae96, STONE_D = 0x9a8e7c, BRASS = 0xd9a441, COPPER = 0x5aa58e;

function starShape(r) {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2, rr = i % 2 ? r * 0.42 : r;
    if (i === 0) s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); else s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  return new THREE.ExtrudeGeometry(s, { depth: 0.03, bevelEnabled: false });
}
// the 5-notch fan used on both the dome carving and the elevation wheel plate
export const FAN_ANGLES = [10, 25, 40, 55, 70];
function fanGeoms(scale, withStar, starIdx) {
  const gs = [];
  gs.push(paint(new THREE.BoxGeometry(1.9 * scale, 0.06 * scale, 0.05).translate(0.85 * scale, 0, 0), 0x3a3128));
  FAN_ANGLES.forEach((a, i) => {
    const r = 1.35 * scale, ar = a * D2R;
    gs.push(paint(xf(new THREE.BoxGeometry(0.24 * scale, 0.06 * scale, 0.05), Math.cos(ar) * r, Math.sin(ar) * r, 0, 0, 0, ar), 0x3a3128));
  });
  if (withStar) {
    const ar = FAN_ANGLES[starIdx] * D2R;
    gs.push(paint(xf(new THREE.BoxGeometry(1.2 * scale, 0.05 * scale, 0.05), Math.cos(ar) * 0.6 * scale, Math.sin(ar) * 0.6 * scale, 0.01, 0, 0, ar), BRASS));
    gs.push(paint(xf(starShape(0.17 * scale), Math.cos(ar) * 1.62 * scale, Math.sin(ar) * 1.62 * scale, 0.0), BRASS));
  }
  return gs;
}

export function buildObservatory(ctx) {
  const { scene, audio } = ctx;
  const R = rng(77);
  const H0 = heightAt(OBS.x, OBS.z) + 0.06;
  const ox = OBS.x, oz = OBS.z;
  const stoneM = toon(0xffffff, { vertexColors: true, flat: true });
  const brassM = toon(BRASS, { emissive: 0x4a3008, emissiveIntensity: 1 });

  // floor
  const floor = new THREE.Mesh(paint(new THREE.CylinderGeometry(OBS.wallR, OBS.wallR + 0.2, 0.5, 40).translate(ox, H0 - 0.25, oz), 0xcfc3aa, 0.06, 4), stoneM);
  floor.receiveShadow = true;
  scene.add(floor);
  addDisc(ox, oz, OBS.wallR, H0, 'stone');
  // floor rings
  const rings = [];
  for (const r of [3, 6.2]) rings.push(paint(new THREE.TorusGeometry(r, 0.06, 3, 48).rotateX(Math.PI / 2).translate(ox, H0 + 0.005, oz), 0x8f846f));
  scene.add(new THREE.Mesh(mergeGeoms(rings), stoneM));

  // brass inlay along the bearing + star at its end, out through the wall gap
  const az = OBS.starAz;
  const dir = new THREE.Vector3(Math.cos(az), 0, Math.sin(az));
  const inlayLen = OBS.plateauR - 2.2;
  const inlay = new THREE.Mesh(new THREE.BoxGeometry(inlayLen, 0.04, 0.16).translate(inlayLen / 2 + 1.0, 0, 0), brassM);
  inlay.position.set(ox, H0 + 0.01, oz);
  inlay.rotation.y = -az;
  scene.add(inlay);
  const star = new THREE.Mesh(starShape(0.55), brassM);
  star.rotation.x = -Math.PI / 2;
  star.position.set(ox + dir.x * (inlayLen + 1.6), heightAt(ox + dir.x * (inlayLen + 1.6), oz + dir.z * (inlayLen + 1.6)) + 0.04, oz + dir.z * (inlayLen + 1.6));
  scene.add(star);

  // ring wall: broken, with gaps at the entrance (south), the sightline and where the dome fell
  const wallG = [];
  const gaps = [[78, 102], [186, 204], [116, 160]];
  for (let a = 0; a < 360; a += 7.5) {
    const ac = a + 3.75;
    if (gaps.some(([g0, g1]) => ac > g0 && ac < g1)) continue;
    const ar = ac * D2R;
    let h = 0.8 + Math.pow(R(), 1.6) * 3.4;
    if (ac > 220 && ac < 320) h += 1.4;
    const x = ox + Math.cos(ar) * OBS.wallR, z = oz + Math.sin(ar) * OBS.wallR;
    const ry = Math.atan2(-Math.cos(ar), -Math.sin(ar));
    wallG.push(paint(xf(new THREE.BoxGeometry(1.3, h, 0.8), x, H0 + h / 2 - 0.2, z, 0, ry, (R() - 0.5) * 0.06), R() > 0.5 ? STONE : STONE_D, 0.08, a + 1));
    addBox(x, z, 0.65, 0.4, ry, H0 - 2, H0 + h, true);
  }
  // doorway pillars at the entrance and a broken lintel
  for (const s of [-1, 1]) {
    const ar = (90 + s * 13) * D2R;
    const x = ox + Math.cos(ar) * OBS.wallR, z = oz + Math.sin(ar) * OBS.wallR;
    wallG.push(paint(xf(new THREE.BoxGeometry(1.1, 4.6, 1.1), x, H0 + 2.1, z), STONE, 0.06, 3));
    addBox(x, z, 0.55, 0.55, 0, H0 - 2, H0 + 4.6, true);
  }
  wallG.push(paint(xf(new THREE.BoxGeometry(3.4, 0.6, 1.0), ox + 1.0, H0 + 4.6, oz + OBS.wallR, 0, 0, 0.18), STONE_D, 0.06, 4));
  // rubble
  for (let i = 0; i < 26; i++) {
    const a = (110 + R() * 70) * D2R, r = OBS.wallR + 0.6 + R() * 4;
    const x = ox + Math.cos(a) * r, z = oz + Math.sin(a) * r, s = 0.3 + R() * 0.5;
    wallG.push(paint(xf(new THREE.BoxGeometry(s * 1.6, s, s), x, heightAt(x, z) + s * 0.3, z, R(), R() * 3, R()), STONE_D, 0.1, i));
  }
  // dome rail fragments on top of the tall wall stretch
  const walls = new THREE.Mesh(mergeGeoms(wallG), stoneM);
  walls.castShadow = true; walls.receiveShadow = true;
  scene.add(walls);
  const rail = new THREE.Mesh(new THREE.TorusGeometry(OBS.wallR, 0.09, 4, 40, 1.2).rotateX(Math.PI / 2), toon(0x5a4a3a));
  rail.position.set(ox, H0 + 4.1, oz); rail.rotation.y = -235 * D2R;
  scene.add(rail);

  // sighting stones flanking the bearing at the plateau edge, each topped with a brass star
  const perp = new THREE.Vector3(-dir.z, 0, dir.x);
  for (const s of [-1, 1]) {
    const x = ox + dir.x * (OBS.plateauR - 1.6) + perp.x * 1.25 * s, z = oz + dir.z * (OBS.plateauR - 1.6) + perp.z * 1.25 * s;
    const h = heightAt(x, z);
    const st = new THREE.Mesh(paint(new THREE.BoxGeometry(0.8, 3.4, 0.7).translate(0, 1.7, 0), STONE_D, 0.1, 8 + s), stoneM);
    st.position.set(x, h - 0.1, z); st.rotation.y = -az; st.castShadow = true;
    scene.add(st);
    const sm = new THREE.Mesh(starShape(0.28), brassM);
    sm.position.set(x, h + 3.32, z); sm.rotation.set(-Math.PI / 2, 0, 0);
    scene.add(sm);
    addCircle(x, z, 0.5, h - 1, h + 3.4, true);
  }

  // ---- fallen dome ----
  const D = OBS.dome;
  const dg = new THREE.Group();
  const toTel = new THREE.Vector2(ox - D.x, oz - D.z).normalize();
  dg.position.set(D.x, heightAt(D.x, D.z) + D.r * 0.72, D.z);
  dg.rotation.y = Math.atan2(toTel.y, -toTel.x);
  scene.add(dg);
  const shell = new THREE.Mesh(new THREE.SphereGeometry(D.r, 28, 12, 0.35, Math.PI * 2 - 0.7, 0, Math.PI / 2), toon(COPPER, { side: THREE.DoubleSide }));
  shell.rotation.z = -Math.PI / 2 - 0.12;
  shell.rotation.x = 0.18;
  shell.castShadow = true; shell.receiveShadow = true;
  dg.add(shell);
  const ribG = [];
  for (let k = 0; k < 6; k++) ribG.push(xf(new THREE.TorusGeometry(D.r + 0.02, 0.07, 4, 20, Math.PI / 2), 0, 0, 0, 0, k * (Math.PI / 3) + 0.5, Math.PI / 2));
  ribG.push(xf(new THREE.TorusGeometry(D.r + 0.03, 0.12, 4, 32), 0, 0, 0, Math.PI / 2, 0, 0));
  const ribs = new THREE.Mesh(mergeGeoms(ribG.map((g) => paint(g, 0x8a6a3a))), toon(0xffffff, { vertexColors: true }));
  ribs.rotation.copy(shell.rotation);
  dg.add(ribs);
  // carved slab inside: horizon line, a fan of five notches, the fourth inlaid with a brass star
  const slab = new THREE.Group();
  const slabMesh = new THREE.Mesh(paint(new THREE.BoxGeometry(2.4, 2.4, 0.3), 0xa79c88, 0.05), stoneM);
  slab.add(slabMesh);
  const fan = new THREE.Mesh(mergeGeoms(fanGeoms(0.85, true, OBS.starElIndex)), toon(0xffffff, { vertexColors: true, emissive: 0x2a1c06 }));
  fan.position.set(-0.9, -0.8, 0.16);
  slab.add(fan);
  const sx = D.x + toTel.x * -1.2, sz = D.z + toTel.y * -1.2;
  slab.position.set(sx, heightAt(sx, sz) + 1.25, sz);
  slab.rotation.y = Math.atan2(toTel.x, toTel.y);
  slab.rotation.x = -0.1;
  scene.add(slab);
  slab.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  // shell colliders: half ring on the apex side
  for (let i = 0; i <= 10; i++) {
    const a = (-90 + i * 18) * D2R;
    // local +x is away from the telescope
    const lx = Math.cos(a) * (D.r - 0.25), lz = Math.sin(a) * (D.r - 0.25);
    const wx = D.x - toTel.x * lx - toTel.y * lz * -1, wz = D.z - toTel.y * lx + toTel.x * lz * -1;
    addCircle(wx, wz, 0.45, dg.position.y - D.r, dg.position.y + D.r, true);
  }
  addCircle(sx, sz, 1.0, heightAt(sx, sz) - 1, heightAt(sx, sz) + 2.5, true);

  // ---- telescope on its mount ----
  const ped = new THREE.Mesh(mergeGeoms([
    paint(new THREE.CylinderGeometry(0.75, 1.0, 1.3, 10).translate(0, 0.65, 0), 0x8f8472, 0.08),
    paint(new THREE.CylinderGeometry(1.1, 1.1, 0.12, 12).translate(0, 1.3, 0), 0x6b5b45),
  ]), stoneM);
  ped.position.set(ox, H0, oz); ped.castShadow = true;
  scene.add(ped);
  addCircle(ox, oz, 1.05, H0 - 1, H0 + 3, true);
  const azG = new THREE.Group();
  azG.position.set(ox, H0 + 1.36, oz);
  scene.add(azG);
  const ironM = toon(0x4a4038);
  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.25, 0.16).translate(0, 0.55, 0.55 * s), ironM);
    arm.castShadow = true; azG.add(arm);
  }
  azG.add(new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.65, 0.18, 12), ironM));
  const elG = new THREE.Group();
  elG.position.y = 1.05;
  azG.add(elG);
  const tubeM = toon(0x2f4a5a);
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 4.6, 16).rotateZ(-Math.PI / 2).translate(0.9, 0, 0), tubeM);
  tube.castShadow = true;
  elG.add(tube);
  const bandG = [];
  for (const x of [-1.2, 0.0, 1.6, 3.1]) bandG.push(xf(new THREE.TorusGeometry(0.38 - x * 0.02, 0.06, 4, 18), x, 0, 0, 0, Math.PI / 2, 0));
  elG.add(new THREE.Mesh(mergeGeoms(bandG), brassM));
  elG.add(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.5, 8).rotateZ(Math.PI / 2).translate(-1.6, 0, 0), brassM));
  const lensM = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x9ab8c8) });
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.27, 18).rotateY(Math.PI / 2).translate(3.21, 0, 0), lensM);
  elG.add(lens);
  // timber A-frame used to lift the telescope back onto its mount
  const timber = paint(new THREE.BoxGeometry(0.16, 4.6, 0.16), 0x7a5a3a);
  const aG = [];
  for (const s of [-1, 1]) aG.push(xf(timber.clone(), 2.6, 2.1, -1.6 + s * 1.0, s * 0.22, 0, 0));
  aG.push(xf(new THREE.BoxGeometry(0.14, 0.14, 2.4), 2.6, 4.3, -1.6));
  aG.push(xf(new THREE.CylinderGeometry(0.025, 0.025, 2.6, 4), 2.6, 3.0, -1.6));
  aG.push(xf(new THREE.TorusGeometry(0.35, 0.07, 4, 12).rotateX(Math.PI / 2), 3.2, 0.08, -0.6));
  const frame = new THREE.Mesh(mergeGeoms(aG.map((g) => (g.attributes.color ? g : paint(g, 0x8a6a44)))), stoneM);
  frame.position.set(ox, H0, oz); frame.castShadow = true;
  scene.add(frame);
  addCircle(ox + 2.6, oz - 0.6, 0.25, H0 - 1, H0 + 4, false);
  addCircle(ox + 2.6, oz - 2.6, 0.25, H0 - 1, H0 + 4, false);

  // wheels on the pedestal's south face
  function wheel(r, x, notches) {
    const g = new THREE.Group();
    const parts = [paint(new THREE.TorusGeometry(r, 0.06, 5, 24), 0x6b4a2a), paint(new THREE.CylinderGeometry(0.09, 0.09, 0.14, 8).rotateX(Math.PI / 2), BRASS)];
    for (let i = 0; i < 6; i++) parts.push(paint(xf(new THREE.BoxGeometry(0.05, r * 2, 0.05), 0, 0, 0, 0, 0, (i * Math.PI) / 6), 0x6b4a2a));
    for (let i = 0; i < notches; i++) { const a = (i / notches) * Math.PI * 2; parts.push(paint(xf(new THREE.BoxGeometry(0.05, 0.12, 0.08), Math.cos(a) * (r + 0.07), Math.sin(a) * (r + 0.07), 0, 0, 0, a + Math.PI / 2), BRASS)); }
    parts.push(paint(xf(new THREE.CylinderGeometry(0.035, 0.035, 0.3, 6).rotateX(Math.PI / 2), r * 0.8, 0, 0.15), BRASS));
    const m = new THREE.Mesh(mergeGeoms(parts), toon(0xffffff, { vertexColors: true }));
    g.add(m);
    g.position.set(ox + x, H0 + 0.95, oz + 1.05);
    scene.add(g);
    return m;
  }
  const azWheel = wheel(0.52, -0.62, OBS.azSteps);
  const elWheel = wheel(0.36, 0.62, 0);
  // fan plate behind the elevation wheel with a needle: the same carving as in the dome
  const plate = new THREE.Group();
  plate.add(new THREE.Mesh(mergeGeoms(fanGeoms(0.3, false, 0)), toon(0xffffff, { vertexColors: true, emissive: 0x1a1206 })));
  const needle = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.035, 0.03).translate(0.23, 0, 0), brassM);
  plate.add(needle);
  plate.position.set(ox + 0.95, H0 + 1.12, oz + 0.93);
  scene.add(plate);

  // starlight thread from lens to brazier once aligned
  const thread = makeBeam(0xffe0a0, 0.035, 5, 4);
  scene.add(thread.group);

  const st = { az: OBS.azStart, el: OBS.elStart, solved: false, visited: false, solveT: -1 };
  let curAz = -st.az * (Math.PI * 2 / OBS.azSteps), curEl = OBS.elAngles[st.el] * D2R;
  let azSpin = 0, elSpin = 0, azSpinT = 0, elSpinT = 0;
  const targetAz = () => -st.az * (Math.PI * 2 / OBS.azSteps);
  const targetEl = () => OBS.elAngles[st.el] * D2R;
  const wp = (o) => o.getWorldPosition(new THREE.Vector3());

  const check = () => {
    if (!st.solved && st.az === OBS.starAzIndex && st.el === OBS.starElIndex) { st.solved = true; st.solveT = 0; ctx.save(); }
  };
  const interactables = [
    { pos: wp(azWheel.parent), r: 1.9, enabled: () => !st.solved, press() {
      st.az = (st.az + 1) % OBS.azSteps; azSpinT += (Math.PI * 2) / 12; audio.click(wp(azWheel.parent), 0.9); audio.gear(wp(azWheel.parent)); check();
    } },
    { pos: wp(elWheel.parent), r: 1.9, enabled: () => !st.solved, press() {
      st.el = (st.el + 1) % OBS.elAngles.length; elSpinT += Math.PI / 3; audio.click(wp(elWheel.parent), 1.25); audio.gear(wp(elWheel.parent)); check();
    } },
  ];

  const domeInside = new THREE.Vector3(D.x - toTel.x * 1.0, 0, D.z - toTel.y * 1.0);
  const lensWorld = new THREE.Vector3();
  return {
    interactables,
    hintTarget: () => (st.visited ? new THREE.Vector3(ox, H0, oz + 1.6) : new THREE.Vector3(domeInside.x, heightAt(domeInside.x, domeInside.z), domeInside.z)),
    centre: new THREE.Vector3(ox, H0, oz),
    getState: () => ({ az: st.az, el: st.el, solved: st.solved, visited: st.visited }),
    setState(s) {
      if (!s) return;
      st.az = s.az ?? st.az; st.el = s.el ?? st.el; st.solved = !!s.solved; st.visited = !!s.visited;
      curAz = targetAz(); curEl = targetEl();
      if (st.solved) st.solveT = 99;
    },
    update(dt, player, beacon) {
      if (!st.visited && Math.hypot(player.x - domeInside.x, player.z - domeInside.z) < 2.6) st.visited = true;
      curAz = dampAngle(curAz, targetAz(), 4, dt);
      curEl = damp(curEl, targetEl(), 4, dt);
      azG.rotation.y = curAz; elG.rotation.z = curEl;
      azSpin = damp(azSpin, azSpinT, 8, dt); elSpin = damp(elSpin, elSpinT, 8, dt);
      azWheel.rotation.z = azSpin; elWheel.rotation.z = elSpin;
      needle.rotation.z = (FAN_ANGLES[st.el]) * D2R;
      if (st.solved) {
        st.solveT += dt;
        const k = Math.min(1, st.solveT / 1.0);
        lensM.color.setRGB(0.6 + 3.4 * k, 0.65 + 2.8 * k, 0.7 + 1.6 * k);
        lens.getWorldPosition(lensWorld);
        lensWorld.y += 0.0;
        thread.setEnds(lensWorld, beacon.flamePos);
        const p = Math.min(1, Math.max(0, (st.solveT - 0.6) / 1.6));
        thread.setProgress(p);
        thread.setStrength(beacon.lit ? 0.35 : 1);
        if (p >= 1 && !beacon.ready) { beacon.setReady(); ctx.onReady(0); }
      }
    },
  };
}
