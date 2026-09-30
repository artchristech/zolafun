// Landmarks, beacons and scatter. Each builder registers its own decks,
// colliders and interactables so the puzzles live next to their geometry.
import * as THREE from "./three.module.min.js";
import { toon, outline, glowSprite, gradientMap, STAR_AZ, STAR_EL, dirFrom } from "./env.js";
import {
  ISLANDS, causeways, terrainH, addDeck, addRing, addCollider, rng, noise, nearCauseway,
} from "./world.js";

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------------------------------------------------------------------------
// Beacon: stone column, iron brazier, cel flame, glow and a pillar of light.

const pillarMat = () =>
  new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(0xffc56b) }, uAlpha: { value: 0 }, uTime: { value: 0 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: false,
    vertexShader: /* glsl */ `
      varying float vY; varying vec3 vN; varying vec3 vW;
      void main() {
        vY = uv.y;
        vN = normalize(mat3(modelMatrix) * normal);
        vW = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uAlpha, uTime;
      varying float vY; varying vec3 vN; varying vec3 vW;
      void main() {
        vec3 v = normalize(cameraPosition - vW);
        float edge = pow(1.0 - abs(dot(normalize(vec3(vN.x, 0.0, vN.z)), normalize(vec3(v.x, 0.0, v.z)))), 1.5);
        float a = (1.0 - edge) * pow(1.0 - vY, 1.6) * uAlpha;
        a *= 0.85 + 0.15 * sin(vY * 30.0 - uTime * 3.0);
        gl_FragColor = vec4(uColor * a, a);
        #include <colorspace_fragment>
      }`,
  });

export function makeBeacon(scene, x, z, opts = {}) {
  const g = new THREE.Group();
  const gy = opts.y ?? terrainH(x, z);
  g.position.set(x, gy, z);
  const h = opts.height ?? 3.4;
  const stone = toon(0xb3a894);
  if (!opts.bare) {
    const base = outline(new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.5, 0.8, 8), stone));
    base.position.y = 0.2;
    const col = outline(new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, h, 8), stone));
    col.position.y = h / 2 + 0.4;
    const bowl = outline(
      new THREE.Mesh(
        new THREE.LatheGeometry([V(0, 0, 0), V(0.5, 0, 0), V(1.25, 0.55, 0), V(1.45, 0.9, 0), V(1.3, 0.95, 0)], 12),
        toon(0x4a4250, { side: THREE.DoubleSide })
      ),
      0.05
    );
    bowl.position.y = h + 0.4;
    for (const m of [base, col, bowl]) {
      m.castShadow = true;
      g.add(m);
    }
    addCollider(x, z, 1.35, gy - 5, gy + h + 2);
  }
  const top = h + (opts.bare ? 0 : 1.1);

  // Flame: two nested cel cones plus a spark sprite.
  const flame = new THREE.Group();
  flame.position.y = top;
  const outer = new THREE.Mesh(new THREE.ConeGeometry(0.85, 2.4, 7), new THREE.MeshBasicMaterial({ color: 0xff7a2e, fog: false }));
  const inner = new THREE.Mesh(new THREE.ConeGeometry(0.48, 1.5, 7), new THREE.MeshBasicMaterial({ color: 0xffe79a, fog: false }));
  outer.position.y = 1.1;
  inner.position.y = 0.8;
  flame.add(outer, inner);
  flame.scale.setScalar(0.001);
  flame.visible = false;
  g.add(flame);

  const glow = glowSprite(0xffb25a, 9);
  glow.position.y = top + 1;
  glow.material.opacity = 0;
  g.add(glow);

  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.8, 90, 16, 1, true), pillarMat());
  pillar.geometry.translate(0, 45, 0);
  pillar.position.y = top + 0.5;
  pillar.renderOrder = 2;
  g.add(pillar);

  const light = new THREE.PointLight(0xffa04a, 0, 55, 1.2);
  light.position.y = top + 1.5;
  g.add(light);

  scene.add(g);
  const world = new THREE.Vector3(x, gy + top, z);
  return {
    group: g, flame, outer, inner, glow, pillar, light, world,
    level: 0, target: 0, pillarScale: opts.pillar ?? 1, lightScale: opts.lightScale ?? 1,
    light_() { this.target = 1; },
    update(dt, t, night) {
      this.level += (this.target - this.level) * Math.min(1, dt * 1.6);
      const L = this.level;
      const on = L > 0.01;
      this.flame.visible = on;
      const fl = 0.85 + 0.15 * Math.sin(t * 13 + x) * Math.sin(t * 7.3 + z);
      this.flame.scale.set(L * (0.9 + 0.1 * Math.sin(t * 9 + z)), L * fl, L * (0.9 + 0.1 * Math.cos(t * 8)));
      this.outer.rotation.y = t * 1.3;
      this.inner.rotation.y = -t * 1.9;
      this.glow.material.opacity = L * (0.55 + 0.45 * night) * fl;
      this.glow.scale.setScalar(7 + 7 * night);
      this.pillar.material.uniforms.uAlpha.value = L * (0.12 + 0.55 * night) * this.pillarScale;
      this.pillar.material.uniforms.uTime.value = t;
      this.light.intensity = L * (6 + 30 * night) * fl * this.lightScale;
    },
  };
}

// ---------------------------------------------------------------------------
// 1. Fishing village of stilt houses. Three dark lamps; light them all.

