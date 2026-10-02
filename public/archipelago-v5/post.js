// Five Lights — HDR render target, bloom (threshold + blurred mip chain), ACES + sRGB output.
import * as THREE from './three.module.min.js';

const VS = `varying vec2 vUv; void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

export class Post {
  constructor(renderer) {
    this.r = renderer;
    const opt = { type: THREE.HalfFloatType, depthBuffer: false };
    this.scene = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
    this.levels = [0, 1, 2].map(() => [new THREE.WebGLRenderTarget(4, 4, opt), new THREE.WebGLRenderTarget(4, 4, opt)]);
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(tri, null);
    this.quad.frustumCulled = false;
    this.fsScene = new THREE.Scene();
    this.fsScene.add(this.quad);
    this.bright = new THREE.ShaderMaterial({
      uniforms: { tSrc: { value: null }, uThresh: { value: 1.0 } }, vertexShader: VS, depthTest: false, depthWrite: false,
      fragmentShader: `uniform sampler2D tSrc; uniform float uThresh; varying vec2 vUv;
        void main(){ vec3 c = texture2D(tSrc, vUv).rgb; float l = max(c.r, max(c.g, c.b)); vec3 o = c * smoothstep(uThresh, uThresh * 1.6, l); gl_FragColor = vec4(min(o, vec3(20.0)), 1.0); }`,
    });
    this.blur = new THREE.ShaderMaterial({
      uniforms: { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } }, vertexShader: VS, depthTest: false, depthWrite: false,
      fragmentShader: `uniform sampler2D tSrc; uniform vec2 uDir; varying vec2 vUv;
        void main(){
          vec3 c = texture2D(tSrc, vUv).rgb * 0.227027;
          c += texture2D(tSrc, vUv + uDir * 1.3846).rgb * 0.316216; c += texture2D(tSrc, vUv - uDir * 1.3846).rgb * 0.316216;
          c += texture2D(tSrc, vUv + uDir * 3.2308).rgb * 0.070270; c += texture2D(tSrc, vUv - uDir * 3.2308).rgb * 0.070270;
          gl_FragColor = vec4(c, 1.0); }`,
    });
    this.copy = new THREE.ShaderMaterial({
      uniforms: { tSrc: { value: null } }, vertexShader: VS, depthTest: false, depthWrite: false,
      fragmentShader: `uniform sampler2D tSrc; varying vec2 vUv; void main(){ gl_FragColor = vec4(texture2D(tSrc, vUv).rgb, 1.0); }`,
    });
    this.comp = new THREE.ShaderMaterial({
      uniforms: { tScene: { value: null }, tB0: { value: null }, tB1: { value: null }, tB2: { value: null }, uBloom: { value: 0.5 }, uExposure: { value: 1.0 }, uFade: { value: 1 } },
      vertexShader: VS, depthTest: false, depthWrite: false,
      fragmentShader: `uniform sampler2D tScene, tB0, tB1, tB2; uniform float uBloom, uExposure, uFade; varying vec2 vUv;
        vec3 aces(vec3 x){ x *= 0.6; return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0); }
        vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }
        void main(){
          vec3 c = texture2D(tScene, vUv).rgb;
          vec3 b = texture2D(tB0, vUv).rgb * 0.6 + texture2D(tB1, vUv).rgb * 0.9 + texture2D(tB2, vUv).rgb * 1.2;
          c += b * uBloom;
          c = aces(c * uExposure * 1.6);
          vec2 q = vUv - 0.5; c *= 1.0 - dot(q, q) * 0.45;
          c = toSRGB(c) * uFade;
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
  }
  setSize(w, h) {
    this.scene.setSize(w, h);
    let lw = Math.max(1, w >> 1), lh = Math.max(1, h >> 1);
    for (const [a, b] of this.levels) { a.setSize(lw, lh); b.setSize(lw, lh); lw = Math.max(1, lw >> 1); lh = Math.max(1, lh >> 1); }
  }
  pass(mat, target) { this.quad.material = mat; this.r.setRenderTarget(target); this.r.render(this.fsScene, this.cam); }
  render(scene, camera, bloom, threshold = 1.0, fade = 1) {
    const r = this.r;
    r.setRenderTarget(this.scene);
    r.render(scene, camera);
    this.bright.uniforms.uThresh.value = threshold;
    this.bright.uniforms.tSrc.value = this.scene.texture;
    this.pass(this.bright, this.levels[0][0]);
    for (let i = 0; i < this.levels.length; i++) {
      const [a, b] = this.levels[i];
      if (i > 0) { this.copy.uniforms.tSrc.value = this.levels[i - 1][0].texture; this.pass(this.copy, a); }
      this.blur.uniforms.tSrc.value = a.texture; this.blur.uniforms.uDir.value.set(1 / a.width, 0); this.pass(this.blur, b);
      this.blur.uniforms.tSrc.value = b.texture; this.blur.uniforms.uDir.value.set(0, 1 / a.height); this.pass(this.blur, a);
    }
    const u = this.comp.uniforms;
    u.tScene.value = this.scene.texture; u.tB0.value = this.levels[0][0].texture; u.tB1.value = this.levels[1][0].texture; u.tB2.value = this.levels[2][0].texture;
    u.uBloom.value = bloom; u.uFade.value = fade;
    this.pass(this.comp, null);
  }
}
