// A ship beached among the trees. Step 1: climb aboard and light the great stern lamp.
// Step 2: its beam shoots into the forest; turn the salvaged brass mirrors to carry the light
// around the ancient trees to the lens on the beacon. Step 3: light the beacon.
import * as THREE from './three.module.min.js';
import { toon, addOutline } from './util.js';
import { Fire } from './fire.js';
import { terrainH, addPlatform, addCircle, addBox, addKeepOut, addKeepOutSeg, addPath, colliders } from './world.js';

const BOW = { x: 43, z: 146 };
const L = 25, BEAM = 5.2;
const PITCH = (6 * Math.PI) / 180;
const QD_X = 19, QD_H = 1.3;

const MIRRORS = [
  { x: 76, z: 146, k: 4, correct: 10 },
  { x: 76, z: 130, k: 12, correct: 2 },
  { x: 92, z: 130, k: 0, correct: 6 },
  { x: 60, z: 130, k: 5, correct: -1 }, // decoy
];
const BLOCKERS = [
  { x: 84, z: 146, r: 1.4 },
  { x: 84, z: 138, r: 1.4 },
];
const RECEIVER = { x: 92, z: 144.9, r: 1.2 };

function halfWidth(x) {
  const t = x / L;
  const bow = Math.pow(Math.min(1, t * 2.4), 0.55);
  const stern = 1 - Math.pow(Math.max(0, t - 0.8) / 0.2, 2) * 0.18;
  return (BEAM / 2) * Math.max(0.05, bow) * stern;
}

