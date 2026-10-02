// Wordless overlay: device glyphs, prompts, pause, readout, closing moment.
const key = (ch) => `<svg viewBox="0 0 48 48"><rect x="4" y="5" width="40" height="38" rx="8" fill="#6b5f50"/><rect x="4" y="3" width="40" height="37" rx="8" fill="#f4ecd8" stroke="#2a2420" stroke-width="2.5"/><text x="24" y="30" text-anchor="middle" font-size="22" font-weight="700" font-family="Georgia,serif" fill="#2a2420">${ch}</text></svg>`;
const pad = (ch, col) => `<svg viewBox="0 0 48 48"><circle cx="24" cy="25.5" r="20" fill="rgba(0,0,0,0.35)"/><circle cx="24" cy="24" r="20" fill="${col}" stroke="#1c1c1c" stroke-width="2.5"/><text x="24" y="31.5" text-anchor="middle" font-size="21" font-weight="700" font-family="Arial,sans-serif" fill="#fff">${ch}</text></svg>`;
export const GLYPHS = {
  keyE: key('E'),
  keyR: key('R'),
  padA: pad('A', '#3a9a4a'),
  padY: pad('Y', '#c8a020'),
  click: `<svg viewBox="0 0 48 48"><rect x="12" y="4" width="24" height="40" rx="12" fill="#f4ecd8" stroke="#2a2420" stroke-width="2.5"/><path d="M12 18 V16 A12 12 0 0 1 24 4 V18 Z" fill="#e0813a" stroke="#2a2420" stroke-width="2"/><line x1="24" y1="4" x2="24" y2="18" stroke="#2a2420" stroke-width="2"/><line x1="12" y1="18" x2="36" y2="18" stroke="#2a2420" stroke-width="2"/></svg>`,
  play: `<svg viewBox="0 0 64 64" style="width:96px;height:96px"><circle cx="32" cy="32" r="28" fill="rgba(244,236,216,0.12)" stroke="#f4ecd8" stroke-width="3"/><path d="M26 20 L46 32 L26 44 Z" fill="#f4ecd8"/></svg>`,
};
const ICON = {
  fps: '<svg viewBox="0 0 16 16"><path d="M2 12a6 6 0 1 1 12 0" fill="none" stroke="#e8e2d0" stroke-width="1.6"/><path d="M8 12 L11 6" stroke="#ffcf7a" stroke-width="1.8"/></svg>',
  tri: '<svg viewBox="0 0 16 16"><path d="M8 2 L14.5 14 H1.5 Z" fill="none" stroke="#e8e2d0" stroke-width="1.6"/></svg>',
  calls: '<svg viewBox="0 0 16 16"><rect x="2" y="2" width="9" height="9" fill="none" stroke="#e8e2d0" stroke-width="1.4"/><rect x="5" y="5" width="9" height="9" fill="#e8e2d0" fill-opacity="0.4" stroke="#e8e2d0" stroke-width="1.4"/></svg>',
  light: '<svg viewBox="0 0 16 16"><circle cx="8" cy="6.5" r="4.5" fill="#ffcf7a"/><rect x="6" y="11" width="4" height="3" fill="#e8e2d0"/></svg>',
};

export class Hud {
  constructor() {
    for (const el of document.querySelectorAll('[data-g]')) el.innerHTML = GLYPHS[el.dataset.g];
    this.title = document.getElementById('title');
    this.reset = document.getElementById('reset');
    this.resetArc = document.getElementById('resetArc');
    this.pause = document.getElementById('pause');
    this.prompt = document.getElementById('prompt');
    this.promptGlyph = document.getElementById('promptGlyph');
    this.perf = document.getElementById('perf');
    this.closingEl = document.getElementById('closing');
    this.closeTime = document.getElementById('closeTime');
    this.device = 'kb';
    this.promptShown = false;
  }
  ready() {
    document.getElementById('spinner').classList.add('done');
    document.getElementById('startRow').classList.add('ready');
  }
  setDots(lit) {
    for (const id of ['titleDots', 'closeDots']) {
      [...document.getElementById(id).children].forEach((d, i) => d.classList.toggle('on', !!lit[i]));
    }
  }
  showTitle(v) { this.title.classList.toggle('hidden', !v); this.reset.classList.toggle('hidden', !v); }
  resetProgress(p) { this.resetArc.setAttribute('stroke-dashoffset', String(150.8 * (1 - p))); }
  showPause(v) { this.pause.classList.toggle('hidden', !v); }
  setDevice(d) {
    if (d === this.device) return;
    this.device = d;
    this.promptGlyph.innerHTML = GLYPHS[d === 'pad' ? 'padA' : 'keyE'];
  }
  showPrompt(x, y) {
    if (x === null) { if (this.promptShown) { this.prompt.classList.add('hidden'); this.promptShown = false; } return; }
    this.prompt.style.left = `${x}px`;
    this.prompt.style.top = `${y}px`;
    if (!this.promptShown) { this.prompt.classList.remove('hidden'); this.promptShown = true; }
  }
  togglePerf() { this.perf.classList.toggle('hidden'); }
  get perfOn() { return !this.perf.classList.contains('hidden'); }
  setPerf(s) {
    this.perf.innerHTML =
      `<div>${ICON.fps}${s.fps.toFixed(0)}</div>` +
      `<div>${ICON.tri}${(s.tris / 1000).toFixed(1)}k</div>` +
      `<div>${ICON.calls}${s.calls}</div>` +
      `<div>${ICON.light}${s.lights}</div>`;
  }
  closing(v, secs) {
    if (typeof secs === 'number') {
      const s = Math.floor(secs), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
      this.closeTime.textContent = (h ? `${h}:` : '') + `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
    }
    this.closingEl.classList.toggle('hidden', !v);
  }
}
