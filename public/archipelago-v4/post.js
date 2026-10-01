// HDR scene target (MSAA) -> bright pass -> two-level gaussian bloom ->
// composite with tone mapping, sRGB output and a soft vignette.
import * as THREE from './three.module.min.js';

const VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

export class Post {
  constructor(renderer) {
    this.r = renderer;
    const opt = { type: THREE.HalfFloatType, depthBuffer: false };
    this.scene = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
    this.a1 = new THREE.WebGLRenderTarget(4, 4, opt); this.b1 = new THREE.WebGLRenderTarget(4, 4, opt);
    this.a2 = new THREE.WebGLRenderTarget(4, 4, opt); this.b2 = new THREE.WebGLRenderTarget(4, 4, opt);
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
    this.quad = new THREE.Mesh(g);
    this.quad.frustumCulled = false;
    this.fs = new THREE.Scene();
    this.fs.add(this.quad);
    this.bright = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, uThreshold: { value: 1.0 }, uKnee: { value: 0.6 } },
      vertexShader: VS, depthTest: false, depthWrite: false,
      fragmentShader: `uniform sampler2D tDiffuse; uniform float uThreshold; uniform float uKnee; varying vec2 vUv;
        void main(){ vec3 c = texture2D(tDiffuse, vUv).rgb; float l = max(c.r, max(c.g, c.b));
          float soft = clamp(l - uThreshold + uKnee, 0.0, 2.0 * uKnee); soft = soft * soft / (4.0 * uKnee + 1e-4);
          float w = max(soft, l - uThreshold) / max(l, 1e-4);
          gl_FragColor = vec4(min(c * w, vec3(30.0)), 1.0); }`,
    });
    this.blur = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, uDir: { value: new THREE.Vector2() } },
      vertexShader: VS, depthTest: false, depthWrite: false,
      fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 uDir; varying vec2 vUv;
        void main(){ vec3 s = texture2D(tDiffuse, vUv).rgb * 0.227027;
          s += texture2D(tDiffuse, vUv + uDir * 1.3846153).rgb * 0.3162162; s += texture2D(tDiffuse, vUv - uDir * 1.3846153).rgb * 0.3162162;
          s += texture2D(tDiffuse, vUv + uDir * 3.2307692).rgb * 0.0702703; s += texture2D(tDiffuse, vUv - uDir * 3.2307692).rgb * 0.0702703;
          gl_FragColor = vec4(s, 1.0); }`,
    });
    this.comp = new THREE.ShaderMaterial({
      uniforms: { tScene: { value: null }, tB1: { value: null }, tB2: { value: null }, uStrength: { value: 0.6 }, uVig: { value: 0.25 }, uLift: { value: new THREE.Color(0, 0, 0) } },
      vertexShader: VS, depthTest: false, depthWrite: false,
      fragmentShader: `uniform sampler2D tScene; uniform sampler2D tB1; uniform sampler2D tB2; uniform float uStrength; uniform float uVig; uniform vec3 uLift; varying vec2 vUv;
        void main(){ vec3 c = texture2D(tScene, vUv).rgb;
          vec3 b = texture2D(tB1, vUv).rgb * 0.7 + texture2D(tB2, vUv).rgb * 1.0;
          c += b * uStrength + uLift;
          vec2 q = vUv - 0.5; c *= 1.0 - dot(q, q) * uVig * 2.0;
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
  }
  setSize(w, h) {
    this.scene.setSize(w, h);
    const w1 = Math.max(1, w >> 1), h1 = Math.max(1, h >> 1), w2 = Math.max(1, w >> 2), h2 = Math.max(1, h >> 2);
    this.a1.setSize(w1, h1); this.b1.setSize(w1, h1); this.a2.setSize(w2, h2); this.b2.setSize(w2, h2);
    this.s1 = [w1, h1]; this.s2 = [w2, h2];
  }
  pass(mat, target) { this.quad.material = mat; this.r.setRenderTarget(target); this.r.render(this.fs, this.cam); }
  render(scene, camera, onSceneRendered) {
    const r = this.r;
    r.setRenderTarget(this.scene);
    r.render(scene, camera);
    if (onSceneRendered) onSceneRendered();
    this.bright.uniforms.tDiffuse.value = this.scene.texture; this.pass(this.bright, this.a1);
    const bl = this.blur.uniforms;
    bl.tDiffuse.value = this.a1.texture; bl.uDir.value.set(1 / this.s1[0], 0); this.pass(this.blur, this.b1);
    bl.tDiffuse.value = this.b1.texture; bl.uDir.value.set(0, 1 / this.s1[1]); this.pass(this.blur, this.a1);
    bl.tDiffuse.value = this.a1.texture; bl.uDir.value.set(1 / this.s2[0], 0); this.pass(this.blur, this.b2);
    bl.tDiffuse.value = this.b2.texture; bl.uDir.value.set(0, 1 / this.s2[1]); this.pass(this.blur, this.a2);
    bl.tDiffuse.value = this.a2.texture; bl.uDir.value.set(2 / this.s2[0], 0); this.pass(this.blur, this.b2);
    bl.tDiffuse.value = this.b2.texture; bl.uDir.value.set(0, 2 / this.s2[1]); this.pass(this.blur, this.a2);
    const cu = this.comp.uniforms;
    cu.tScene.value = this.scene.texture; cu.tB1.value = this.a1.texture; cu.tB2.value = this.a2.texture;
    this.pass(this.comp, null);
  }
}
