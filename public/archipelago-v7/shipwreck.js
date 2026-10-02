// Shipwreck beached in the forest. Brass prisms on posts each click between three carved grooves, each groove
// aimed at something. The ship's stern lamp is aimed at the first prism. The beam only appears once the route
// is set AND the lamp has been lit (two kinds of step); a wrong route gutters the lamp, which must cool.
// A small candle-and-two-prisms version in a glade teaches it.
import * as THREE from './three.module.min.js';
import { GeoBuilder, mat, makeStaticMesh, sceneryMat, mulberry32, clamp } from './util.js';
import { ISL, SPOT } from './layout.js';
import { groundAt } from './terrain.js';
import { addCircle, addBox, addPlatform } from './colliders.js';
import { exclude, excludeSegment } from './foliage.js';
import { addBrazier, Fire } from './fire.js';

const S = ISL.S;
const LW = (lx, lz) => [S.x + lx, S.z + lz];
const WARM = 3.0, COOL = 7.0, TUT_COOL = 3.0;

export class Shipwreck {
  constructor(ctx) {
    this.ctx = ctx;
    const b = new GeoBuilder({ seed: 41 });
    const rng = mulberry32(41);
    this.areas = [{ x: S.x + 4, z: S.z + 2, r: 20 }, { x: S.x - 16.5, z: S.z - 16, r: 6 }];

    // ---- the ship
    const shipC = LW(4, 8);
    const al = 0.3, ax = Math.cos(al), az = Math.sin(al);
    const px = -az, pz = ax; // port side direction
    const SP = (u, v) => [shipC[0] + ax * u + px * v, shipC[1] + az * u + pz * v];
    const gy = groundAt(shipC[0], shipC[1]);
    const deck = gy + 2.1;
    this.deckY = deck;
    const hullCol = ['#6b4a30', '#7d5838', '#5f412a'];
    for (let u = -10; u < 10; u += 1.0) {
      const w = 3.0 * Math.sqrt(Math.max(0.05, 1 - Math.pow((u + 1) / 11.5, 2)));
      const [x, z] = SP(u + 0.5, 0);
      for (let k = 0; k < 4; k++) {
        const hy = gy - 0.7 + k * 0.72;
        const ww = w * (0.72 + k * 0.1);
        b.box(1.04, 0.7, ww * 2, mat(x, hy + 0.35, z, 0.0, -al, 0.04), hullCol[(((k + Math.floor(u)) % 3) + 3) % 3], { jitter: 0.08 });
      }
      b.box(1.0, 0.12, w * 1.9, mat(x, deck - 0.06, z, 0, -al, 0), u % 2 ? '#a07a52' : '#94704a');
      // rails
      for (const sd of [-1, 1]) {
        const [rx, rz] = SP(u + 0.5, sd * w * 0.95);
        b.box(1.0, 0.5, 0.12, mat(rx, deck + 0.25, rz, 0, -al, 0), '#5a3d26');
      }
      // barnacles low on the hull
      if (rng() < 0.7) for (let k = 0; k < 4; k++) {
        const [bx, bz] = SP(u + rng(), (rng() < 0.5 ? -1 : 1) * w * 0.75);
        b.cyl(0.02, 0.1, 0.12, 5, mat(bx, gy - 0.2 + rng() * 0.8, bz, rng(), 0, rng()), '#ddd6c4', { flat: true });
      }
    }
    // bowsprit, stern castle, broken main mast, rigging scraps
    {
      const [x, z] = SP(11.5, 0);
      b.cyl(0.12, 0.2, 4.5, 6, mat(x, deck + 0.9, z, 0, -al, -1.25), '#5a4030');
      const [sx, sz] = SP(-8, 0);
      b.box(3.6, 1.6, 5.0, mat(sx, deck + 0.8, sz, 0, -al, 0), '#7d5838', { top: '#94704a' });
      const [mx, mz] = SP(1.5, 0);
      b.cyl(0.32, 0.38, 6.5, 8, mat(mx, deck + 3.2, mz, 0.08, 0, 0.12), '#6a4a30');
      b.box(3.6, 0.18, 0.18, mat(mx + 0.2, deck + 5.2, mz, 0, -al + 1.5, 0.1), '#5a3d26');
      b.box(1.8, 2.4, 0.04, mat(mx + 0.6, deck + 3.8, mz + 0.5, 0.1, -al + 1.4, 0.2), '#d9cfb4');
    }
    this.sternTop = deck + 1.6;
    // deck & stern castle walkable, hull blocks
    { const [dx, dz] = SP(-1.5, 0); addPlatform(dx, dz, 7, 2.3, al, deck, deck, 'wood'); }
    {
      const [sx, sz] = SP(-8, 0);
      addBox(sx, sz, 1.8, 2.5, al, deck - 0.5, deck + 1.6);
    }
    addBox(shipC[0], shipC[1], 10.2, 3.1, al, gy - 3, deck - 0.1);
    // gangplank on the port side
    {
      const [x0, z0] = SP(-3, 3.0 + 6.2);
      const [x1, z1] = SP(-3, 3.0);
      const g0 = groundAt(x0, z0);
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      const ang = Math.atan2(z1 - z0, x1 - x0);
      addPlatform(cx, cz, 3.1, 0.75, ang, g0 + 0.05, deck, 'wood');
      for (let i = 0; i < 10; i++) {
        const t = (i + 0.5) / 10;
        b.box(0.64, 0.1, 1.5, mat(x0 + (x1 - x0) * t, g0 + (deck - g0) * t - 0.02, z0 + (z1 - z0) * t, 0, -ang, Math.atan2(deck - g0, 6.2)), '#9a7550');
      }
      excludeSegment(x0, z0, x1, z1, 2.5);
    }
    exclude(shipC[0], shipC[1], 11);
    exclude(...SP(8, 0), 6);
    exclude(...SP(-8, 0), 6);

    // ---- nodes
    const lampXZ = SP(-8.3, 0.0);
    const N = {
      lamp: { p: new THREE.Vector3(lampXZ[0], this.sternTop + 1.0, lampXZ[1]) },
      A: { xz: LW(-12, -6) }, B: { xz: LW(2, -12) }, C: { xz: LW(16, -8) }, D: { xz: LW(20, 18) }, E: { xz: LW(-14, 12) },
      lens: { xz: LW(23.6, -3.6) },
      T0: { xz: LW(-20, -17) }, T1: { xz: LW(-16, -20) }, T2: { xz: LW(-12.8, -15.6) }, T3: { xz: LW(-16.6, -12.6) },
    };
    for (const k in N) if (N[k].xz) N[k].p = new THREE.Vector3(N[k].xz[0], groundAt(N[k].xz[0], N[k].xz[1]) + (k.startsWith('T') ? 0.9 : 1.6), N[k].xz[1]);
    this.N = N;
    // decoy aim points (things you can see: a stump, a rock)
    const pt = (lx, lz, h = 1.2) => { const [x, z] = LW(lx, lz); return { p: new THREE.Vector3(x, groundAt(x, z) + h, z), decoy: true }; };
    const decoyT1a = pt(-12, -24, 0.6), decoyT1b = pt(-20.5, -23, 0.6), decoyT2 = pt(-8.6, -14.2, 0.6);
    // prisms: options are node keys or decoy points; cur = starting groove
    this.prisms = [
      { key: 'A', opts: ['D', 'B', 'E'], cur: 0 },
      { key: 'B', opts: ['A', 'E', 'C'], cur: 0 },
      { key: 'C', opts: ['lens', 'B', 'D'], cur: 2 },
      { key: 'D', opts: ['lens', 'A', 'E'], cur: 1 },
      { key: 'E', opts: ['A', 'B', 'D'], cur: 2 },
      { key: 'T1', opts: [decoyT1a, 'T2', decoyT1b], cur: 0, tut: true },
      { key: 'T2', opts: [decoyT2, 'T3', 'T1'], cur: 0, tut: true },
    ];
    // sightlines blocked by the hull, the fallen mast and the boulder (both directions)
    this.blocked = new Set(['A-D', 'D-A', 'D-lens', 'E-B', 'B-E']);
    const target = (o) => (typeof o === 'string' ? N[o].p : o.p);
    for (const pr of this.prisms) {
      const p = N[pr.key].p;
      const s = pr.tut ? 0.6 : 1;
      const gy2 = p.y - (pr.tut ? 0.9 : 1.6);
      b.cyl(0.75 * s, 0.85 * s, 0.25, 10, mat(p.x, gy2 + 0.12, p.z), '#8e877b', { flat: true });
      b.cyl(0.16 * s, 0.22 * s, p.y - gy2 - 0.25, 6, mat(p.x, (p.y + gy2) / 2 - 0.1, p.z), '#7a6a52');
      // carved grooves, one per option, aimed at what it would send light to
      for (const o of pr.opts) {
        const t = target(o);
        const a = Math.atan2(t.z - p.z, t.x - p.x);
        b.box(0.62 * s, 0.05, 0.1 * s, mat(p.x + Math.cos(a) * 0.4 * s, gy2 + 0.26, p.z + Math.sin(a) * 0.4 * s, 0, -a, 0), '#2e2a24');
        b.box(0.1 * s, 0.08, 0.1 * s, mat(p.x + Math.cos(a) * 0.74 * s, gy2 + 0.28, p.z + Math.sin(a) * 0.74 * s, 0, -a, 0), '#c9a646');
      }
      addCircle(p.x, p.z, 0.8 * s, gy2 - 1, p.y + 0.4, { cam: false });
      exclude(p.x, p.z, 3.5);
      pr.pos = p;
      pr.shown = Math.atan2(target(pr.opts[pr.cur]).x - p.x, target(pr.opts[pr.cur]).z - p.z);
    }
    // keep every sightline between nodes free of trees
    const all = ['lamp', 'A', 'B', 'C', 'D', 'E', 'lens'];
    for (const a of all) for (const c of all) if (a < c) excludeSegment(N[a].p.x, N[a].p.z, N[c].p.x, N[c].p.z, 2.2);
    for (const a of ['T0', 'T1', 'T2', 'T3']) for (const c of ['T0', 'T1', 'T2', 'T3']) if (a < c) excludeSegment(N[a].p.x, N[a].p.z, N[c].p.x, N[c].p.z, 1.5);
    exclude(S.x - 16.5, S.z - 16.5, 6);
    // decoy props
    for (const d of [decoyT1a, decoyT1b, decoyT2]) {
      b.cyl(0.35, 0.45, 0.8, 7, mat(d.p.x, d.p.y - 0.2, d.p.z), '#6b4a32', { flat: true, top: '#c9a57a' });
      addCircle(d.p.x, d.p.z, 0.5, d.p.y - 2, d.p.y + 0.3, { cam: false });
    }
    // blockers: the fallen fore-mast across D->lens, and a barnacled boulder across E->B
    {
      const D = N.D.p, Ls = N.lens.p;
      const mx = D.x + (Ls.x - D.x) * 0.5, mz = D.z + (Ls.z - D.z) * 0.5;
      const ang = Math.atan2(Ls.z - D.z, Ls.x - D.x) + Math.PI / 2;
      const my = groundAt(mx, mz);
      b.cyl(0.38, 0.42, 7.5, 8, mat(mx, my + 1.6, mz, 0, -ang, Math.PI / 2 + 0.06), '#6a4a30');
      b.ico(1.1, 0, mat(mx + Math.cos(ang) * 2.2, my + 0.5, mz + Math.sin(ang) * 2.2), '#7d786e');
      b.ico(0.9, 0, mat(mx - Math.cos(ang) * 2.6, my + 0.4, mz - Math.sin(ang) * 2.6), '#857f74');
      b.box(1.6, 2.0, 0.05, mat(mx, my + 1.6, mz, 0.2, -ang + 0.3, 0.1), '#cfc4a6');
      addBox(mx, mz, 3.8, 0.6, ang, my - 1, my + 2.2);
      const E = N.E.p, Bp = N.B.p;
      const bx = E.x + (Bp.x - E.x) * 0.3, bz = E.z + (Bp.z - E.z) * 0.3;
      const by = groundAt(bx, bz);
      b.ico(2.0, 1, mat(bx, by + 1.1, bz, 0.3, 0.5, 0, 1.0, 1.25, 1.0), '#8a8478', { jitter: 0.15 });
      for (let k = 0; k < 16; k++) {
        const a = rng() * Math.PI * 2;
        b.cyl(0.02, 0.12, 0.14, 5, mat(bx + Math.cos(a) * 1.8, by + 0.3 + rng(), bz + Math.sin(a) * 1.8, rng(), 0, rng()), '#e0d9c6', { flat: true });
      }
      addCircle(bx, bz, 2.0, by - 1, by + 3.5);
      exclude(bx, bz, 3);
    }
    // stern lamp: post + housing + sight tube aimed at prism A
    {
      const L = N.lamp.p;
      b.box(0.2, 1.0, 0.2, mat(L.x, L.y - 0.75, L.z), '#4a3a2c');
      b.box(0.5, 0.06, 0.5, mat(L.x, L.y - 0.25, L.z), '#3a3028');
      b.box(0.5, 0.06, 0.5, mat(L.x, L.y + 0.42, L.z), '#3a3028');
      for (const [dx, dz] of [[0.22, 0.22], [-0.22, 0.22], [0.22, -0.22], [-0.22, -0.22]]) b.box(0.05, 0.66, 0.05, mat(L.x + dx, L.y + 0.08, L.z + dz), '#3a3028');
      const A = N.A.p;
      const yaw = Math.atan2(A.x - L.x, A.z - L.z);
      const pitch = Math.atan2(L.y - A.y, Math.hypot(A.x - L.x, A.z - L.z));
      b.cyl(0.1, 0.13, 1.0, 8, new THREE.Matrix4().makeTranslation(L.x, L.y, L.z).multiply(new THREE.Matrix4().makeRotationY(yaw)).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2 + pitch)).multiply(new THREE.Matrix4().makeTranslation(0, 0.6, 0)), '#b98d3e', {});
      this.lampFire = new Fire(ctx.scene, L.clone().add(new THREE.Vector3(0, -0.2, 0)), { scale: 0.22, embers: 12 });
    }
    // lens by the beacon, tutorial candle and lens
    {
      const Lp = N.lens.p;
      b.cyl(0.25, 0.35, 1.4, 8, mat(Lp.x, Lp.y - 0.9, Lp.z), '#8e877b', { flat: true });
      addCircle(Lp.x, Lp.z, 0.5, Lp.y - 3, Lp.y + 0.5, { cam: false });
      const T0 = N.T0.p, T3 = N.T3.p;
      b.cyl(0.4, 0.5, 0.6, 8, mat(T0.x, T0.y - 0.8, T0.z), '#6b4a32', { flat: true, top: '#c9a57a' });
      b.cyl(0.07, 0.07, 0.3, 8, mat(T0.x, T0.y - 0.38, T0.z), '#efe6cf');
      b.cyl(0.18, 0.25, 0.9, 8, mat(T3.x, T3.y - 0.55, T3.z), '#8e877b', { flat: true });
      // candle's little hood points at T1
      const T1 = N.T1.p;
      const yaw = Math.atan2(T1.x - T0.x, T1.z - T0.z);
      b.cyl(0.06, 0.08, 0.5, 6, new THREE.Matrix4().makeTranslation(T0.x, T0.y - 0.15, T0.z).multiply(new THREE.Matrix4().makeRotationY(yaw)).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2)).multiply(new THREE.Matrix4().makeTranslation(0, 0.3, 0)), '#b98d3e', {});
      addCircle(T0.x, T0.z, 0.5, T0.y - 2, T0.y, { cam: false });
      this.candleFire = new Fire(ctx.scene, T0.clone().add(new THREE.Vector3(0, -0.22, 0)), { scale: 0.12, embers: 6 });
    }
    // crystal lenses (main + tutorial), glow when struck
    this.lensMeshes = [N.lens.p, N.T3.p].map((p, i) => {
      const m = new THREE.Mesh(new THREE.OctahedronGeometry(i ? 0.22 : 0.4), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 0.5, 0.6) }));
      m.position.copy(p);
      ctx.scene.add(m);
      return m;
    });
    // prism heads (instanced)
    const hb = new GeoBuilder();
    hb.box(0.5, 0.42, 0.62, mat(0, 0, 0), '#b98d3e');
    hb.cyl(0.14, 0.17, 0.5, 8, mat(0, 0.02, 0.5, Math.PI / 2, 0, 0), '#8c6a32', {});
    hb.cyl(0.12, 0.12, 0.04, 8, mat(0, 0.02, 0.76, Math.PI / 2, 0, 0), '#bfe8f0', {});
    hb.box(0.56, 0.06, 0.68, mat(0, 0.24, 0), '#6a4a22');
    this.heads = new THREE.InstancedMesh(hb.build(), sceneryMat(), this.prisms.length);
    this.heads.castShadow = true;
    ctx.scene.add(this.heads);
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(); this._up = new THREE.Vector3(0, 1, 0);

    // ---- beacon
    const [bx, bz] = LW(26.6, -1.0);
    const by = groundAt(bx, bz);
    this.fireY = addBrazier(b, bx, by, bz, true);
    this.beaconPos = new THREE.Vector3(bx, this.fireY, bz);
    addCircle(bx, bz, 1.1, by - 1, by + 4);
    exclude(bx, bz, 4);

    this.static = makeStaticMesh(b);
    ctx.scene.add(this.static);

    this.lamp = { state: 'idle', t: 0 }; // idle | warm | lit | sputter | cool
    this.candle = { state: 'idle', t: 0 };
    this.solved = false; this.tSolved = false;
    this.target = target;
  }

  interactables() {
    const out = [];
    this.prisms.forEach((pr) => out.push({
      pos: pr.pos.clone().add(new THREE.Vector3(0, 0.3, 0)), r: pr.tut ? 1.3 : 1.8,
      can: () => (pr.tut ? !this.tSolved && this.candle.state === 'idle' : !this.solved && this.lamp.state === 'idle'),
      use: () => this.click(pr),
    }));
    out.push({ pos: this.N.lamp.p, r: 3.0, lights: true, can: () => !this.solved && this.lamp.state === 'idle', use: () => this.lightLamp(false) });
    out.push({ pos: this.N.T0.p, r: 1.4, lights: true, can: () => !this.tSolved && this.candle.state === 'idle', use: () => this.lightLamp(true) });
    return out;
  }

  click(pr) {
    pr.cur = (pr.cur + 1) % pr.opts.length;
    this.ctx.audio.click(pr.pos, 1.3);
    this.ctx.save();
  }

  lightLamp(tut) {
    const L = tut ? this.candle : this.lamp;
    L.state = 'warm'; L.t = 0;
    this.ctx.audio.ignite(tut ? this.N.T0.p : this.N.lamp.p);
  }

  // follow the route from the lamp; returns list of points if it reaches the lens
  route(tut) {
    const N = this.N;
    let from = tut ? 'T0' : 'lamp';
    let cur = tut ? 'T1' : 'A';
    const goal = tut ? 'T3' : 'lens';
    const pts = [N[from].p];
    const seen = new Set();
    for (let i = 0; i < 10; i++) {
      if (this.blocked.has(`${from}-${cur}`)) return null;
      pts.push(N[cur].p);
      if (cur === goal) return pts;
      if (seen.has(cur)) return null;
      seen.add(cur);
      const pr = this.prisms.find((p) => p.key === cur);
      if (!pr) return null;
      const o = pr.opts[pr.cur];
      if (typeof o !== 'string') return null;
      from = cur; cur = o;
    }
    return null;
  }

  update(dt, time, night) {
    const A = this.ctx.audio;
    for (const tut of [false, true]) {
      const L = tut ? this.candle : this.lamp;
      const fire = tut ? this.candleFire : this.lampFire;
      L.t += dt;
      let level = 0;
      if (L.state === 'warm') {
        level = Math.min(1, L.t / WARM) * 0.9 + 0.1;
        if (L.t >= (tut ? 1.5 : WARM)) {
          const pts = this.route(tut);
          if (pts) {
            L.state = 'lit'; L.t = 0;
            for (let i = 0; i < pts.length - 1; i++) this.ctx.beams.set(`${tut ? 't' : 'm'}beam${i}`, pts[i], pts[i + 1], tut ? 0.04 : 0.07, 0);
            this.beamPts = this.beamPts || {};
            this.beamPts[tut ? 't' : 'm'] = pts.length - 1;
            A.chime(tut ? 880 : 587, pts[pts.length - 1], 0.3);
            if (tut) this.tSolved = true;
            else {
              this.solved = true;
              setTimeout(() => this.ctx.onSolved([this.N.lens.p]), 1200);
            }
            this.ctx.save();
          } else {
            L.state = 'sputter'; L.t = 0;
            A.sputter(tut ? this.N.T0.p : this.N.lamp.p);
          }
        }
      } else if (L.state === 'lit') level = 1;
      else if (L.state === 'sputter') {
        level = Math.max(0, 1 - L.t / 1.2) * (0.5 + 0.5 * Math.sin(L.t * 40));
        if (L.t > 1.2) { L.state = 'cool'; L.t = 0; }
      } else if (L.state === 'cool') {
        if (L.t > (tut ? TUT_COOL : COOL)) { L.state = 'idle'; L.t = 0; }
      }
      fire.setIntensity(level, night);
      // beams grow along the route one segment after another
      if (L.state === 'lit') {
        const pre = tut ? 't' : 'm';
        const n = (this.beamPts && this.beamPts[pre]) || 0;
        for (let i = 0; i < n; i++) {
          const it = this.ctx.beams.items.find((x) => x.id === `${pre}beam${i}`);
          if (it) it.grow = clamp(L.t * 2.2 - i, 0, 1);
        }
      }
    }
    // lenses: dim, or blazing when struck
    for (let i = 0; i < 2; i++) {
      const on = i ? this.tSolved : this.solved;
      const g = on ? 4 + Math.sin(time * 5) : 0.35 + night * 0.3;
      this.lensMeshes[i].material.color.setRGB(g * 0.7, g * 0.95, g * 1.1);
      this.lensMeshes[i].rotation.y += dt * (on ? 2 : 0.3);
    }
    // cooling wick glows red through the lamp housing
    const cool = this.lamp.state === 'cool' ? 1 - this.lamp.t / COOL : 0;
    if (cool > 0) { this.lampFire.setIntensity(0.12 * cool, night); }
    // prism heads rotate to their current groove
    this.prisms.forEach((pr, i) => {
      const t = this.target(pr.opts[pr.cur]);
      const want = Math.atan2(t.x - pr.pos.x, t.z - pr.pos.z);
      let d = want - pr.shown; d = Math.atan2(Math.sin(d), Math.cos(d));
      pr.shown += d * (1 - Math.exp(-dt * 10));
      this._q.setFromAxisAngle(this._up, pr.shown);
      const s = pr.tut ? 0.6 : 1;
      this._m.compose(pr.pos, this._q, this._s.set(s, s, s));
      this.heads.setMatrixAt(i, this._m);
    });
    this.heads.instanceMatrix.needsUpdate = true;
  }

  getState() { return { cur: this.prisms.map((p) => p.cur), solved: this.solved, tSolved: this.tSolved }; }
  setState(s) {
    if (!s) return;
    (s.cur || []).forEach((c, i) => { if (this.prisms[i]) { this.prisms[i].cur = c; const t = this.target(this.prisms[i].opts[c]); this.prisms[i].shown = Math.atan2(t.x - this.prisms[i].pos.x, t.z - this.prisms[i].pos.z); } });
    this.solved = !!s.solved; this.tSolved = !!s.tSolved;
    for (const tut of [false, true]) {
      if (tut ? this.tSolved : this.solved) {
        const L = tut ? this.candle : this.lamp;
        const pts = this.route(tut);
        if (pts) {
          L.state = 'lit'; L.t = 10;
          for (let i = 0; i < pts.length - 1; i++) this.ctx.beams.set(`${tut ? 't' : 'm'}beam${i}`, pts[i], pts[i + 1], tut ? 0.04 : 0.07, 1);
          this.beamPts = this.beamPts || {};
          this.beamPts[tut ? 't' : 'm'] = pts.length - 1;
        }
      }
    }
  }
}
