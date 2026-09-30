import * as THREE from './three.module.min.js';

// HDR scene target + three-level bloom + tone-mapped composite to the screen.
const FS_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

export class Post {
  constructor(renderer) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
    const opt = { type: THREE.HalfFloatType, depthBuffer: false };
    this.rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
    this.levels = [0, 1, 2].map(() => ({ a: new THREE.WebGLRenderTarget(4, 4, opt), b: new THREE.WebGLRenderTarget(4, 4, opt) }));

    this.bright = new THREE.ShaderMaterial({
      uniforms: { tSrc: { value: null }, uThreshold: { value: 1.0 }, uTexel: { value: new THREE.Vector2() } },
      vertexShader: FS_VS,
      fragmentShader: `uniform sampler2D tSrc; uniform float uThreshold; uniform vec2 uTexel; varying vec2 vUv;
        void main(){
          vec3 c = texture2D(tSrc, vUv + uTexel * vec2(-0.5, -0.5)).rgb + texture2D(tSrc, vUv + uTexel * vec2(0.5, -0.5)).rgb
                 + texture2D(tSrc, vUv + uTexel * vec2(-0.5, 0.5)).rgb + texture2D(tSrc, vUv + uTexel * vec2(0.5, 0.5)).rgb;
          c *= 0.25;
          float l = max(max(c.r, c.g), c.b);
          float soft = clamp(l - uThreshold + 0.4, 0.0, 0.8); soft = soft * soft / 1.6;
          float k = max(soft, l - uThreshold) / max(l, 1e-4);
          gl_FragColor = vec4(min(c * k, vec3(40.0)), 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });
    this.down = new THREE.ShaderMaterial({
      uniforms: { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } },
      vertexShader: FS_VS,
      fragmentShader: `uniform sampler2D tSrc; uniform vec2 uTexel; varying vec2 vUv;
        void main(){ vec3 c = texture2D(tSrc, vUv + uTexel * vec2(-1.0,-1.0)).rgb + texture2D(tSrc, vUv + uTexel * vec2(1.0,-1.0)).rgb
          + texture2D(tSrc, vUv + uTexel * vec2(-1.0,1.0)).rgb + texture2D(tSrc, vUv + uTexel * vec2(1.0,1.0)).rgb; gl_FragColor = vec4(c * 0.25, 1.0); }`,
      depthTest: false, depthWrite: false,
    });
    this.blur = new THREE.ShaderMaterial({
      uniforms: { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } },
      vertexShader: FS_VS,
      fragmentShader: `uniform sampler2D tSrc; uniform vec2 uDir; varying vec2 vUv;
        void main(){
          vec3 c = texture2D(tSrc, vUv).rgb * 0.2270270270;
          c += texture2D(tSrc, vUv + uDir * 1.3846153846).rgb * 0.3162162162;
          c += texture2D(tSrc, vUv - uDir * 1.3846153846).rgb * 0.3162162162;
          c += texture2D(tSrc, vUv + uDir * 3.2307692308).rgb * 0.0702702703;
          c += texture2D(tSrc, vUv - uDir * 3.2307692308).rgb * 0.0702702703;
          gl_FragColor = vec4(c, 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });
    this.comp = new THREE.ShaderMaterial({
      uniforms: {
        tScene: { value: this.rt.texture }, tB0: { value: null }, tB1: { value: null }, tB2: { value: null },
        uStrength: { value: 0.5 }, uNight: { value: 0 }, uFade: { value: 1 },
      },
      vertexShader: FS_VS,
      fragmentShader: `uniform sampler2D tScene, tB0, tB1, tB2; uniform float uStrength, uNight, uFade; varying vec2 vUv;
        void main(){
          vec3 c = texture2D(tScene, vUv).rgb;
          vec3 b = texture2D(tB0, vUv).rgb * 0.6 + texture2D(tB1, vUv).rgb * 0.8 + texture2D(tB2, vUv).rgb * 1.0;
          c += b * uStrength;
          vec2 q = vUv - 0.5;
          float vig = 1.0 - dot(q, q) * (0.55 + 0.9 * uNight);
          c *= clamp(vig, 0.0, 1.0) * uFade;
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      depthTest: false, depthWrite: false,
    });
    this.w = 0; this.h = 0;
  }

  setSize(w, h) {
    this.w = w; this.h = h;
    this.rt.setSize(w, h);
    let lw = w, lh = h;
    for (const L of this.levels) {
      lw = Math.max(1, Math.floor(lw / 2)); lh = Math.max(1, Math.floor(lh / 2));
      L.a.setSize(lw, lh); L.b.setSize(lw, lh);
      L.w = lw; L.h = lh;
    }
  }

  pass(mat, target) {
    this.quad.material = mat;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.scene, this.cam);
  }

  render(scene, camera, strength, threshold, night, fade = 1) {
    const r = this.renderer;
    r.setRenderTarget(this.rt);
    r.render(scene, camera);
    let src = this.rt.texture, sw = this.w, sh = this.h;
    this.levels.forEach((L, i) => {
      if (i === 0) {
        this.bright.uniforms.tSrc.value = src;
        this.bright.uniforms.uThreshold.value = threshold;
        this.bright.uniforms.uTexel.value.set(1 / sw, 1 / sh);
        this.pass(this.bright, L.a);
      } else {
        this.down.uniforms.tSrc.value = src;
        this.down.uniforms.uTexel.value.set(0.5 / sw, 0.5 / sh);
        this.pass(this.down, L.a);
      }
      this.blur.uniforms.tSrc.value = L.a.texture;
      this.blur.uniforms.uDir.value.set(1 / L.w, 0);
      this.pass(this.blur, L.b);
      this.blur.uniforms.tSrc.value = L.b.texture;
      this.blur.uniforms.uDir.value.set(0, 1 / L.h);
      this.pass(this.blur, L.a);
      src = L.a.texture; sw = L.w; sh = L.h;
    });
    const cu = this.comp.uniforms;
    cu.tB0.value = this.levels[0].a.texture;
    cu.tB1.value = this.levels[1].a.texture;
    cu.tB2.value = this.levels[2].a.texture;
    cu.uStrength.value = strength;
    cu.uNight.value = night;
    cu.uFade.value = fade;
    this.pass(this.comp, null);
  }
}
