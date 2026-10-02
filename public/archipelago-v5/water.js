// Five Lights — stylised opaque sea with Wind-Waker-like shore foam rings.
import * as THREE from './three.module.min.js';
import { shared, GLSL_NOISE } from './util.js';
import { HALF } from './terrain.js';

export class Water {
  constructor(scene, heightTex) {
    this.level = { value: 2.4 };
    const geo = new THREE.PlaneGeometry(3600, 3600, 1, 1);
    geo.rotateX(-Math.PI / 2);
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: shared.uTime, uLevel: this.level, uHeight: { value: heightTex }, uHalf: { value: HALF },
        uSunDir: shared.uSunDir, uSunColor: shared.uSunColor, uTop: shared.uSkyTop, uHor: shared.uSkyHorizon, uNight: shared.uNight,
        uFogColor: shared.uFogColor, uFogNear: shared.uFogNear, uFogFar: shared.uFogFar,
      },
      vertexShader: `
        uniform float uLevel; varying vec3 vW;
        void main(){ vec4 w = modelMatrix * vec4(position, 1.0); w.y += uLevel; vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `
        uniform float uTime, uLevel, uHalf, uNight, uFogNear, uFogFar;
        uniform sampler2D uHeight; uniform vec3 uSunDir, uSunColor, uTop, uHor, uFogColor;
        varying vec3 vW;
        ${GLSL_NOISE}
        void main(){
          vec2 uv = (vW.xz + uHalf) / (2.0 * uHalf);
          float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
          float th = mix(-6.0, texture2D(uHeight, clamp(uv, 0.0, 1.0)).r * 12.0 - 6.0, inside);
          float depth = uLevel - th;
          float n = fbm(vW.xz * 0.045 + vec2(uTime * 0.02, uTime * 0.013));
          float n2 = vnoise(vW.xz * 0.21 - vec2(uTime * 0.05, -uTime * 0.03));
          // banded water colour by depth
          vec3 shallow = vec3(0.16, 0.62, 0.62), mid = vec3(0.04, 0.32, 0.5), deep = vec3(0.02, 0.13, 0.32);
          float dq = floor(clamp(depth / 4.5, 0.0, 1.0) * 3.0 + n * 0.6) / 3.0;
          vec3 col = mix(shallow, mid, smoothstep(0.0, 0.5, dq));
          col = mix(col, deep, smoothstep(0.5, 1.0, dq));
          // lighting follows the sky
          vec3 V = normalize(cameraPosition - vW);
          float fres = pow(1.0 - max(V.y, 0.0), 4.0);
          float dayL = clamp(uSunDir.y * 4.0 + 0.35, 0.12, 1.0);
          col = col * mix(vec3(0.25, 0.32, 0.55), uSunColor * 0.9 + uTop * 0.4, dayL);
          col = mix(col, uHor * 0.9, fres * 0.65);
          // sun glitter path (stepped)
          vec3 nrm = normalize(vec3((n - 0.5) * 0.5 + (n2 - 0.5) * 0.35, 1.0, (n2 - 0.5) * 0.5));
          vec3 R = reflect(-V, nrm);
          float sp = pow(max(dot(R, normalize(uSunDir)), 0.0), 90.0);
          col += uSunColor * step(0.35, sp) * 2.2 * smoothstep(-0.05, 0.05, uSunDir.y);
          // wave squiggles in open water
          float sq = step(0.965, fract(n * 7.0 + n2 * 0.6 + uTime * 0.03)) * smoothstep(1.5, 4.0, depth);
          col = mix(col, vec3(0.85, 0.95, 1.0) * (dayL * 0.8 + 0.2), sq * 0.55);
          // shore foam: a solid lip plus rings rolling in
          float lip = 1.0 - smoothstep(0.12, 0.3, depth + (n2 - 0.5) * 0.25);
          float ring = step(0.72, sin(depth * 7.5 - uTime * 2.2 + n * 5.0) * 0.5 + 0.5) * (1.0 - smoothstep(0.3, 1.5, depth));
          float foam = max(lip, ring * 0.9) * step(-0.6, depth);
          vec3 fc = mix(vec3(0.95, 0.98, 1.0), vec3(0.45, 0.55, 0.8), uNight * 0.8) * (0.4 + dayL * 0.8);
          col = mix(col, fc, foam);
          // fog
          float fd = length(cameraPosition - vW);
          float ff = smoothstep(uFogNear, uFogFar, fd);
          col = mix(col, uFogColor, ff);
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = false;
    scene.add(this.mesh);
  }
  set(level) { this.level.value = level; }
  get() { return this.level.value; }
}
