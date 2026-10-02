// Stylised sea: depth-tinted from the baked height texture, cel foam at shores and over submerged causeways,
// toon sun glints, reflections of lit beacons at night, manual fog.
import * as THREE from './three.module.min.js';
import { GRID_MIN, GRID_SIZE } from './terrain.js';

const DEEP_DAY = new THREE.Color('#1d5f8f'), DEEP_NIGHT = new THREE.Color('#06142e');
const SHALLOW_DAY = new THREE.Color('#45d3c4'), SHALLOW_NIGHT = new THREE.Color('#1a4a66');

export class Water {
  constructor(scene, heightTex) {
    this.level = 1.2;
    this.uniforms = {
      uHeight: { value: heightTex },
      uXform: { value: new THREE.Vector3(GRID_MIN, GRID_MIN, GRID_SIZE) },
      uLevel: { value: this.level },
      uTime: { value: 0 },
      uDeep: { value: new THREE.Color('#1d5f8f') },
      uShallow: { value: new THREE.Color('#3fd0c8') },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunCol: { value: new THREE.Color() },
      uSkyCol: { value: new THREE.Color() },
      uFogCol: { value: new THREE.Color() },
      uFogD: { value: 0.002 },
      uNight: { value: 0 },
      uLights: { value: [0, 1, 2, 3, 4].map(() => new THREE.Vector4()) },
      uLightCol: { value: new THREE.Color('#ffae55') },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: true,
      vertexShader: `varying vec3 vW; uniform float uLevel; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); w.y = uLevel; vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `
        uniform sampler2D uHeight; uniform vec3 uXform; uniform float uLevel, uTime, uFogD, uNight;
        uniform vec3 uDeep, uShallow, uSunDir, uSunCol, uSkyCol, uFogCol, uLightCol; uniform vec4 uLights[5];
        varying vec3 vW;
        void main(){
          vec2 uv = (vW.xz - uXform.xy) / uXform.z;
          float g = -12.0;
          if (uv.x > 0.0 && uv.y > 0.0 && uv.x < 1.0 && uv.y < 1.0) g = texture2D(uHeight, uv).r;
          float depth = uLevel - g;
          vec2 p = vW.xz; float t = uTime;
          vec3 col = mix(uShallow, uDeep, smoothstep(0.0, 4.0, depth));
          col = mix(col, uDeep * 0.6, smoothstep(6.0, 14.0, depth));
          // wave normal
          float wx = cos(p.x * 0.17 + t * 0.9) * 0.5 + cos((p.x + p.y) * 0.31 + t * 1.4) * 0.3;
          float wz = cos(p.y * 0.21 - t * 0.7) * 0.5 + cos((p.x - p.y) * 0.27 - t * 1.1) * 0.3;
          vec3 N = normalize(vec3(wx * 0.12, 1.0, wz * 0.12));
          vec3 V = normalize(cameraPosition - vW);
          // cel squiggles
          float sq = sin(p.x * 0.33 + sin(p.y * 0.21 + t * 0.6) * 2.4 + t * 0.4) * sin(p.y * 0.29 + sin(p.x * 0.17 - t * 0.5) * 2.0);
          col += vec3(0.25, 0.32, 0.35) * step(0.93, sq) * (1.0 - uNight * 0.7) * smoothstep(1.0, 3.0, depth);
          // shoreline foam bands (also outlines submerged causeways)
          float edge = 1.0 - smoothstep(0.0, 0.32 + 0.1 * sin(t * 1.6 + p.x * 0.4 + p.y * 0.3), depth);
          float band = step(0.55, fract(depth * 1.6 - t * 0.35)) * (1.0 - smoothstep(0.2, 1.1, depth));
          float foam = max(edge, band * 0.6);
          col = mix(col, vec3(0.95, 0.97, 1.0) * (1.0 - uNight * 0.75), foam);
          // fresnel sky
          float fr = pow(1.0 - max(dot(V, N), 0.0), 4.0);
          col = mix(col, uSkyCol, clamp(fr * 0.8, 0.0, 0.8));
          // toon sun glint
          vec3 R = reflect(-uSunDir, N);
          float sp = pow(max(dot(R, V), 0.0), 120.0);
          col += uSunCol * step(0.35, sp) * 2.0;
          // lit beacons reflected as warm streaks
          for (int i = 0; i < 5; i++) {
            vec4 L = uLights[i];
            if (L.w > 0.0) {
              vec3 toL = L.xyz - vW; float dl = length(toL);
              vec3 Lr = reflect(-normalize(toL), N);
              float s = pow(max(dot(Lr, V), 0.0), 40.0);
              col += uLightCol * L.w * (s * 2.0 + 0.4 / (1.0 + dl * dl * 0.02)) * (0.3 + uNight);
            }
          }
          float a = mix(0.55, 1.0, smoothstep(0.0, 2.6, depth));
          a = max(a, foam);
          float dist = length(cameraPosition - vW);
          float f = 1.0 - exp(-pow(uFogD * dist, 2.0));
          col = mix(col, uFogCol, f);
          gl_FragColor = vec4(col, a);
        }`,
    });
    const geo = new THREE.PlaneGeometry(2400, 2400, 1, 1);
    geo.rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    scene.add(this.mesh);
  }

  update(time, sky, scene, lights, level) {
    const u = this.uniforms;
    this.level = level;
    u.uLevel.value = level;
    u.uTime.value = time;
    u.uSunDir.value.copy(sky.sunDir.y > -0.02 ? sky.sunDir : sky.moonDir);
    u.uSunCol.value.copy(sky.light.color).multiplyScalar(sky.sunDir.y > -0.02 ? 1.2 : 0.4);
    u.uSkyCol.value.copy(sky.uniforms.uHorizon.value).lerp(sky.uniforms.uZenith.value, 0.3);
    u.uFogCol.value.copy(scene.fog.color);
    u.uFogD.value = scene.fog.density;
    u.uNight.value = sky.night;
    const night = sky.night;
    u.uDeep.value.copy(DEEP_DAY).lerp(DEEP_NIGHT, night);
    u.uShallow.value.copy(SHALLOW_DAY).lerp(SHALLOW_NIGHT, night);
    for (let i = 0; i < 5; i++) {
      const l = lights[i];
      u.uLights.value[i].set(l.position.x, l.position.y, l.position.z, i < 4 ? l.intensity / 30 : 0);
    }
  }
}