export function buildVillage(scene, ctx) {
  const I = ISLANDS[0];
  const deckTop = 2.75;
  const plank = toon(0xa7794f);
  const plankDark = toon(0x7d5a3e);
  const group = new THREE.Group();
  scene.add(group);

  function walkway(ax, az, bx, bz, hw) {
    addDeck(ax, az, bx, bz, hw, deckTop);
    const len = Math.hypot(bx - ax, bz - az);
    const ang = Math.atan2(bz - az, bx - ax);
    const n = Math.max(1, Math.round(len / 0.9));
    const geo = new THREE.BoxGeometry(0.8, 0.22, hw * 2);
    const inst = new THREE.InstancedMesh(geo, plank, n);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1);
    const r = rng(Math.round(ax * 13 + az * 7));
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      q.setFromEuler(new THREE.Euler((r() - 0.5) * 0.05, -ang + (r() - 0.5) * 0.05, 0));
      m.compose(V(ax + (bx - ax) * t, deckTop - 0.11 - r() * 0.05, az + (bz - az) * t), q, s);
      inst.setMatrixAt(i, m);
    }
    inst.receiveShadow = inst.castShadow = true;
    group.add(inst);
    // posts
    const posts = Math.max(2, Math.round(len / 3.2) + 1);
    const pgeo = new THREE.CylinderGeometry(0.16, 0.2, 14, 6);
    const pinst = new THREE.InstancedMesh(pgeo, plankDark, posts * 2);
    for (let i = 0; i < posts; i++) {
      const t = i / (posts - 1);
      for (let sde = 0; sde < 2; sde++) {
        const off = (sde ? 1 : -1) * (hw - 0.15);
        const px = ax + (bx - ax) * t - Math.sin(ang) * off;
        const pz = az + (bz - az) * t + Math.cos(ang) * off;
        m.makeTranslation(px, deckTop - 7, pz);
        pinst.setMatrixAt(i * 2 + sde, m);
      }
    }
    pinst.castShadow = true;
    group.add(pinst);
  }

  const cx = I.x, cz = I.z;
  walkway(cx, cz + 15, cx, cz + 41, 1.1);
  const houses = [
    { x: cx - 11, z: cz + 26, color: 0xd9644a, roof: 0x5b3b52, face: 1 },
    { x: cx + 11, z: cz + 33, color: 0x4fa3a5, roof: 0x3f3552, face: -1 },
    { x: cx, z: cz + 45, color: 0xf0c05a, roof: 0x7a3c3c, face: 0 },
  ];
  walkway(cx, cz + 26, cx - 7.5, cz + 26, 1.0);
  walkway(cx, cz + 33, cx + 7.5, cz + 33, 1.0);

  const lamps = [];
  const glassDark = new THREE.MeshToonMaterial({ color: 0x3b4660, gradientMap });
  houses.forEach((H, i) => {
    // platform
    walkway(H.x - 3.4, H.z, H.x + 3.4, H.z, 3.3);
    const hg = new THREE.Group();
    hg.position.set(H.x, deckTop, H.z);
    const body = outline(new THREE.Mesh(new THREE.BoxGeometry(4.2, 3.2, 3.8), toon(H.color)));
    body.position.y = 1.6;
    const roof = outline(new THREE.Mesh(new THREE.ConeGeometry(3.6, 2.4, 4), toon(H.roof)));
    roof.position.y = 4.4;
    roof.rotation.y = Math.PI / 4;
    roof.scale.set(1, 1, 0.92);
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.9, 0.1), toon(0x3a2a2a));
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.8, 0.1), toon(0x2c3450));
    const faceZ = H.face === 0 ? -1 : 1;
    door.position.set(H.face === 0 ? 0 : 0, 0.95, faceZ * -1.93);
    if (H.face !== 0) {
      door.position.set(H.face * 2.13, 0.95, 0);
      door.rotation.y = Math.PI / 2;
    }
    win.position.set(H.face === 0 ? 1.2 : -H.face * 0.2, 2.1, H.face === 0 ? -1.93 : 1.93);
    for (const m of [body, roof]) m.castShadow = true;
    hg.add(body, roof, door, win);
    // net drying rack and a buoy for silhouette
    const rack = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.2, 0.12), plankDark);
    rack.position.set(-1.6, 1.1, (H.face === 0 ? 1 : -1) * 2.9);
    hg.add(rack);
    group.add(hg);
    addCollider(H.x, H.z, 2.6, deckTop - 1, deckTop + 6);

    // lamp on a hooked post at the corner nearest the pier
    const lx = H.face === 0 ? H.x + 2.6 : H.x + H.face * 2.8;
    const lz = H.face === 0 ? H.z - 2.6 : H.z - 2.6;
    const post = outline(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 3.2, 6), plankDark), 0.04);
    post.position.set(lx, deckTop + 1.6, lz);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.1, 0.1), plankDark);
    arm.position.set(lx + 0.4, deckTop + 3.15, lz);
    const glass = outline(new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8), glassDark.clone()), 0.04);
    glass.position.set(lx + 0.8, deckTop + 2.6, lz);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.3, 8), toon(0x3b3040));
    cap.position.set(lx + 0.8, deckTop + 3.0, lz);
    const glow = glowSprite(0xffc070, 3.2);
    glow.position.copy(glass.position);
    glow.visible = false;
    group.add(post, arm, glass, cap, glow);
    addCollider(lx, lz, 0.25, deckTop - 1, deckTop + 4);
    const lamp = { glass, glow, lit: false, pos: glass.position.clone() };
    lamps.push(lamp);
    ctx.interact({
      pos: V(lx + 0.8, deckTop, lz),
      r: 2.6,
      icon: "flame",
      can: () => !lamp.lit && !ctx.state.lit[0],
      act: () => {
        lamp.lit = true;
        glass.material.color.set(0xfff0b0);
        glass.material.emissive = new THREE.Color(0xffb040);
        glow.visible = true;
        ctx.sound.kindle(1 + lamps.filter((l) => l.lit).length * 0.125);
        if (lamps.every((l) => l.lit)) ctx.solved(0, lamps.map((l) => l.pos));
      },
    });
  });

  // boats pulled up on the beach, crates, a drying net
  const boatGeo = hullGeometry(4.2, 1.5, 0.9);
  for (const [bx, bz, ang, col] of [[cx - 6, cz + 13, 0.4, 0xe4e0d0], [cx + 7, cz + 12, -0.8, 0x6c9fcf]]) {
    const b = outline(new THREE.Mesh(boatGeo, toon(col)), 0.05);
    b.position.set(bx, terrainH(bx, bz) + 0.25, bz);
    b.rotation.set(0.12, ang, 0.2);
    b.castShadow = true;
    group.add(b);
    addCollider(bx, bz, 1.4);
  }

  const beacon = makeBeacon(scene, I.x + 3, I.z - 5);
  return {
    beacon,
    lamps,
    restore() {
      for (const l of lamps) {
        l.lit = true;
        l.glass.material.color.set(0xfff0b0);
        l.glass.material.emissive = new THREE.Color(0xffb040);
        l.glow.visible = true;
      }
    },
  };
}

// Tapered hull from a box: pinched bow and stern, narrow keel.
export function hullGeometry(len, width, height) {
  const g = new THREE.BoxGeometry(len, height, width, 10, 2, 3);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const u = Math.abs(x) / (len / 2);
    const taper = 1 - Math.pow(u, 2.2) * 0.92;
    const keel = y < 0 ? 0.45 : 1;
    p.setZ(i, z * taper * keel);
    p.setY(i, y + Math.pow(u, 2) * height * 0.35);
  }
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------------------
// 2. Shipwreck in the forest. The helm turns a mirror at the masthead that
//    throws the low sun as a beam; aim it at the beacon.

