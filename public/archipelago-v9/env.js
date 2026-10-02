// Sky, sea, sun/moon, fog and the light pool.
import * as THREE from './three.module.min.js';
import { NOISE_GLSL, clamp, lerp, smooth } from './util.js';
import { BOUNDS, waterHeightTexture } from './terrain.js';
import { OBS } from './places.js';

const SKY_VS = `
varying vec3 vDir;
void main(){
  vDir = position;
  vec4 p = projectionMatrix * viewMatrix * vec4(cameraPosition + position, 1.0);
  gl_Position = p.xyww;
}`;
const SKY_FS = `
uniform vec3 uSunDir, uZenith, uHorizon, uSunCol, uGlow, uStarDir;
uniform float uNight, uTime, uSunVis;
varying vec3 vDir;
${NOISE_GLSL}
void main(){
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(uHorizon, uZenith, pow(smoothstep(-0.02, 0.65, h), 0.65));
  float sd = max(dot(d, uSunDir), 0.0);
  col += uGlow * (pow(sd, 5.0) * 0.55 + pow(sd, 48.0) * 0.8) * smoothstep(-0.25, 0.05, h + 0.1);
  col = mix(col, uSunCol * 4.0, step(0.9988, sd) * uSunVis);
  if (h > 0.0) {
    vec2 uv = d.xz / (h + 0.12) * 1.1 + vec2(uTime * 0.003, uTime * 0.001);
    float n = fbm2(uv * 1.3);
    float c1 = step(0.56, n), c2 = step(0.62, n);
    vec3 cloud = mix(uHorizon * 0.95 + uGlow * 0.25, uHorizon * 1.15 + uGlow * 0.5 + 0.05, c2);
    col = mix(col, cloud, c1 * smoothstep(0.0, 0.12, h) * (1.0 - uNight * 0.6));
    vec3 sp = d * 160.0;
    vec3 cell = floor(sp);
    float r = fract(sin(dot(cell, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
    float star = step(0.986, r) * step(length(fract(sp) - 0.5), 0.22);
    col += vec3(0.9, 0.95, 1.0) * star * uNight * (1.0 - c1 * 0.8) * 1.4;
    float es = max(dot(d, uStarDir), 0.0);
    col += vec3(1.0, 0.95, 0.85) * step(0.99993, es) * (0.6 + uNight * 3.0);
    col += vec3(0.7, 0.75, 1.0) * pow(es, 900.0) * uNight * 0.6;
  }
  col = mix(col, uHorizon * 0.92, smoothstep(0.01, -0.08, h));
  gl_FragColor = vec4(col, 1.0);
}`;

const WATER_VS = `
uniform float uTime, uLevel;
varying vec3 vW;
#include <fog_pars_vertex>
void main(){
  vec4 w = modelMatrix * vec4(position, 1.0);
  w.y = uLevel + sin(w.x * 0.15 + uTime * 1.1) * 0.05 + sin(w.z * 0.21 - uTime * 0.9) * 0.04;
  vW = w.xyz;
  vec4 mvPosition = viewMatrix * w;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const WATER_FS = `
