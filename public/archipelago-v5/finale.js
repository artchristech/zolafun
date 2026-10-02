// Five Lights — finale: beams from all five beacons link across the sky, then boats with lanterns come home.
import * as THREE from './three.module.min.js';
import { toon, srgb, smoothstep, mulberry32 } from './util.js';
import { LAYOUT, groundAt } from './terrain.js';
import { hullGeometry, MAT } from './world.js';
import { Fire } from './fire.js';

export class Finale {
  constructor(scene, beacons, hooks) {
    this.hooks = hooks;
    this.root = new THREE.Group(); scene.add(this.root);
    this.active = false; this.t = 0; this.done = false;
    this.progress = { value: 0 };
    this.arcMat = new THREE.ShaderMaterial({
      uniforms: { uP: this.progress, uTime: { value: 0 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform float uP, uTime; varying vec2 vUv;
        void main(){
          if (vUv.x > uP) discard;
          float edge = 1.0 - abs(vUv.y - 0.5) * 2.0;
          float head = smoothstep(uP - 0.04, uP, vUv.x) * step(uP, 0.999);
          float shimmer = 0.85 + 0.15 * sin(vUv.x * 80.0 - uTime * 6.0);
          vec3 c = vec3(1.6, 1.15, 0.6) * (0.6 + edge) * shimmer + vec3(3.0, 2.4, 1.6) * head;
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    // arcs: each beacon to the next, closing the ring, plus a column up from each
    this.arcs = [];
    const pts = beacons.map((b) => b.lightPos.clone());
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const mid = a.clone().add(b).multiplyScalar(0.5); mid.y += 90 + a.distanceTo(b) * 0.25;
      const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
      const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 64, 0.9, 6, false), this.arcMat);
      m.frustumCulled = false; m.visible = false; m.renderOrder = 4;
      this.root.add(m); this.arcs.push(m);
      const col = new THREE.Mesh(new THREE.TubeGeometry(new THREE.LineCurve3(a, a.clone().add(new THREE.Vector3(0, 220, 0))), 1, 0.5, 6, false), this.arcMat);
      col.frustumCulled = false; col.visible = false; col.renderOrder = 4;
      this.root.add(col); this.arcs.push(col);
    }
    // boats
    const V = LAYOUT.village, u = V.u, v = V.v;
    const rng = mulberry32(8);
    this.boats = [];
    const sailCols = [srgb(0.95, 0.9, 0.78), srgb(0.9, 0.55, 0.35), srgb(0.75, 0.85, 0.9), srgb(0.95, 0.8, 0.5), srgb(0.85, 0.4, 0.4), srgb(0.9, 0.9, 0.9), srgb(0.7, 0.8, 0.55)];
    for (let i = 0; i < 7; i++) {
      const a = Math.atan2(u.z, u.x) + (i - 3) * 0.22;
      const R = 230 + rng() * 60;
      const start = new THREE.Vector3(V.platform.x + Math.cos(a) * R, 0, V.platform.z + Math.sin(a) * R);
      const side = i - 3;
      const end = new THREE.Vector3(V.platform.x + u.x * (8 + Math.abs(side) * 2.5) + v.x * side * 6, 0, V.platform.z + u.z * (8 + Math.abs(side) * 2.5) + v.z * side * 6);
      const g = new THREE.Group();
      const hull = new THREE.Mesh(hullGeometry(6.5, 1.5, 1.3, 14, 8), toon(srgb(0.5 + rng() * 0.3, 0.3 + rng() * 0.2, 0.2), { side: THREE.DoubleSide }));
      hull.castShadow = true; g.add(hull);
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 6, 6), MAT.woodDark); mast.position.y = 2.8; g.add(mast);
      const sailG = new THREE.BufferGeometry();
      sailG.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.6, 0, 0, 5.6, 0, -3.2, 0.8, 0], 3));
      sailG.computeVertexNormals();
      const sail = new THREE.Mesh(sailG, toon(sailCols[i], { side: THREE.DoubleSide })); sail.rotation.y = 0.3; g.add(sail);
      const lantern = new Fire(0.45, { embers: 4, glow: 2.2, seed: i });
      lantern.group.position.set(2.6, 1.6, 0); g.add(lantern.group);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.4, 4), MAT.woodDark); pole.position.set(2.6, 0.9, 0); g.add(pole);
      g.visible = false;
      this.root.add(g);
      this.boats.push({ g, start, end, lantern, delay: i * 1.8 + rng() * 2, dur: 48 + rng() * 10, phase: rng() * 6, rang: false });
    }
  }
  start(instant = false) {
    this.active = true;
    this.t = instant ? 999 : 0;
    for (const a of this.arcs) a.visible = true;
    for (const b of this.boats) { b.g.visible = true; b.lantern.setLit(true, true); }
  }
  update(dt, time, water, night) {
    this.arcMat.uniforms.uTime.value = time;
    if (!this.active) return;
    this.t += dt;
    this.progress.value = smoothstep(0, 7, this.t);
    for (const b of this.boats) {
      const k = smoothstep(0, 1, Math.min(1, Math.max(0, (this.t - 6 - b.delay) / b.dur)));
      const e = 1 - Math.pow(1 - k, 2);
      b.g.position.lerpVectors(b.start, b.end, e);
      b.g.position.y = water + 0.55 + Math.sin(time * 1.3 + b.phase) * 0.12;
      const dx = b.end.x - b.start.x, dz = b.end.z - b.start.z;
      b.g.rotation.set(Math.sin(time * 1.1 + b.phase) * 0.05, -Math.atan2(dz, dx), Math.sin(time * 0.9 + b.phase) * 0.04);
      b.lantern.update(dt, Math.max(night, 0.6));
      if (k >= 1 && !b.rang) { b.rang = true; this.hooks.arrive && this.hooks.arrive(b.g.position); }
    }
    if (!this.done && this.boats.every((b) => b.rang)) { this.done = true; this.hooks.done && this.hooks.done(); }
  }
}
