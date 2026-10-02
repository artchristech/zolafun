// Finale: beams from the five lights link across the sky, then boats with lanterns come home.
import * as THREE from './three.module.min.js';
import { ISLANDS, pol } from './layout.js';
import { GeoBuilder, mat, smoothstep, lerp } from './util.js';

const arcVS = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
const arcFS = /* glsl */ `uniform float uProg, uTime; uniform vec3 uColor; varying vec2 vUv;
void main(){
  if (vUv.x > uProg) discard;
  float pulse = 0.75 + 0.25*sin(vUv.x*60.0 - uTime*5.0);
  float head = smoothstep(uProg-0.04, uProg, vUv.x)*1.5;
  gl_FragColor = vec4(uColor*(pulse + head), 1.0);
}`;

function boatGeo() {
  const b = new GeoBuilder();
  const hull = new THREE.CylinderGeometry(0.5, 0.9, 3.6, 8, 1, false, -Math.PI / 2, Math.PI);
  b.add(hull, mat(0, 0.2, 0, Math.PI / 2, 0, 0), '#7a4f2e');
  b.add(new THREE.BoxGeometry(1.5, 0.08, 3.2), mat(0, 0.2, 0), '#a97c50');
  b.add(new THREE.CylinderGeometry(0.05, 0.06, 2.6, 5), mat(0, 1.45, 0.3), '#5e4630');
  const sail = new THREE.BufferGeometry();
  sail.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.5, 0.35, 0, 2.6, 0.35, 0, 0.5, -1.3, 0, 0.5, 0.35, 0, 0.5, -1.3, 0, 2.6, 0.35], 3));
  sail.computeVertexNormals();
  b.add(sail, mat(0.02, 0.2, 0), '#efe2c4');
  b.add(new THREE.CylinderGeometry(0.03, 0.03, 1.0, 4), mat(0, 0.7, 1.55), '#3c3632');
  return b.build();
}

