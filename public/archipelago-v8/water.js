// Stylised sea: depth-tinted from the terrain height texture, hard-edged foam
// along shores and over surfacing causeways, cel glints, and shimmering
// pools of light under burning beacons at night.
import * as THREE from './three.module.min.js';
import { U, GLSL_NOISE } from './materials.js';

export class Water {
  constructor(scene, heightTex) {
    this.uniforms = {
      uHeight: { value: heightTex }, uLevel: U.uWater, uTime: U.uTime,
      uShallow: { value: new THREE.Color() }, uDeep: { value: new THREE.Color() }, uSky: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color() }, uNight: U.uNight,
      uFogColor: U.uFogColor, uFogNear: U.uFogNear, uFogFar: U.uFogFar,
      uLights: { value: [0, 1, 2, 3, 4].map(() => new THREE.Vector4()) },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: `
uniform float uLevel;
varying vec3 vW; varying float vDepth;
void main(){
  vec4 w = modelMatrix * vec4(position, 1.0);
  w.y = uLevel;
  vW = w.xyz;
  vec4 mv = viewMatrix * w;
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`,
      fragmentShader: `
uniform sampler2D uHeight; uniform float uLevel, uTime, uNight;
uniform vec3 uShallow, uDeep, uSky, uSunDir, uSunCol, uFogColor; uniform float uFogNear, uFogFar;
uniform vec4 uLights[5];
varying vec3 vW; varying float vDepth;
${GLSL_NOISE}
void main(){
  vec2 uv = (vW.xz + 160.5) / 321.0;
  float g = -9.0;
  if (uv.x > 0.0 && uv.y > 0.0 && uv.x < 1.0 && uv.y < 1.0) g = texture2D(uHeight, uv).r;
  float depth = uLevel - g;
  vec2 p = vW.xz;
  float t = uTime;
  float n1 = vnoise(p * 0.13 + vec2(t * 0.05, t * 0.03));
  float n2 = vnoise(p * 0.37 - vec2(t * 0.09, -t * 0.07));
  vec3 N = normalize(vec3((n1 - 0.5) * 0.35 + (n2 - 0.5) * 0.2, 1.0, (n2 - 0.5) * 0.35 - (n1 - 0.5) * 0.1));
  vec3 V = normalize(cameraPosition - vW);
  float fres = pow(1.0 - max(dot(N, V), 0.0), 4.0);
  float dk = smoothstep(0.3, 7.0, depth);
  dk = floor(dk * 4.0 + 0.5) / 4.0;
  vec3 col = mix(uShallow, uDeep, dk);
  col = mix(col, uSky, clamp(fres * 0.65, 0.0, 0.6));
  // cel sun glint
  vec3 R = reflect(-V, N);
  float sp = pow(max(dot(R, uSunDir), 0.0), 90.0);
  col += uSunCol * step(0.35, sp) * 1.6 * (1.0 - uNight);
  // sparkle ripples
  float rip = step(0.78, vnoise(p * 0.9 + vec2(t * 0.4, -t * 0.25)) * vnoise(p * 0.5 - vec2(t * 0.1, 0.0)) * 1.9);
  col = mix(col, mix(uSky, vec3(1.0), 0.5), rip * 0.25 * (1.0 - dk * 0.5));
  // shore foam: a solid edge plus travelling bands
  float fn = vnoise(p * 0.7 + vec2(t * 0.25, t * 0.1));
  float edge = 1.0 - step(0.12 + fn * 0.22, depth);
  float bands = step(0.62, fract(depth * 1.1 - t * 0.22 + fn * 0.4)) * (1.0 - smoothstep(0.2, 1.3, depth));
  vec3 foamC = mix(vec3(0.96, 0.98, 1.0), vec3(0.55, 0.62, 0.78), uNight);
  col = mix(col, foamC, max(edge, bands * 0.75) * step(-0.05, depth));
  // light pools under fires
  for (int i = 0; i < 5; i++) {
    vec4 L = uLights[i];
    if (L.w <= 0.0) continue;
    float d = length(vW.xz - L.xz);
    float h = max(L.y - uLevel, 1.0);
    float s = vnoise(vW.xz * 1.3 + vec2(0.0, t * 1.4));
    float pool = (1.0 - smoothstep(0.0, 6.0 + h * 1.6, d)) * step(0.42, s);
    col += vec3(1.0, 0.62, 0.25) * pool * L.w * 0.9;
  }
  float f = smoothstep(uFogNear, uFogFar, vDepth);
  gl_FragColor = vec4(mix(col, uFogColor, f), 1.0);
}`,
    });
    const geo = new THREE.PlaneGeometry(4000, 4000, 1, 1);
    geo.rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1;
    scene.add(this.mesh);
  }
  update(sky, sunDir, lights) {
    const u = this.uniforms;
    u.uShallow.value.copy(sky.shallow);
    u.uDeep.value.copy(sky.deep);
    u.uSky.value.copy(sky.sky);
    u.uSunDir.value.copy(sunDir);
    u.uSunCol.value.copy(sky.sunCol);
    for (let i = 0; i < 5; i++) {
      const L = lights[i];
      if (L) u.uLights.value[i].set(L.x, L.y, L.z, L.w); else u.uLights.value[i].set(0, 0, 0, 0);
    }
  }
}
