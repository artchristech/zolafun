// Finale: beams rise from the five beacons and link across the sky, then the
// fishing boats come home with their lanterns lit.
import * as THREE from './three.module.min.js';
import { G, mat, GeoBuilder, hullGeo } from './geo.js';
import { glow } from './materials.js';
import { easeInOut, easeOut, clamp, lerp } from './util.js';

const CROWN = new THREE.Vector3(0, 128, 0);

function additive(color, s) {
  const m = glow(color, s);
  m.transparent = true; m.blending = THREE.AdditiveBlending; m.depthWrite = false;
  return m;
}

export class Finale {
  constructor(scene, beacons, toonMat) {
    this.t = -1;
    this.beams = [];
    this.arcs = [];
    const coreM = additive(0xffd890, 2.4), haloM = additive(0xffa050, 0.35);
    this.coreM = coreM; this.haloM = haloM;
    const tops = [];
    beacons.forEach((b, i) => {
      const base = b.lightPos.clone();
      const top = new THREE.Vector3(base.x, i === 4 ? CROWN.y : 96, base.z);
      tops.push(top);
      const g = new THREE.Group();
      g.position.copy(base);
      const core = new THREE.Mesh(G.cyl(0.35, 0.5, 1, 8, true), coreM);
      const halo = new THREE.Mesh(G.cyl(1.3, 1.8, 1, 10, true), haloM);
      core.position.y = halo.position.y = 0.5;
      g.add(core, halo);
      g.scale.y = 0.001;
      g.userData.len = top.y - base.y;
      g.visible = false;
      scene.add(g);
      this.beams.push(g);
    });
    const tube = (a, b, ctrl) => {
      const curve = new THREE.QuadraticBezierCurve3(a, ctrl, b);
      const core = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.4, 6, false), coreM);
      const halo = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 1.3, 8, false), haloM);
      const g = new THREE.Group(); g.add(core, halo);
      g.visible = false;
      g.userData.parts = [core, halo];
      scene.add(g);
      this.arcs.push(g);
      return g;
    };
    for (let i = 0; i < 4; i++) {
      const a = tops[i];
      tube(a, CROWN, new THREE.Vector3(a.x * 0.45, 140, a.z * 0.45));
    }
    for (let i = 0; i < 4; i++) {
      const a = tops[i], b = tops[(i + 1) % 4];
      const mid = a.clone().add(b).multiplyScalar(0.5);
      mid.y = 112; mid.x *= 1.1; mid.z *= 1.1;
      tube(a, b, mid);
    }
    // boats
    this.boats = [];
    const moor = [[-3.6, 124], [3.6, 127], [-3.6, 131], [3.6, 134], [-3.6, 138], [3.6, 141]];
    moor.forEach(([mx, mz], k) => {
      const b = new GeoBuilder();
      b.add(hullGeo(4.4, 1.7, 1.0, 10), mat(0, 0, 0), [0x6f8fa8, 0xc8322b, 0x5fa35a, 0xf2c14e, 0x3f7cc4, 0x8a5bb5][k], { jitter: 0.06 });
      b.add(G.box(3.2, 0.08, 1.2), mat(0.3, 0.86, 0), 0x8a6240);
      b.add(G.cyl(0.05, 0.06, 3.0, 5), mat(-0.4, 2.3, 0), 0x6b4a2e);
      b.add(G.box(0.04, 1.9, 1.5), mat(0.2, 2.3, 0, 0, 0, -0.08), 0xf1e6cc);
      b.add(G.cyl(0.03, 0.03, 1.0, 4), mat(1.6, 1.4, 0, 0, 0, -0.5), 0x6b4a2e);
      const mesh = new THREE.Mesh(b.build(), toonMat);
      mesh.castShadow = false;
      const lantern = new THREE.Mesh(G.sph(0.14, 8, 6), glow(0xffb050, 3.2));
      lantern.position.set(2.0, 1.75, 0);
      mesh.add(lantern);
      const a = (-42 + k * 17) * Math.PI / 180;
      const start = new THREE.Vector3(Math.sin(a) * 340, 0, 110 + Math.cos(a) * 340);
      const end = new THREE.Vector3(mx, 0, mz);
      mesh.visible = false;
      scene.add(mesh);
      this.boats.push({ mesh, start, end, delay: k * 0.9 + Math.random() * 0.5, phase: Math.random() * 6 });
    });
  }
  get running() { return this.t >= 0 && this.t < 1e8; }
  start() { this.t = 0; }
  // jump to the finished state (after a reload)
  finish(water) {
    this.t = 1e9;
    this.beams.forEach((g) => { g.visible = true; g.scale.y = g.userData.len; });
    this.arcs.forEach((g) => { g.visible = true; g.userData.parts.forEach((m) => m.geometry.setDrawRange(0, Infinity)); });
    this.boats.forEach((b) => { b.mesh.visible = true; b.mesh.position.set(b.end.x, water - 0.45, b.end.z); b.mesh.rotation.y = Math.PI / 2; });
    this.settled = true;
  }
  forceVisible(v) {
    const on = v || this.t >= 0;
    this.beams.forEach((g) => { g.visible = on; if (v) g.scale.y = g.userData.len; });
    this.arcs.forEach((g) => { g.visible = on; g.userData.parts.forEach((m) => m.geometry.setDrawRange(0, v ? Infinity : m.geometry.drawRange.count)); });
    this.boats.forEach((b) => { b.mesh.visible = on; });
  }
  update(dt, water, time) {
    if (this.t < 0) return;
    const pulse = 0.85 + 0.15 * Math.sin(time * 1.7);
    const fade = this.settled ? 0.55 : 1;
    this.coreM.color.setRGB(2.4 * pulse * fade, 1.9 * pulse * fade, 1.0 * pulse * fade);
    this.haloM.color.setRGB(0.35 * fade, 0.22 * fade, 0.1 * fade);
    for (const b of this.boats) {
      if (!b.mesh.visible) continue;
      b.mesh.position.y = water - 0.45 + Math.sin(time * 1.3 + b.phase) * 0.08;
      b.mesh.rotation.z = Math.sin(time * 1.1 + b.phase) * 0.04;
    }
    if (this.t > 1e8) return;
    this.t += dt;
    const t = this.t;
    this.beams.forEach((g, i) => {
      const u = easeOut(clamp((t - 0.6 - i * 0.35) / 2.6, 0, 1));
      g.visible = u > 0;
      g.scale.y = Math.max(0.001, g.userData.len * u);
    });
    this.arcs.forEach((g, i) => {
      const u = easeInOut(clamp((t - 4.0 - (i % 4) * 0.4 - (i >= 4 ? 1.6 : 0)) / 2.4, 0, 1));
      g.visible = u > 0;
      for (const m of g.userData.parts) {
        const n = m.geometry.index.count;
        m.geometry.setDrawRange(0, Math.floor(n * u / 3) * 3);
      }
    });
    for (const b of this.boats) {
      const u = clamp((t - 9 - b.delay) / 13, 0, 1);
      if (u <= 0) continue;
      b.mesh.visible = true;
      const e = easeOut(u);
      const x = lerp(b.start.x, b.end.x, e), z = lerp(b.start.z, b.end.z, e);
      b.mesh.position.x = x; b.mesh.position.z = z;
      const dx = b.end.x - b.start.x, dz = b.end.z - b.start.z;
      const head = Math.atan2(dz, -dx);
      b.mesh.rotation.y = u < 0.97 ? head : lerp(head, Math.PI / 2, (u - 0.97) / 0.03);
    }
  }
}

