import * as THREE from './three.module.min.js';

export const GLYPH_E = `<svg width="46" height="46" viewBox="0 0 46 46" aria-hidden="true"><rect x="3" y="3" width="40" height="40" rx="8" fill="#f6efe0" stroke="#3b2f28" stroke-width="3"/><rect x="7" y="7" width="32" height="30" rx="5" fill="#fffaf0"/><text x="23" y="30" text-anchor="middle" font-family="Georgia, serif" font-weight="700" font-size="21" fill="#3b2f28">E</text></svg>`;
export const GLYPH_A = `<svg width="46" height="46" viewBox="0 0 46 46" aria-hidden="true"><circle cx="23" cy="23" r="20" fill="#2f8f3a" stroke="#123b18" stroke-width="3"/><circle cx="23" cy="21" r="16" fill="#3fae4b"/><text x="23" y="30" text-anchor="middle" font-family="Arial, sans-serif" font-weight="700" font-size="21" fill="#fff">A</text></svg>`;

// Wordless on-screen prompt above the thing you can interact with, plus a tiny fps readout.
export class UI {
  constructor() {
    this.prompt = document.getElementById('prompt');
    this.fps = document.getElementById('fps');
    this.title = document.getElementById('title');
    this.glyphs = document.getElementById('glyphs');
    this.device = null;
    this.fpsOn = false;
    this.frames = 0; this.acc = 0;
    this.v = new THREE.Vector3();
  }
  setReady() { this.glyphs.classList.add('ready'); }
  hideTitle() { this.title.classList.add('hidden'); }

  showPrompt(worldPos, camera, device, w, h) {
    if (!worldPos) { this.prompt.classList.remove('show'); return; }
    if (device !== this.device) { this.device = device; this.prompt.innerHTML = device === 'pad' ? GLYPH_A : GLYPH_E; }
    this.v.copy(worldPos).project(camera);
    if (this.v.z > 1 || this.v.z < -1) { this.prompt.classList.remove('show'); return; }
    const x = (this.v.x * 0.5 + 0.5) * w, y = (-this.v.y * 0.5 + 0.5) * h;
    this.prompt.style.left = x.toFixed(1) + 'px';
    this.prompt.style.top = y.toFixed(1) + 'px';
    this.prompt.classList.add('show');
  }

  toggleFps() { this.fpsOn = !this.fpsOn; this.fps.style.display = this.fpsOn ? 'block' : 'none'; }
  tick(dt, extra) {
    this.frames++; this.acc += dt;
    if (this.acc >= 0.5) {
      if (this.fpsOn) this.fps.textContent = Math.round(this.frames / this.acc) + ' fps' + (extra ? '  ' + extra : '');
      this.frames = 0; this.acc = 0;
    }
  }
}
