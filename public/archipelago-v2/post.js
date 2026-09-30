// HDR render target + custom bloom (threshold, mip-chain blur) + ACES tonemap composite.
import * as THREE from './three.module.min.js';

const quadVert = /* glsl */ `
  varying vec2 vUv;
  void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

export class Post {
  constructor(renderer) {
    this.renderer = renderer;
    this.levels = 5;
    this.strength = 0.6;
    this.threshold = 1.2;
    this.eyepiece = 0;
    this.fade = 0; // 0 = none, 1 = black
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.quad.frustumCulled = false;
    this.scene = new THREE.Scene();
    this.scene.add(this.quad);

    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    this.main = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.HalfFloatType, samples: 4, depthBuffer: true,
    });
    this.mips = [];
    for (let i = 0; i < this.levels; i++) {
      const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: false });
      rt.texture.minFilter = THREE.LinearFilter;
      rt.texture.magFilter = THREE.LinearFilter;
      this.mips.push(rt);
    }

    this.brightMat = new THREE.ShaderMaterial({
      uniforms: { tSrc: { value: null }, uThreshold: { value: 1 }, uTexel: { value: new THREE.Vector2() } },
      vertexShader: quadVert,
      fragmentShader: /* glsl */ `
        uniform sampler2D tSrc; uniform float uThreshold; uniform vec2 uTexel; varying vec2 vUv;
        vec3 pick(vec2 o){ vec3 c = texture2D(tSrc, vUv + o*uTexel).rgb; float l = max(c.r, max(c.g, c.b));
          float k = max(l - uThreshold, 0.0); k = k*k / (k + 0.5); return c * (k / max(l, 1e-4)); }
        void main(){
          vec3 c = pick(vec2(-1.0,-1.0)) + pick(vec2(1.0,-1.0)) + pick(vec2(-1.0,1.0)) + pick(vec2(1.0,1.0));
          gl_FragColor = vec4(min(c*0.25, vec3(60.0)), 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });
    this.downMat = new THREE.ShaderMaterial({
      uniforms: { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } },
      vertexShader: quadVert,
      fragmentShader: /* glsl */ `
        uniform sampler2D tSrc; uniform vec2 uTexel; varying vec2 vUv;
        void main(){
          vec3 c = texture2D(tSrc, vUv).rgb * 4.0;
          c += texture2D(tSrc, vUv + uTexel*vec2(-1.0,-1.0)).rgb;
          c += texture2D(tSrc, vUv + uTexel*vec2( 1.0,-1.0)).rgb;
          c += texture2D(tSrc, vUv + uTexel*vec2(-1.0, 1.0)).rgb;
          c += texture2D(tSrc, vUv + uTexel*vec2( 1.0, 1.0)).rgb;
          gl_FragColor = vec4(c / 8.0, 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });
    this.upMat = new THREE.ShaderMaterial({
      uniforms: { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uScale: { value: 1 } },
      vertexShader: quadVert,
      fragmentShader: /* glsl */ `
        uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uScale; varying vec2 vUv;
        void main(){
          vec2 o = uTexel;
          vec3 c = texture2D(tSrc, vUv).rgb * 4.0;
          c += texture2D(tSrc, vUv + vec2(-o.x, 0.0)).rgb * 2.0;
          c += texture2D(tSrc, vUv + vec2( o.x, 0.0)).rgb * 2.0;
          c += texture2D(tSrc, vUv + vec2(0.0, -o.y)).rgb * 2.0;
          c += texture2D(tSrc, vUv + vec2(0.0,  o.y)).rgb * 2.0;
          c += texture2D(tSrc, vUv + vec2(-o.x, -o.y)).rgb;
          c += texture2D(tSrc, vUv + vec2( o.x, -o.y)).rgb;
          c += texture2D(tSrc, vUv + vec2(-o.x,  o.y)).rgb;
          c += texture2D(tSrc, vUv + vec2( o.x,  o.y)).rgb;
          gl_FragColor = vec4(c / 16.0 * uScale, 1.0);
        }`,
      blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, transparent: true,
    });
    this.compMat = new THREE.ShaderMaterial({
      uniforms: {
        tScene: { value: this.main.texture }, tBloom: { value: this.mips[0].texture },
        uStrength: { value: 0.6 }, uExposure: { value: 1.0 }, uEye: { value: 0 }, uAspect: { value: 1 },
        uFade: { value: 0 }, uTime: { value: 0 }, uSat: { value: 1.1 },
      },
      vertexShader: quadVert,
      fragmentShader: /* glsl */ `
        uniform sampler2D tScene, tBloom; uniform float uStrength, uExposure, uEye, uAspect, uFade, uTime, uSat;
        varying vec2 vUv;
        vec3 aces(vec3 x){ const float a=2.51, b=0.03, c=2.43, d=0.59, e=0.14; return clamp((x*(a*x+b))/(x*(c*x+d)+e), 0.0, 1.0); }
        vec3 toSRGB(vec3 c){ return mix(c*12.92, 1.055*pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }
        void main(){
          vec3 c = texture2D(tScene, vUv).rgb;
          vec3 b = texture2D(tBloom, vUv).rgb;
          c += b * uStrength;
          c *= uExposure;
          c = aces(c);
          float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
          c = mix(vec3(l), c, uSat);
          vec2 q = vUv - 0.5; q.x *= uAspect;
          float vig = smoothstep(0.95, 0.35, length(q));
          c *= mix(0.78, 1.0, vig);
          if (uEye > 0.0) {
            float r = length(q);
            float ring = smoothstep(0.36, 0.34, r);
            c *= mix(1.0, ring, uEye);
            c += vec3(0.6, 0.45, 0.2) * smoothstep(0.34, 0.345, r) * smoothstep(0.36, 0.352, r) * uEye;
          }
          c = toSRGB(c);
          // tiny dither to avoid sky banding
          float n = fract(sin(dot(gl_FragCoord.xy + uTime, vec2(12.9898, 78.233))) * 43758.5453);
          c += (n - 0.5) / 255.0;
          c *= 1.0 - uFade;
          gl_FragColor = vec4(c, 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });
    this.setSize();
  }
  setSize() {
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.main.setSize(size.x, size.y);
    let w = size.x, h = size.y;
    for (let i = 0; i < this.levels; i++) {
      w = Math.max(2, Math.floor(w / 2));
      h = Math.max(2, Math.floor(h / 2));
      this.mips[i].setSize(w, h);
    }
    this.compMat.uniforms.uAspect.value = size.x / size.y;
  }
  pass(mat, target, clear = true) {
    this.quad.material = mat;
    this.renderer.setRenderTarget(target);
    if (clear) this.renderer.clear(true, false, false);
    this.renderer.render(this.scene, this.cam);
  }
  render(scene, camera, time) {
    const r = this.renderer;
    r.setRenderTarget(this.main);
    r.clear();
    r.render(scene, camera);
    const prevAuto = r.autoClear;
    r.autoClear = false;
    // bright pass into mip 0
    this.brightMat.uniforms.tSrc.value = this.main.texture;
    this.brightMat.uniforms.uThreshold.value = this.threshold;
    this.brightMat.uniforms.uTexel.value.set(1 / this.main.width, 1 / this.main.height);
    this.pass(this.brightMat, this.mips[0]);
    for (let i = 1; i < this.levels; i++) {
      this.downMat.uniforms.tSrc.value = this.mips[i - 1].texture;
      this.downMat.uniforms.uTexel.value.set(1 / this.mips[i - 1].width, 1 / this.mips[i - 1].height);
      this.pass(this.downMat, this.mips[i]);
    }
    for (let i = this.levels - 1; i > 0; i--) {
      this.upMat.uniforms.tSrc.value = this.mips[i].texture;
      this.upMat.uniforms.uTexel.value.set(1 / this.mips[i].width, 1 / this.mips[i].height);
      this.upMat.uniforms.uScale.value = 1.0;
      this.pass(this.upMat, this.mips[i - 1], false);
    }
    const u = this.compMat.uniforms;
    u.uStrength.value = this.strength;
    u.uEye.value = this.eyepiece;
    u.uFade.value = this.fade;
    u.uTime.value = time % 100;
    this.pass(this.compMat, null);
    r.autoClear = prevAuto;
  }
}