// Wordless hint: a shimmer of rising sparkles over the next place to go.
export class Shimmer {
  constructor(scene, uniforms) {
    const n = 70;
    const r = new Float32Array(n * 3);
    for (let i = 0; i < n * 3; i++) r[i] = Math.random();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('aRnd', new THREE.BufferAttribute(r, 3));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 30);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uTime: uniforms.uTime, uPointScale: uniforms.uPointScale, uAlpha: { value: 0 } },
      vertexShader: `attribute vec3 aRnd; uniform float uTime; uniform float uPointScale; uniform float uAlpha; varying float vA;
        void main(){ float life = fract(uTime * (0.12 + aRnd.x * 0.1) + aRnd.y);
          float ang = aRnd.z * 6.2832 + uTime * 0.5; float rad = 0.6 + aRnd.x * 1.4;
          vec3 p = vec3(cos(ang) * rad, life * 14.0, sin(ang) * rad);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          vA = uAlpha * sin(life * 3.14159) * (0.5 + 0.5 * sin(uTime * 7.0 + aRnd.y * 40.0));
          gl_PointSize = 0.3 * uPointScale / max(1.0, -mv.z) + 2.0;
          gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying float vA; void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d); if (r > 0.5) discard;
          float star = max(1.0 - abs(d.x) * 9.0, 0.0) * step(abs(d.y), 0.5) + max(1.0 - abs(d.y) * 9.0, 0.0) * step(abs(d.x), 0.5);
          gl_FragColor = vec4(vec3(1.4, 1.3, 0.9) * (star + (0.5 - r)) * vA, 1.0); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.visible = false;
    scene.add(this.points);
    this.alpha = 0; this.target = 0;
  }
  show(pos) { this.points.position.set(pos[0], pos[1] - 1, pos[2]); this.target = 1; }
  hide() { this.target = 0; }
  update(dt) {
    this.alpha += (this.target - this.alpha) * Math.min(1, dt * 1.5);
    this.mat.uniforms.uAlpha.value = this.alpha;
    this.points.visible = this.alpha > 0.01;
  }
}
