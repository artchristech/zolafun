// Small shared effects: flying sparks (puzzle -> beacon), light beams (instanced), the idle-hint shimmer.
import * as THREE from './three.module.min.js';

// ---------- sparks: a few glowing balls flying along arcs, then a callback
export class Sparks {
  constructor(scene) {
    this.list = [];
    const g = new THREE.IcosahedronGeometry(0.22, 1);
    this.mesh = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }), 64);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(64 * 3), 3);
    scene.add(this.mesh);
    this._m = new THREE.Matrix4();
    this._c = new THREE.Color();
    this._p = new THREE.Vector3();
  }
  fly(from, to, dur = 1.4, done = null, color = new THREE.Color(4, 2.2, 0.7), arc = 6) {
    this.list.push({ a: from.clone(), b: to.clone(), t: 0, dur, done, color, arc });
  }
  update(dt) {
    let n = 0;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const s = this.list[i];
      s.t += dt;
      const k = Math.min(1, s.t / s.dur);
      if (k >= 1) { this.list.splice(i, 1); if (s.done) s.done(); continue; }
    }
    for (const s of this.list) {
      const k = Math.min(1, s.t / s.dur);
      // a ball and a short trail of fading copies
      for (let j = 0; j < 6 && n < 64; j++) {
        const kk = Math.max(0, k - j * 0.025);
        const e = kk * kk * (3 - 2 * kk);
        this._p.lerpVectors(s.a, s.b, e);
        this._p.y += Math.sin(Math.PI * e) * s.arc;
        const sc = 1 - j * 0.15;
        this._m.makeScale(sc, sc, sc).setPosition(this._p);
        this.mesh.setMatrixAt(n, this._m);
        this._c.copy(s.color).multiplyScalar(1 - j * 0.14);
        this.mesh.setColorAt(n, this._c);
        n++;
      }
    }
    this.mesh.count = n;
    this.mesh.visible = n > 0;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
  }
}

// ---------- beams: instanced glowing cylinders between points
export class Beams {
  constructor(scene, max = 16) {
    const g = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true);
    g.translate(0, 0.5, 0);
    this.mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 2.2, 1.0), transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    this.mesh = new THREE.InstancedMesh(g, this.mat, max);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.renderOrder = 4;
    scene.add(this.mesh);
    this.items = [];
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._d = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0);
  }
  set(id, a, b, width, grow = 1) {
    let it = this.items.find((x) => x.id === id);
    if (!it) { it = { id }; this.items.push(it); }
    it.a = a.clone(); it.b = b.clone(); it.w = width; it.grow = grow;
  }
  remove(prefix) { this.items = this.items.filter((x) => !String(x.id).startsWith(prefix)); }
  update(time) {
    let n = 0;
    for (const it of this.items) {
      if (it.grow <= 0.001) continue;
      this._d.subVectors(it.b, it.a);
      const len = this._d.length() * it.grow;
      this._d.normalize();
      this._q.setFromUnitVectors(this._up, this._d);
      const w = it.w * (0.85 + 0.15 * Math.sin(time * 9 + n));
      this._m.compose(it.a, this._q, this._s.set(w, len, w));
      this.mesh.setMatrixAt(n++, this._m);
    }
    this.mesh.count = n;
    this.mesh.visible = n > 0;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ---------- shimmer column shown at the next place to go when the player idles
export class Shimmer {
  constructor(scene) {
    const g = new THREE.CylinderGeometry(2.4, 2.4, 34, 20, 1, true);
    g.translate(0, 17, 0);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uA: { value: 0 } },
      vertexShader: `varying vec2 vUv; varying vec3 vP; void main(){ vUv = uv; vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform float uTime, uA; varying vec2 vUv; varying vec3 vP;
        void main(){
          float streak = smoothstep(0.75, 1.0, sin(vUv.x * 62.83 + sin(vUv.y * 9.0 + uTime) * 1.5) * 0.5 + 0.5);
          float rise = fract(vUv.y * 3.0 - uTime * 0.35);
          float a = streak * smoothstep(0.0, 0.5, rise) * (1.0 - rise) + 0.08;
          a *= (1.0 - vUv.y) * smoothstep(0.0, 0.06, vUv.y) * uA;
          gl_FragColor = vec4(vec3(1.4, 1.25, 0.9) * a, 1.0);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.visible = false;
    this.mesh.renderOrder = 7;
    scene.add(this.mesh);
    this.a = 0;
    this.target = 0;
  }
  show(pos) { this.mesh.position.copy(pos); this.target = 1; }
  hide() { this.target = 0; }
  update(dt, time) {
    this.a += (this.target - this.a) * Math.min(1, dt * (this.target ? 0.8 : 3));
    this.mat.uniforms.uA.value = this.a;
    this.mat.uniforms.uTime.value = time;
    this.mesh.visible = this.a > 0.01;
  }
}