export const MIRROR_STEPS = 8;
export function buildShipwreck(scene, ctx) {
  const I = ISLANDS[1];
  const sx = I.x + 6, sz = I.z + 6;
  const sy = terrainH(sx, sz);
  const heading = 0.5;
  const ship = new THREE.Group();
  ship.position.set(sx, sy - 0.6, sz);
  ship.rotation.set(0, heading, 0.22);
  const hull = outline(new THREE.Mesh(hullGeometry(17, 5.6, 4.2), toon(0x6f4a38)), 0.1);
  hull.position.y = 1.6;
  const stripe = new THREE.Mesh(hullGeometry(17.1, 5.7, 0.6), toon(0xd8b25a));
  stripe.position.y = 3.0;
  const deck = new THREE.Mesh(new THREE.BoxGeometry(13, 0.25, 4.2), toon(0x9c7550));
  deck.position.y = 3.55;
  // broken planks gaping on one side
  const holeMat = toon(0x2a1c1c);
  const hole = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.6, 0.2), holeMat);
  hole.position.set(-2.5, 1.4, 2.35);
  hole.rotation.y = 0.1;
  const mast = outline(new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.38, 10, 8), toon(0x7a5238)), 0.06);
  mast.position.set(0.5, 8.4, 0);
  const yard = outline(new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 6.5, 6), toon(0x7a5238)), 0.05);
  yard.rotation.x = Math.PI / 2;
  yard.position.set(0.5, 10.5, 0);
  // torn sail
  const sailGeo = new THREE.PlaneGeometry(5.8, 4.4, 8, 6);
  const sp = sailGeo.attributes.position;
  for (let i = 0; i < sp.count; i++) {
    const x = sp.getX(i), y = sp.getY(i);
    sp.setZ(i, Math.sin(x * 0.7) * 0.4 + (y < -1.2 && x > 0.5 ? 0 : 0));
    if (y < -1.4 && x > 0.8) sp.setY(i, y + (x - 0.8) * 0.9); // torn corner
  }
  sailGeo.computeVertexNormals();
  const sail = new THREE.Mesh(sailGeo, toon(0xece2c8, { side: THREE.DoubleSide }));
  sail.rotation.y = Math.PI / 2;
  sail.position.set(0.9, 8.2, 0);
  const bow = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 5, 6), toon(0x7a5238));
  bow.rotation.z = Math.PI / 2.8;
  bow.position.set(9.5, 4.8, 0);
  for (const m of [hull, deck, mast, yard, sail, bow]) m.castShadow = true;
  ship.add(hull, stripe, deck, hole, mast, yard, sail, bow);
  scene.add(ship);
  ship.updateMatrixWorld(true);

  const along = V(Math.cos(-heading), 0, Math.sin(-heading)); // ship local +x in world (rotation.y = heading)
  for (let k = -3; k <= 3; k++) addCollider(sx + along.x * k * 2.4, sz + along.z * k * 2.4, 2.9 - Math.abs(k) * 0.25);

  // Mirror sits at the masthead but turns in world space (its own group).
  const top = mast.localToWorld(V(0, 5.2, 0));
  const mirror = new THREE.Group();
  mirror.position.copy(top);
  const frame = outline(new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.14, 8, 20), toon(0xb8862f)), 0.04);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.9, 20), new THREE.MeshBasicMaterial({ color: 0xfff3cc, side: THREE.DoubleSide }));
  frame.rotation.y = Math.PI / 2;
  disc.rotation.y = Math.PI / 2;
  const mirrorFace = new THREE.Group();
  mirrorFace.add(frame, disc);
  mirrorFace.rotation.z = -0.35;
  mirror.add(mirrorFace);
  const glint = glowSprite(0xfff0c0, 4);
  mirror.add(glint);
  scene.add(mirror);

  // The helm: a wheel on a broken pedestal on the sand beside the wreck.
  const side = V(-along.z, 0, along.x);
  const wx = sx + side.x * 6 - along.x * 3, wz = sz + side.z * 6 - along.z * 3;
  const wy = terrainH(wx, wz);
  const helm = new THREE.Group();
  helm.position.set(wx, wy, wz);
  helm.rotation.y = Math.atan2(side.x, side.z);
  const ped = outline(new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.6, 0.6), toon(0x6f4a38)), 0.05);
  ped.position.y = 0.8;
  const wheel = new THREE.Group();
  wheel.position.set(0, 1.8, 0.35);
  const rim = outline(new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.08, 6, 20), toon(0x8f6040)), 0.035);
  wheel.add(rim);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.3, 5), toon(0x8f6040));
    spoke.rotation.z = a;
    wheel.add(spoke);
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.2, 8), toon(0xb8862f));
  hub.rotation.x = Math.PI / 2;
  wheel.add(hub);
  helm.add(ped, wheel);
  helm.traverse((o) => o.isMesh && (o.castShadow = true));
  scene.add(helm);
  addCollider(wx, wz, 0.7);

  // A rope from the helm up to the masthead — the only hint that they're linked.
  const ropePts = [];
  const a = V(wx, wy + 1.8, wz), b = top.clone().add(V(0, -0.8, 0));
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    const p = a.clone().lerp(b, t);
    p.y -= Math.sin(t * Math.PI) * 1.4;
    ropePts.push(p);
  }
  const rope = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ropePts), 30, 0.05, 4), toon(0xcdb58a));
  scene.add(rope);

  // Beacon placed exactly along one of the mirror's eight headings.
  const correct = 5;
  const ang = (correct / MIRROR_STEPS) * Math.PI * 2;
  const bx = top.x + Math.cos(ang) * 22, bz = top.z + Math.sin(ang) * 22;
  const beacon = makeBeacon(scene, bx, bz);

  // Beam.
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0xfff0b8, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.4, 1, 8, 1, true), beamMat);
  beam.geometry.translate(0, 0.5, 0);
  beam.geometry.rotateX(Math.PI / 2);
  beam.renderOrder = 2;
  scene.add(beam);
  const hit = glowSprite(0xfff0c0, 3);
  scene.add(hit);

  const st = { k: 1, shown: 1, spin: 0 };
  function aim(k) {
    const a = (k / MIRROR_STEPS) * Math.PI * 2;
    const end = k % MIRROR_STEPS === correct ? beacon.world.clone().add(V(0, 0.4, 0)) : V(top.x + Math.cos(a) * 22, beacon.world.y, top.z + Math.sin(a) * 22);
    return end;
  }
  ctx.interact({
    pos: V(wx, wy, wz),
    r: 2.8,
    icon: "turn",
    can: () => !ctx.state.lit[1] && Math.abs(st.shown - st.k) < 0.02,
    act: () => {
      st.k += 1;
      ctx.sound.clack();
      ctx.sound.tone(330 + (st.k % 8) * 20, { dur: 0.25, vol: 0.05, type: "triangle" });
      if (st.k % MIRROR_STEPS === correct) ctx.after(1.1, () => ctx.solved(1, [beacon.world.clone()], true));
    },
  });

  return {
    beacon,
    restore() {
      st.k = st.shown = correct;
    },
    update(dt, t, pal) {
      st.shown += (st.k - st.shown) * Math.min(1, dt * 4);
      if (Math.abs(st.k - st.shown) < 0.001) st.shown = st.k;
      const a = (st.shown / MIRROR_STEPS) * Math.PI * 2;
      mirror.rotation.y = -a;
      wheel.rotation.z = -st.shown * (Math.PI / 4);
      // beam from mirror toward current aim point
      const end = aim(Math.round(st.shown));
      const settled = Math.abs(st.shown - Math.round(st.shown)) < 0.05;
      const len = top.distanceTo(end);
      beam.position.copy(top);
      beam.lookAt(end);
      beam.scale.set(1, 1, len);
      const sun = Math.max(0.3, pal.day);
      beamMat.opacity = (settled ? 0.38 : 0.1) * sun * (0.9 + 0.1 * Math.sin(t * 20));
      glint.material.opacity = 0.9 * sun;
      hit.position.copy(end);
      hit.material.opacity = settled ? 0.8 * sun : 0;
    },
  };
}

