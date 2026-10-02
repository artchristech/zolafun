// HDR scene target, threshold bloom (dual-filter style), tone-mapped composite.
import * as THREE from './three.module.min.js';

const VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const BRIGHT = `uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uThr; varying vec2 vUv;
void main(){
  vec3 c = vec3(0.0);
  c += texture2D(tSrc, vUv + uTexel * vec2(-1.0, -1.0)).rgb;
  c += texture2D(tSrc, vUv + uTexel * vec2( 1.0, -1.0)).rgb;
  c += texture2D(tSrc, vUv + uTexel * vec2(-1.0,  1.0)).rgb;
  c += texture2D(tSrc, vUv + uTexel * vec2( 1.0,  1.0)).rgb;
  c *= 0.25;
  float l = max(c.r, max(c.g, c.b));
  float w = smoothstep(uThr, uThr + 1.2, l);
  gl_FragColor = vec4(min(c * w, vec3(30.0)), 1.0);
}`;
const DOWN = `uniform sampler2D tSrc; uniform vec2 uTexel; varying vec2 vUv;
void main(){
  vec3 c = texture2D(tSrc, vUv).rgb * 4.0;
  c += texture2D(tSrc, vUv + uTexel * vec2(-1.0, -1.0)).rgb;
  c += texture2D(tSrc, vUv + uTexel * vec2( 1.0, -1.0)).rgb;
  c += texture2D(tSrc, vUv + uTexel * vec2(-1.0,  1.0)).rgb;
  c += texture2D(tSrc, vUv + uTexel * vec2( 1.0,  1.0)).rgb;
  gl_FragColor = vec4(c / 8.0, 1.0);
}`;
const UP = `uniform sampler2D tLow; uniform sampler2D tCur; uniform vec2 uTexel; varying vec2 vUv;
void main(){
  vec3 c = vec3(0.0);
  c += texture2D(tLow, vUv + uTexel * vec2(-1.0, 0.0)).rgb * 2.0;
  c += texture2D(tLow, vUv + uTexel * vec2( 1.0, 0.0)).rgb * 2.0;
  c += texture2D(tLow, vUv + uTexel * vec2(0.0, -1.0)).rgb * 2.0;
  c += texture2D(tLow, vUv + uTexel * vec2(0.0,  1.0)).rgb * 2.0;
  c += texture2D(tLow, vUv + uTexel * vec2(-1.0, -1.0)).rgb;
  c += texture2D(tLow, vUv + uTexel * vec2( 1.0, -1.0)).rgb;
  c += texture2D(tLow, vUv + uTexel * vec2(-1.0,  1.0)).rgb;
  c += texture2D(tLow, vUv + uTexel * vec2( 1.0,  1.0)).rgb;
  c += texture2D(tLow, vUv).rgb * 4.0;
  gl_FragColor = vec4(c / 16.0 + texture2D(tCur, vUv).rgb, 1.0);
}`;
const COMP = `uniform sampler2D tScene; uniform sampler2D tBloom; uniform float uBloom; uniform float uFade; varying vec2 vUv;
void main(){
  vec3 c = texture2D(tScene, vUv).rgb + texture2D(tBloom, vUv).rgb * uBloom;
  vec2 d = vUv - 0.5;
  c *= 1.0 - dot(d, d) * 0.45;
  gl_FragColor = vec4(c * uFade, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class Post {
  constructor(renderer) {
    this.r = renderer;
    const opt = { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false };
    this.scene = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
    this.levels = 5;
    this.down = []; this.up = [];
    for (let i = 0; i < this.levels; i++) { this.down.push(new THREE.WebGLRenderTarget(4, 4, opt)); this.up.push(new THREE.WebGLRenderTarget(4, 4, opt)); }
    const mk = (fs, u) => new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: fs, uniforms: u, depthTest: false, depthWrite: false });
    this.mBright = mk(BRIGHT, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uThr: { value: 1.6 } });
    this.mDown = mk(DOWN, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.mUp = mk(UP, { tLow: { value: null }, tCur: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.mComp = mk(COMP, { tScene: { value: null }, tBloom: { value: null }, uBloom: { value: 0.6 }, uFade: { value: 1 } });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mComp);
    this.quad.frustumCulled = false;
    this.qs = new THREE.Scene();
    this.qs.add(this.quad);
    this.qc = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.bloom = 0.6;
  }
  setSize(w, h) {
    this.scene.setSize(w, h);
    let cw = w, ch = h;
    for (let i = 0; i < this.levels; i++) {
      cw = Math.max(1, Math.floor(cw / 2)); ch = Math.max(1, Math.floor(ch / 2));
      this.down[i].setSize(cw, ch); this.up[i].setSize(cw, ch);
    }
  }
  pass(mat, target) {
    this.quad.material = mat;
    this.r.setRenderTarget(target);
    this.r.render(this.qs, this.qc);
  }
  render(scene, camera) {
    const r = this.r;
    r.setRenderTarget(this.scene);
    r.render(scene, camera);
    const src = this.scene.texture;
    this.mBright.uniforms.tSrc.value = src;
    this.mBright.uniforms.uTexel.value.set(1 / this.scene.width, 1 / this.scene.height);
    this.pass(this.mBright, this.down[0]);
    for (let i = 1; i < this.levels; i++) {
      this.mDown.uniforms.tSrc.value = this.down[i - 1].texture;
      this.mDown.uniforms.uTexel.value.set(1 / this.down[i - 1].width, 1 / this.down[i - 1].height);
      this.pass(this.mDown, this.down[i]);
    }
    let low = this.down[this.levels - 1];
    for (let i = this.levels - 2; i >= 0; i--) {
      this.mUp.uniforms.tLow.value = low.texture;
      this.mUp.uniforms.tCur.value = this.down[i].texture;
      this.mUp.uniforms.uTexel.value.set(1 / low.width, 1 / low.height);
      this.pass(this.mUp, this.up[i]);
      low = this.up[i];
    }
    this.mComp.uniforms.tScene.value = src;
    this.mComp.uniforms.tBloom.value = low.texture;
    this.mComp.uniforms.uBloom.value = this.bloom;
    this.pass(this.mComp, null);
  }
}
