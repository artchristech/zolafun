// Stylised sea: depth colour and animated foam rings read from the terrain
// height texture, cel sun glints, and warm reflections of the nearest lights.
import * as THREE from './three.module.min.js';
import { shared } from './materials.js';

const VS = `
varying vec3 vW;
#include <fog_pars_vertex>
void main(){
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vec4 mvPosition = viewMatrix * w;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const FS = `
uniform float uTime; uniform float uTide; uniform sampler2D uHeight; uniform vec2 uHMin; uniform float uHStep; uniform vec2 uHSize;
uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uFoam; uniform vec3 uSunDir; uniform vec3 uSunColor; uniform float uSunI;
uniform vec3 uHorizon; uniform vec3 uLightPos[4]; uniform vec3 uLightCol[4];
varying vec3 vW;
#include <fog_pars_fragment>
float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n2(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(h2(i), h2(i+vec2(1,0)), u.x), mix(h2(i+vec2(0,1)), h2(i+vec2(1,1)), u.x), u.y); }
void main(){
  vec2 uv = ((vW.xz - uHMin) / uHStep + 0.5) / uHSize;
  float ground = texture2D(uHeight, uv).r;
  float depth = uTide - ground;
  vec3 V = normalize(cameraPosition - vW);
  // wave normal
  float t = uTime;
  vec2 p = vW.xz;
  float wa = n2(p * 0.18 + vec2(t * 0.25, t * 0.13)) + n2(p * 0.43 - vec2(t * 0.3, -t * 0.21)) * 0.5;
  float wb = n2(p * 0.18 + vec2(t * 0.25, t * 0.13) + vec2(0.37, 0.0)) + n2(p * 0.43 - vec2(t * 0.3, -t * 0.21) + vec2(0.37, 0.0)) * 0.5;
  float wc = n2(p * 0.18 + vec2(t * 0.25, t * 0.13) + vec2(0.0, 0.37)) + n2(p * 0.43 - vec2(t * 0.3, -t * 0.21) + vec2(0.0, 0.37)) * 0.5;
  vec3 N = normalize(vec3((wa - wb) * 0.9, 1.0, (wa - wc) * 0.9));
  vec3 col = mix(uShallow, uDeep, smoothstep(0.2, 7.0, depth));
  // fresnel toward horizon colour
  float fr = pow(1.0 - max(dot(V, vec3(0.0, 1.0, 0.0)), 0.0), 4.0);
  col = mix(col, uHorizon * 0.9, fr * 0.6);
  // cel sun glints
  vec3 R = reflect(-V, N);
  float sp = pow(max(dot(R, uSunDir), 0.0), 90.0);
  col += uSunColor * step(0.35, sp) * 1.6 * uSunI;
  col += uSunColor * smoothstep(0.75, 1.0, pow(max(dot(R, uSunDir), 0.0), 8.0)) * 0.25 * uSunI;
  // warm light reflections (lantern + beacons)
  for (int i = 0; i < 4; i++) {
    vec3 L = uLightPos[i] - vW; float dl = length(L);
    float s = pow(max(dot(R, L / dl), 0.0), 40.0);
    col += uLightCol[i] * (s * 1.2 + 0.25 / (1.0 + dl * dl * 0.02)) / (1.0 + dl * 0.05);
  }
  // foam: shoreline band plus a ring that travels outward
  float nf = n2(p * 0.7 + t * 0.4);
  float shore = 1.0 - smoothstep(0.18, 0.3, depth + (nf - 0.5) * 0.22);
  float ring = fract(depth * 0.9 - t * 0.22 + nf * 0.15);
  float ringF = step(0.86, ring) * (1.0 - smoothstep(0.4, 1.6, depth)) * step(0.05, depth);
  float foam = max(shore, ringF * 0.85);
  col = mix(col, uFoam, foam);
  float alpha = mix(0.62, 1.0, smoothstep(0.05, 2.6, depth));
  alpha = max(alpha, foam);
  gl_FragColor = vec4(col, alpha);
  #include <fog_fragment>
}`;

export function createWater(hm) {
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    uTide: { value: 2.4 }, uHeight: { value: null }, uHMin: { value: hm.min }, uHStep: { value: hm.step }, uHSize: { value: hm.size },
    uDeep: { value: new THREE.Color() }, uShallow: { value: new THREE.Color() }, uFoam: { value: new THREE.Color(1, 1, 1) },
    uSunDir: { value: new THREE.Vector3() }, uSunColor: { value: new THREE.Color() }, uSunI: { value: 1 }, uHorizon: { value: new THREE.Color() },
    uLightPos: { value: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()] },
    uLightCol: { value: [new THREE.Color(0, 0, 0), new THREE.Color(0, 0, 0), new THREE.Color(0, 0, 0), new THREE.Color(0, 0, 0)] },
  }]);
  uniforms.uHeight.value = hm.tex;
  uniforms.uTime = shared.uTime;
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: VS, fragmentShader: FS, transparent: true, fog: true, depthWrite: true });
  const geo = new THREE.PlaneGeometry(4000, 4000, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(90, 0, -70);
  mesh.renderOrder = -1; // first among transparents so embers, glass and beams draw over it
  mesh.frustumCulled = false;
  return { mesh, u: uniforms };
}