// ---------------------------------------------------------------------------
// 3. Ring of barnacled monoliths. Stand inside and they hum a phrase.

export const STONE_TONES = [196.0, 220.0, 246.94, 293.66, 329.63, 392.0];
export function buildMonoliths(scene, ctx) {
  const I = ISLANDS[2];
  const cx = I.x + 1, cz = I.z - 1;
  const heights = [5.2, 3.6, 6.2, 4.4, 3.0, 4.8];
  // pitch follows height: tallest stone sings lowest
  const order = heights.map((h, i) => i).sort((a, b) => heights[b] - heights[a]);
  const tone = [];
  order.forEach((si, rank) => (tone[si] = STONE_TONES[rank]));
  const melody = [2, 5, 1, 3];
  const R = 7.5;
  const stones = [];
  const r = rng(77);
  const barnGeo = new THREE.SphereGeometry(0.16, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2);
  heights.forEach((h, i) => {
    const a = (i / heights.length) * Math.PI * 2 + 0.3;
    const x = cx + Math.cos(a) * R, z = cz + Math.sin(a) * R;
    const y = terrainH(x, z);
    const geo = new THREE.BoxGeometry(1.7, h, 1.1, 1, 4, 1);
    const p = geo.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const yy = p.getY(k) / h + 0.5;
      const taper = 1 - yy * 0.28;
      p.setX(k, p.getX(k) * taper + Math.sin(yy * 3 + i) * 0.1);
      p.setZ(k, p.getZ(k) * taper);
    }
    geo.computeVertexNormals();
    const stone = outline(new THREE.Mesh(geo, toon(0x7f8a86)), 0.08);
    stone.position.set(x, y + h / 2 - 0.3, z);
    stone.rotation.set((r() - 0.5) * 0.12, -a + Math.PI / 2, (r() - 0.5) * 0.12);
    stone.castShadow = true;
    scene.add(stone);
    // barnacles crusting the lower half; they glow when the stone sings
    const bm = toon(0xf1ead2, { emissive: new THREE.Color(0x000000) });
    const inst = new THREE.InstancedMesh(barnGeo, bm, 60);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    for (let k = 0; k < 60; k++) {
      const face = Math.floor(r() * 4);
      const yy = -h / 2 + Math.pow(r(), 1.8) * h * 0.7;
      const taper = 1 - (yy / h + 0.5) * 0.28;
      const w = 0.85 * taper, d = 0.55 * taper;
      let lx = (r() - 0.5) * 2 * w, lz = (r() - 0.5) * 2 * d, n = V(0, 0, 1);
      if (face === 0) { lz = d; n = V(0, 0, 1); }
      if (face === 1) { lz = -d; n = V(0, 0, -1); }
      if (face === 2) { lx = w; n = V(1, 0, 0); }
      if (face === 3) { lx = -w; n = V(-1, 0, 0); }
      q.setFromUnitVectors(V(0, 1, 0), n);
      s.setScalar(0.6 + r() * 1.1);
      m.compose(V(lx, yy, lz), q, s);
      inst.setMatrixAt(k, m);
    }
    stone.add(inst);
    addCollider(x, z, 1.05);
    const st = { i, x, z, h, mesh: stone, barn: bm, glow: 0, held: false, tone: tone[i] };
    stones.push(st);
    const toward = V(cx - x, 0, cz - z).normalize();
    ctx.interact({
      pos: V(x + toward.x * 1.8, y, z + toward.z * 1.8),
      r: 2.4,
      icon: "touch",
      can: () => !ctx.state.lit[2] && !puzzle.playing,
      act: () => press(st),
    });
  });

  // altar at the centre carries the beacon
  const altar = outline(new THREE.Mesh(new THREE.CylinderGeometry(1.8, 2.1, 0.7, 10), toon(0x9a9c92)), 0.06);
  const ay = terrainH(cx, cz);
  altar.position.set(cx, ay + 0.2, cz);
  altar.receiveShadow = true;
  addCollider(cx, cz, 2.0);
  scene.add(altar);
  const beacon = makeBeacon(scene, cx, cz, { y: ay + 0.4, height: 2.2 });

  const puzzle = { progress: 0, playing: false, timer: 1.5, inside: false };

  function sing(st, dur = 0.8) {
    ctx.sound.stone(st.tone);
    st.glow = 1;
    st.hold = dur;
  }
  function press(st) {
    sing(st, 0.6);
    if (melody[puzzle.progress] === st.i) {
      puzzle.progress++;
      st.held = true;
      if (puzzle.progress === melody.length) {
        ctx.after(0.9, () => {
          stones.forEach((s, k) => ctx.after(k * 0.12, () => sing(s, 1.2)));
          ctx.after(1.4, () => ctx.solved(2, [beacon.world.clone()], true));
        });
      }
    } else {
      puzzle.progress = 0;
      ctx.after(0.35, () => ctx.sound.wrong());
      stones.forEach((s) => (s.held = false));
      puzzle.timer = 3.5;
    }
  }
  async function playPhrase() {
    puzzle.playing = true;
    stones.forEach((s) => (s.held = false));
    puzzle.progress = 0;
    for (const idx of melody) {
      sing(stones[idx], 0.7);
      await ctx.wait(0.85);
    }
    puzzle.playing = false;
  }

  return {
    beacon,
    center: V(cx, ay, cz),
    restore() {},
    update(dt, t, player) {
      const d = Math.hypot(player.x - cx, player.z - cz);
      const inside = d < R - 1.2;
      const solved = ctx.state.lit[2];
      if (inside && !puzzle.inside && !solved) puzzle.timer = Math.min(puzzle.timer, 1.4);
      puzzle.inside = inside;
      if (inside && !solved && !puzzle.playing && puzzle.progress === 0) {
        puzzle.timer -= dt;
        if (puzzle.timer <= 0) {
          puzzle.timer = 7;
          playPhrase();
        }
      }
      const humPulse = inside ? 0.12 + 0.08 * Math.sin(t * 2.2) : 0;
      for (const s of stones) {
        if (s.hold > 0) s.hold -= dt;
        else s.glow = Math.max(0, s.glow - dt * 2);
        const g = Math.max(s.glow, s.held ? 0.55 : 0, humPulse, solved ? 0.35 + 0.15 * Math.sin(t * 1.5 + s.i) : 0);
        s.barn.emissive.setRGB(0.25 * g, 0.85 * g, 0.95 * g);
      }
      ctx.hum = solved ? Math.max(0, 1 - d / 30) * 0.4 : inside ? 1 : Math.max(0, 1 - (d - R) / 18) * 0.35;
    },
  };
}

