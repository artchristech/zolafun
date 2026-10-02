// Wordless hint: after a long stillness the next place to go shimmers.
import * as THREE from './three.module.min.js';

const VS = `attribute float aSeed; uniform float uTime, uAlpha, uPx; varying float vA;
void main(){
  float s = aSeed;
  float life = fract(uTime * (0.18 + 0.12 * fract(s * 5.3)) + s);
  float a = s * 40.0 + uTime * 0.6;
  float r = 0.6 + 1.6 * fract(s * 9.7);
  vec3 p = vec3(cos(a) * r, life * 7.0, sin(a) * r);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vA = uAlpha * sin(life * 3.14159) * (0.5 + 0.5 * sin(uTime * 7.0 + s * 30.0));
  gl_PointSize = 0.22 * uPx / max(-mv.z, 0.5);
  gl_Position = projectionMatrix * mv;
}`;
const FS = `varying float vA;
void main(){
  vec2 c = gl_PointCoord - 0.5;
  float d = abs(c.x) + abs(c.y);
  if (d > 0.5 || vA < 0.01) discard;
  gl_FragColor = vec4(vec3(1.0, 0.92, 0.65) * 3.0 * vA * (1.0 - d * 1.4), 1.0);
}`;

export class Hint {
  constructor(scene, pxUniform) {
    const n = 70;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const s = new Float32Array(n);
    for (let i = 0; i < n; i++) s[i] = Math.random();
    g.setAttribute('aSeed', new THREE.BufferAttribute(s, 1));
    this.u = { uTime: { value: 0 }, uAlpha: { value: 0 }, uPx: pxUniform };
    this.points = new THREE.Points(g, new THREE.ShaderMaterial({
      uniforms: this.u, vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    }));
    this.points.frustumCulled = false;
    this.points.visible = false;
    scene.add(this.points);
    this.alpha = 0;
  }
  update(dt, t, target) {
    this.u.uTime.value = t;
    this.alpha += ((target ? 1 : 0) - this.alpha) * Math.min(1, dt * (target ? 0.8 : 3));
    if (target) this.points.position.copy(target).y -= 1.0;
    this.u.uAlpha.value = this.alpha;
    this.points.visible = this.alpha > 0.01;
  }
}