export class Finale {
  constructor(ctx, lightPositions) {
    this.ctx = ctx;
    this.active = false;
    this.done = false;
    this.t = 0;
    this.arcs = [];
    const apex = new THREE.Vector3(0, 95, 0);
    const mk = (a, c, b, delay, color) => {
      const curve = new THREE.QuadraticBezierCurve3(a.clone(), c, b.clone());
      const g = new THREE.TubeGeometry(curve, 48, 0.32, 6, false);
      const m = new THREE.ShaderMaterial({
        vertexShader: arcVS, fragmentShader: arcFS,
        uniforms: { uProg: { value: 0 }, uTime: ctx.fires.shared.uTime, uColor: { value: color } },
        transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(g, m);
      mesh.visible = false;
      mesh.renderOrder = 6;
      ctx.scene.add(mesh);
      this.arcs.push({ mesh, delay });
    };
    const warm = new THREE.Color(2.6, 1.6, 0.6), pale = new THREE.Color(2.2, 2.0, 1.4);
    const L = lightPositions;
    mk(L[4], new THREE.Vector3(0, 60, 0), apex, 0.6, pale);
    for (let i = 0; i < 4; i++) {
      const a = L[i];
      const mid = a.clone().lerp(apex, 0.5);
      mk(a, new THREE.Vector3(mid.x * 1.25, 110, mid.z * 1.25), apex, 1.4 + i * 0.5, warm);
    }
    for (let i = 0; i < 4; i++) {
      const a = L[i], b = L[(i + 1) % 4];
      const mid = a.clone().lerp(b, 0.5);
      mk(a, new THREE.Vector3(mid.x * 1.15, 85, mid.z * 1.15), b, 4.2 + i * 0.5, pale);
    }
    // boats
    const geo = boatGeo();
    const V = ISLANDS[0];
    this.boats = [];
    const angles = [300, 325, 350, 12, 35, 58, 80];
    angles.forEach((ang, i) => {
      const m = new THREE.Mesh(geo, ctx.mats.vc);
      m.castShadow = true;
      m.visible = false;
      ctx.scene.add(m);
      const f = ctx.fires.create({ scale: 0.22, glow: 2.6, embers: false, seed: i * 3.1 });
      ctx.scene.add(f.group);
      const end = pol(ang, 47 + (i % 2) * 3, V.x, V.z);
      const start = pol(ang + (i % 2 ? 8 : -8), 240, V.x, V.z);
      this.boats.push({ m, f, start, end, delay: 7 + i * 0.7, seed: i });
    });
    this.camPos = new THREE.Vector3();
    this.camLook = new THREE.Vector3();
  }
  // everything visible, used to compile shaders up front
  setAllVisible(v) {
    for (const a of this.arcs) a.mesh.visible = v;
    for (const b of this.boats) {
      b.m.visible = v;
      b.f.group.visible = v;
    }
  }
  start() {
    this.active = true;
    this.t = 0;
    this.ctx.audio.finale();
  }
  finishInstant() {
    this.done = true;
    this.active = false;
    for (const a of this.arcs) {
      a.mesh.visible = true;
      a.mesh.material.uniforms.uProg.value = 1;
    }
    for (const b of this.boats) {
      b.m.visible = true;
      b.f.ignite(true);
      b.k = 1;
    }
  }
  _boats(dt, time, water) {
    for (const b of this.boats) {
      if (b.k === undefined) b.k = 0;
      if (this.active) b.k = smoothstep(b.delay, b.delay + 15, this.t);
      if (b.k <= 0 && !this.done) continue;
      b.m.visible = true;
      if (!b.f.lit) b.f.ignite();
      const k = b.k;
      const x = lerp(b.start.x, b.end.x, k), z = lerp(b.start.z, b.end.z, k);
      const yaw = Math.atan2(b.end.x - b.start.x, b.end.z - b.start.z);
      const bob = Math.sin(time * 1.3 + b.seed) * 0.08;
      b.m.position.set(x, water + 0.05 + bob, z);
      b.m.rotation.set(Math.sin(time * 1.1 + b.seed) * 0.04, yaw, Math.sin(time * 0.9 + b.seed * 2) * 0.06);
      b.m.updateMatrixWorld();
      const lp = new THREE.Vector3(0, 1.2, 1.55).applyMatrix4(b.m.matrixWorld);
      b.f.group.position.copy(lp);
    }
  }
  // returns {fade, card, ended}
  update(dt, time, water) {
    this._boats(dt, time, water);
    if (!this.active) return null;
    this.t += dt;
    const t = this.t;
    for (const a of this.arcs) {
      const p = smoothstep(a.delay, a.delay + 3.2, t);
      a.mesh.visible = p > 0;
      a.mesh.material.uniforms.uProg.value = p;
    }
    // camera
    if (t < 11) {
      const a = (200 + t * 5) * (Math.PI / 180);
      this.camPos.set(Math.sin(a) * 82, 34 + t * 0.8, Math.cos(a) * 82);
      this.camLook.set(0, lerp(26, 58, smoothstep(0, 8, t)), 0);
    } else {
      const k = smoothstep(11, 19, t);
      const a = (255) * (Math.PI / 180);
      const p0 = new THREE.Vector3(Math.sin(a) * 82, 42.8, Math.cos(a) * 82);
      const p1 = new THREE.Vector3(34, 20, 62);
      this.camPos.copy(p0).lerp(p1, k);
      this.camLook.copy(new THREE.Vector3(0, 58, 0)).lerp(new THREE.Vector3(0, 4, 150), k);
    }
    let fade = 0, card = false, ended = false;
    if (t > 22.5 && t < 24) fade = (t - 22.5) / 1.5;
    else if (t >= 24 && t < 31) { fade = 1; card = true; }
    else if (t >= 31 && t < 32.5) fade = 1 - (t - 31) / 1.5;
    else if (t >= 32.5) { ended = true; this.active = false; this.done = true; }
    if (t >= 31) this.handBack = true;
    return { fade, card, ended };
  }
}