// ---------------------------------------------------------------------------
// 4. Toppled observatory on the highest peak. Turn the telescope to the
//    evening star; the starlight kindles the beacon.

export const SCOPE_STEPS = 12;
export function buildObservatory(scene, ctx) {
  const I = ISLANDS[3];
  const cx = I.x - 1, cz = I.z + 1;
  const fy = terrainH(cx, cz);
  const floorMat = toon(0xd8ccb4);
  const floor = new THREE.Mesh(new THREE.CylinderGeometry(7.5, 8, 0.6, 24), floorMat);
  floor.position.set(cx, fy + 0.05, cz);
  floor.receiveShadow = true;
  scene.add(floor);
  // floor ring inlay (a compass without letters)
  const inlay = new THREE.Mesh(new THREE.RingGeometry(5.2, 5.5, 48), toon(0xb8862f));
  inlay.rotation.x = -Math.PI / 2;
  inlay.position.set(cx, fy + 0.37, cz);
  scene.add(inlay);
  for (let i = 0; i < SCOPE_STEPS; i++) {
    const a = (i / SCOPE_STEPS) * Math.PI * 2;
    const tick = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.05, 0.18), toon(0xb8862f));
    tick.position.set(cx + Math.cos(a) * 6.1, fy + 0.37, cz + Math.sin(a) * 6.1);
    tick.rotation.y = -a;
    scene.add(tick);
  }
  addDeck(cx - 0.01, cz, cx + 0.01, cz, 7.6, fy + 0.35);

  const wallMat = toon(0xefe6d2);
  // broken drum wall: three arcs of differing height
  [[0.3, 2.0, 3.2], [2.6, 1.3, 1.6], [4.3, 1.2, 2.6]].forEach(([start, len, h]) => {
    const w = outline(new THREE.Mesh(new THREE.CylinderGeometry(7.6, 7.6, h, 24, 1, true, start, len), toon(0xefe6d2, { side: THREE.DoubleSide })), 0.06);
    w.position.set(cx, fy + h / 2, cz);
    w.castShadow = true;
    scene.add(w);
    for (let a = start; a < start + len; a += 0.2) {
      const x = cx + Math.sin(a) * 7.6, z = cz + Math.cos(a) * 7.6;
      addCollider(x, z, 0.8, fy - 2, fy + h);
    }
  });
  // the dome, toppled on its side beside the platform
  const dome = outline(
    new THREE.Mesh(new THREE.SphereGeometry(6.5, 24, 12, 0.4, Math.PI * 1.75, 0, Math.PI / 2), toon(0x9ab0c8, { side: THREE.DoubleSide })),
    0.08
  );
  const dx = cx + 10, dz = cz - 10;
  dome.position.set(dx, terrainH(dx, dz) + 1.5, dz);
  dome.rotation.set(1.2, 0.6, 0.3);
  dome.castShadow = true;
  scene.add(dome);
  addCollider(dx, dz, 5.5);
  // fallen column drums
  for (const [ox, oz, rot] of [[9.5, 4, 0.3], [11, 1, 1.1], [-3, 10, 2.2]]) {
    const c = outline(new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 2.2, 10), wallMat), 0.05);
    const x = cx + ox, z = cz + oz;
    c.position.set(x, terrainH(x, z) + 0.6, z);
    c.rotation.set(Math.PI / 2, rot, 0);
    c.castShadow = true;
    scene.add(c);
    addCollider(x, z, 1.1);
  }

  // telescope
  const mount = outline(new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.8, 1.6, 10), toon(0x4a4250)), 0.05);
  mount.position.set(cx, fy + 1.1, cz);
  scene.add(mount);
  addCollider(cx, cz, 1.2, fy - 1, fy + 4);
  const scope = new THREE.Group();
  scope.position.set(cx, fy + 2.1, cz);
  const tilt = new THREE.Group();
  tilt.rotation.z = STAR_EL;
  const tube = outline(new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.62, 6, 14), toon(0xc0903a)), 0.05);
  tube.rotation.z = -Math.PI / 2;
  tube.position.x = 0.8;
  const ring1 = new THREE.Mesh(new THREE.TorusGeometry(0.66, 0.1, 6, 16), toon(0x4a4250));
  ring1.rotation.y = Math.PI / 2;
  ring1.position.x = 3.7;
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.4, 14), new THREE.MeshBasicMaterial({ color: 0x88a4c8 }));
  lens.rotation.y = Math.PI / 2;
  lens.position.x = 3.82;
  const eye = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.8, 8), toon(0x4a4250));
  eye.rotation.z = Math.PI / 2;
  eye.position.x = -2.5;
  tilt.add(tube, ring1, lens, eye);
  scope.add(tilt);
  scope.traverse((o) => o.isMesh && (o.castShadow = true));
  scene.add(scope);

  const bx = cx + 4.5, bz = cz + 9.5;
  const beacon = makeBeacon(scene, bx, bz);

  const correct = Math.round((((STAR_AZ / (Math.PI * 2)) * SCOPE_STEPS) % SCOPE_STEPS + SCOPE_STEPS) % SCOPE_STEPS);
  const st = { k: 3, shown: 3 };
  // starlight thread from lens to brazier, shown on success
  const threadMat = new THREE.MeshBasicMaterial({ color: 0xcfe0ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const thread = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1, 6, 1, true), threadMat);
  thread.geometry.translate(0, 0.5, 0);
  thread.geometry.rotateX(Math.PI / 2);
  thread.renderOrder = 2;
  scene.add(thread);
  const lensGlow = glowSprite(0xcfe0ff, 3);
  scene.add(lensGlow);

  ctx.interact({
    pos: V(cx, fy, cz),
    r: 3.2,
    icon: "turn",
    can: () => !ctx.state.lit[3] && Math.abs(st.shown - st.k) < 0.02,
    act: () => {
      st.k += 1;
      ctx.sound.ratchet();
      if (st.k % SCOPE_STEPS === correct) {
        ctx.after(0.9, () => {
          ctx.sound.bell(1174.7, 0.1);
          ctx.sound.bell(1568, 0.08, 0.3);
          st.lit = true;
        });
        ctx.after(2.4, () => ctx.solved(3, [beacon.world.clone()], true));
      }
    },
  });

  return {
    beacon,
    restore() {
      st.k = st.shown = correct;
      st.lit = true;
    },
    update(dt, t) {
      st.shown += (st.k - st.shown) * Math.min(1, dt * 3);
      if (Math.abs(st.k - st.shown) < 0.001) st.shown = st.k;
      const a = (st.shown / SCOPE_STEPS) * Math.PI * 2;
      scope.rotation.y = -a;
      const aligned = Math.round(st.shown) % SCOPE_STEPS === correct && Math.abs(st.shown - Math.round(st.shown)) < 0.03;
      lens.material.color.set(aligned ? 0xeaf2ff : 0x88a4c8);
      const lp = lens.getWorldPosition(V(0, 0, 0));
      lensGlow.position.copy(lp);
      lensGlow.material.opacity = aligned ? 0.9 + 0.1 * Math.sin(t * 6) : 0;
      threadMat.opacity = st.lit ? 0.5 + 0.2 * Math.sin(t * 3) : 0;
      if (st.lit) {
        thread.position.copy(lp);
        thread.lookAt(beacon.world);
        thread.scale.set(1, 1, lp.distanceTo(beacon.world));
      }
    },
  };
}

