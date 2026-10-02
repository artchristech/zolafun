// Finale: beams rise from all five beacons and link into a crown over the lighthouse, then boats with lanterns
// sail home to the village. Main drives the camera and the closing overlay from the timeline here.
import * as THREE from './three.module.min.js';
import { GeoBuilder, mat, sceneryMat, smoothstep, clamp } from './util.js';
import { ISL } from './layout.js';

export const FINALE = { beams: 0, boats: 10, overlay: 34, overlayEnd: 46, end: 48 };

export class Finale {
  constructor(scene, beacons) {
    this.t = -1;
    this.done = false;
    // ---- beam crown
    const L = beacons[4];
    const crownC = new THREE.Vector3(L.x, 150, L.z);
    const outer = beacons.slice(0, 4).map((p) => {
      const a = Math.atan2(p.z - L.z, p.x - L.x);
      return new THREE.Vector3(L.x + Math.cos(a) * 70, 128, L.z + Math.sin(a) * 70);
    });
    const curves = [];
    beacons.slice(0, 4).forEach((p, i) => {
      const c = new THREE.Vector3((p.x + outer[i].x) / 2, p.y + 95, (p.z + outer[i].z) / 2);
      curves.push({ curve: new THREE.QuadraticBezierCurve3(p.clone().add(new THREE.Vector3(0, 1.5, 0)), c, outer[i]), delay: 0.6 + i * 1.3, dur: 2.6, r: 0.55 });
    });
    curves.push({ curve: new THREE.LineCurve3(L.clone().add(new THREE.Vector3(0, 1.5, 0)), crownC), delay: 0.0, dur: 2.2, r: 0.8 });
    for (let i = 0; i < 4; i++) {
      const a = outer[i], b = outer[(i + 1) % 4];
      const m = a.clone().add(b).multiplyScalar(0.5); m.y += 14;
      curves.push({ curve: new THREE.QuadraticBezierCurve3(a, m, b), delay: 6.2 + i * 0.5, dur: 1.8, r: 0.4 });
      curves.push({ curve: new THREE.LineCurve3(a, crownC), delay: 8.0 + i * 0.3, dur: 1.4, r: 0.3 });
    }
    const pos = [], prog = [], delay = [], dur = [];
    for (const c of curves) {
      const g = new THREE.TubeGeometry(c.curve, 48, c.r, 6, false);
      const ng = g.toNonIndexed();
      const p = ng.attributes.position, uv = ng.attributes.uv;
      for (let i = 0; i < p.count; i++) {
        pos.push(p.getX(i), p.getY(i), p.getZ(i));
        prog.push(uv.getX(i)); delay.push(c.delay); dur.push(c.dur);
      }
      g.dispose(); ng.dispose();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aP', new THREE.Float32BufferAttribute(prog, 1));
    g.setAttribute('aD', new THREE.Float32BufferAttribute(delay, 1));
    g.setAttribute('aL', new THREE.Float32BufferAttribute(dur, 1));
    this.beamMat = new THREE.ShaderMaterial({
      uniforms: { uT: { value: -1 }, uI: { value: 1 }, uTime: { value: 0 } },
      vertexShader: `attribute float aP, aD, aL; varying float vP, vK; uniform float uT;
        void main(){ vP = aP; vK = clamp((uT - aD) / aL, 0.0, 1.0); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform float uI, uTime; varying float vP, vK;
        void main(){ if (vP > vK) discard;
          float head = smoothstep(vK - 0.08, vK, vP) * step(vK, 0.999);
          float pulse = 0.75 + 0.25 * sin(vP * 40.0 - uTime * 6.0);
          vec3 c = mix(vec3(2.6, 1.5, 0.55), vec3(4.0, 3.2, 1.8), head) * pulse;
          gl_FragColor = vec4(c * uI, 1.0); }`,
      blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false,
    });
    this.beams = new THREE.Mesh(g, this.beamMat);
    this.beams.frustumCulled = false;
    this.beams.visible = false;
    this.beams.renderOrder = 6;
    scene.add(this.beams);

    // ---- boats coming home to the village
    const V = ISL.V;
    this.boats = [];
    for (let i = 0; i < 6; i++) {
      const a = ((18 + i * 12) * Math.PI) / 180;
      const from = new THREE.Vector3(V.x + Math.cos(a) * 230, 0, V.z + Math.sin(a) * 230);
      const to = new THREE.Vector3(V.x + Math.cos(a) * (43 + (i % 2) * 4), 0, V.z + Math.sin(a) * (43 + (i % 2) * 4));
      this.boats.push({ from, to, delay: i * 1.6, dur: 20 + (i % 3) * 2 });
    }
    const bb = new GeoBuilder();
    bb.box(1.6, 0.8, 4.2, mat(0, 0.1, 0), '#a8452f');
    bb.box(1.7, 0.14, 4.3, mat(0, 0.52, 0), '#e8dcc0');
    bb.cyl(0, 0.85, 1.3, 4, mat(0, 0.15, 2.7, Math.PI / 2, 0, 0, 1, 1, 0.7), '#a8452f', { flat: true });
    bb.cyl(0.06, 0.08, 4.2, 5, mat(0, 2.5, 0.3), '#5a4030');
    bb.box(0.05, 2.8, 2.2, mat(0, 2.6, -0.5), '#f1e6cf');
    bb.box(0.05, 1.0, 0.05, mat(0, 1.0, -1.8), '#2a2420');
    this.hulls = new THREE.InstancedMesh(bb.build(), sceneryMat(), 6);
    this.hulls.castShadow = true;
    this.hulls.visible = false;
    this.hulls.frustumCulled = false;
    scene.add(this.hulls);
    this.lanterns = new THREE.InstancedMesh(new THREE.BoxGeometry(0.3, 0.38, 0.3), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.4, 2.0, 0.7), fog: false }), 6);
    this.lanterns.visible = false;
    this.lanterns.frustumCulled = false;
    scene.add(this.lanterns);
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._p = new THREE.Vector3(); this._s = new THREE.Vector3(1, 1, 1); this._e = new THREE.Euler();
    this.centroid = new THREE.Vector3();
  }

  start() { this.t = 0; this.beams.visible = true; }

  // instantly settle into the after-finale state (reload)
  settle() {
    this.done = true;
    this.t = FINALE.end + 30;
    this.beams.visible = true;
    this.hulls.visible = true;
    this.lanterns.visible = true;
  }

  get playing() { return this.t >= 0 && !this.done; }

  update(dt, time, water) {
    if (this.t < 0) return;
    if (!this.done) {
      this.t += dt;
      if (this.t > FINALE.end) this.done = true;
    }
    const t = this.t;
    this.beamMat.uniforms.uT.value = t;
    this.beamMat.uniforms.uTime.value = time;
    this.beamMat.uniforms.uI.value = this.done ? 0.55 : 1;
    const bt = t - FINALE.boats;
    if (bt > 0) {
      this.hulls.visible = this.lanterns.visible = true;
      this.centroid.set(0, 0, 0);
      this.boats.forEach((b, i) => {
        const k = smoothstep(0, 1, clamp((bt - b.delay) / b.dur, 0, 1));
        const e = 1 - Math.pow(1 - k, 2);
        this._p.lerpVectors(b.from, b.to, e);
        this._p.y = water + 0.05 + Math.sin(time * 1.4 + i) * 0.08;
        const yaw = Math.atan2(b.to.x - b.from.x, b.to.z - b.from.z);
        this._e.set(Math.sin(time * 1.1 + i) * 0.04, yaw, Math.sin(time * 0.9 + i * 2) * 0.05, 'YXZ');
        this._q.setFromEuler(this._e);
        this._m.compose(this._p, this._q, this._s);
        this.hulls.setMatrixAt(i, this._m);
        const lp = new THREE.Vector3(0, 1.62, -1.8).applyQuaternion(this._q).add(this._p);
        this._m.makeTranslation(lp.x, lp.y, lp.z);
        this.lanterns.setMatrixAt(i, this._m);
        this.centroid.add(this._p);
      });
      this.centroid.multiplyScalar(1 / 6);
      this.hulls.instanceMatrix.needsUpdate = true;
      this.lanterns.instanceMatrix.needsUpdate = true;
    }
  }
}
