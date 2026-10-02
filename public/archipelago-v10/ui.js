// Wordless overlays: title, pause, prompts, stats readout, closing card.
const SVG = {
  key: (ch) => `<svg viewBox="0 0 48 48" class="g"><rect x="5" y="5" width="38" height="38" rx="8" fill="#f6efe0" stroke="#2b2622" stroke-width="3"/><rect x="5" y="37" width="38" height="6" rx="3" fill="#d8ccb4"/><text x="24" y="31" font-size="21" text-anchor="middle" font-family="Georgia, serif" font-weight="700" fill="#2b2622">${ch}</text></svg>`,
  pad: (ch, col) => `<svg viewBox="0 0 48 48" class="g"><circle cx="24" cy="24" r="19" fill="#22262b" stroke="${col}" stroke-width="3.5"/><text x="24" y="31.5" font-size="21" text-anchor="middle" font-family="Arial, sans-serif" font-weight="700" fill="${col}">${ch}</text></svg>`,
  click: `<svg viewBox="0 0 48 48" class="g"><rect x="12" y="5" width="24" height="38" rx="12" fill="#f6efe0" stroke="#2b2622" stroke-width="3"/><path d="M12 19 H36 M24 5 V19" stroke="#2b2622" stroke-width="2.5"/><path d="M13.5 17.5 V16 A10.5 10.5 0 0 1 22.5 6.6 V17.5 Z" fill="#e8a63a"/></svg>`,
  play: `<svg viewBox="0 0 64 64" class="big"><circle cx="32" cy="32" r="29" fill="rgba(20,24,40,0.55)" stroke="#f6efe0" stroke-width="3"/><path d="M25 18 L48 32 L25 46 Z" fill="#f6efe0"/></svg>`,
  restart: `<svg viewBox="0 0 64 64" class="rs"><circle cx="32" cy="32" r="27" fill="none" stroke="rgba(246,239,224,0.25)" stroke-width="5"/><circle id="rsRing" cx="32" cy="32" r="27" fill="none" stroke="#e8a63a" stroke-width="5" stroke-dasharray="170" stroke-dashoffset="170" transform="rotate(-90 32 32)"/><path d="M41 23 A12 12 0 1 0 44 33" fill="none" stroke="#f6efe0" stroke-width="4" stroke-linecap="round"/><path d="M36 19 L44 21 L41 29" fill="none" stroke="#f6efe0" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  fps: `<svg viewBox="0 0 24 24" class="i"><path d="M2 13 H7 L9 7 L13 18 L15 11 H22" fill="none" stroke="currentColor" stroke-width="2"/></svg>`,
  tri: `<svg viewBox="0 0 24 24" class="i"><path d="M12 3 L22 20 H2 Z" fill="none" stroke="currentColor" stroke-width="2"/></svg>`,
  draw: `<svg viewBox="0 0 24 24" class="i"><rect x="3" y="9" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"/><rect x="9" y="3" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"/></svg>`,
  light: `<svg viewBox="0 0 24 24" class="i"><circle cx="12" cy="10" r="6" fill="none" stroke="currentColor" stroke-width="2"/><path d="M9 18 H15 M10 21 H14" stroke="currentColor" stroke-width="2"/></svg>`,
  shadow: `<svg viewBox="0 0 24 24" class="i"><circle cx="9" cy="9" r="6" fill="currentColor"/><ellipse cx="15" cy="19" rx="7" ry="2.5" fill="currentColor" opacity="0.5"/></svg>`,
};
export const GLYPH = SVG;

export class UI {
  constructor() {
    const $ = (id) => document.getElementById(id);
    this.title = $('title');
    this.pause = $('pause');
    this.prompt = $('prompt');
    this.stats = $('stats');
    this.card = $('card');
    this.fadeEl = $('fade');
    this.loading = $('loading');
    $('tGlyphs').innerHTML = SVG.pad('A', '#7ccf5a') + SVG.click;
    $('pGlyphs').innerHTML = SVG.click + SVG.pad('A', '#7ccf5a');
    this.pause.querySelector('.playIcon').innerHTML = SVG.play;
    this.restart = $('restart');
    this.restart.innerHTML = SVG.restart + `<div class="rsy">${SVG.pad('Y', '#f2c94c')}</div>`;
    this.rsRing = document.getElementById('rsRing');
    this.promptGlyph = { kb: SVG.key('E'), pad: SVG.pad('A', '#7ccf5a') };
    this.promptDev = null;
    this.statsOn = false;
    this.stats.innerHTML = `<span>${SVG.fps}<b id="sF">0</b></span><span>${SVG.tri}<b id="sT">0</b></span><span>${SVG.draw}<b id="sD">0</b></span><span>${SVG.light}<b id="sL">0</b></span>`;
    this.sF = $('sF'); this.sT = $('sT'); this.sD = $('sD'); this.sL = $('sL');
    this.cardLights = $('cardLights');
    this.cardTime = $('cardTime');
  }
  ready(hasSave) {
    this.loading.classList.add('hidden');
    document.getElementById('tGlyphs').classList.remove('hidden');
    this.restart.classList.toggle('hidden', !hasSave);
  }
  showTitle(v) {
    this.title.classList.toggle('gone', !v);
  }
  showPause(v) {
    this.pause.classList.toggle('hidden', !v);
  }
  setRestart(p) {
    if (this.rsRing) this.rsRing.setAttribute('stroke-dashoffset', String(170 * (1 - p)));
  }
  setPrompt(x, y, device) {
    if (x === null) {
      if (!this.prompt.classList.contains('hidden')) this.prompt.classList.add('hidden');
      return;
    }
    if (this.promptDev !== device) {
      this.prompt.innerHTML = this.promptGlyph[device];
      this.promptDev = device;
    }
    this.prompt.classList.remove('hidden');
    this.prompt.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
  }
  toggleStats() {
    this.statsOn = !this.statsOn;
    this.stats.classList.toggle('hidden', !this.statsOn);
  }
  updateStats(fps, tris, calls, lights) {
    if (!this.statsOn) return;
    this.sF.textContent = String(Math.round(fps));
    this.sT.textContent = tris >= 1000 ? (tris / 1000).toFixed(1) + 'k' : String(tris);
    this.sD.textContent = String(calls);
    this.sL.textContent = String(lights);
  }
  showCard(v, seconds = 0) {
    if (v === this.cardOn) return;
    this.cardOn = v;
    if (v) {
      const m = Math.floor(seconds / 60), s = Math.floor(seconds % 60);
      this.cardTime.textContent = `${m}:${String(s).padStart(2, '0')}`;
      this.cardLights.innerHTML = '<i></i><i></i><i></i><i></i><i></i>';
    }
    this.card.classList.toggle('hidden', !v);
  }
  fade(v) {
    this.fadeEl.style.opacity = String(v);
  }
}