// The evening star, low in the sky opposite the sunset.
export function makeEveningStar(scene) {
  const s = glowSprite(0xe8f0ff, 26);
  s.position.copy(dirFrom(STAR_AZ, STAR_EL).multiplyScalar(900));
  s.renderOrder = -8;
  s.material.depthTest = true;
  scene.add(s);
  return s;
}

// ---------------------------------------------------------------------------
// 5. The great lighthouse.

export function buildLighthouse(scene, ctx) {
  const I = ISLANDS[4];
  const cx = I.x, cz = I.z;
  const gy = terrainH(cx, cz);
  const H = 32;
  const geo = new THREE.CylinderGeometry(3.0, 4.3, H, 28, 8);
  const cols = [];
  const p = geo.attributes.position;
  const red = new THREE.Color(0xd24a3c), white = new THREE.Color(0xf4ecdc);
  for (let i = 0; i < p.count; i++) {
    const band = Math.floor(((p.getY(i) + H / 2) / H) * 4 + 0.001);
    const c = band % 2 ? red : white;
    cols.push(c.r, c.g, c.b);
  }
  // make the bands hard: duplicate rows aren't present, so bands blend over
  // one segment which reads as a soft painted edge — fine at this scale.
  geo.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
  const tower = outline(new THREE.Mesh(geo, toon(0xffffff, { vertexColors: true })), 0.12);
  tower.position.set(cx, gy + H / 2, cz);
  tower.castShadow = true;
  scene.add(tower);
  addCollider(cx, cz, 4.3, gy - 5, gy + H - 0.5);

  const top = gy + H;
  const gallery = outline(new THREE.Mesh(new THREE.CylinderGeometry(5.4, 4.2, 0.6, 28), toon(0x3d3548)), 0.06);
  gallery.position.set(cx, top - 0.3, cz);
  gallery.receiveShadow = gallery.castShadow = true;
  const rail = new THREE.Mesh(new THREE.TorusGeometry(5.3, 0.08, 6, 40), toon(0x3d3548));
  rail.rotation.x = Math.PI / 2;
  rail.position.set(cx, top + 1.1, cz);
  scene.add(gallery, rail);
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.1, 4), toon(0x3d3548));
    post.position.set(cx + Math.cos(a) * 5.3, top + 0.55, cz + Math.sin(a) * 5.3);
    scene.add(post);
  }
  addRing(cx, cz, 2.9, 5.1, top);
  const lantern = new THREE.Mesh(
    new THREE.CylinderGeometry(2.4, 2.4, 3.6, 10, 1, true),
    new THREE.MeshToonMaterial({ color: 0x9cc4d8, gradientMap, transparent: true, opacity: 0.55, side: THREE.DoubleSide, emissive: new THREE.Color(0) })
  );
  lantern.position.set(cx, top + 1.8, cz);
  const roof = outline(new THREE.Mesh(new THREE.ConeGeometry(3.0, 2.6, 10), toon(0xa6352c)), 0.08);
  roof.position.set(cx, top + 4.9, cz);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 8), toon(0x3d3548));
  ball.position.set(cx, top + 6.4, cz);
  const lampBase = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 1.2, 10), toon(0xb8862f));
  lampBase.position.set(cx, top + 0.6, cz);
  scene.add(lantern, roof, ball, lampBase);
  for (const m of [roof, ball]) m.castShadow = true;
  addCollider(cx, cz, 2.6, top - 0.5, top + 6);

  const beacon = makeBeacon(scene, cx, cz, { y: top + 1.2, bare: true, height: 0, pillar: 0, lightScale: 2.2 });

  // Rotating beams, dormant until the finale.
  const beams = new THREE.Group();
  beams.position.set(cx, top + 1.9, cz);
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xfff1c4, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide });
  for (const s of [1, -1]) {
    const b = new THREE.Mesh(new THREE.ConeGeometry(6, 220, 20, 1, true), beamMat);
    b.geometry.translate(0, -110, 0);
    b.rotation.z = (s * Math.PI) / 2;
    b.rotation.x = 0.03;
    beams.add(b);
  }
  beams.children.forEach((b) => (b.renderOrder = 2));
  scene.add(beams);

  // Door at the foot, facing the causeway from the observatory.
  const cw = causeways[3];
  const ux = -cw.ux, uz = -cw.uz;
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.8, 3, 0.6), toon(0x3a2a2a));
  const dxp = cx + ux * 4.05, dzp = cz + uz * 4.05;
  door.position.set(dxp, gy + 1.5, dzp);
  door.rotation.y = Math.atan2(ux, uz);
  const arch = outline(new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.18, 6, 12, Math.PI), toon(0xf4ecdc)), 0.04);
  arch.position.set(dxp + ux * 0.2, gy + 3, dzp + uz * 0.2);
  arch.rotation.y = Math.atan2(ux, uz);
  scene.add(door, arch);

  const galAng = Math.atan2(uz, ux);
  const hatch = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.1, 1.4), toon(0x5a4a3a));
  const hx = cx + Math.cos(galAng) * 4.0, hz = cz + Math.sin(galAng) * 4.0;
  hatch.position.set(hx, top + 0.02, hz);
  hatch.rotation.y = -galAng;
  scene.add(hatch);

  ctx.interact({
    pos: V(cx + ux * 5.2, gy, cz + uz * 5.2),
    r: 2.6,
    icon: "door",
    can: () => true,
    act: () => {
      const a = galAng + 0.7;
      ctx.teleport(V(cx + Math.cos(a) * 4.1, top, cz + Math.sin(a) * 4.1), a + Math.PI / 2);
    },
  });
  ctx.interact({
    pos: V(hx, top, hz),
    r: 1.6,
    icon: "door",
    can: () => true,
    act: () => ctx.teleport(V(cx + ux * 6.2, gy, cz + uz * 6.2), Math.atan2(ux, uz)),
  });
  ctx.interact({
    pos: V(cx, top, cz),
    r: 5.8,
    icon: "flame",
    can: () => !ctx.state.lit[4],
    act: () => {
      if (!ctx.state.lit.slice(0, 4).every(Boolean)) return ctx.sound.wrong();
      ctx.sound.kindle(1.5);
      ctx.solved(4, [], true);
    },
  });

  return {
    beacon,
    top,
    center: V(cx, top, cz),
    door: V(cx + ux * 6.2, gy, cz + uz * 6.2),
    restore() {},
    update(dt, t, night) {
      const on = beacon.level;
      lantern.material.emissive.setRGB(1.0 * on, 0.75 * on, 0.35 * on);
      beams.rotation.y = t * 0.45;
      beamMat.opacity = on * (0.04 + 0.12 * night);
    },
  };
}