function hullGeo() {
  const N = 30, M = 8, depth = 3.3;
  const pos = [], col = [];
  const cA = new THREE.Color(0x6e4a30), cB = new THREE.Color(0x5a3b26), cK = new THREE.Color(0x3a2a20), cW = new THREE.Color(0x3c4a34);
  const ring = (x) => {
    const w = halfWidth(x);
    const pts = [];
    // from port rail top, down around keel, up to starboard rail top
    pts.push([w, 0.75]);
    for (let j = 0; j <= M; j++) {
      const a = (j / M) * (Math.PI / 2);
      pts.push([w * Math.pow(Math.cos(a), 0.45), -depth * Math.sin(a)]);
    }
    const out = pts.map(([z, y]) => [x, y, z]);
    const mirror = pts.slice().reverse().map(([z, y]) => [x, y, -z]);
    return out.concat(mirror.slice(1));
  };
  const rings = [];
  for (let i = 0; i <= N; i++) rings.push(ring((i / N) * L));
  const colorFor = (y) => (y > 0 ? cK : y < -2.2 ? cW : (Math.floor((y + 10) * 2.2) % 2 ? cA : cB));
  for (let i = 0; i < N; i++) {
    const r0 = rings[i], r1 = rings[i + 1];
    for (let j = 0; j < r0.length - 1; j++) {
      const a = r0[j], b = r0[j + 1], c = r1[j], d = r1[j + 1];
      pos.push(...a, ...c, ...b, ...b, ...c, ...d);
      const cc = colorFor((a[1] + b[1]) / 2);
      for (let k = 0; k < 6; k++) col.push(cc.r, cc.g, cc.b);
    }
  }
  // transom
  const rs = rings[N];
  for (let j = 1; j < rs.length - 1; j++) {
    pos.push(L, 0.75, 0, ...rs[j], ...rs[j + 1]);
    for (let k = 0; k < 3; k++) col.push(cB.r, cB.g, cB.b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

export class Shipwreck {
  constructor(ctx) {
    this.ctx = ctx;
    const scene = ctx.scene;
    this.lampLit = false;
    this.solved = false;
    const ground = terrainH(BOW.x + 12, BOW.z);
    const bowY = ground - 0.12;
    this.ship = new THREE.Group();
    this.ship.position.set(BOW.x, bowY, BOW.z);
    this.ship.rotation.z = PITCH;
    scene.add(this.ship);
    const w2 = (lx, ly = 0) => ({ x: BOW.x + lx * Math.cos(PITCH) - ly * Math.sin(PITCH), y: bowY + lx * Math.sin(PITCH) + ly * Math.cos(PITCH) });

    const hull = new THREE.Mesh(hullGeo(), toon(0xffffff, { vertexColors: true, side: THREE.DoubleSide }));
    hull.castShadow = hull.receiveShadow = true;
    this.ship.add(hull);
    const hullOutline = addOutline(hull, 0.06);
    hullOutline.material = hullOutline.material; // keep shared
    // deck planks
    const deckShape = new THREE.Shape();
    deckShape.moveTo(0, 0);
    for (let i = 0; i <= 20; i++) { const x = (i / 20) * L; deckShape.lineTo(x, halfWidth(x) - 0.05); }
    for (let i = 20; i >= 0; i--) { const x = (i / 20) * L; deckShape.lineTo(x, -halfWidth(x) + 0.05); }
    const deckGeo = new THREE.ShapeGeometry(deckShape);
    deckGeo.rotateX(Math.PI / 2);
    const deck = new THREE.Mesh(deckGeo, toon(0xa98258, { side: THREE.DoubleSide }));
    deck.position.y = 0.02;
    deck.receiveShadow = true;
    this.ship.add(deck);
    for (let z = -2; z <= 2; z += 0.5) {
      const seam = new THREE.Mesh(new THREE.BoxGeometry(L - 4, 0.02, 0.03), toon(0x6e5034));
      seam.position.set(L / 2 + 1.5, 0.035, z);
      this.ship.add(seam);
    }
    // quarterdeck
    const qd = new THREE.Mesh(new THREE.BoxGeometry(L - QD_X, QD_H, BEAM * 0.86), toon(0x8d6a47));
    qd.position.set(QD_X + (L - QD_X) / 2, QD_H / 2, 0);
    qd.castShadow = qd.receiveShadow = true;
    addOutline(qd, 0.04);
    this.ship.add(qd);
    const cabinDoor = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.0, 0.8), toon(0x3a2a1e));
    cabinDoor.position.set(QD_X - 0.02, 0.55, 1.4);
    this.ship.add(cabinDoor);
    // stair to quarterdeck
    const stairLen = 3.5;
    for (let i = 0; i < 6; i++) {
      const st = new THREE.Mesh(new THREE.BoxGeometry(stairLen / 6 + 0.02, 0.12, 1.5), toon(0x9c7650));
      st.position.set(QD_X - stairLen + (i + 0.5) * (stairLen / 6), ((i + 1) / 6) * QD_H - 0.06, -0.4);
      st.castShadow = true;
      this.ship.add(st);
    }
    // stern rail
    for (const zz of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(L - QD_X, 0.12, 0.12), toon(0x5a3b26));
      rail.position.set(QD_X + (L - QD_X) / 2, QD_H + 0.9, zz * (BEAM * 0.43));
      this.ship.add(rail);
    }
    // broken main mast + fallen mast into the trees
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 5, 8), toon(0x7a5638));
    mast.position.set(11, 2.5, 0);
    mast.castShadow = true;
    addOutline(mast, 0.03);
    this.ship.add(mast);
    const mw = w2(11);
    addCircle(mw.x, BOW.z, 0.45, mw.y - 1, mw.y + 5, { cam: true });
    const fallen = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 14, 8), toon(0x7a5638));
    fallen.castShadow = true;
    fallen.position.set(BOW.x + 13, bowY + 2.2, BOW.z - 6.5);
    fallen.rotation.set(0.25, 0.6, Math.PI / 2 - 0.2);
    scene.add(fallen);
    const sail = new THREE.Mesh(new THREE.PlaneGeometry(6, 4, 6, 4), toon(0xe6dcc4, { side: THREE.DoubleSide }));
    const sp = sail.geometry.attributes.position;
    for (let i = 0; i < sp.count; i++) sp.setZ(i, Math.sin(sp.getX(i) * 0.9) * 0.4 + Math.cos(sp.getY(i) * 1.3) * 0.3);
    sail.geometry.computeVertexNormals();
    sail.position.set(BOW.x + 12, bowY + 1.2, BOW.z - 8.5);
    sail.rotation.set(-1.1, 0.3, 0.2);
    sail.castShadow = true;
    scene.add(sail);
    addBox(BOW.x + 12, BOW.z - 7, 5, 2.2, 0.6, bowY - 2, bowY + 3);

    // walkable surfaces (world heights follow the pitched deck)
    const d0 = w2(0.6), d1 = w2(QD_X);
    addPlatform({ x: (d0.x + d1.x) / 2, z: BOW.z, hx: (d1.x - d0.x) / 2, hz: BEAM * 0.36, rot: 0, y0: d0.y + 0.02, y1: d1.y + 0.02, surface: 'wood' });
    const q0 = w2(QD_X, QD_H), q1 = w2(L - 0.3, QD_H);
    addPlatform({ x: (q0.x + q1.x) / 2, z: BOW.z, hx: (q1.x - q0.x) / 2, hz: BEAM * 0.4, rot: 0, y0: q0.y, y1: q1.y, surface: 'wood' });
    const s0 = w2(QD_X - stairLen), s1 = w2(QD_X, QD_H);
    addPlatform({ x: (s0.x + s1.x) / 2, z: BOW.z - 0.4, hx: (s1.x - s0.x) / 2, hz: 0.75, rot: 0, y0: s0.y + 0.02, y1: s1.y, surface: 'wood' });
    // hull blocks the camera
    const hc = w2(L / 2, -1.2);
    addBox(hc.x, BOW.z, L / 2, BEAM * 0.45, 0, hc.y - 2.5, hc.y + 0.9, { cam: true, block: false });
    // keep trees off the hull, the fallen mast and every beam corridor the puzzle needs
    addKeepOutSeg(BOW.x - 2, BOW.z, BOW.x + L + 1.5, BOW.z, 4.2);
    addKeepOut(BOW.x + 12, BOW.z - 7, 5.5);
    const corridor = [[68, 146, 76, 146], [76, 146, 76, 130], [76, 130, 92, 130], [92, 130, 92, 146], [76, 130, 60, 130]];
    for (const [ax, az, bx, bz] of corridor) addKeepOutSeg(ax, az, bx, bz, 1.8);
    for (const m of MIRRORS) addKeepOut(m.x, m.z, 3.2);
    addPath([[34.6, 142.7], [40, 144.5], [BOW.x - 1, BOW.z]]);
    addPath([[92, 140], [100, 125], [110, 100], [120, 75], [129.6, 49]]);

    // --- stern lamp ---
    const lampLocal = { x: L - 0.7, y: QD_H + 1.35 };
    const lw = w2(lampLocal.x, lampLocal.y);
    this.lampPos = new THREE.Vector3(lw.x, lw.y, BOW.z);
    const lamp = new THREE.Group();
    lamp.position.copy(this.lampPos);
    scene.add(lamp);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 1.4, 6), toon(0x3a3431));
    post.position.y = -0.7;
    lamp.add(post);
    const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.55, 0.9, 8, 1, true), toon(0x3a3431, { side: THREE.DoubleSide }));
    housing.rotation.z = Math.PI / 2;
    housing.position.x = 0.1;
    addOutline(housing, 0.03);
    lamp.add(housing);
    const back = new THREE.Mesh(new THREE.CircleGeometry(0.52, 12), toon(0xc9a24a));
    back.rotation.y = -Math.PI / 2;
    back.position.x = -0.35;
    lamp.add(back);
    this.lensMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.25, 0.3, 0.35), transparent: true, opacity: 0.7 });
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.5, 16), this.lensMat);
    lens.rotation.y = Math.PI / 2;
    lens.position.x = 0.56;
    lamp.add(lens);
    this.lampFire = new Fire({ height: 0.6, width: 0.4, embers: 8, emberHeight: 1.2, light: true, lightIntensity: 12, lightDistance: 18 });
    this.lampFire.group.position.set(0, -0.35, 0);
    lamp.add(this.lampFire.group);
    const qp = w2(L - 2.2, QD_H);
    ctx.register({ pos: new THREE.Vector3(qp.x, qp.y + 0.9, BOW.z), r: 2.4, promptY: 1.4, enabled: () => !this.lampLit, press: () => this.lightLamp(), id: 'sternlamp' });

    // --- ancient trees that block the light ---
    for (const b of BLOCKERS) {
      const y = terrainH(b.x, b.z);
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(b.r * 0.8, b.r * 1.15, 16, 10), toon(0x5c4030));
      trunk.position.set(b.x, y + 8, b.z);
      trunk.castShadow = trunk.receiveShadow = true;
      addOutline(trunk, 0.05);
      scene.add(trunk);
      for (let i = 0; i < 5; i++) {
        const root = new THREE.Mesh(new THREE.ConeGeometry(0.5, 3, 5), toon(0x5c4030));
        const a = (i / 5) * Math.PI * 2;
        root.position.set(b.x + Math.cos(a) * b.r, y + 0.3, b.z + Math.sin(a) * b.r);
        root.rotation.set(Math.sin(a) * 1.2, 0, -Math.cos(a) * 1.2);
        scene.add(root);
      }
      const canopy = new THREE.Group();
      canopy.position.set(b.x, y + 16, b.z);
      scene.add(canopy);
      for (let i = 0; i < 6; i++) {
        const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(3 + (i % 3), 1), toon(0x3f6e34));
        const a = i * 1.3;
        blob.position.set(Math.cos(a) * 3.5, (i % 2) * 2 - 0.5, Math.sin(a) * 3.5);
        blob.castShadow = true;
        canopy.add(blob);
      }
      addCircle(b.x, b.z, b.r + 0.2, y - 2, y + 18, { cam: true });
    }

    // --- mirrors ---
    this.mirrors = MIRRORS.map((m, i) => {
      const y = terrainH(m.x, m.z);
      const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 1.0, 9), toon(0x6b4a33));
      stump.position.set(m.x, y + 0.5, m.z);
      stump.castShadow = stump.receiveShadow = true;
      addOutline(stump, 0.03);
      scene.add(stump);
      const pivot = new THREE.Group();
      pivot.position.set(m.x, y + 1.0, m.z);
      scene.add(pivot);
      const fork = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.12, 0.2), toon(0x3a3431));
      fork.position.y = 0.1;
      pivot.add(fork);
      for (const s of [-1, 1]) {
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.1, 0.12), toon(0x3a3431));
        arm.position.set(s * 0.72, 0.65, 0);
        pivot.add(arm);
      }
      const frame = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.07, 6, 20), toon(0xb8893a));
      frame.position.y = 1.0;
      addOutline(frame, 0.02);
      pivot.add(frame);
      const faceMat = toon(0xe8d49a, { unique: true, emissive: new THREE.Color(0, 0, 0) });
      const face = new THREE.Mesh(new THREE.CircleGeometry(0.6, 20), faceMat);
      face.position.set(0, 1.0, 0.03);
      pivot.add(face);
      const backM = new THREE.Mesh(new THREE.CircleGeometry(0.6, 20), toon(0x4a3426));
      backM.rotation.y = Math.PI;
      backM.position.set(0, 1.0, -0.03);
      pivot.add(backM);
      // a little notch arrow on the rim shows which way the face points
      const nub = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.25, 4), toon(0xb8893a));
      nub.rotation.x = Math.PI / 2;
      nub.position.set(0, 1.7, 0.12);
      pivot.add(nub);
      addCircle(m.x, m.z, 0.75, y - 1, y + 2.4, { cam: false });
      const obj = { ...m, i, y, pivot, faceMat, angle: this.kAngle(m.k), center: new THREE.Vector3(m.x, y + 2.0, m.z), turning: 0 };
      pivot.rotation.y = Math.PI / 2 - obj.angle;
      ctx.register({ pos: new THREE.Vector3(m.x, y + 1.0, m.z), r: 2.8, promptY: 1.6, enabled: () => this.lampLit && !this.solved, press: () => this.turn(obj), id: 'mirror' + i });
      return obj;
    });

    // --- receiver lens on the beacon ---
    const ry = terrainH(RECEIVER.x, RECEIVER.z);
    this.recvMat = toon(0xc9a24a, { unique: true, emissive: new THREE.Color(0, 0, 0) });
    const recv = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.1, 6, 20), this.recvMat);
    recv.position.set(RECEIVER.x, ry + 2.0, RECEIVER.z - 0.95);
    addOutline(recv, 0.02);
    scene.add(recv);
    this.recvGlass = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 0.35, 0.4), transparent: true, opacity: 0.6 });
    const glass = new THREE.Mesh(new THREE.CircleGeometry(0.5, 16), this.recvGlass);
    glass.position.copy(recv.position);
    glass.rotation.y = Math.PI;
    scene.add(glass);
    this.recvPoint = recv.position.clone();

    // --- beam segments ---
    this.segs = [];
    const inner = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true);
    for (let i = 0; i < 10; i++) {
      const core = new THREE.Mesh(inner, new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 3.4, 1.6), fog: false }));
      const halo = new THREE.Mesh(inner, new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 0.5, 0.18), transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      core.visible = halo.visible = false;
      core.frustumCulled = halo.frustumCulled = false;
      scene.add(core);
      scene.add(halo);
      this.segs.push({ core, halo });
    }
    this.path = [];
    this.beamGrow = 0;
  }
  kAngle(k) { return (k * Math.PI) / 8; }
  treeBlockers() {
    if (!this._trees) this._trees = colliders.filter((c) => c.tree && c.x > 30 && c.x < 125 && c.z > 100 && c.z < 185);
    return this._trees;
  }
  lightLamp() {
    this.lampLit = true;
    this.beamGrow = 0;
    this.ctx.player.raiseLantern(1.8);
    this.ctx.audio.whoosh(this.lampPos, 0.7);
    this.ctx.spark(this.lampPos);
    this.ctx.save();
  }
  turn(m) {
    m.k = (m.k + 1) % 16;
    m.turning = 1;
    m.from = m.angle;
    m.to = this.kAngle(m.k);
    if (m.to < m.from) m.to += Math.PI * 2;
    this.ctx.audio.click(m.center, 0.7);
    this.ctx.audio.grind(m.center, 0.35);
    this.ctx.save();
  }
  trace() {
    const pts = [this.lampPos.clone().add(new THREE.Vector3(0.6, 0, 0))];
    let px = this.lampPos.x + 0.6, pz = this.lampPos.z, dx = 1, dz = 0;
    let lastY = this.lampPos.y;
    const hitMirrors = new Set();
    let reached = false;
    for (let bounce = 0; bounce < 9; bounce++) {
      let best = 70, hit = null;
      const test = (cx, cz, r, obj) => {
        const fx = px - cx, fz = pz - cz;
        const b = fx * dx + fz * dz;
        const c = fx * fx + fz * fz - r * r;
        const disc = b * b - c;
        if (disc < 0) return;
        const t = -b - Math.sqrt(disc);
        if (t > 0.05 && t < best) { best = t; hit = obj; }
      };
      for (const m of this.mirrors) if (!(m.turning > 0 && false)) test(m.x, m.z, 0.6, m);
      for (const b of BLOCKERS) test(b.x, b.z, b.r, b);
      for (const b of this.treeBlockers()) test(b.x, b.z, b.r, b);
      test(RECEIVER.x, RECEIVER.z, RECEIVER.r, RECEIVER);
      if (!hit) {
        pts.push(new THREE.Vector3(px + dx * best, lastY, pz + dz * best));
        break;
      }
      if (hit === RECEIVER) { pts.push(this.recvPoint.clone()); reached = true; break; }
      if (BLOCKERS.includes(hit) || hit.tree) {
        pts.push(new THREE.Vector3(px + dx * best, lastY, pz + dz * best));
        break;
      }
      // mirror: beam goes to its centre
      const m = hit;
      pts.push(m.center.clone());
      lastY = m.center.y;
      hitMirrors.add(m);
      if (m.turning > 0) break;
      const nx = Math.cos(m.angle), nz = Math.sin(m.angle);
      const dn = dx * nx + dz * nz;
      if (dn >= -0.01) break; // hit the wooden back
      dx = dx - 2 * dn * nx; dz = dz - 2 * dn * nz;
      const l = Math.hypot(dx, dz); dx /= l; dz /= l;
      // snap to 45 degree directions to keep the beam clean
      const ang = Math.round(Math.atan2(dz, dx) / (Math.PI / 4)) * (Math.PI / 4);
      dx = Math.cos(ang); dz = Math.sin(ang);
      px = m.x; pz = m.z;
    }
    return { pts, reached, hitMirrors };
  }
  update(dt, time, night) {
    this.lampFire.set(this.lampLit ? 1 : 0);
    this.lampFire.update(dt, night);
    this.lensMat.color.setRGB(this.lampLit ? 4 : 0.25, this.lampLit ? 2.6 : 0.3, this.lampLit ? 1.2 : 0.35);
    for (const m of this.mirrors) {
      if (m.turning > 0) {
        m.turning = Math.max(0, m.turning - dt / 0.35);
        const t = 1 - m.turning;
        m.angle = m.from + (m.to - m.from) * (t * t * (3 - 2 * t));
        if (m.turning === 0) m.angle = this.kAngle(m.k);
        m.pivot.rotation.y = Math.PI / 2 - m.angle;
      }
    }
    if (!this.lampLit) {
      for (const s of this.segs) s.core.visible = s.halo.visible = false;
      return;
    }
    const tr = this.trace();
    this.beamGrow = Math.min(1, this.beamGrow + dt * 1.5);
    // total length for grow animation
    let total = 0;
    for (let i = 1; i < tr.pts.length; i++) total += tr.pts[i].distanceTo(tr.pts[i - 1]);
    let budget = total * this.beamGrow;
    const up = new THREE.Vector3(0, 1, 0);
    const pulse = 1 + 0.1 * Math.sin(time * 6);
    for (let i = 0; i < this.segs.length; i++) {
      const s = this.segs[i];
      if (i >= tr.pts.length - 1 || budget <= 0) { s.core.visible = s.halo.visible = false; continue; }
      const a = tr.pts[i], b = tr.pts[i + 1];
      let len = a.distanceTo(b);
      const drawLen = Math.min(len, budget);
      budget -= len;
      const dir = b.clone().sub(a).normalize();
      const mid = a.clone().addScaledVector(dir, drawLen / 2);
      for (const [mesh, r] of [[s.core, 0.05], [s.halo, 0.22 * pulse]]) {
        mesh.visible = true;
        mesh.position.copy(mid);
        mesh.quaternion.setFromUnitVectors(up, dir);
        mesh.scale.set(r, drawLen, r);
      }
      s.halo.material.opacity = 0.25 + night * 0.25;
    }
    for (const m of this.mirrors) {
      const lit = tr.hitMirrors.has(m) ? 1 : 0;
      m.faceMat.emissive.setRGB(lit * 1.6, lit * 1.1, lit * 0.5);
    }
    const r = tr.reached && this.beamGrow >= 1 ? 1 : 0;
    this.recvMat.emissive.setRGB(r * 1.5, r * 0.9, r * 0.3);
    this.recvGlass.color.setRGB(0.3 + r * 4, 0.35 + r * 2.6, 0.4 + r * 1.0);
    if (tr.reached && this.beamGrow >= 1 && !this.solved) {
      this.solved = true;
      this.ctx.audio.success(this.recvPoint);
      this.ctx.game.primeBeacon(2);
      this.ctx.save();
    }
  }
  hint() {
    if (this.solved) return null;
    if (!this.lampLit) return this.lampPos.clone();
    for (const m of this.mirrors) {
      if (m.correct >= 0 && m.k !== m.correct) return m.center.clone();
    }
    return null;
  }
  getState() { return { lamp: this.lampLit, solved: this.solved, ks: this.mirrors.map((m) => m.k) }; }
  setState(s) {
    if (!s) return;
    this.lampLit = !!s.lamp;
    this.solved = !!s.solved;
    if (this.lampLit) this.beamGrow = 1;
    if (Array.isArray(s.ks)) this.mirrors.forEach((m, i) => {
      m.k = (s.ks[i] | 0) % 16;
      m.angle = this.kAngle(m.k);
      m.pivot.rotation.y = Math.PI / 2 - m.angle;
    });
  }
}
