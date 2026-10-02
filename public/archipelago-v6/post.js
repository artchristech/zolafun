// Five Lights — HDR scene target (MSAA), bloom chain and ACES composite.
import * as THREE from './three.module.min.js';

const fsVS = /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

export class Post {
  constructor(renderer) {
    this.r = renderer;
    const opt = { type: THREE.HalfFloatType, depthBuffer: false };
    this.scene = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
    this.levels = [];
    for (let i = 0; i < 5; i++) this.levels.push({ a: new THREE.WebGLRenderTarget(4, 4, opt), b: new THREE.WebGLRenderTarget(4, 4, opt) });
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null);
    this.quad.frustumCulled = false;
    this.fs = new THREE.Scene();
    this.fs.add(this.quad);
    this.bright = new THREE.ShaderMaterial({
      uniforms: { tSrc: { value: null }, uThresh: { value: 1.0 } },
      vertexShader: fsVS,
      fragmentShader: /* glsl */`
        uniform sampler2D tSrc; uniform float uThresh; varying vec2 vUv;
        void main(){
          vec3 c = texture2D(tSrc, vUv).rgb;
          float l = max(c.r, max(c.g, c.b));
          gl_FragColor = vec4(c * smoothstep(uThresh, uThresh * 1.8, l), 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });
    this.blur = new THREE.ShaderMaterial({
      uniforms: { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } },
      vertexShader: fsVS,
      fragmentShader: /* glsl */`
        uniform sampler2D tSrc; uniform vec2 uDir; varying vec2 vUv;
        void main(){
          vec3 c = texture2D(tSrc, vUv).rgb * 0.227;
          c += texture2D(tSrc, vUv + uDir * 1.385).rgb * 0.316;
          c += texture2D(tSrc, vUv - uDir * 1.385).rgb * 0.316;
          c += texture2D(tSrc, vUv + uDir * 3.231).rgb * 0.07;
          c += texture2D(tSrc, vUv - uDir * 3.231).rgb * 0.07;
          gl_FragColor = vec4(c, 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });
    this.comp = new THREE.ShaderMaterial({
      uniforms: {
        tScene: { value: null }, t0: { value: null }, t1: { value: null }, t2: { value: null }, t3: { value: null }, t4: { value: null },
        uBloom: { value: 0.4 }, uExposure: { value: 1 }, uFade: { value: 0 }, uVignette: { value: 0.25 },
      },
      vertexShader: fsVS,
      fragmentShader: /* glsl */`
        uniform sampler2D tScene, t0, t1, t2, t3, t4; uniform float uBloom, uExposure, uFade, uVignette; varying vec2 vUv;
        vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0); }
        vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }
        void main(){
          vec3 c = texture2D(tScene, vUv).rgb;
          vec3 b = texture2D(t0, vUv).rgb * 0.6 + texture2D(t1, vUv).rgb * 0.7 + texture2D(t2, vUv).rgb * 0.8
                 + texture2D(t3, vUv).rgb * 0.9 + texture2D(t4, vUv).rgb * 1.0;
          c += b * uBloom;
          c = aces(c * uExposure);
          float v = length(vUv - 0.5);
          c *= 1.0 - smoothstep(0.45, 0.9, v) * uVignette;
          c = toSRGB(c);
          c = mix(c, vec3(0.0), uFade);
          gl_FragColor = vec4(c, 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });
  }
  setSize(w, h) {
    this.scene.setSize(w, h);
    let lw = Math.max(1, w >> 1), lh = Math.max(1, h >> 1);
    for (const L of this.levels) { L.a.setSize(lw, lh); L.b.setSize(lw, lh); L.w = lw; L.h = lh; lw = Math.max(1, lw >> 1); lh = Math.max(1, lh >> 1); }
  }
  pass(material, target) {
    this.quad.material = material;
    this.r.setRenderTarget(target);
    this.r.render(this.fs, this.cam);
  }
  render(scene, camera, bloom, exposure, fade = 0) {
    const r = this.r;
    r.setRenderTarget(this.scene);
    r.render(scene, camera);
    this.bright.uniforms.tSrc.value = this.scene.texture;
    this.pass(this.bright, this.levels[0].b);
    let src = this.levels[0].b;
    for (const L of this.levels) {
      this.blur.uniforms.tSrc.value = src.texture;
      this.blur.uniforms.uDir.value.set(1 / L.w, 0);
      this.pass(this.blur, L.a);
      this.blur.uniforms.tSrc.value = L.a.texture;
      this.blur.uniforms.uDir.value.set(0, 1 / L.h);
      this.pass(this.blur, L.b);
      src = L.b;
    }
    const u = this.comp.uniforms;
    u.tScene.value = this.scene.texture;
    for (let i = 0; i < 5; i++) u['t' + i].value = this.levels[i].b.texture;
    u.uBloom.value = bloom; u.uExposure.value = exposure; u.uFade.value = fade;
    this.pass(this.comp, null);
  }
}