// ---------------------------------------------------------------------------
// Causeways: stone slabs where the strip dips below its own top, with a
// pillar every few metres so they read as a drowned road, not a ridge.

export function buildCauseways(scene) {
  const slabGeo = new THREE.BoxGeometry(2.4, 0.7, 3.8);
  const pillarGeo = new THREE.CylinderGeometry(0.9, 1.3, 1, 8);
  pillarGeo.translate(0, -0.5, 0);
  const slabs = [], pillars = [];
  const r = rng(4242);
  for (const c of causeways) {
    const L = Math.hypot(c.bx - c.ax, c.bz - c.az);
    const n = Math.floor(L / 2.5);
    const ang = Math.atan2(c.uz, c.ux);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = c.ax + (c.bx - c.ax) * t, z = c.az + (c.bz - c.az) * t;
      const gh = terrainH(x, z);
      if (gh > c.top + 0.3) continue;
      slabs.push({ x, z, y: c.top - 0.35 + (r() - 0.5) * 0.08, ang: -ang + (r() - 0.5) * 0.05, tilt: (r() - 0.5) * 0.05 });
      if (i % 4 === 0 && gh < c.top - 1.5) pillars.push({ x, z, y: c.top - 0.6, h: c.top - 0.6 - gh + 0.5 });
    }
  }
  const stone = toon(0xa89c86);
  const inst = new THREE.InstancedMesh(slabGeo, stone, slabs.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion();
  const col = new THREE.Color();
  slabs.forEach((s, i) => {
    q.setFromEuler(new THREE.Euler(s.tilt, s.ang, s.tilt * 0.5));
    m.compose(V(s.x, s.y, s.z), q, V(1, 1, 1));
    inst.setMatrixAt(i, m);
    inst.setColorAt(i, col.setHSL(0.1, 0.12, 0.52 + (r() - 0.5) * 0.12));
  });
  inst.receiveShadow = inst.castShadow = true;
  scene.add(inst);
  const pinst = new THREE.InstancedMesh(pillarGeo, toon(0x8e8471), pillars.length);
  pillars.forEach((p, i) => {
    m.compose(V(p.x, p.y, p.z), q.identity(), V(1, p.h, 1));
    pinst.setMatrixAt(i, m);
  });
  scene.add(pinst);
}

// ---------------------------------------------------------------------------
// Scatter: round-canopy trees (dense on the forest island), rocks, sea stacks.

