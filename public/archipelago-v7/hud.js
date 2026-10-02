// DOM overlay: wordless title, device glyph prompts, the closing moment, and the stats readout.
const $ = (id) => document.getElementById(id);

export class Hud {
  constructor() {
    this.title = $('title');
    this.prompt = $('prompt');
    this.closing = $('closing');
    this.stats = $('stats');
    this.restart = $('restart');
    this.restartRing = $('restart-ring');
    this.dots = Array.from(document.querySelectorAll('#title .dots i'));
    this.cdots = Array.from(document.querySelectorAll('#closing .dots i'));
    this.ctime = $('ctime');
    this.device = 'kbm';
    this.statsOn = false;
    this.promptShown = false;
  }

  setDevice(d) {
    if (d === this.device) return;
    this.device = d;
    document.body.dataset.device = d;
  }

  setReady() { this.title.classList.add('ready'); }

  setProgress(n, hasSave) {
    this.dots.forEach((el, i) => el.classList.toggle('on', i < n));
    this.restart.classList.toggle('show', !!hasSave);
  }

  setRestart(k) {
    const c = 2 * Math.PI * 26;
    this.restartRing.style.strokeDashoffset = String(c * (1 - k));
  }

  hideTitle() { this.title.classList.add('gone'); }

  showPrompt(x, y) {
    this.prompt.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
    if (!this.promptShown) { this.prompt.classList.add('show'); this.promptShown = true; }
  }

  hidePrompt() {
    if (this.promptShown) { this.prompt.classList.remove('show'); this.promptShown = false; }
  }

  showClosing(on, timeStr, n) {
    this.closing.classList.toggle('show', on);
    if (on) {
      this.ctime.textContent = timeStr;
      this.cdots.forEach((el, i) => el.classList.toggle('on', i < n));
    }
  }

  toggleStats() {
    this.statsOn = !this.statsOn;
    this.stats.classList.toggle('show', this.statsOn);
  }

  setStats(text) { if (this.statsOn) this.stats.textContent = text; }
}
