// Five Lights — finale: beams from the five beacons link across the sky, the
// lighthouse sweeps the sea, and the fishing boats come home with lanterns lit.
import * as THREE from './three.module.min.js';
import { Builder, vtoon, smoothstep, clamp } from './util.js';
import { Fire } from './fire.js';
import { VILLAGE } from './layout.js';

let boatMat = null;
export function makeBoat(lantern) {
  boatMat = boatMat || vtoon();
  const b = new Builder();
  b.add(new THREE.CylinderGeometry(1.0, 0.7, 4.4, 8, 1, true, Math.PI, Math.PI), 0x7a5234, new THREE.Matrix4().makeRotationZ(Math.PI / 2).setPosition(0, 0.55, 0));
  b.box(4.2, 0.12, 1.6, 0x9a7a52, 0, 0.35, 0);
  b.box(0.3, 0.5, 1.7, 0x5a3c24, 1.9, 0.6, 0);
  b.box(0.12, 3.2, 0.12, 0x5a3c24, -0.3, 1.9, 0);
  b.add(new THREE.PlaneGeometry(1.6, 2.4), 0xe8dcc0, new THREE.Matrix4().makeRotationY(Math.PI / 2).setPosition(-0.3, 2.1, 0.05));
  const m = b.build(boatMat, true, true);
  m.matrixAutoUpdate = true;
  const g = new THREE.Group();
  g.add(m);
  if (lantern) {
    b.box(0.06, 1.2, 0.06, 0x333333, 1.6, 1.0, 0);
    const pole = b.build(boatMat, false, false); pole.matrixAutoUpdate = true;
    g.add(pole);
    const f = new Fire(0.35, { embers: false, lit: true, hot: 1.3 });
    f.snap();
    f.group.position.set(1.6, 1.55, 0);
    g.add(f.group);
    g.userData.fire = f;
  }
  return g;
}

const arcVS = /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const arcFS = /* glsl */`
  uniform float uProg, uTime; uniform vec3 uCol; varying vec2 vUv;
  void main(){
    if (vUv.x > uProg) discard;
    float head = smoothstep(uProg - 0.06, uProg, vUv.x) * step(uProg, 0.999);
    float pulse = 0.75 + 0.25 * step(0.5, fract(vUv.x * 14.0 - uTime * 1.5));
    gl_FragColor = vec4(uCol * (pulse + head * 2.0), 1.0);
  }`;

export class Finale {
  constructor(scene) {
    this.scene = scene;
    this.t = -1;
    this.arcs = [];
    this.boats = [];
    this.time = { value: 0 };
    // lighthouse sweep
    const cone = new THREE.ConeGeometry(7, 60, 16, 1, true);
    cone.translate(0, -30, 0); cone.rotateX(-Math.PI / 2);
    this.sweepMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 0.75, 0.45), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.sweep = new THREE.Mesh(cone, this.sweepMat);
    this.sweep.visible = false;
    scene.add(this.sweep);
  }
  // tops: Vector3 of the five beacon flames (index 4 = lighthouse)
  prepare(tops) {
    this.tops = tops;
    const mk = (pts, col, delay, dur) => {
      const curve = new THREE.CatmullRomCurve3(pts);
      const geo = new THREE.TubeGeometry(curve, 48, 0.35, 6, false);
      const m = new THREE.ShaderMaterial({
        uniforms: { uProg: { value: 0 }, uTime: this.time, uCol: { value: col } },
        vertexShader: arcVS, fragmentShader: arcFS, side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geo, m);
      mesh.visible = false;
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      this.arcs.push({ mesh, delay, dur });
    };
    const warm = new THREE.Color(3.2, 2.0, 0.9), gold = new THREE.Color(3.5, 2.8, 1.4);
    const sky = (p, h) => new THREE.Vector3(p.x, h, p.z);
    tops.forEach((p, i) => mk([p.clone(), sky(p, (p.y + 70) / 2), sky(p, 70)], warm, i * 0.25, 2.2));
    for (let i = 0; i < 4; i++) {
      const a = sky(tops[i], 70), b = sky(tops[(i + 1) % 4], 70);
      const mid = a.clone().lerp(b, 0.5); mid.y = 95;
      mk([a, mid, b], gold, 2.8 + i * 0.3, 2.6);
      const l = sky(tops[4], 70), m2 = a.clone().lerp(l, 0.5); m2.y = 88;
      mk([a, m2, l], gold, 3.6 + i * 0.3, 2.2);
    }
    // boats far out at sea, bound for the village pier
    const homes = [[-6, 64], [6, 68], [-9, 86], [9, 88], [-24, 74], [24, 84]];
    homes.forEach(([hx, hz], i) => {
      const g = makeBoat(true);
      const a = -0.9 + i * 0.36;
      const from = new THREE.Vector3(hx + Math.sin(a) * 220, 0, hz + Math.cos(a) * 220);
      const to = new THREE.Vector3(hx, 0, hz);
      g.visible = false;
      this.scene.add(g);
      this.boats.push({ g, from, to, delay: 8 + i * 1.6, dur: 48 + i * 3 });
    });
  }
  start(instant = false) {
    this.t = instant ? 200 : 0;
    this.sweep.visible = true;
    this.sweep.position.copy(this.tops[4]);
  }
  get running() { return this.t >= 0; }
  update(dt, water) {
    if (this.t < 0) return;
    this.t += dt;
    this.time.value += dt;
    for (const a of this.arcs) {
      const p = clamp((this.t - a.delay) / a.dur, 0, 1);
      a.mesh.visible = p > 0;
      a.mesh.material.uniforms.uProg.value = p;
    }
    this.sweep.rotation.y = this.t * 0.5;
    this.sweepMat.opacity = 0.18 * smoothstep(0, 3, this.t);
    for (const b of this.boats) {
      const k = clamp((this.t - b.delay) / b.dur, 0, 1);
      b.g.visible = this.t > b.delay;
      const e = 1 - Math.pow(1 - k, 2);
      b.g.position.lerpVectors(b.from, b.to, e);
      b.g.position.y = water + 0.05 + Math.sin(this.t * 1.3 + b.delay) * 0.08;
      b.g.rotation.y = Math.atan2(b.to.x - b.from.x, b.to.z - b.from.z) - Math.PI / 2;
      b.g.rotation.z = Math.sin(this.t * 1.1 + b.delay) * 0.05;
      if (b.g.userData.fire) b.g.userData.fire.update(dt);
    }
  }
}