uniform sampler2D uHeight;
uniform vec4 uBounds;
uniform float uTime, uLevel, uLightLvl;
uniform vec3 uShallow, uDeep, uSky, uSunDir, uSunCol, uFoam;
uniform vec4 uPL[5];
varying vec3 vW;
#include <fog_pars_fragment>
${NOISE_GLSL}
void main(){
  vec2 uv = (vW.xz - uBounds.xy) / uBounds.zw;
  float g = texture2D(uHeight, uv).r;
  float depth = uLevel - g;
  if (depth < -0.08) discard;
  vec3 col = mix(uShallow, uDeep, smoothstep(0.0, 5.0, depth));
  float n = vn(vW.xz * 0.25 + vec2(uTime * 0.15, uTime * 0.1));
  float n2 = vn(vW.xz * 0.6 - vec2(uTime * 0.2, -uTime * 0.13));
  vec3 V = normalize(cameraPosition - vW);
  float fres = pow(1.0 - max(V.y, 0.0), 3.0);
  col = mix(col, uSky, fres * 0.55);
  vec3 R = reflect(-V, vec3(0.0, 1.0, 0.0));
  float sd = dot(R, uSunDir);
  col += uSunCol * step(0.985, sd + (n2 - 0.5) * 0.03) * 1.2;
  col += uSunCol * step(0.83, n * 0.6 + n2 * 0.5) * 0.1;
  vec3 warm = vec3(0.0);
  for (int i = 0; i < 5; i++) {
    vec3 d = uPL[i].xyz - vW;
    float dd = dot(d.xz, d.xz) + d.y * d.y;
    warm += vec3(1.0, 0.55, 0.2) * uPL[i].w / (1.0 + dd * 0.02);
  }
  col += warm * 0.08;
  float band = step(0.55, fract(depth * 1.4 - uTime * 0.25 + n * 0.4)) * (1.0 - smoothstep(0.15, 1.0, depth));
  float edge = 1.0 - smoothstep(0.0, 0.2 + n * 0.12, depth);
  float foam = max(edge, band * 0.8);
  col = mix(col, uFoam * (uLightLvl + warm * 0.3), foam);
  float alpha = mix(0.42, 0.94, smoothstep(0.0, 2.5, depth));
  alpha = max(alpha, foam * 0.95);
  gl_FragColor = vec4(col, alpha);
  #include <fog_fragment>
}`;

// time-of-day keyframes over t (0 = golden hour start, 1 = night)
const K = [
  { t: 0.0, sun: [1.0, 0.8, 0.55], sunI: 3.0, zen: [0.33, 0.52, 0.82], hor: [1.0, 0.8, 0.58], glow: [1.0, 0.7, 0.4], fog: [0.92, 0.78, 0.62], dens: 0.0022, hs: [0.62, 0.7, 0.86], hg: [0.52, 0.4, 0.3], hI: 0.95, sh: [0.25, 0.78, 0.74], dp: [0.05, 0.33, 0.52], night: 0, ll: 1 },
  { t: 0.45, sun: [1.0, 0.66, 0.38], sunI: 2.7, zen: [0.28, 0.42, 0.75], hor: [1.0, 0.64, 0.42], glow: [1.0, 0.55, 0.3], fog: [0.88, 0.64, 0.52], dens: 0.0028, hs: [0.55, 0.58, 0.8], hg: [0.48, 0.34, 0.28], hI: 0.85, sh: [0.24, 0.68, 0.7], dp: [0.05, 0.28, 0.48], night: 0, ll: 0.95 },
  { t: 0.7, sun: [1.0, 0.42, 0.2], sunI: 1.6, zen: [0.2, 0.25, 0.55], hor: [0.98, 0.45, 0.3], glow: [1.0, 0.38, 0.2], fog: [0.62, 0.42, 0.45], dens: 0.004, hs: [0.42, 0.4, 0.65], hg: [0.35, 0.24, 0.24], hI: 0.65, sh: [0.2, 0.45, 0.58], dp: [0.04, 0.18, 0.38], night: 0.05, ll: 0.75 },
  { t: 0.85, sun: [0.6, 0.3, 0.3], sunI: 0.0, zen: [0.06, 0.08, 0.24], hor: [0.3, 0.22, 0.4], glow: [0.5, 0.2, 0.25], fog: [0.18, 0.16, 0.3], dens: 0.008, hs: [0.2, 0.22, 0.45], hg: [0.1, 0.08, 0.14], hI: 0.4, sh: [0.08, 0.2, 0.35], dp: [0.02, 0.07, 0.2], night: 0.5, ll: 0.4 },
  { t: 1.0, sun: [0.4, 0.5, 0.9], sunI: 0.0, zen: [0.012, 0.02, 0.07], hor: [0.04, 0.07, 0.16], glow: [0.04, 0.06, 0.15], fog: [0.035, 0.055, 0.12], dens: 0.019, hs: [0.12, 0.16, 0.34], hg: [0.03, 0.04, 0.08], hI: 0.3, sh: [0.04, 0.1, 0.2], dp: [0.01, 0.03, 0.09], night: 1, ll: 0.22 },
];
function sampleK(t) {
  t = clamp(t, 0, 1);
  let i = 0;
  while (i < K.length - 2 && t > K[i + 1].t) i++;
  const a = K[i], b = K[i + 1];
  const u = smooth(a.t, b.t, t);
  const o = {};
  for (const k in a) o[k] = Array.isArray(a[k]) ? a[k].map((v, j) => lerp(v, b[k][j], u)) : lerp(a[k], b[k], u);
  return o;
}

export function createEnv(scene) {
  const env = {};
  // sky
  const skyU = {
    uSunDir: { value: new THREE.Vector3() }, uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() },
    uSunCol: { value: new THREE.Color() }, uGlow: { value: new THREE.Color() }, uNight: { value: 0 }, uTime: { value: 0 },
    uSunVis: { value: 1 }, uStarDir: { value: new THREE.Vector3() },
  };
  {
    const az = OBS.azAnswer * (Math.PI * 2 / OBS.azSteps), el = [5, 20, 35, 50, 65][OBS.elAnswer] * Math.PI / 180;
    skyU.uStarDir.value.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
  }
  const sky = new THREE.Mesh(new THREE.IcosahedronGeometry(800, 3), new THREE.ShaderMaterial({
    uniforms: skyU, vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, fog: false,
  }));
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  scene.add(sky);

  // fog
  scene.fog = new THREE.FogExp2(0xffffff, 0.003);

  // water
  const wU = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    uHeight: { value: null }, uBounds: { value: new THREE.Vector4(BOUNDS.x0, BOUNDS.z0, BOUNDS.x1 - BOUNDS.x0, BOUNDS.z1 - BOUNDS.z0) },
    uTime: { value: 0 }, uLevel: { value: 2.8 }, uLightLvl: { value: 1 },
    uShallow: { value: new THREE.Color() }, uDeep: { value: new THREE.Color() }, uSky: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3() }, uSunCol: { value: new THREE.Color() }, uFoam: { value: new THREE.Color(1, 1, 1) },
    uPL: { value: [0, 1, 2, 3, 4].map(() => new THREE.Vector4()) },
  }]);
  wU.uHeight.value = waterHeightTexture();
  const wgeo = new THREE.PlaneGeometry(1000, 1000, 120, 120);
  wgeo.rotateX(-Math.PI / 2);
  const water = new THREE.Mesh(wgeo, new THREE.ShaderMaterial({
    uniforms: wU, vertexShader: WATER_VS, fragmentShader: WATER_FS, transparent: true, fog: true, depthWrite: false,
  }));
  water.position.set(-20, 0, -95);
  water.frustumCulled = false;
  water.renderOrder = 1;
  scene.add(water);

  // sun / moon
  const sun = new THREE.DirectionalLight(0xffffff, 3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const S = 48;
  Object.assign(sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 1, far: 320 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.05;
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x000000, 1);
  scene.add(hemi);

  // point light pool: index 0 = lantern, 1..4 = nearest lit beacons
  const points = [];
  for (let i = 0; i < 5; i++) {
    const l = new THREE.PointLight(0xffa850, 0, i === 0 ? 22 : 70, i === 0 ? 1.4 : 1.3);
    scene.add(l);
    points.push(l);
  }

  const sunDir = new THREE.Vector3(), moonDir = new THREE.Vector3(0.35, 0.75, 0.55).normalize();
  let lastQ = -1;
  const tmpM = new THREE.Matrix4(), ax = new THREE.Vector3(), ay = new THREE.Vector3(), az = new THREE.Vector3();
  const texel = (S * 2) / 2048;
  env.state = null;

  env.setTime = (t) => {
    const k = sampleK(t);
    env.state = k;
    const tq = Math.round(t * 600) / 600; // steps of ~2s keep shadows steady
    if (tq !== lastQ) {
      lastQ = tq;
      const el = ((14 - 20 * Math.min(tq, 1.2)) * Math.PI) / 180;
      sunDir.set(-Math.cos(el) * 0.88, Math.sin(el), Math.cos(el) * 0.47).normalize();
    }
    const moonW = smooth(0.85, 0.97, t);
    env.lightDir = moonW > 0 ? moonDir : sunDir;
    sun.color.setRGB(...k.sun);
    sun.intensity = moonW > 0 ? moonW * 0.45 : k.sunI;
    hemi.color.setRGB(...k.hs);
    hemi.groundColor.setRGB(...k.hg);
    hemi.intensity = k.hI;
    scene.fog.color.setRGB(...k.fog);
    scene.fog.density = k.dens;
    skyU.uSunDir.value.copy(sunDir);
    skyU.uZenith.value.setRGB(...k.zen);
    skyU.uHorizon.value.setRGB(...k.hor);
    skyU.uGlow.value.setRGB(...k.glow);
    skyU.uSunCol.value.setRGB(1.0, 0.75, 0.45);
    skyU.uSunVis.value = smooth(-0.06, 0.0, sunDir.y);
    skyU.uNight.value = k.night;
    wU.uShallow.value.setRGB(...k.sh);
    wU.uDeep.value.setRGB(...k.dp);
    wU.uSky.value.setRGB(...k.hor);
    wU.uSunDir.value.copy(sunDir);
    wU.uSunCol.value.setRGB(...k.sun).multiplyScalar(k.sunI * 0.5);
    wU.uLightLvl.value = k.ll;
    env.night = k.night;
  };

  // keep the shadow frustum centred on the player, snapped to texels
  env.updateShadow = (center) => {
    const d = env.lightDir || sunDir;
    tmpM.lookAt(d, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0));
    tmpM.extractBasis(ax, ay, az);
    let u = center.dot(ax), v = center.dot(ay);
    const w = center.dot(az);
    u = Math.round(u / texel) * texel;
    v = Math.round(v / texel) * texel;
    const c = new THREE.Vector3().addScaledVector(ax, u).addScaledVector(ay, v).addScaledVector(az, w);
    sun.target.position.copy(c);
    sun.position.copy(c).addScaledVector(d, 150);
    sun.target.updateMatrixWorld();
  };

  env.update = (time, level) => {
    skyU.uTime.value = time;
    wU.uTime.value = time;
    wU.uLevel.value = level;
  };
  env.setPointGlow = (i, x, y, z, w) => wU.uPL.value[i].set(x, y, z, w);
  env.sky = sky; env.water = water; env.sun = sun; env.hemi = hemi; env.points = points;
  return env;
}
