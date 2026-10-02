// HDR scene target (MSAA) -> bright pass -> mip blur chain -> composite with
// ACES tone mapping. Bloom strength and threshold follow the time of day so
// flames glow at night.
import * as THREE from './three.module.min.js';

const VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

export class Post {
  constructor(renderer) {
    this.r = renderer;
    this.scene = new THREE.Scene();
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
    const opts = { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
    this.sceneRT = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
    this.levels = 5;
    this.down = []; this.up = [];
    for (let i = 0; i < this.levels; i++) { this.down.push(new THREE.WebGLRenderTarget(4, 4, opts)); this.up.push(new THREE.WebGLRenderTarget(4, 4, opts)); }
    const mk = (fs, uniforms) => new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: fs, uniforms, depthTest: false, depthWrite: false });
    this.bright = mk(`uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uThresh; varying vec2 vUv;
      vec3 s(vec2 o){ vec3 c = texture2D(tSrc, vUv + o * uTexel).rgb; float l = max(c.r, max(c.g, c.b)); return c * max(l - uThresh, 0.0) / max(l, 1e-4); }
      void main(){ vec3 c = s(vec2(-1.0,-1.0)) + s(vec2(1.0,-1.0)) + s(vec2(-1.0,1.0)) + s(vec2(1.0,1.0)); gl_FragColor = vec4(min(c * 0.25, vec3(40.0)), 1.0); }`,
    { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uThresh: { value: 1 } });
    this.downM = mk(`uniform sampler2D tSrc; uniform vec2 uTexel; varying vec2 vUv;
      void main(){ vec3 c = texture2D(tSrc, vUv).rgb * 4.0;
        c += texture2D(tSrc, vUv + vec2(-1.0,-1.0) * uTexel).rgb + texture2D(tSrc, vUv + vec2(1.0,-1.0) * uTexel).rgb;
        c += texture2D(tSrc, vUv + vec2(-1.0,1.0) * uTexel).rgb + texture2D(tSrc, vUv + vec2(1.0,1.0) * uTexel).rgb;
        gl_FragColor = vec4(c / 8.0, 1.0); }`,
    { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.upM = mk(`uniform sampler2D tLow; uniform sampler2D tCur; uniform vec2 uTexel; varying vec2 vUv;
      void main(){ vec3 c = vec3(0.0);
        c += texture2D(tLow, vUv + vec2(-2.0, 0.0) * uTexel).rgb + texture2D(tLow, vUv + vec2(2.0, 0.0) * uTexel).rgb;
        c += texture2D(tLow, vUv + vec2(0.0, -2.0) * uTexel).rgb + texture2D(tLow, vUv + vec2(0.0, 2.0) * uTexel).rgb;
        c += (texture2D(tLow, vUv + vec2(-1.0, -1.0) * uTexel).rgb + texture2D(tLow, vUv + vec2(1.0, -1.0) * uTexel).rgb
            + texture2D(tLow, vUv + vec2(-1.0, 1.0) * uTexel).rgb + texture2D(tLow, vUv + vec2(1.0, 1.0) * uTexel).rgb) * 2.0;
        gl_FragColor = vec4(c / 12.0 + texture2D(tCur, vUv).rgb, 1.0); }`,
    { tLow: { value: null }, tCur: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.comp = mk(`uniform sampler2D tScene; uniform sampler2D tBloom; uniform float uStrength; uniform float uNight; varying vec2 vUv;
      void main(){
        vec3 c = texture2D(tScene, vUv).rgb + texture2D(tBloom, vUv).rgb * uStrength;
        float v = smoothstep(0.95, 0.3, length(vUv - 0.5));
        c *= mix(1.0, v, 0.35 + uNight * 0.3);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    { tScene: { value: null }, tBloom: { value: null }, uStrength: { value: 0.5 }, uNight: { value: 0 } });
    this.strength = 0.5; this.thresh = 1.5; this.night = 0;
  }
  setSize(w, h) {
    this.sceneRT.setSize(w, h);
    let cw = Math.max(1, w >> 1), ch = Math.max(1, h >> 1);
    for (let i = 0; i < this.levels; i++) {
      this.down[i].setSize(cw, ch); this.up[i].setSize(cw, ch);
      cw = Math.max(1, cw >> 1); ch = Math.max(1, ch >> 1);
    }
  }
  pass(mat, target) {
    this.quad.material = mat;
    this.r.setRenderTarget(target);
    this.r.render(this.scene, this.cam);
  }
  render(scene, camera) {
    const r = this.r;
    r.setRenderTarget(this.sceneRT);
    r.render(scene, camera);
    const src = this.sceneRT.texture;
    this.bright.uniforms.tSrc.value = src;
    this.bright.uniforms.uTexel.value.set(0.5 / this.sceneRT.width, 0.5 / this.sceneRT.height);
    this.bright.uniforms.uThresh.value = this.thresh;
    this.pass(this.bright, this.down[0]);
    for (let i = 1; i < this.levels; i++) {
      this.downM.uniforms.tSrc.value = this.down[i - 1].texture;
      this.downM.uniforms.uTexel.value.set(1 / this.down[i - 1].width, 1 / this.down[i - 1].height);
      this.pass(this.downM, this.down[i]);
    }
    let low = this.down[this.levels - 1];
    for (let i = this.levels - 2; i >= 0; i--) {
      this.upM.uniforms.tLow.value = low.texture;
      this.upM.uniforms.tCur.value = this.down[i].texture;
      this.upM.uniforms.uTexel.value.set(0.5 / low.width, 0.5 / low.height);
      this.pass(this.upM, this.up[i]);
      low = this.up[i];
    }
    this.comp.uniforms.tScene.value = src;
    this.comp.uniforms.tBloom.value = low.texture;
    this.comp.uniforms.uStrength.value = this.strength;
    this.comp.uniforms.uNight.value = this.night;
    this.pass(this.comp, null);
  }
}
