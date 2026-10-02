// DOM overlays: title, device glyph prompts, fades, the closing moment,
// pause glyph, restart hold ring and the performance readout.
const $ = (id) => document.getElementById(id);

export class UI {
  constructor() {
    this.title = $('title');
    this.dots = $('titleDots');
    this.glyphs = $('startGlyphs');
    this.restart = $('restart');
    this.ring = $('restartRing');
    this.promptEl = $('prompt');
    this.fadeEl = $('fade');
    this.closingEl = $('closing');
    this.closingTime = $('closingTime');
    this.pauseEl = $('pause');
    this.statsEl = $('stats');
    this.device = 'kbm';
    this.promptOn = false;
  }
  ready(hasSave) {
    this.dots.classList.remove('loading');
    this.glyphs.classList.add('on');
    this.restart.style.display = hasSave ? 'block' : 'none';
  }
  hideTitle() { this.title.classList.add('hidden'); }
  setDevice(d) {
    if (d === this.device) return;
    this.device = d;
    this.promptEl.className = d;
    this.restart.querySelector('.pad').style.display = d === 'pad' ? 'block' : 'none';
  }
  prompt(x, y, on) {
    if (on) this.promptEl.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    if (on !== this.promptOn) { this.promptOn = on; this.promptEl.style.opacity = on ? '1' : '0'; }
  }
  fade(on) { this.fadeEl.style.opacity = on ? '1' : '0'; }
  closing(on, secs) {
    if (on) {
      const s = Math.floor(secs), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
      const pad = (v) => String(v).padStart(2, '0');
      this.closingTime.textContent = h > 0 ? `${h}:${pad(m)}:${pad(r)}` : `${m}:${pad(r)}`;
    }
    this.closingEl.style.opacity = on ? '1' : '0';
  }
  pause(on) { this.pauseEl.classList.toggle('on', on); }
  restartProgress(p) { this.ring.setAttribute('stroke-dashoffset', (175.9 * (1 - p)).toFixed(1)); }
  stats(on, text) {
    this.statsEl.style.display = on ? 'block' : 'none';
    if (on) this.statsEl.textContent = text;
  }
}