export function buildScatter(scene, avoid) {
  const r = rng(99);
  const trees = [];
  const tryTree = (x, z, big) => {
    const h = terrainH(x, z);
    if (h < 3.2 || h > 22) return;
    for (const a of avoid) if (Math.hypot(x - a.x, z - a.z) < a.r) return;
    if (nearCauseway(x, z, 1.6)) return;
    for (const t of trees) if (Math.hypot(x - t.x, z - t.z) < 3.2) return;
    trees.push({ x, z, y: h, s: (big ? 1.1 : 0.8) + r() * 0.6 });
  };
  const F = ISLANDS[1];
  for (let i = 0; i < 900 && trees.length < 150; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * F.r * 0.85;
    tryTree(F.x + Math.cos(a) * d, F.z + Math.sin(a) * d, true);
  }
  for (const k of [0, 2, 3, 4]) {
    const I = ISLANDS[k];
    const want = k === 3 ? 26 : k === 4 ? 4 : 10;
    const start = trees.length;
    for (let i = 0; i < 400 && trees.length - start < want; i++) {
      const a = r() * Math.PI * 2, d = (0.3 + r() * 0.5) * I.r;
      tryTree(I.x + Math.cos(a) * d, I.z + Math.sin(a) * d, false);
    }
  }
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.36, 3, 6);
  trunkGeo.translate(0, 1.5, 0);
  const canopyGeo = new THREE.IcosahedronGeometry(1.9, 1);
  const trunks = new THREE.InstancedMesh(trunkGeo, toon(0x7a5238), trees.length);
  const canopies = new THREE.InstancedMesh(canopyGeo, toon(0xffffff), trees.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color();
  const greens = [0x4f9a45, 0x62b04e, 0x3f8a4a, 0x76bb52];
  trees.forEach((t, i) => {
    q.setFromEuler(new THREE.Euler(0, r() * 6, 0));
    m.compose(V(t.x, t.y - 0.2, t.z), q, V(t.s, t.s * (1 + r() * 0.5), t.s));
    trunks.setMatrixAt(i, m);
    m.compose(V(t.x, t.y + 3.4 * t.s + 0.6, t.z), q, V(t.s * 1.1, t.s * 0.95, t.s * 1.1));
    canopies.setMatrixAt(i, m);
    canopies.setColorAt(i, col.set(greens[i % greens.length]));
    addCollider(t.x, t.z, 0.45 * t.s);
  });
  trunks.castShadow = canopies.castShadow = true;
  canopies.receiveShadow = true;
  scene.add(trunks, canopies);

  // rocks along shores
  const rocks = [];
  for (let i = 0; i < 90; i++) {
    const I = ISLANDS[i % 5];
    const a = r() * Math.PI * 2, d = (0.75 + r() * 0.35) * I.r;
    const x = I.x + Math.cos(a) * d, z = I.z + Math.sin(a) * d;
    if (nearCauseway(x, z, 2.5)) continue;
    rocks.push({ x, z, y: terrainH(x, z), s: 0.5 + r() * 1.3 });
  }
  // sea stacks out in the open water for silhouette
  for (const [x, z, s] of [[-120, 70, 5], [30, 120, 4], [140, -20, 6], [-100, -110, 5], [110, -110, 4], [-20, 5, 3.2], [20, -110, 3]]) {
    rocks.push({ x, z, y: -9, s, stack: true });
  }
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const rinst = new THREE.InstancedMesh(rockGeo, toon(0x948a86), rocks.length);
  rocks.forEach((k, i) => {
    q.setFromEuler(k.stack ? new THREE.Euler((r() - 0.5) * 0.15, r() * 6, (r() - 0.5) * 0.15) : new THREE.Euler(r() * 3, r() * 3, r() * 3));
    const sy = k.stack ? k.s * 4.5 : k.s * 0.8;
    m.compose(V(k.x, k.y + (k.stack ? sy * 0.6 : 0), k.z), q, V(k.s, sy, k.s));
    rinst.setMatrixAt(i, m);
    if (!k.stack && k.s > 1) addCollider(k.x, k.z, k.s * 0.8);
  });
  rinst.castShadow = true;
  scene.add(rinst);
  return trees;
}

// Gulls wheeling over the islands.
export function makeGulls(scene) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0.3, -1.2, 0.3, -0.1, 0, 0, -0.2, 0, 0, 0.3, 1.2, 0.3, -0.1, 0, 0, -0.2], 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshBasicMaterial({ color: 0xfaf6ee, side: THREE.DoubleSide });
  const gulls = [];
  const r = rng(5);
  for (let i = 0; i < 9; i++) {
    const I = ISLANDS[i % 5];
    const g = new THREE.Mesh(geo, mat);
    g.userData = { cx: I.x + (r() - 0.5) * 20, cz: I.z + (r() - 0.5) * 20, R: 10 + r() * 16, y: 18 + r() * 14, sp: 0.25 + r() * 0.2, ph: r() * 6, dir: r() > 0.5 ? 1 : -1 };
    scene.add(g);
    gulls.push(g);
  }
  return {
    mat,
    update(t) {
      for (const g of gulls) {
        const u = g.userData;
        const a = u.ph + t * u.sp * u.dir;
        g.position.set(u.cx + Math.cos(a) * u.R, u.y + Math.sin(t * 0.7 + u.ph) * 1.5, u.cz + Math.sin(a) * u.R);
        g.rotation.y = -a - (u.dir > 0 ? 0 : Math.PI);
        g.rotation.z = Math.sin(a) * 0.2;
        g.scale.set(1, 1 + Math.sin(t * 6 + u.ph) * 0.8, 1);
      }
    },
  };
}

// Homecoming boats for the finale.
export function makeBoats(scene, center) {
  const boats = [];
  const hull = hullGeometry(3.6, 1.4, 0.9);
  for (let i = 0; i < 5; i++) {
    const g = new THREE.Group();
    const h = new THREE.Mesh(hull, toon(0x5a4030));
    const sail = new THREE.Mesh(new THREE.ConeGeometry(1.2, 3, 3), toon(0xe8dcc0));
    sail.position.y = 2;
    sail.scale.z = 0.2;
    const lamp = glowSprite(0xffc070, 6);
    lamp.position.y = 1.2;
    g.add(h, sail, lamp);
    const a = 0.4 + i * 1.1;
    g.userData = { a, r0: 330 + i * 25, lamp };
    g.visible = false;
    scene.add(g);
    boats.push(g);
  }
  return {
    start() {
      boats.forEach((b) => (b.visible = true));
    },
    update(t, prog, tide) {
      for (const b of boats) {
        const u = b.userData;
        const r = u.r0 - prog * (u.r0 - 90);
        b.position.set(center.x + Math.cos(u.a) * r, tide + 0.2 + Math.sin(t * 1.5 + u.a) * 0.15, center.z + Math.sin(u.a) * r);
        b.rotation.y = -u.a + Math.PI;
        b.rotation.z = Math.sin(t * 1.2 + u.a) * 0.06;
        u.lamp.material.opacity = 0.7 + 0.3 * Math.sin(t * 5 + u.a);
      }
    },
  };
}
