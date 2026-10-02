// Wordless hint: a column of drifting sparkles over the next place to go.
import * as THREE from './three.module.min.js';

const VS = /* glsl */ `
uniform float uTime, uPx, uAlpha;
attribute vec3 aSeed;
varying float vA;
void main(){
  float life = fract(uTime*0.12 + aSeed.x);
  float a = aSeed.y*6.2831 + uTime*0.6;
  float r = 0.6 + aSeed.z*1.6;
  vec3 p = vec3(cos(a)*r, life*14.0, sin(a)*r);
  vec4 mv = modelViewMatrix*vec4(p,1.0);
  float tw = 0.5 + 0.5*sin(uTime*7.0 + aSeed.y*40.0);
  vA = uAlpha * sin(3.14159*life) * tw;
  gl_PointSize = uPx*0.22/max(-mv.z, 1.0);
  gl_Position = projectionMatrix*mv;
}`;
const FS = /* glsl */ `
varying float vA;
void main(){
  vec2 c = gl_PointCoord - 0.5;
  float d = abs(c.x) + abs(c.y);
  if (d > 0.5) discard;
  float k = 1.0 - d*2.0;
  gl_FragColor = vec4(vec3(2.2, 1.9, 1.2)*k*vA, 1.0);
}`;

export class Shimmer {
  constructor(scene, pxUniform) {
    const N = 90;
    const pos = new Float32Array(N * 3), seed = new Float32Array(N * 3);
    for (let i = 0; i < N * 3; i++) seed[i] = Math.random();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 7, 0), 9);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VS, fragmentShader: FS,
      uniforms: { uTime: { value: 0 }, uPx: pxUniform, uAlpha: { value: 0 } },
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.renderOrder = 7;
    this.points.visible = false;
    scene.add(this.points);
    this.alpha = 0;
    this.on = false;
  }
  show(pos) {
    if (!this.on) this.points.position.copy(pos);
    this.on = true;
  }
  hide() {
    this.on = false;
  }
  update(dt, time) {
    this.alpha += ((this.on ? 1 : 0) - this.alpha) * Math.min(1, dt * (this.on ? 0.8 : 3));
    this.mat.uniforms.uAlpha.value = this.alpha;
    this.mat.uniforms.uTime.value = time;
    this.points.visible = this.alpha > 0.01;
  }
}
