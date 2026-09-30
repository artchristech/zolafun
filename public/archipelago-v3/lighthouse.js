import * as THREE from './three.module.min.js';
import { toon, toonUnique, U } from './materials.js';
import { LAYOUT, groundH, angTo, D2R } from './terrain.js';
import { Fire } from './fire.js';
import { Batcher } from './batch.js';
import { rng } from './noise.js';

export const LH = { bands: 8, y0: 1.4, y1: 36.4, r0: 5.0, r1: 3.4 };

// Beacon 5 — the great lighthouse. Around its plaza stand eight sighting posts, each with a
// hinged cover. The floor map shows the four islands; open the sights that look out at a
// lit beacon and keep the others shut. Then light the bowl at the door.
export function buildLighthouse(G) {
  const c = LAYOUT.light;
  const h = groundH(c[0], c[1]);
  const batch = new Batcher();
  const rand = rng(4242);
  const at = (deg, r, y = 0) => new THREE.Vector3(c[0] + Math.cos(deg * D2R) * r, h + y, c[1] + Math.sin(deg * D2R) * r);
  const red = toon(0xc62f2a), white = toon(0xf3efe6), stoneM = toon(0xa39b89, { flatShading: true }), darkM = toon(0x2b2624), ironM = toon(0x34302e);

  // tower with hard red/white bands
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(6.2, 6.8, LH.y0 + 0.4, 8), stoneM);
  plinth.position.set(c[0], h + (LH.y0 - 0.4) / 2, c[1]); plinth.castShadow = plinth.receiveShadow = true;
  batch.addObject(plinth);
  const bh = (LH.y1 - LH.y0) / LH.bands;
  for (let i = 0; i < LH.bands; i++) {
    const rb = LH.r0 + (LH.r1 - LH.r0) * i / LH.bands, rt = LH.r0 + (LH.r1 - LH.r0) * (i + 1) / LH.bands;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, bh, 32), i % 2 ? white : red);
    band.position.set(c[0], h + LH.y0 + bh * (i + 0.5), c[1]);
    band.castShadow = band.receiveShadow = true;
    batch.addObject(band);
    // small windows spiralling up
    if (i > 0) {
      const a = LAYOUT.doorAng + i * 95;
      const r = (rb + rt) / 2;
      const w = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.1, 0.3), darkM);
      const p = at(a, r - 0.05, LH.y0 + bh * (i + 0.5));
      w.position.copy(p); w.rotation.y = Math.atan2(Math.cos(a * D2R), Math.sin(a * D2R));
      batch.addObject(w);
    }
  }
  const gy = h + LH.y1;
  const gallery = new THREE.Mesh(new THREE.CylinderGeometry(4.7, 4.3, 0.4, 32), darkM);
  gallery.position.set(c[0], gy + 0.2, c[1]); gallery.castShadow = true;
  batch.addObject(gallery);
  const rail = new THREE.Mesh(new THREE.TorusGeometry(4.55, 0.07, 4, 40), ironM);
  rail.rotation.x = Math.PI / 2; rail.position.set(c[0], gy + 1.35, c[1]);
  batch.addObject(rail);
  for (let k = 0; k < 20; k++) {
    const a = k * 18;
    const p = at(a, 4.55, LH.y1 + 0.85);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.0, 0.07), ironM);
    post.position.copy(p); batch.addObject(post);
  }
  const roomY = gy + 0.4;
  for (let k = 0; k < 10; k++) {
    const a = k * 36;
    const p = at(a, 2.4, LH.y1 + 0.4 + 1.6);
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.16, 3.2, 0.16), darkM);
    m.position.copy(p); m.castShadow = true; batch.addObject(m);
  }
  const floorRoom = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.5, 0.2, 16), darkM);
  floorRoom.position.set(c[0], roomY + 0.1, c[1]); batch.addObject(floorRoom);
  const roofRing = new THREE.Mesh(new THREE.CylinderGeometry(2.7, 2.7, 0.3, 20), red);
  roofRing.position.set(c[0], roomY + 3.3, c[1]); batch.addObject(roofRing);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(3.2, 2.6, 20), red);
  roof.position.set(c[0], roomY + 3.45 + 1.3, c[1]); roof.castShadow = true; batch.addObject(roof);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), ironM);
  ball.position.set(c[0], roomY + 6.1, c[1]); batch.addObject(ball);
  // door
  const dA = LAYOUT.doorAng;
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.8, 0.5), darkM);
  const dp = at(dA, LH.r0 + 0.02, LH.y0 + 1.3);
  door.position.copy(dp); door.rotation.y = Math.atan2(Math.cos(dA * D2R), Math.sin(dA * D2R));
  batch.addObject(door);
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.35, 0.6), white);
  lintel.position.copy(dp).add(new THREE.Vector3(0, 1.55, 0)); lintel.rotation.y = door.rotation.y;
  batch.addObject(lintel);
  G.physics.addCircle(c[0], c[1], 6.7, h - 2, h + 44, true);

  // floor map: an island stone in each beacon's direction
  const beaconAngs = [0, 1, 2, 3].map((i) => ((angTo(4, i) % 360) + 360) % 360);
  const mapM = toon(0x5d6b70, { flatShading: true }), dotM = toonUnique(0xd9a441, { emissive: new THREE.Color(0xffb040), emissiveIntensity: 0.2 });
  for (const a of beaconAngs) {
    const p = at(a, 9.0, 0.03);
    const shape = new THREE.CircleGeometry(1.2, 9);
    const pos = shape.attributes.position;
    for (let k = 1; k < pos.count; k++) { const s = 0.7 + rand() * 0.5; pos.setXY(k, pos.getX(k) * s, pos.getY(k) * s * 0.8); }
    const m = new THREE.Mesh(shape, mapM);
    m.rotation.set(-Math.PI / 2, 0, rand() * 6);
    m.position.set(p.x, groundH(p.x, p.z) + 0.04, p.z);
    m.receiveShadow = true;
    batch.addObject(m);
    const dot = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 10), dotM);
    dot.position.set(p.x, groundH(p.x, p.z) + 0.08, p.z);
    G.scene.add(dot);
  }

  // sighting posts: four toward the beacons, four toward empty sea
  const sorted = beaconAngs.slice().sort((a, b) => a - b);
  const gaps = sorted.map((a, i) => { const b = i === 3 ? sorted[0] + 360 : sorted[i + 1]; return [a, b - a]; });
  const decoys = gaps.map(([a, g]) => (a + g / 2) % 360);
  const posts = [];
  const allAngs = [...beaconAngs.map((a) => [a, true]), ...decoys.map((a) => [a, false])].sort((x, y) => x[0] - y[0]);
  const coverM = toon(0x8f8778, { flatShading: true }), ringM = toon(0xcf9a44);
  for (const [a, want] of allAngs) {
    const p = at(a, 12.8);
    const gp = groundH(p.x, p.z);
    const g = new THREE.Group();
    g.position.set(p.x, gp, p.z);
    g.rotation.y = Math.atan2(Math.cos(a * D2R), Math.sin(a * D2R)); // +z looks outward
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.34, 1.2, 8), stoneM);
    col.position.y = 0.6; col.castShadow = true;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.08, 6, 18), ringM);
    ring.position.y = 1.52; ring.castShadow = true;
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.2), ringM);
    cap.position.y = 1.9;
    const tmp = new THREE.Group(); tmp.add(col, ring, cap);
    tmp.position.copy(g.position); tmp.rotation.copy(g.rotation);
    batch.addObject(tmp);
    const pivot = new THREE.Group();
    pivot.position.y = 1.52 + 0.4;
    const cover = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.07, 16), coverM);
    cover.rotation.x = Math.PI / 2; cover.position.set(0, -0.4, 0.12);
    cover.castShadow = true;
    pivot.add(cover);
    g.add(pivot);
    G.scene.add(g);
    G.physics.addCircle(p.x, p.z, 0.4, gp - 1, gp + 2.2, false);
    const P0 = { a, want, open: false, pivot, pos: new THREE.Vector3(p.x, gp + 1.2, p.z), anim: 0 };
    posts.push(P0);
  }

  // ignition bowl at the door
  const bp = at(dA, 7.4);
  const bg = groundH(bp.x, bp.z);
  const bowlG = new THREE.Group();
  bowlG.position.set(bp.x, bg, bp.z);
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 1.1, 8), stoneM); ped.position.y = 0.55; ped.castShadow = true;
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.45, 0.4, 12, 1, true), toon(0x3a3431, { side: THREE.DoubleSide })); bowl.position.y = 1.3;
  const tb = new THREE.Group(); tb.add(ped, bowl); tb.position.copy(bowlG.position);
  batch.addObject(tb);
  const lidPivot = new THREE.Group(); lidPivot.position.set(-0.78, 1.5, 0);
  const lid = new THREE.Mesh(new THREE.SphereGeometry(0.78, 12, 5, 0, Math.PI * 2, 0, Math.PI / 2), toon(0xb9823e));
  lid.scale.y = 0.5; lid.position.x = 0.78; lid.castShadow = true;
  lidPivot.add(lid); bowlG.add(lidPivot);
  const bowlFire = new Fire({ size: [0.9, 1.4], hdr: 1.8, embers: 14, halo: 2.5, emberHeight: 2.5 });
  bowlFire.group.position.y = 1.35;
  bowlG.add(bowlFire.group);
  G.scene.add(bowlG);
  G.physics.addCircle(bp.x, bp.z, 0.75, bg - 1, bg + 1.6, false);
  G.fires.push(bowlFire);
  G.lightSources.push({ pos: new THREE.Vector3(bp.x, bg + 2.0, bp.z), color: new THREE.Color(1, 0.62, 0.3), power: 45, range: 25, fire: bowlFire });

  // lamp at the top
  const lampFire = new Fire({ size: [2.2, 3.4], hdr: 2.2, embers: 30, halo: 14, emberHeight: 5, haloDay: 0.3 });
  lampFire.group.position.set(c[0], roomY + 0.2, c[1]);
  G.scene.add(lampFire.group);
  G.fires.push(lampFire);
  const lampPos = new THREE.Vector3(c[0], roomY + 1.6, c[1]);
  G.lightSources.push({ pos: lampPos, color: new THREE.Color(1, 0.7, 0.35), power: 900, range: 90, fire: lampFire });
  // sweeping beams
  const beamMat = new THREE.ShaderMaterial({
    uniforms: { uI: { value: 0 }, uNight: U.uNight },
    vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.0); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform float uI, uNight; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){ float rim = pow(abs(dot(normalize(vN), vV)), 1.5); float a = pow(vUv.y, 2.0);
        gl_FragColor = vec4(vec3(1.0, 0.85, 0.55) * rim * a * uI * (0.15 + 0.85 * uNight) * 1.6, 1.0); }`,
    blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide,
  });
  const beamGeo = new THREE.ConeGeometry(6, 110, 20, 1, true);
  beamGeo.translate(0, -55, 0);
  beamGeo.rotateX(Math.PI / 2);
  const beams = new THREE.Group();
  beams.position.copy(lampPos);
  const b1 = new THREE.Mesh(beamGeo, beamMat), b2 = new THREE.Mesh(beamGeo, beamMat);
  b2.rotation.y = Math.PI;
  b1.frustumCulled = b2.frustumCulled = false;
  beams.add(b1, b2);
  beams.visible = false;
  G.scene.add(beams);
  // rising spark carried up the tower
  const riser = new Fire({ size: [0.5, 0.8], hdr: 2.0, embers: 10, halo: 2.2, emberHeight: 1.5, haloDay: 0.5 });
  riser.group.visible = false;
  G.scene.add(riser.group);
  G.fires.push(riser);

  batch.build(G.scene);

  // ---------------- puzzle ----------------
  const P = { solved: false, island: 4, posts };
  for (const po of posts) {
    G.interact.add({
      pos: po.pos, radius: 2.1, glyphY: 1.2,
      enabled: () => !P.solved,
      action: () => { po.open = !po.open; G.audio.click('stone', po.pos); G.audio.click('metal', po.pos); },
    });
  }
  const check = () => posts.every((p) => p.open === p.want);

  // ---------------- beacon object ----------------
  const B = {
    index: 4, unlocked: false, lit: false, fire: lampFire, firePos: lampPos, lidOpen: 0, seq: -1,
    base: new THREE.Vector3(bp.x, bg, bp.z),
    unlock(instant = false) {
      if (B.unlocked) return;
      B.unlocked = true;
      if (instant) B.lidOpen = 1; else { G.audio.unlockChime(); G.audio.click('stone', B.base); }
    },
    light(instant = false) {
      B.lit = true; B.unlocked = true;
      bowlFire.light(instant);
      if (instant) { B.lidOpen = 1; lampFire.light(true); beams.visible = true; beamMat.uniforms.uI.value = 1; B.seq = 99; }
      else B.seq = 0;
    },
    update(dt) {
      B.lidOpen += ((B.unlocked ? 1 : 0) - B.lidOpen) * Math.min(1, dt * 2.5);
      lidPivot.rotation.z = B.lidOpen * 2.1;
      if (B.seq >= 0 && B.seq < 99) {
        B.seq += dt;
        const k = Math.min(1, Math.max(0, (B.seq - 0.6) / 3.2));
        riser.group.visible = k > 0 && k < 1;
        if (k > 0 && k < 1) {
          riser.light(true);
          const y = 1.5 + k * (LH.y1 + 1.0);
          const r = LH.r0 + (LH.r1 - LH.r0) * Math.min(1, y / LH.y1) + 0.5;
          const a = (dA + k * 540) * D2R;
          const rr = k < 0.92 ? r : r * Math.max(0, 1 - (k - 0.92) / 0.08);
          riser.group.position.set(c[0] + Math.cos(a) * rr, h + y, c[1] + Math.sin(a) * rr);
        }
        if (k >= 1 && !lampFire.lit) {
          lampFire.light();
          riser.snuff(true);
          beams.visible = true;
          G.audio.ignite(lampPos, true);
          G.input.rumble(1.0, 900);
          G.startFinale();
        }
        if (lampFire.lit) beamMat.uniforms.uI.value = Math.min(1, beamMat.uniforms.uI.value + dt * 0.4);
        if (B.seq > 8) B.seq = 99;
      }
      if (beams.visible) beams.rotation.y += dt * 0.5;
    },
  };
  B.interact = G.interact.add({
    pos: new THREE.Vector3(bp.x, bg + 1.2, bp.z), radius: 2.6, glyphY: 1.3,
    enabled: () => B.unlocked && !B.lit,
    action: () => G.lightBeacon(B),
  });
  Object.defineProperty(B, 'hintPos', { get: () => B.interact.pos });

  P.update = (dt) => {
    for (const po of posts) {
      po.anim += ((po.open ? 1 : 0) - po.anim) * Math.min(1, dt * 6);
      po.pivot.rotation.x = -po.anim * 1.9;
    }
    if (!P.solved && check() && posts.every((p) => Math.abs(p.anim - (p.open ? 1 : 0)) < 0.05)) {
      P.solved = true;
      G.later(0.5, () => { dotM.emissiveIntensity = 1.8; B.unlock(); G.input.rumble(0.3, 250); });
    }
  };
  P.hintTarget = () => { if (P.solved) return null; for (const p of posts) if (p.open !== p.want) return p.pos; return null; };
  P.getState = () => ({ open: posts.map((p) => p.open), solved: P.solved });
  P.setState = (o) => {
    if (!o) return;
    if (o.open) posts.forEach((p, i) => { p.open = !!o.open[i]; p.anim = p.open ? 1 : 0; });
    if (o.solved) { P.solved = true; dotM.emissiveIntensity = 1.8; }
  };
  P.beacon = B;
  P.lampPos = lampPos;
  return P;
}
