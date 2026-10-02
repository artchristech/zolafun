// Cel-shaded animated fire (banded flame tongues + rising embers + a distance glow), and beacons built on it.
import * as THREE from './three.module.min.js';
import { GeoBuilder, mat, clamp, smoothstep } from './util.js';

const fireTime = { value: 0 };
export function setFireTime(t) { fireTime.value = t; }

function flameGeometry() {
  const pos = [], aT = [], aPh = [], aLay = [];
  const tongue = (ox, oz, R, H, ph, layer, seg = 8, rings = 7) => {
    const ring = (j) => {
      const t = j / rings;
      const r = R * (1 - t) * (0.75 + 1.3 * t * (1 - t) * 2) + 0.001;
      const out = [];
      for (let i = 0; i < seg; i++) {
        const a = (i / seg) * Math.PI * 2;
        out.push([ox + Math.cos(a) * r, t * H, oz + Math.sin(a) * r, t]);
      }
      return out;
    };
    for (let j = 0; j < rings; j++) {
      const A = ring(j), B = ring(j + 1);
      for (let i = 0; i < seg; i++) {
        const i2 = (i + 1) % seg;
        for (const v of [A[i], B[i], B[i2], A[i], B[i2], A[i2]]) {
          pos.push(v[0], v[1], v[2]); aT.push(v[3]); aPh.push(ph); aLay.push(layer);
        }
      }
    }
  };
  tongue(0, 0, 0.62, 2.5, 0.0, 0);
  tongue(0.32, 0.1, 0.4, 1.7, 1.7, 0);
  tongue(-0.28, 0.22, 0.38, 1.5, 3.1, 0);
  tongue(0.05, -0.32, 0.36, 1.6, 4.4, 0);
  tongue(0, 0, 0.36, 1.45, 2.2, 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aT', new THREE.Float32BufferAttribute(aT, 1));
  g.setAttribute('aPh', new THREE.Float32BufferAttribute(aPh, 1));
  g.setAttribute('aLay', new THREE.Float32BufferAttribute(aLay, 1));
  g.computeBoundingSphere();
  return g;
}

let FLAME_GEO = null, EMBER_GEO = null, GLOW_GEO = null;

function flameMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: fireTime, uI: { value: 1 }, uBright: { value: 3 }, uSeed: { value: 0 } },
    vertexShader: `attribute float aT, aPh, aLay; uniform float uTime, uI, uSeed; varying float vT, vLay, vPh; varying vec3 vP;
      void main(){
        vT = aT; vLay = aLay; vPh = aPh + uSeed;
        float tt = uTime + uSeed * 7.0;
        vec3 p = position;
        float fl = sin(tt * 7.0 + vPh * 3.0 + aT * 4.0) * 0.14 + sin(tt * 12.3 + vPh * 5.0) * 0.06;
        p.x += fl * aT * 1.6;
        p.z += cos(tt * 6.1 + vPh * 2.0 + aT * 3.0) * 0.12 * aT;
        p.y *= 0.82 + 0.22 * sin(tt * 4.6 + vPh * 4.0) + 0.1 * sin(tt * 9.7 + vPh);
        p *= uI;
        vP = p;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `uniform float uTime, uBright, uI; varying float vT, vLay, vPh; varying vec3 vP;
      void main(){
        float tt = uTime;
        float n = sin(vT * 13.0 - tt * 9.0 + atan(vP.z, vP.x) * 3.0 + vPh) * 0.5 + 0.5;
        if (vT > 0.5 + 0.42 * n) discard;
        vec3 c;
        if (vLay > 0.5) c = vec3(1.0, 0.93, 0.6);
        else if (vT < 0.3) c = vec3(1.0, 0.62, 0.16);
        else if (vT < 0.62) c = vec3(0.98, 0.36, 0.08);
        else c = vec3(0.78, 0.12, 0.05);
        gl_FragColor = vec4(c * uBright, 1.0);
      }`,
    side: THREE.DoubleSide,
    fog: false,
  });
}

function emberMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: fireTime, uI: { value: 1 }, uRise: { value: 5 }, uSize: { value: 0.12 }, uSpread: { value: 0.8 } },
    vertexShader: `attribute vec3 aSeed; uniform float uTime, uI, uRise, uSize, uSpread; varying float vLife;
      void main(){
        float life = fract(uTime * 0.32 * (0.7 + aSeed.y * 0.6) + aSeed.x);
        vec3 c = vec3(sin(aSeed.x * 40.0 + uTime * 1.3) * 0.7 * life + (aSeed.z - 0.5) * uSpread,
                      life * uRise,
                      cos(aSeed.x * 23.0 + uTime * 1.1) * 0.7 * life + (aSeed.y - 0.5) * uSpread) * uI;
        vec4 mv = modelViewMatrix * vec4(c, 1.0);
        mv.xy += position.xy * uSize * (1.0 - life * 0.7) * step(0.05, uI);
        vLife = life;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `varying float vLife; void main(){
        vec3 c = vLife < 0.25 ? vec3(1.0, 0.85, 0.4) : (vLife < 0.6 ? vec3(1.0, 0.45, 0.1) : vec3(0.8, 0.15, 0.05));
        gl_FragColor = vec4(c * 4.0 * (1.0 - vLife), 1.0);
      }`,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
    fog: false,
  });
}

function glowMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uI: { value: 0 }, uSize: { value: 4 }, uCol: { value: new THREE.Color(1.0, 0.55, 0.2) } },
    vertexShader: `uniform float uSize; varying vec2 vUv;
      void main(){
        vUv = position.xy;
        vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float d = -mv.z;
        float s = uSize * (1.0 + d / 45.0);
        mv.xyz += normalize(-mv.xyz) * 2.5;
        mv.xy += position.xy * s;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `uniform float uI; uniform vec3 uCol; varying vec2 vUv;
      void main(){ float r = length(vUv) * 2.0; float a = smoothstep(1.0, 0.0, r); a = a * a;
        float core = smoothstep(0.35, 0.0, r);
        gl_FragColor = vec4((uCol * a + vec3(1.0, 0.85, 0.6) * core) * uI, 1.0); }`,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
    fog: false,
  });
}

export class Fire {
  constructor(parent, pos, { scale = 1, embers = 36, glow = false, seed = Math.random() * 10 } = {}) {
    if (!FLAME_GEO) {
      FLAME_GEO = flameGeometry();
      const p = new THREE.PlaneGeometry(1, 1);
      EMBER_GEO = new THREE.InstancedBufferGeometry();
      EMBER_GEO.index = p.index;
      EMBER_GEO.setAttribute('position', p.attributes.position);
      const N = 48;
      const seeds = new Float32Array(N * 3);
      for (let i = 0; i < N * 3; i++) seeds[i] = Math.random();
      EMBER_GEO.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 3));
      GLOW_GEO = new THREE.PlaneGeometry(1, 1);
    }
    this.group = new THREE.Group();
    this.group.position.copy(pos);
    this.group.scale.setScalar(scale);
    this.scale = scale;
    this.flameMat = flameMaterial();
    this.flameMat.uniforms.uSeed.value = seed;
    this.flame = new THREE.Mesh(FLAME_GEO, this.flameMat);
    this.flame.frustumCulled = false;
    this.group.add(this.flame);
    this.emberMat = emberMaterial();
    this.embers = new THREE.Mesh(EMBER_GEO, this.emberMat);
    this.embers.frustumCulled = false;
    this.embers.renderOrder = 5;
    this.embersCount = embers;
    this.group.add(this.embers);
    if (glow) {
      this.glowMat = glowMaterial();
      this.glow = new THREE.Mesh(GLOW_GEO, this.glowMat);
      this.glow.position.y = 1.0;
      this.glow.frustumCulled = false;
      this.glow.renderOrder = 6;
      this.group.add(this.glow);
    }
    parent.add(this.group);
    this.intensity = 0;
    this.setIntensity(0);
  }

  setIntensity(v, night = 0) {
    this.intensity = v;
    const on = v > 0.01;
    this.group.visible = on;
    this.flameMat.uniforms.uI.value = v;
    this.flameMat.uniforms.uBright.value = 2.2 + night * 2.5;
    this.emberMat.uniforms.uI.value = v;
    if (this.glow) this.glowMat.uniforms.uI.value = v * (0.25 + night * 1.1);
  }
}

// A beacon: brazier position, interaction position, fire, its readiness ember, and the light slot it may claim.
export class Beacon {
  constructor(scene, firePos, interactPos, { scale = 1.3, glowSize = 5 } = {}) {
    this.pos = firePos.clone();
    this.interactPos = interactPos.clone();
    this.fire = new Fire(scene, firePos, { scale, glow: true });
    this.fire.glowMat.uniforms.uSize.value = glowSize;
    this.state = 'dormant'; // dormant | ready | lighting | lit
    this.t = 0;
    this.level = 0;
    // pulsing ember that shows the beacon is ready to be lit
    const em = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 1.2, 0.3), fog: false }));
    em.position.copy(firePos).add(new THREE.Vector3(0, 0.15, 0));
    em.visible = false;
    scene.add(em);
    this.ember = em;
  }

  get lit() { return this.state === 'lit' || this.state === 'lighting'; }

  setReady() { if (this.state === 'dormant') this.state = 'ready'; }

  light() {
    if (this.state !== 'ready') return false;
    this.state = 'lighting';
    this.t = 0;
    return true;
  }

  setLitInstant() { this.state = 'lit'; this.level = 1; }

  update(dt, time, night) {
    this.ember.visible = this.state === 'ready';
    if (this.ember.visible) {
      const p = 0.8 + 0.4 * Math.sin(time * 3);
      this.ember.scale.setScalar(p);
      this.ember.rotation.y += dt;
    }
    if (this.state === 'lighting') {
      this.t += dt;
      this.level = smoothstep(0, 1.6, this.t);
      if (this.t > 1.6) this.state = 'lit';
    }
    const flick = this.level * (0.95 + 0.05 * Math.sin(time * 13 + this.pos.x));
    this.fire.setIntensity(flick, night);
  }

  // light intensity for its point light
  lightIntensity(time, night) {
    const f = 0.9 + 0.1 * Math.sin(time * 11 + this.pos.z) + 0.05 * Math.sin(time * 23.7);
    return this.level * f * (4 + night * 10);
  }
}

// static brazier geometry into a builder
export function addBrazier(b, x, y, z, big = false) {
  const s = big ? 1.3 : 1;
  b.cyl(0.7 * s, 0.95 * s, 0.5, 8, mat(x, y + 0.25, z), '#7d766c', { flat: true });
  b.cyl(0.38 * s, 0.5 * s, 1.5 * s, 8, mat(x, y + 0.5 + 0.75 * s, z), '#9a9286', { flat: true });
  b.cyl(0.9 * s, 0.35 * s, 0.6 * s, 10, mat(x, y + 0.5 + 1.5 * s + 0.3 * s, z), '#3c3530', { flat: true });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    b.box(0.12, 0.5 * s, 0.12, mat(x + Math.cos(a) * 0.82 * s, y + 0.5 + 1.95 * s, z + Math.sin(a) * 0.82 * s), '#2a2520');
  }
  return y + 0.5 + 2.1 * s; // fire base height
}
