// Height field of the whole archipelago, baked once into grids.
import {
  ISLANDS, SEABED, EXTENT, CAUSEWAYS, FLATS, DECKS, TRAIL, mountainH, SURF, FOREST_PATHS, polyDist,
} from './layout.js';
import { fbm, smoothstep, lerp } from './util.js';

export const RES = 0.5;
export const N = Math.round((EXTENT * 2) / RES) + 1;
export const Hn = new Float32Array(N * N); // natural terrain
export const Hc = new Float32Array(N * N); // terrain + causeways (for the water)
export const Hf = new Float32Array(N * N); // full walkable ground
export const Sn = new Uint8Array(N * N); // natural surface
export const Sf = new Uint8Array(N * N); // walkable surface

const PEAK = ISLANDS[3];
const FOREST = ISLANDS[2];

function islandH(isl, x, z, d) {
  const n = fbm(x * 0.045, z * 0.045, 3, isl.id * 31 + 3);
  const coast = d / isl.R + n * 0.09;
  let h;
  if (coast < 1) h = isl.H - (isl.H - 1.0) * smoothstep(0.3, 1.0, coast);
  else h = 1.0 - (1.0 - SEABED) * smoothstep(1.0, 1.35, coast);
  const n2 = fbm(x * 0.13, z * 0.13, 2, isl.id * 7 + 1);
  h += n2 * 0.35 * (1 - smoothstep(0.6, 1.2, coast)) + n * 0.5 * (1 - smoothstep(0.25, 1.0, coast));
  return h;
}

function baseH(x, z) {
  let h = SEABED + fbm(x * 0.02, z * 0.02, 2, 99) * 0.6;
  for (const isl of ISLANDS) {
    const dx = x - isl.x, dz = z - isl.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d > isl.R * 1.5) continue;
    const ih = islandH(isl, x, z, d);
    if (ih > h) h = ih;
  }
  const dx = x - PEAK.x, dz = z - PEAK.z;
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d < 47) {
    let m = mountainH(d);
    if (d > 13) m += fbm(x * 0.09, z * 0.09, 3, 7) * 1.4 * smoothstep(13, 19, d) * (1 - smoothstep(40, 46, d));
    if (m > h) h = m;
  }
  return h;
}

