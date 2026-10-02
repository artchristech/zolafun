// HDR scene target -> bright pass -> blurred mip chain -> composite with ACES tone mapping.
import * as THREE from './three.module.min.js';

const VS = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

export class Post {
  constructor(renderer) {
    this.r = renderer;
    const opt = { type: THREE.HalfFloatType, depthBuffer: false };
    this.scene = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
    this.levels = [];
    for (let i = 0; i < 3; i++) this.levels.push([new THREE.WebGLRenderTarget(4, 4, opt), new THREE.WebGLRenderTarget(4, 4, opt)]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
    this.quad = new THREE.Mesh(geo);
    this.quad.frustumCulled = false;
    this.fsScene = new THREE.Scene();
    this.fsScene.add(this.quad);
    this.fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const base = { vertexShader: VS, depthTest: false, depthWrite: false };
    this.bright = new THREE.ShaderMaterial({
      ...base,
      uniforms: { tSrc: { value: null }, uTh: { value: 1.15 }, uTexel: { value: new THREE.Vector2() } },
      fragmentShader: /* glsl */ `uniform sampler2D tSrc; uniform float uTh; uniform vec2 uTexel; varying vec2 vUv;
        void main(){
          vec3 c = texture2D(tSrc, vUv + uTexel*vec2(-0.5,-0.5)).rgb + texture2D(tSrc, vUv + uTexel*vec2(0.5,-0.5)).rgb
                 + texture2D(tSrc, vUv + uTexel*vec2(-0.5,0.5)).rgb + texture2D(tSrc, vUv + uTexel*vec2(0.5,0.5)).rgb;
          c *= 0.25;
          float l = max(c.r, max(c.g, c.b));
          float k = smoothstep(uTh, uTh + 0.8, l);
          gl_FragColor = vec4(min(c*k, vec3(16.0)), 1.0);
        }`,
    });
    this.blur = new THREE.ShaderMaterial({
      ...base,
      uniforms: { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } },
      fragmentShader: /* glsl */ `uniform sampler2D tSrc; uniform vec2 uDir; varying vec2 vUv;
        void main(){
          vec3 c = texture2D(tSrc, vUv).rgb * 0.227027;
          c += (texture2D(tSrc, vUv + uDir*1.3846).rgb + texture2D(tSrc, vUv - uDir*1.3846).rgb) * 0.3162162;
          c += (texture2D(tSrc, vUv + uDir*3.2308).rgb + texture2D(tSrc, vUv - uDir*3.2308).rgb) * 0.0702703;
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    this.copy = new THREE.ShaderMaterial({
      ...base,
      uniforms: { tSrc: { value: null } },
      fragmentShader: /* glsl */ `uniform sampler2D tSrc; varying vec2 vUv; void main(){ gl_FragColor = vec4(texture2D(tSrc, vUv).rgb, 1.0); }`,
    });
    this.comp = new THREE.ShaderMaterial({
      ...base,
      uniforms: {
        tScene: { value: null }, tB0: { value: null }, tB1: { value: null }, tB2: { value: null },
        uBloom: { value: 0.4 }, uExposure: { value: 1.0 }, uFade: { value: 0 },
      },
      fragmentShader: /* glsl */ `uniform sampler2D tScene, tB0, tB1, tB2; uniform float uBloom, uExposure, uFade; varying vec2 vUv;
        vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0); }
        vec3 toSRGB(vec3 c){ return mix(c*12.92, 1.055*pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }
        void main(){
          vec3 c = texture2D(tScene, vUv).rgb;
          vec3 b = texture2D(tB0, vUv).rgb*0.6 + texture2D(tB1, vUv).rgb*0.8 + texture2D(tB2, vUv).rgb*1.0;
          c += b*uBloom;
          c = aces(c*uExposure);
          vec2 q = vUv - 0.5;
          c *= 1.0 - dot(q,q)*0.45;
          c = toSRGB(c);
          c = mix(c, vec3(0.0), uFade);
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
  }
  setSize(w, h) {
    this.scene.setSize(w, h);
    let lw = Math.max(1, w >> 1), lh = Math.max(1, h >> 1);
    for (const [a, b] of this.levels) {
      a.setSize(lw, lh);
      b.setSize(lw, lh);
      lw = Math.max(1, lw >> 1);
      lh = Math.max(1, lh >> 1);
    }
    this.w = w;
    this.h = h;
  }
  _pass(mat, target) {
    this.quad.material = mat;
    this.r.setRenderTarget(target);
    this.r.render(this.fsScene, this.fsCam);
  }
  render(scene, camera, bloom, fade = 0) {
    const r = this.r;
    r.setRenderTarget(this.scene);
    r.render(scene, camera);
    // bright pass into level 0
    this.bright.uniforms.tSrc.value = this.scene.texture;
    this.bright.uniforms.uTexel.value.set(1 / this.w, 1 / this.h);
    this._pass(this.bright, this.levels[0][0]);
    for (let i = 0; i < this.levels.length; i++) {
      const [a, b] = this.levels[i];
      if (i > 0) {
        this.copy.uniforms.tSrc.value = this.levels[i - 1][0].texture;
        this._pass(this.copy, a);
      }
      const w = a.width, h = a.height;
      this.blur.uniforms.tSrc.value = a.texture;
      this.blur.uniforms.uDir.value.set(1 / w, 0);
      this._pass(this.blur, b);
      this.blur.uniforms.tSrc.value = b.texture;
      this.blur.uniforms.uDir.value.set(0, 1 / h);
      this._pass(this.blur, a);
    }
    const c = this.comp.uniforms;
    c.tScene.value = this.scene.texture;
    c.tB0.value = this.levels[0][0].texture;
    c.tB1.value = this.levels[1][0].texture;
    c.tB2.value = this.levels[2][0].texture;
    c.uBloom.value = bloom;
    c.uFade.value = fade;
    this._pass(this.comp, null);
  }
}
