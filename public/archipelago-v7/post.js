// HDR render target -> bright pass -> 3-level blur -> composite (bloom, ACES tone map, grade, vignette).
import * as THREE from './three.module.min.js';

const VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

export class Post {
  constructor(renderer) {
    this.renderer = renderer;
    const opt = { type: THREE.HalfFloatType, depthBuffer: false };
    this.rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
    this.levels = [0, 1, 2].map(() => [new THREE.WebGLRenderTarget(4, 4, opt), new THREE.WebGLRenderTarget(4, 4, opt)]);
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.quad.frustumCulled = false;
    this.qscene = new THREE.Scene();
    this.qscene.add(this.quad);

    this.bright = new THREE.ShaderMaterial({
      uniforms: { tSrc: { value: null }, uThreshold: { value: 1.0 } },
      vertexShader: VERT,
      fragmentShader: `uniform sampler2D tSrc; uniform float uThreshold; varying vec2 vUv;
        void main(){ vec3 c = texture2D(tSrc, vUv).rgb; float l = max(c.r, max(c.g, c.b));
          float k = smoothstep(uThreshold, uThreshold * 1.6, l); gl_FragColor = vec4(min(c * k, vec3(24.0)), 1.0); }`,
      depthTest: false, depthWrite: false,
    });
    this.blur = new THREE.ShaderMaterial({
      uniforms: { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } },
      vertexShader: VERT,
      fragmentShader: `uniform sampler2D tSrc; uniform vec2 uDir; varying vec2 vUv;
        void main(){ vec3 c = texture2D(tSrc, vUv).rgb * 0.2270;
          c += texture2D(tSrc, vUv + uDir * 1.3846).rgb * 0.3162; c += texture2D(tSrc, vUv - uDir * 1.3846).rgb * 0.3162;
          c += texture2D(tSrc, vUv + uDir * 3.2308).rgb * 0.0703; c += texture2D(tSrc, vUv - uDir * 3.2308).rgb * 0.0703;
          gl_FragColor = vec4(c, 1.0); }`,
      depthTest: false, depthWrite: false,
    });
    this.comp = new THREE.ShaderMaterial({
      uniforms: {
        tScene: { value: null }, tB0: { value: null }, tB1: { value: null }, tB2: { value: null },
        uBloom: { value: 0.4 }, uExposure: { value: 1.0 }, uTint: { value: new THREE.Color(1, 1, 1) }, uFade: { value: 0 },
        uSat: { value: 1.1 },
      },
      vertexShader: VERT,
      fragmentShader: `uniform sampler2D tScene, tB0, tB1, tB2; uniform float uBloom, uExposure, uFade, uSat; uniform vec3 uTint; varying vec2 vUv;
        vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0); }
        void main(){
          vec3 c = texture2D(tScene, vUv).rgb;
          vec3 b = texture2D(tB0, vUv).rgb * 0.5 + texture2D(tB1, vUv).rgb * 0.8 + texture2D(tB2, vUv).rgb * 1.1;
          c += b * uBloom;
          c *= uExposure * uTint;
          float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
          c = mix(vec3(l), c, uSat);
          c = aces(c);
          vec2 q = vUv - 0.5; c *= 1.0 - dot(q, q) * 0.55;
          c = mix(c, vec3(0.0), uFade);
          gl_FragColor = linearToOutputTexel(vec4(c, 1.0));
        }`,
      depthTest: false, depthWrite: false,
    });
    this.params = { threshold: 1.0, bloom: 0.4, exposure: 1.0, fade: 0, sat: 1.1, tint: new THREE.Color(1, 1, 1) };
  }

  setSize(w, h) {
    this.rt.setSize(w, h);
    let lw = Math.max(1, w >> 1), lh = Math.max(1, h >> 1);
    for (const [a, b] of this.levels) { a.setSize(lw, lh); b.setSize(lw, lh); lw = Math.max(1, lw >> 1); lh = Math.max(1, lh >> 1); }
  }

  _pass(mat, target) {
    this.quad.material = mat;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.qscene, this.cam);
  }

  render(scene, camera) {
    const r = this.renderer, P = this.params;
    r.setRenderTarget(this.rt);
    r.render(scene, camera);
    this.bright.uniforms.tSrc.value = this.rt.texture;
    this.bright.uniforms.uThreshold.value = P.threshold;
    this._pass(this.bright, this.levels[0][0]);
    let src = this.levels[0][0].texture;
    for (let i = 0; i < 3; i++) {
      const [a, b] = this.levels[i];
      if (i > 0) { this.blur.uniforms.tSrc.value = src; this.blur.uniforms.uDir.value.set(0, 0); this._pass(this.blur, a); }
      this.blur.uniforms.tSrc.value = a.texture;
      this.blur.uniforms.uDir.value.set(1 / a.width, 0);
      this._pass(this.blur, b);
      this.blur.uniforms.tSrc.value = b.texture;
      this.blur.uniforms.uDir.value.set(0, 1 / a.height);
      this._pass(this.blur, a);
      src = a.texture;
    }
    const u = this.comp.uniforms;
    u.tScene.value = this.rt.texture;
    u.tB0.value = this.levels[0][0].texture;
    u.tB1.value = this.levels[1][0].texture;
    u.tB2.value = this.levels[2][0].texture;
    u.uBloom.value = P.bloom;
    u.uExposure.value = P.exposure;
    u.uFade.value = P.fade;
    u.uSat.value = P.sat;
    u.uTint.value.copy(P.tint);
    this._pass(this.comp, null);
  }
}