let built = false;
export function buildGround() {
  if (built) return;
  built = true;
  for (const f of FLATS) if (f.h === null) f.h = baseH(f.x, f.z) + 0.05;
  const peakR2 = 50 * 50;
  for (let j = 0; j < N; j++) {
    const z = -EXTENT + j * RES;
    for (let i = 0; i < N; i++) {
      const x = -EXTENT + i * RES;
      const k = j * N + i;
      let h = baseH(x, z);
      let s = 255;
      for (const f of FLATS) {
        const dx = x - f.x, dz = z - f.z;
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d >= f.r + f.blend) continue;
        const w = 1 - smoothstep(f.r, f.r + f.blend, d);
        h = lerp(h, f.h, w);
        if (d < f.r && f.surf !== null) s = f.surf;
      }
      const px = x - PEAK.x, pz = z - PEAK.z;
      if (px * px + pz * pz < peakR2) {
        // nearest point on the switchback trail
        let best = 1e9, bh = 0;
        for (let t = 0; t < TRAIL.length - 1; t++) {
          const a = TRAIL[t], b = TRAIL[t + 1];
          const dx = b.x - a.x, dz = b.z - a.z;
          const l2 = dx * dx + dz * dz;
          let u = l2 > 0 ? ((x - a.x) * dx + (z - a.z) * dz) / l2 : 0;
          u = u < 0 ? 0 : u > 1 ? 1 : u;
          const qx = a.x + dx * u - x, qz = a.z + dz * u - z;
          const dd = qx * qx + qz * qz;
          if (dd < best) {
            best = dd;
            bh = a.h + (b.h - a.h) * u;
          }
        }
        best = Math.sqrt(best);
        if (best < 4.6) {
          const w = 1 - smoothstep(1.8, 4.6, best);
          h = lerp(h, bh, w);
          if (best < 1.9) s = SURF.DIRT;
        }
      }
      const fx = x - FOREST.x, fz = z - FOREST.z;
      if (s === 255 && fx * fx + fz * fz < 3600) {
        for (const p of FOREST_PATHS) {
          if (polyDist(x, z, p) < 1.3) {
            s = SURF.DIRT;
            break;
          }
        }
      }
      Hn[k] = h;
      Sn[k] = s;
    }
  }
  // natural surface classification from height and slope
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const k = j * N + i;
      if (Sn[k] !== 255) continue;
      const h = Hn[k];
      const i0 = i > 0 ? k - 1 : k, i1 = i < N - 1 ? k + 1 : k;
      const j0 = j > 0 ? k - N : k, j1 = j < N - 1 ? k + N : k;
      const gx = (Hn[i1] - Hn[i0]) / (RES * 2), gz = (Hn[j1] - Hn[j0]) / (RES * 2);
      const slope = Math.sqrt(gx * gx + gz * gz);
      if (slope > 0.95) Sn[k] = SURF.STONE;
      else if (h < 3.0) Sn[k] = SURF.SAND;
      else Sn[k] = SURF.GRASS;
    }
  }
  // causeways and decks
  for (let j = 0; j < N; j++) {
    const z = -EXTENT + j * RES;
    for (let i = 0; i < N; i++) {
      const x = -EXTENT + i * RES;
      const k = j * N + i;
      let h = Hn[k], s = Sn[k];
      for (const c of CAUSEWAYS) {
        const dx = x - c.x0, dz = z - c.z0;
        const along = dx * c.ux + dz * c.uz;
        if (along < -2 || along > c.len + 2) continue;
        const lat = Math.abs(-dx * c.uz + dz * c.ux);
        if (lat > c.hw) continue;
        if (c.top > h) {
          h = c.top;
          s = SURF.STONE;
        }
      }
      Hc[k] = h;
      for (const d of DECKS) {
        const dx = x - d.x, dz = z - d.z;
        const c = Math.cos(d.yaw), sn = Math.sin(d.yaw);
        const lx = dx * c - dz * sn, lz = dx * sn + dz * c;
        if (Math.abs(lx) > d.hx || Math.abs(lz) > d.hz) continue;
        if (d.h >= h - 0.02) {
          h = d.h;
          s = SURF.WOOD;
        }
      }
      Hf[k] = h;
      Sf[k] = s;
    }
  }
}

function sample(arr, x, z) {
  let fx = (x + EXTENT) / RES, fz = (z + EXTENT) / RES;
  if (fx < 0) fx = 0;
  if (fz < 0) fz = 0;
  if (fx > N - 1.001) fx = N - 1.001;
  if (fz > N - 1.001) fz = N - 1.001;
  const ix = Math.floor(fx), iz = Math.floor(fz);
  const tx = fx - ix, tz = fz - iz;
  const k = iz * N + ix;
  const a = arr[k], b = arr[k + 1], c = arr[k + N], d = arr[k + N + 1];
  return (a + (b - a) * tx) * (1 - tz) + (c + (d - c) * tx) * tz;
}
export const groundH = (x, z) => sample(Hf, x, z);
export const naturalH = (x, z) => sample(Hn, x, z);
export const waterBedH = (x, z) => sample(Hc, x, z);
function sampleS(arr, x, z) {
  const ix = Math.round((x + EXTENT) / RES), iz = Math.round((z + EXTENT) / RES);
  if (ix < 0 || iz < 0 || ix >= N || iz >= N) return SURF.SAND;
  return arr[iz * N + ix];
}
export const surfaceAt = (x, z) => sampleS(Sf, x, z);
export const naturalSurf = (x, z) => sampleS(Sn, x, z);
export function slopeAt(x, z) {
  const e = 0.6;
  const gx = (naturalH(x + e, z) - naturalH(x - e, z)) / (2 * e);
  const gz = (naturalH(x, z + e) - naturalH(x, z - e)) / (2 * e);
  return Math.sqrt(gx * gx + gz * gz);
}
