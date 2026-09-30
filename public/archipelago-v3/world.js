import * as THREE from './three.module.min.js';
import { U, GLSL_NOISE, toon, addWind, gradientMap } from './materials.js';
import {
  ISLANDS, CAUSEWAYS, LAYOUT, TRAIL, SEABED, TIDE, GRID, groundH, slopeAt, pathDist, causewayAt, islandOf,
  makeHeightTexture, STONE, coastR,
} from './terrain.js';
import { mergeGeometries, paint } from './batch.js';
import { rng, vnoise, segDist } from './noise.js';

// ---------------------------------------------------------------------------
// Water: toon sea with drifting wave lines, shore foam and see-through shallows
// ---------------------------------------------------------------------------
export function buildWater(G) {
  const { tex, bounds } = makeHeightTexture();
  const uni = {
    uTime: U.uTime, uNight: U.uNight, uFogColor: U.uFogColor, uFogNear: U.uFogNear, uFogFar: U.uFogFar,
    uLevel: { value: TIDE[0] }, uHeight: { value: tex }, uBounds: { value: bounds },
    uDeep: { value: new THREE.Color(0x0c4f7a) }, uShallow: { value: new THREE.Color(0x2fa3a0) },
    uFoam: { value: new THREE.Color(0xf4fbff) },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color() }, uAmb: { value: new THREE.Color() },
    uLP: { value: [0, 1, 2, 3].map(() => new THREE.Vector4()) },
    uLC: { value: [0, 1, 2, 3].map(() => new THREE.Color()) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: uni,
    vertexShader: `varying vec3 vW; varying float vDepth;
      void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vec4 mv = viewMatrix * w; vDepth = -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `${GLSL_NOISE}
      uniform float uTime, uNight, uLevel, uFogNear, uFogFar; uniform sampler2D uHeight; uniform vec4 uBounds;
      uniform vec3 uDeep, uShallow, uFoam, uSunDir, uSunCol, uAmb, uFogColor;
      uniform vec4 uLP[4]; uniform vec3 uLC[4];
      varying vec3 vW; varying float vDepth;
      void main(){
        vec2 uv = (vW.xz - uBounds.xy) / uBounds.zw;
        float ground = (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) ? -7.0 : texture2D(uHeight, uv).r;
        float depth = uLevel - ground;
        float dist = vDepth;
        vec3 col = mix(uShallow, uDeep, smoothstep(0.3, 7.0, depth));
        // Wind-Waker style drifting wave lines (contours of moving noise)
        vec2 p = vW.xz * 0.045;
        float n = vnoise(p + vec2(uTime * 0.05, uTime * 0.03)) * 0.6 + vnoise(p * 2.3 - vec2(uTime * 0.04, -uTime * 0.06)) * 0.4;
        float fw = fwidth(n);
        float line = 1.0 - smoothstep(0.0, fw * 1.2 + 0.004, abs(n - 0.5));
        line *= (1.0 - smoothstep(60.0, 240.0, dist)) * smoothstep(0.8, 2.2, depth);
        // shore foam: a breaking edge plus a second pulsing band offshore
        float wav = sin(uTime * 1.3 + ground * 1.7 + vnoise(vW.xz * 0.2) * 4.0) * 0.16;
        float edge = step(depth, 0.32 + wav + vnoise(vW.xz * 0.6 + uTime * 0.2) * 0.25);
        float band = step(abs(depth - (0.95 + wav * 2.0)), 0.07) * step(vnoise(vW.xz * 0.35 - uTime * 0.1), 0.62);
        float foam = max(edge, band) * step(-0.3, depth);
        vec3 light = uAmb + uSunCol * 0.45;
        vec3 lit = col * light;
        lit = mix(lit, uFoam * (uAmb * 1.2 + uSunCol * 0.6), clamp(max(line * 0.75, foam), 0.0, 1.0));
        // cel sun glint
        vec3 V = normalize(cameraPosition - vW);
        vec3 N = normalize(vec3((vnoise(vW.xz * 0.5 + uTime * 0.3) - 0.5) * 0.3, 1.0, (vnoise(vW.zx * 0.5 - uTime * 0.25) - 0.5) * 0.3));
        vec3 H = normalize(V + uSunDir);
        float spec = pow(max(dot(N, H), 0.0), 220.0);
        lit += uSunCol * step(0.45, spec) * 1.4 * (1.0 - uNight);
        // firelight reflected on the water
        for (int i = 0; i < 4; i++) {
          vec3 d = uLP[i].xyz - vW;
          float dd = dot(d.xz, d.xz);
          float shim = 0.4 + 0.6 * step(0.55, vnoise(vW.xz * vec2(0.8, 3.0) + float(i) * 3.0 + uTime * 0.6));
          lit += uLC[i] * uLP[i].w * shim / (1.0 + dd * 0.03);
        }
        float alpha = mix(0.42, 0.94, smoothstep(0.0, 3.2, depth));
        alpha = max(alpha, foam);
        float f = smoothstep(uFogNear, uFogFar, dist);
        lit = mix(lit, uFogColor, f);
        gl_FragColor = vec4(lit, mix(alpha, 1.0, f));
      }`,
    transparent: true, depthWrite: false, fog: false,
  });
  const geo = new THREE.PlaneGeometry(3600, 3600, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 2;
  mesh.frustumCulled = false;
  G.scene.add(mesh);
  return {
    mesh, uni,
    setLevel(y) { uni.uLevel.value = y; mesh.position.y = y; },
  };
}

// ---------------------------------------------------------------------------
// Vegetation, rocks, causeway stones, trail posts, gulls
// ---------------------------------------------------------------------------
function coniferGeo() {
  const parts = [];
  const t = new THREE.CylinderGeometry(0.16, 0.26, 1.8, 5); t.translate(0, 0.9, 0); paint(t, 0x6a4a30); parts.push(t);
  const cols = [0x2f6b3a, 0x3a7a3f, 0x468a45];
  [[1.7, 2.6, 2.2], [1.3, 2.3, 3.5], [0.9, 2.0, 4.7]].forEach(([r, h, y], i) => {
    const c = new THREE.ConeGeometry(r, h, 7); c.translate(0, y, 0); paint(c, cols[i]); parts.push(c);
  });
  return mergeGeometries(parts.map((g) => ({ geom: g, matrix: new THREE.Matrix4() })));
}
function roundGeo() {
  const parts = [];
  const t = new THREE.CylinderGeometry(0.2, 0.3, 2.4, 5); t.translate(0, 1.2, 0); paint(t, 0x6e4c32); parts.push(t);
  const a = new THREE.IcosahedronGeometry(1.8, 0); a.translate(0, 3.3, 0); paint(a, 0x4f9a3a); parts.push(a);
  const b = new THREE.IcosahedronGeometry(1.25, 0); b.translate(0.8, 4.3, 0.3); paint(b, 0x66ae44); parts.push(b);
  const c = new THREE.IcosahedronGeometry(1.1, 0); c.translate(-0.9, 3.9, -0.4); paint(c, 0x5aa340); parts.push(c);
  return mergeGeometries(parts.map((g) => ({ geom: g, matrix: new THREE.Matrix4() })));
}
function grassGeo() {
  const pos = [], col = [], nor = [];
  for (let k = 0; k < 3; k++) {
    const a = k * Math.PI / 3 + 0.3;
    const cx = Math.cos(a), cz = Math.sin(a);
    const w = 0.09, hgt = 0.62 - k * 0.08;
    const lean = 0.12;
    pos.push(-cx * w, 0, -cz * w, cx * w, 0, cz * w, -cz * lean, hgt, cx * lean);
    col.push(0.45, 0.45, 0.45, 0.45, 0.45, 0.45, 1.0, 1.0, 1.0);
    nor.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

export function buildDressing(G) {
  const rand = rng(12345);
  const excl = [
    { x: LAYOUT.ringC[0], z: LAYOUT.ringC[1], r: 14 },
    { x: LAYOUT.ship.c[0] + 3, z: LAYOUT.ship.c[1], r: 17 },
    { x: LAYOUT.ship.lamp[0], z: LAYOUT.ship.lamp[1], r: 3.5 },
    { x: LAYOUT.light[0], z: LAYOUT.light[1], r: 21 },
    { x: LAYOUT.totem[0], z: LAYOUT.totem[1], r: 7 },
    { x: LAYOUT.obs[0], z: LAYOUT.obs[1], r: 19 },
    { x: LAYOUT.start[0], z: LAYOUT.start[1], r: 5 },
    ...LAYOUT.beacons.map((b) => ({ x: b[0], z: b[1], r: 4.5 })),
    ...LAYOUT.ship.mirrors.map((m) => ({ x: m[0], z: m[1], r: 3.2 })),
  ];
  const excluded = (x, z, pad = 0) => excl.some((e) => (x - e.x) ** 2 + (z - e.z) ** 2 < (e.r + pad) ** 2);
  const inStone = (x, z) => STONE.some((s) => (x - s.x) ** 2 + (z - s.z) ** 2 < s.r * s.r);
  const onPlatform = (x, z) => !!G.physics.platformAt(x, z, 1e6);

  // ---- trees ----
  const TCELL = 40;
  const tcells = new Map();
  const addTree = (type, x, z, s, rot) => {
    const k = Math.floor(x / TCELL) + ',' + Math.floor(z / TCELL);
    let c = tcells.get(k);
    if (!c) { c = { cx: (Math.floor(x / TCELL) + 0.5) * TCELL, cz: (Math.floor(z / TCELL) + 0.5) * TCELL, list: [[], []] }; tcells.set(k, c); }
    c.list[type].push([x, groundH(x, z) - 0.15, z, s, rot]);
    G.physics.addCircle(x, z, 0.32 * s, groundH(x, z) - 1, groundH(x, z) + 4, false);
  };
  ISLANDS.forEach((I, ii) => {
    const forest = ii === 1;
    const sp = forest ? 2.6 : 5.5;
    const R = I.R * 1.2;
    for (let z = I.c[1] - R; z < I.c[1] + R; z += sp) {
      for (let x = I.c[0] - R; x < I.c[0] + R; x += sp) {
        const px = x + (rand() - 0.5) * sp * 0.9, pz = z + (rand() - 0.5) * sp * 0.9;
        if (islandOf(px, pz) !== ii) continue;
        const h = groundH(px, pz);
        if (h < (forest ? 4.6 : 5.0)) continue;
        const sl = slopeAt(px, pz);
        if (sl > (ii === 3 ? 1.1 : 0.8)) continue;
        if (ii === 3 && h > 36) continue;
        const dens = vnoise(px * 0.035 + ii * 10, pz * 0.035);
        if (forest ? dens < 0.1 : dens < (ii === 4 ? 0.7 : ii === 3 ? 0.4 : 0.5)) continue;
        const pd = pathDist(px, pz);
        if (pd < (forest ? 1.6 : 1.8)) continue;
        if (excluded(px, pz) || inStone(px, pz) || onPlatform(px, pz)) continue;
        if (causewayAt(px, pz) >= 0) continue;
        const conifer = forest ? rand() < 0.72 : ii === 3 ? rand() < 0.85 : rand() < 0.25;
        addTree(conifer ? 0 : 1, px, pz, 0.8 + rand() * 0.65, rand() * Math.PI * 2);
      }
    }
  });
  const treeMat = addWind(new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: gradientMap() }), 0.0035);
  treeMat.flatShading = true; // toon has no flatShading option, but the program flag still applies
  const tGeos = [coniferGeo(), roundGeo()];
  const treeMeshes = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s3 = new THREE.Vector3(), p3 = new THREE.Vector3(), cc = new THREE.Color();
  let treeCount = 0;
  for (const c of tcells.values()) {
    for (let type = 0; type < 2; type++) {
      const L = c.list[type];
      if (!L.length) continue;
      const im = new THREE.InstancedMesh(tGeos[type], treeMat, L.length);
      L.forEach(([x, y, z, s, r], i) => {
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r);
        s3.set(s, s * (0.9 + rand() * 0.25), s);
        p3.set(x, y, z);
        m4.compose(p3, q, s3);
        im.setMatrixAt(i, m4);
        const v = 0.85 + rand() * 0.25;
        cc.setRGB(v * (0.95 + rand() * 0.1), v, v * (0.9 + rand() * 0.1));
        im.setColorAt(i, cc);
      });
      im.castShadow = true; im.receiveShadow = true;
      im.computeBoundingSphere();
      G.scene.add(im);
      treeMeshes.push({ mesh: im, cx: c.cx, cz: c.cz });
      treeCount += L.length;
    }
  }

  // ---- grass ----
  const GCELL = 20;
  const grassMat = addWind(new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: gradientMap(), side: THREE.DoubleSide }), 0.28);
  const gGeo = grassGeo();
  const grassMeshes = [];
  const gA = new THREE.Color(0x5f9f36), gB = new THREE.Color(0x8cbb42), gC = new THREE.Color(0xb8b85a);
  let grassCount = 0;
  const X0 = GRID.x0, Z0 = GRID.z0, X1 = GRID.x0 + (GRID.nx - 1) * GRID.s, Z1 = GRID.z0 + (GRID.nz - 1) * GRID.s;
  for (let cz = Z0; cz < Z1; cz += GCELL) {
    for (let cx = X0; cx < X1; cx += GCELL) {
      if (groundH(cx + GCELL / 2, cz + GCELL / 2) < 3 && groundH(cx, cz) < 3 && groundH(cx + GCELL, cz + GCELL) < 3 && groundH(cx + GCELL, cz) < 3 && groundH(cx, cz + GCELL) < 3) continue;
      const pts = [];
      const N = 900;
      for (let i = 0; i < N; i++) {
        const x = cx + rand() * GCELL, z = cz + rand() * GCELL;
        const h = groundH(x, z);
        if (h < 4.5 + vnoise(x * 0.08, z * 0.08) * 1.0) continue;
        if (slopeAt(x, z) > 0.6) continue;
        const dn = vnoise(x * 0.09 + 3, z * 0.09 - 5);
        if (dn < 0.28) continue;
        if (pathDist(x, z) < 0.4) continue;
        if (inStone(x, z) || onPlatform(x, z)) continue;
        if (excluded(x, z, -3)) continue;
        pts.push([x, h, z, dn]);
      }
      if (!pts.length) continue;
      const im = new THREE.InstancedMesh(gGeo, grassMat, pts.length);
      pts.forEach(([x, h, z, dn], i) => {
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * 6.28);
        const s = 0.7 + rand() * 0.7 + dn * 0.4;
        s3.set(s, s * (0.8 + rand() * 0.5), s);
        p3.set(x, h - 0.03, z);
        m4.compose(p3, q, s3);
        im.setMatrixAt(i, m4);
        cc.copy(gA).lerp(gB, vnoise(x * 0.08, z * 0.08));
        if (rand() < 0.12) cc.lerp(gC, 0.6);
        im.setColorAt(i, cc);
      });
      im.receiveShadow = true;
      im.castShadow = false;
      im.computeBoundingSphere();
      G.scene.add(im);
      grassMeshes.push({ mesh: im, cx: cx + GCELL / 2, cz: cz + GCELL / 2 });
      grassCount += pts.length;
    }
  }

  // ---- rocks ----
  const rockGeo = new THREE.DodecahedronGeometry(0.8, 0);
  const rockMat = toon(0x8e877b, { flatShading: true });
  const rocks = [];
  for (let i = 0; i < 2600 && rocks.length < 420; i++) {
    const I = ISLANDS[Math.floor(rand() * ISLANDS.length)];
    const a = rand() * Math.PI * 2, r = rand() * I.R * 1.15;
    const x = I.c[0] + Math.cos(a) * r, z = I.c[1] + Math.sin(a) * r;
    const h = groundH(x, z);
    if (h < -1.5) continue;
    const sl = slopeAt(x, z);
    const beach = h < 4.6;
    if (!(sl > 0.55 || (beach && rand() < 0.35))) continue;
    if (pathDist(x, z) < 1.2 || excluded(x, z) || inStone(x, z) || causewayAt(x, z) >= 0 || onPlatform(x, z)) continue;
    const s = 0.4 + rand() * 1.4;
    rocks.push([x, h, z, s]);
    if (s > 0.8) G.physics.addCircle(x, z, 0.7 * s, h - 1, h + s, false);
  }
  const rockIM = new THREE.InstancedMesh(rockGeo, rockMat, rocks.length);
  rocks.forEach(([x, h, z, s], i) => {
    q.setFromEuler(new THREE.Euler(rand() * 3, rand() * 3, rand() * 3));
    s3.set(s * (0.8 + rand() * 0.5), s * (0.5 + rand() * 0.4), s * (0.8 + rand() * 0.5));
    p3.set(x, h - s * 0.15, z);
    m4.compose(p3, q, s3);
    rockIM.setMatrixAt(i, m4);
  });
  rockIM.castShadow = true; rockIM.receiveShadow = true;
  rockIM.computeBoundingSphere();
  G.scene.add(rockIM);

  // ---- causeway slabs and half-sunken pillars ----
  const slabGeo = new THREE.BoxGeometry(1.45, 0.6, 1.35);
  const slabMat = toon(0xa7a08e, { flatShading: true });
  const slabs = [], pillars = [];
  CAUSEWAYS.forEach((cw, k) => {
    const a = ISLANDS[cw.a].c, b = ISLANDS[cw.b].c;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const ux = (b[0] - a[0]) / len, uz = (b[1] - a[1]) / len;
    const px = -uz, pz = ux;
    const yaw = Math.atan2(ux, uz);
    let pillarSide = 1, lastPillar = -100;
    for (let d = 0; d < len; d += 1.5) {
      const cx = a[0] + ux * d, cz = a[1] + uz * d;
      if (causewayAt(cx, cz) !== k) continue;
      for (const o of [-1.5, 0, 1.5]) {
        const x = cx + px * o + (rand() - 0.5) * 0.15, z = cz + pz * o + (rand() - 0.5) * 0.15;
        slabs.push([x, cw.top - 0.28 - rand() * 0.04, z, yaw + (rand() - 0.5) * 0.12]);
      }
      if (d - lastPillar > 15) {
        lastPillar = d;
        pillarSide *= -1;
        const x = cx + px * pillarSide * 3.4, z = cz + pz * pillarSide * 3.4;
        pillars.push([x, cw.top, z, 2.2 + rand() * 4.5, rand()]);
      }
    }
  });
  const slabIM = new THREE.InstancedMesh(slabGeo, slabMat, slabs.length);
  slabs.forEach(([x, y, z, r], i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r);
    const v = 0.8 + rand() * 0.3;
    s3.set(v * 0.9 + 0.1, 1, 1);
    p3.set(x, y, z);
    m4.compose(p3, q, s3);
    slabIM.setMatrixAt(i, m4);
    cc.setRGB(0.8 + rand() * 0.25, 0.85 + rand() * 0.2, 0.75 + rand() * 0.2);
    slabIM.setColorAt(i, cc);
  });
  slabIM.receiveShadow = true; slabIM.castShadow = false;
  slabIM.computeBoundingSphere();
  G.scene.add(slabIM);
  const pilGeo = new THREE.CylinderGeometry(0.55, 0.7, 1, 7);
  pilGeo.translate(0, 0.5, 0);
  const pilIM = new THREE.InstancedMesh(pilGeo, toon(0x9a937f, { flatShading: true }), pillars.length);
  const capGeo = new THREE.BoxGeometry(1.7, 0.4, 1.7);
  const caps = [];
  pillars.forEach(([x, top, z, hh, r], i) => {
    const tilt = r < 0.35 ? 0.25 : 0;
    q.setFromEuler(new THREE.Euler(tilt, r * 6, tilt * 0.5));
    const base = SEABED + 1;
    s3.set(1, hh + (top - base), 1);
    p3.set(x, base, z);
    m4.compose(p3, q, s3);
    pilIM.setMatrixAt(i, m4);
    if (r > 0.6) caps.push([x, base + hh + (top - base), z, r]);
    G.physics.addCircle(x, z, 0.75, -20, top + hh, true);
  });
  pilIM.castShadow = true; pilIM.receiveShadow = true;
  pilIM.computeBoundingSphere();
  G.scene.add(pilIM);
  if (caps.length) {
    const capIM = new THREE.InstancedMesh(capGeo, toon(0x9a937f, { flatShading: true }), caps.length);
    caps.forEach(([x, y, z, r], i) => { q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r * 5); p3.set(x, y + 0.2, z); s3.set(1, 1, 1); m4.compose(p3, q, s3); capIM.setMatrixAt(i, m4); });
    capIM.castShadow = true; capIM.computeBoundingSphere();
    G.scene.add(capIM);
  }

  // ---- trail marker posts on the outer edge of each switchback ----
  const posts = [];
  const pc = ISLANDS[3].c;
  for (let i = 0; i < TRAIL.length - 1; i++) {
    const a = TRAIL[i], b = TRAIL[i + 1];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const ux = (b[0] - a[0]) / len, uz = (b[1] - a[1]) / len;
    for (let d = 2; d < len - 1; d += 5) {
      const x = a[0] + ux * d, z = a[1] + uz * d;
      let px = -uz, pz = ux;
      if ((x - pc[0]) * px + (z - pc[1]) * pz < 0) { px = -px; pz = -pz; }
      const qx = x + px * 2.3, qz = z + pz * 2.3;
      posts.push([qx, groundH(qx, qz), qz]);
    }
  }
  const postIM = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 1.0, 0.16).translate(0, 0.5, 0), toon(0x6b4a30), posts.length);
  posts.forEach(([x, y, z], i) => { p3.set(x, y - 0.05, z); q.identity(); s3.set(1, 1, 1); m4.compose(p3, q, s3); postIM.setMatrixAt(i, m4); });
  postIM.castShadow = true; postIM.computeBoundingSphere();
  G.scene.add(postIM);
  // stone gateposts where the trail starts
  const ts = LAYOUT.trailStart;
  for (const s of [-1, 1]) {
    const t0 = TRAIL[0], t1 = TRAIL[1];
    const len = Math.hypot(t1[0] - t0[0], t1[1] - t0[1]);
    const px = -(t1[1] - t0[1]) / len, pz = (t1[0] - t0[0]) / len;
    const x = ts[0] + px * s * 2.6, z = ts[1] + pz * s * 2.6;
    const gp = new THREE.Mesh(new THREE.BoxGeometry(0.7, 3.0, 0.7), toon(0xa39b89, { flatShading: true }));
    gp.position.set(x, groundH(x, z) + 1.4, z); gp.castShadow = true;
    G.scene.add(gp);
    G.physics.addCircle(x, z, 0.5, -10, 100, true);
  }

  // ---- gulls wheeling overhead ----
  const gullGeo = new THREE.BufferGeometry();
  gullGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.25, -1.1, 0.25, -0.1, 0, 0, -0.2, 0, 0, 0.25, 0, 0, -0.2, 1.1, 0.25, -0.1], 3));
  gullGeo.computeVertexNormals();
  const gullMat = new THREE.MeshBasicMaterial({ color: 0xf6f3ee, side: THREE.DoubleSide });
  const gulls = [];
  for (let i = 0; i < 9; i++) {
    const m = new THREE.Mesh(gullGeo, gullMat);
    const I = ISLANDS[i % 5];
    gulls.push({ m, c: I.c, r: 20 + rand() * 30, h: 22 + rand() * 20, sp: 0.15 + rand() * 0.15, ph: rand() * 6 });
    G.scene.add(m);
  }

  const stats = { trees: treeCount, grass: grassCount, rocks: rocks.length };
  return {
    stats,
    update(dt, cam, fogFar, t, night) {
      const grassD = 72, treeD = Math.min(460, fogFar + 60);
      for (const g of grassMeshes) {
        const dx = g.cx - cam.x, dz = g.cz - cam.z;
        g.mesh.visible = dx * dx + dz * dz < grassD * grassD;
      }
      for (const g of treeMeshes) {
        const dx = g.cx - cam.x, dz = g.cz - cam.z;
        g.mesh.visible = dx * dx + dz * dz < treeD * treeD;
      }
      for (const g of gulls) {
        const a = t * g.sp + g.ph;
        g.m.position.set(g.c[0] + Math.cos(a) * g.r, g.h + Math.sin(a * 2.3) * 2, g.c[1] + Math.sin(a) * g.r);
        g.m.rotation.y = -a;
        g.m.scale.y = 0.3 + Math.abs(Math.sin(t * 6 + g.ph)) * 1.2;
        g.m.visible = night < 0.7;
      }
    },
  };
}
