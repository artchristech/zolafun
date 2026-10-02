// Five Lights — wordless UI: title glyphs, hold-to-restart, interaction prompt, stats.
const svgA = `<svg viewBox="0 0 48 48" class="g"><circle cx="24" cy="24" r="21" fill="#2f8f3a" stroke="#e8f5e0" stroke-width="2.5"/><path d="M16 34 L24 13 L32 34 M19 27 H29" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const svgY = `<svg viewBox="0 0 48 48" class="g s"><circle cx="24" cy="24" r="21" fill="#c9a227" stroke="#fff7d6" stroke-width="2.5"/><path d="M16 13 L24 24 L32 13 M24 24 V35" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const svgClick = `<svg viewBox="0 0 48 48" class="g"><rect x="11" y="5" width="26" height="38" rx="13" fill="#f3ead8" stroke="#3a2f25" stroke-width="2.5"/><path d="M11 20 H37 M24 5 V20" stroke="#3a2f25" stroke-width="2.5"/><path d="M12.5 19 V18 A11.5 11.5 0 0 1 22.6 6.6 V19 Z" fill="#e8913a"/></svg>`;
const keyE = `<div class="key">E</div>`;
const keyR = `<div class="key s">R</div>`;
const svgReset = `<svg viewBox="0 0 64 64" class="reset"><circle cx="32" cy="32" r="28" fill="rgba(20,16,30,.45)" stroke="rgba(255,240,210,.35)" stroke-width="3"/><circle id="resetRing" cx="32" cy="32" r="28" fill="none" stroke="#ffd27a" stroke-width="4" stroke-dasharray="176" stroke-dashoffset="176" transform="rotate(-90 32 32)"/><path d="M42 24 A12 12 0 1 0 44 34" fill="none" stroke="#fff3dc" stroke-width="4" stroke-linecap="round"/><path d="M36 22 L44 23 L43 15" fill="none" stroke="#fff3dc" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export class UI {
  constructor() {
    this.title = document.getElementById('title');
    this.prompt = document.getElementById('prompt');
    this.stats = document.getElementById('stats');
    this.start = document.getElementById('startGlyphs');
    this.resetBox = document.getElementById('resetBox');
    this.lights = document.getElementById('lights');
    this.start.innerHTML = svgA + svgClick;
    this.resetBox.innerHTML = svgReset + `<div class="mini">${svgY}${keyR}</div>`;
    this.ring = document.getElementById('resetRing');
    this.device = null;
    this.promptVisible = false;
    this.statsOn = false;
  }
  setReady(r) { this.title.classList.toggle('ready', r); }
  showReset(v) { this.resetBox.style.display = v ? 'flex' : 'none'; }
  setLights(n) {
    this.lights.innerHTML = '';
    for (let i = 0; i < 5; i++) {
      const d = document.createElement('i');
      if (i < n) d.className = 'on';
      this.lights.appendChild(d);
    }
  }
  resetProgress(k) { this.ring.setAttribute('stroke-dashoffset', String(176 * (1 - k))); }
  hideTitle() { this.title.classList.add('gone'); setTimeout(() => { this.title.style.display = 'none'; }, 1600); }
  setPrompt(screen, device) {
    if (!screen) {
      if (this.promptVisible) { this.prompt.style.opacity = '0'; this.promptVisible = false; }
      return;
    }
    if (device !== this.device) { this.device = device; this.prompt.innerHTML = device === 'pad' ? svgA : keyE; }
    this.prompt.style.transform = `translate(${screen.x.toFixed(1)}px, ${screen.y.toFixed(1)}px) translate(-50%, -50%)`;
    if (!this.promptVisible) { this.prompt.style.opacity = '1'; this.promptVisible = true; }
  }
  toggleStats() { this.statsOn = !this.statsOn; this.stats.style.display = this.statsOn ? 'block' : 'none'; }
  setStats(s) { if (this.statsOn) this.stats.textContent = s; }
}
