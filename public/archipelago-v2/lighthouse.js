// The great lighthouse: hard-edged red and white bands. Four brass sighting tubes stand around it.
// By now four beacons burn across the dark sea: sight each tube on one of them and their light is
// gathered into the tower. Then light the fuse at the door; the flame climbs to the lamp.
import * as THREE from './three.module.min.js';
import { toon, addOutline, makeGlow } from './util.js';
import { Fire } from './fire.js';
import { terrainH, addCircle, addKeepOut, addPath } from './world.js';
import { wrapAngle } from './math.js';

export const TOWER = { x: 60, z: -133 };
const deg = (d) => (d * Math.PI) / 180;
const TUBE_ANG = [45, 135, 225, 315];
const TUBE_INIT = [deg(200), deg(20), deg(300), deg(120)];
const TOL = deg(7);

export class Lighthouse {
  constructor(ctx) {
    this.ctx = ctx;
    const scene = ctx.scene;
    const base = terrainH(TOWER.x, TOWER.z);
    this.baseY = base;
    this.solved = false;
    this.stage = 'dark'; // dark -> climbing -> lit
    this.climbT = 0;
    const white = toon(0xf4f0e6), red = toon(0xc92f26), stone = toon(0xa39b8e), dark = toon(0x262a30);
    const g = (this.group = new THREE.Group());
    g.position.set(TOWER.x, base, TOWER.z);
    scene.add(g);
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(5.3, 5.8, 1.3, 8), stone);
    plinth.position.y = 0.55;
    plinth.castShadow = plinth.receiveShadow = true;
    addOutline(plinth, 0.05);
    g.add(plinth);
    const bands = 6, bh = 4.6, r0 = 4.3, r1 = 3.1;
    let y = 1.2;
    this.windows = [];
    for (let i = 0; i < bands; i++) {
      const ra = r0 + (r1 - r0) * (i / bands), rb = r0 + (r1 - r0) * ((i + 1) / bands);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(rb, ra, bh, 40, 1), i % 2 === 0 ? white : red);
      m.position.y = y + bh / 2;
      m.castShadow = m.receiveShadow = true;
      addOutline(m, 0.06);
      g.add(m);
      // a small window on each band, spiralling up
      const wa = deg(90 + i * 62);
      const wr = (ra + rb) / 2 + 0.02;
      const win = new THREE.Group();
      win.position.set(Math.cos(wa) * wr, y + bh * 0.55, Math.sin(wa) * wr);
      win.rotation.y = -wa + Math.PI / 2;
      g.add(win);
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1.1), new THREE.MeshBasicMaterial({ color: 0x1c2230 }));
      win.add(pane);
      const fire = new Fire({ height: 0.8, width: 0.55, embers: 0, layers: [{ x: 0, z: 0, s: 1, seed: i * 3.1 }] });
      fire.group.position.set(0, -0.45, 0.1);
      win.add(fire.group);
      this.windows.push({ pane, fire });
      y += bh;
    }
    this.topY = base + y;
    // door
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.6, 0.3), dark);
    door.position.set(0, 1.2 + 1.3, r0 - 0.05);
    g.add(door);
    const arch = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.14, 6, 12, Math.PI), stone);
    arch.position.set(0, 2.5 + 0.1, r0 + 0.05);
    g.add(arch);
    // gallery + lantern room
    const gal = new THREE.Mesh(new THREE.CylinderGeometry(4.1, 3.4, 0.5, 32), dark);
    gal.position.y = y + 0.25;
    gal.castShadow = true;
    g.add(gal);
    const rail = new THREE.Mesh(new THREE.TorusGeometry(4.0, 0.06, 4, 40), dark);
    rail.rotation.x = Math.PI / 2;
    rail.position.y = y + 1.4;
    g.add(rail);
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.9, 0.06), dark);
      p.position.set(Math.cos(a) * 4.0, y + 0.95, Math.sin(a) * 4.0);
      g.add(p);
    }
    this.glassMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.12, 0.16, 0.22), transparent: true, opacity: 0.75 });
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.3, 3.4, 16, 1, true), this.glassMat);
    glass.position.y = y + 0.5 + 1.7;
    g.add(glass);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const mu = new THREE.Mesh(new THREE.BoxGeometry(0.1, 3.4, 0.1), dark);
      mu.position.set(Math.cos(a) * 2.32, y + 2.2, Math.sin(a) * 2.32);
      g.add(mu);
    }
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.9, 2.2, 16), red);
    roof.position.y = y + 3.9 + 1.1;
    roof.castShadow = true;
    addOutline(roof, 0.05);
    g.add(roof);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), dark);
    ball.position.y = y + 6.3;
    g.add(ball);
    this.lampLocalY = y + 1.2;
    this.lampPos = new THREE.Vector3(TOWER.x, base + y + 2.2, TOWER.z);
    this.lamp = new Fire({ height: 2.2, width: 1.5, embers: 40, emberHeight: 4, emberSize: 0.1, light: true, lightIntensity: 160, lightDistance: 160, lightDecay: 1.0, glow: true, glowSize: 26, glowIntensity: 1.3 });
    this.lamp.group.position.y = this.lampLocalY;
    g.add(this.lamp.group);
    // rotating beams
    this.beams = new THREE.Group();
    this.beams.position.y = y + 2.2;
    g.add(this.beams);
    const beamMat = new THREE.ShaderMaterial({
      uniforms: { uAlpha: { value: 0 } },
      vertexShader: `varying float vT; varying vec3 vN; varying vec3 vV;
        void main(){ vT = uv.y; vec4 wp = modelMatrix*vec4(position,1.0); vN = normalize(mat3(modelMatrix)*normal); vV = normalize(cameraPosition - wp.xyz); gl_Position = projectionMatrix*viewMatrix*wp; }`,
      fragmentShader: `uniform float uAlpha; varying float vT; varying vec3 vN; varying vec3 vV;
        void main(){ float edge = abs(dot(normalize(vN), normalize(vV))); float a = pow(vT, 1.6) * uAlpha * (0.25 + 0.75*edge);
          gl_FragColor = vec4(vec3(1.0, 0.85, 0.55) * a * 1.4, a); }`,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
    });
    this.beamMat = beamMat;
    for (const s of [0, Math.PI]) {
      const cg = new THREE.CylinderGeometry(0.6, 9, 120, 24, 1, true);
      cg.translate(0, -60, 0);
      cg.rotateZ(Math.PI / 2);
      const cm = new THREE.Mesh(cg, beamMat);
      cm.rotation.y = s;
      cm.frustumCulled = false;
      this.beams.add(cm);
    }
    this.beams.visible = false;
    addCircle(TOWER.x, TOWER.z, 5.6, base - 2, base + 60, { cam: true });
    addKeepOut(TOWER.x, TOWER.z + 3, 17);

    // sighting tubes
    this.tubes = TUBE_ANG.map((a, i) => {
      const ar = deg(a);
      const px = TOWER.x + Math.cos(ar) * 9.5, pz = TOWER.z + Math.sin(ar) * 9.5;
      const py = terrainH(px, pz);
      const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.6, 1.1, 8), stone);
      ped.position.set(px, py + 0.55, pz);
      ped.castShadow = ped.receiveShadow = true;
      addOutline(ped, 0.03);
      scene.add(ped);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.04, 4, 24), toon(0xc9a24a));
      ring.rotation.x = Math.PI / 2;
      ring.position.set(px, py + 1.1, pz);
      scene.add(ring);
      const yoke = new THREE.Group();
      yoke.position.set(px, py + 1.15, pz);
      scene.add(yoke);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.5, 0.5), toon(0x3a3431));
      arm.position.y = 0.25;
      yoke.add(arm);
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.12, 2.6, 12), toon(0xc9a24a));
      tube.rotation.z = -Math.PI / 2 + deg(3);
      tube.position.set(0.3, 0.55, 0);
      tube.castShadow = true;
      addOutline(tube, 0.02);
      yoke.add(tube);
      for (const x of [-0.95, 1.55]) {
        const sr = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.03, 4, 12), toon(0x8a6a2a));
        sr.rotation.y = Math.PI / 2;
        sr.position.set(x, 0.55 + (x - 0.3) * Math.tan(deg(3)), 0);
        yoke.add(sr);
      }
      const lensMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 0.25, 0.3) });
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.15, 12), lensMat);
      lens.rotation.y = Math.PI / 2;
      lens.position.set(1.61, 0.62, 0);
      yoke.add(lens);
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 6), toon(0x3a3431));
      handle.position.set(-1.05, 0.35, 0);
      yoke.add(handle);
      addCircle(px, pz, 0.6, py - 1, py + 1.6);
      const t = { i, px, py, pz, yoke, az: TUBE_INIT[i], dir: -1, holdT: 0, lensMat, ip: new THREE.Vector3() };
      ctx.register({
        pos: t.ip, r: 1.9, promptY: 1.2,
        enabled: () => !this.solved,
        press: () => { t.dir = -t.dir; t.holdT = 0; },
        hold: (dt) => this.turnTube(t, dt),
        id: 'tube' + i,
      });
      this.poseTube(t);
      return t;
    });
    addPath([[79.1, -103.2], [70, -115], [62, -126]]);
  }
  poseTube(t) {
    t.yoke.rotation.y = -t.az;
    t.ip.set(t.px - Math.cos(t.az) * 1.6, t.py + 1.0, t.pz - Math.sin(t.az) * 1.6);
  }
  turnTube(t, dt) {
    t.holdT += dt;
    const sp = t.holdT < 0.7 ? deg(5) : deg(18);
    t.az += sp * dt * t.dir;
    this._tick = (this._tick || 0) + sp * dt;
    if (this._tick > deg(4)) { this._tick = 0; this.ctx.audio.click(new THREE.Vector3(t.px, t.py + 1, t.pz), 1.2); }
    this.poseTube(t);
    this.ctx.saveSoon();
  }
  beaconDir(t, b) { return Math.atan2(b.lightPos.z - t.pz, b.lightPos.x - t.px); }
  matches() {
    const beacons = this.ctx.game.beacons.slice(0, 4);
    const used = new Set();
    let n = 0;
    for (const b of beacons) {
      if (b.state !== 'lit') continue;
      for (const t of this.tubes) {
        if (used.has(t)) continue;
        if (Math.abs(wrapAngle(t.az - this.beaconDir(t, b))) < TOL) { used.add(t); n++; break; }
      }
    }
    return { n, used };
  }
  update(dt, time, night) {
    const g = this.ctx.game;
    if (!this.solved && g.lit[3]) {
      const m = this.matches();
      if (m.n === 4) {
        this.solved = true;
        this.ctx.audio.success(this.lampPos);
        this.ctx.flash(0.8);
        g.primeBeacon(4);
        this.ctx.save();
      }
    }
    for (const t of this.tubes) {
      const k = this.solved ? 1 : 0;
      t.lensMat.color.setRGB(0.2 + k * 3.5, 0.25 + k * 2.2, 0.3 + k * 0.8);
    }
    // the flame climbing the tower
    if (this.stage === 'climbing') {
      this.climbT += dt;
      const n = this.windows.length;
      this.windows.forEach((w, i) => {
        const on = this.climbT > i * 0.7;
        w.fire.set(on ? 1 : 0);
        if (on && !w.played) { w.played = true; this.ctx.audio.whoosh(this.lampPos.clone().setY(this.baseY + 3 + i * 4.6), 0.4); }
      });
      if (this.climbT > n * 0.7 + 0.4) {
        this.stage = 'lit';
        this.lamp.set(1);
        this.beams.visible = true;
        this.ctx.onLighthouseLit();
      }
    }
    for (const w of this.windows) w.fire.update(dt, night);
    this.lamp.update(dt, night);
    if (this.stage === 'lit') {
      this.beams.rotation.y += dt * 0.5;
      this.beamMat.uniforms.uAlpha.value = Math.min(1, this.beamMat.uniforms.uAlpha.value + dt * 0.4) * (0.35 + night * 0.65);
      this.glassMat.color.setRGB(3, 2, 0.9);
      this.glassMat.opacity = 0.5;
    }
  }
  ignite(instant = false) {
    if (instant) {
      this.stage = 'lit';
      this.windows.forEach((w) => { w.fire.set(1, true); w.played = true; });
      this.lamp.set(1, true);
      this.beams.visible = true;
      this.beamMat.uniforms.uAlpha.value = 1;
      return;
    }
    this.stage = 'climbing';
    this.climbT = 0;
  }
  hint() {
    if (this.solved) return null;
    const m = this.matches();
    for (const t of this.tubes) if (!m.used.has(t)) return t.ip.clone().add(new THREE.Vector3(0, 0.8, 0));
    return null;
  }
  getState() { return { solved: this.solved, az: this.tubes.map((t) => t.az) }; }
  setState(s) {
    if (!s) return;
    this.solved = !!s.solved;
    if (Array.isArray(s.az)) this.tubes.forEach((t, i) => { if (typeof s.az[i] === 'number') { t.az = s.az[i]; this.poseTube(t); } });
  }
}
