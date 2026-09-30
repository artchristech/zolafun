// All sound is synthesized: sea, wind, stone hum, bells, fire, and a slow pad
// that gains a voice for every beacon lit.

const PAD_CHORDS = [
  [196.0, 246.94, 293.66, 392.0], // G
  [164.81, 196.0, 246.94, 329.63], // Em
  [130.81, 196.0, 261.63, 329.63], // C
  [146.83, 220.0, 293.66, 369.99], // D
];

export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.voices = 1;
    this.darkness = 0;
  }

  start() {
    if (this.ctx) {
      this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 3;
    this.master.connect(comp).connect(ctx.destination);

    // Shared reverb-ish tail: a feedback delay through a lowpass.
    this.verb = ctx.createGain();
    this.verb.gain.value = 0.35;
    const dl = ctx.createDelay(1);
    dl.delayTime.value = 0.23;
    const fb = ctx.createGain();
    fb.gain.value = 0.45;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1800;
    this.verb.connect(dl).connect(lp).connect(fb).connect(dl);
    lp.connect(this.master);

    const len = ctx.sampleRate * 3;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02; // brown-ish
      data[i] = w * 0.35 + last * 3.2;
    }

    // Sea: low swell plus a brighter hiss, each breathing on slow LFOs.
    this.sea = this._bed(420, 0.22, 0.07, 0.11);
    this.hiss = this._bed(2400, 0.035, 0.05, 0.023, "bandpass");
    this.wind = this._bed(800, 0.0, 0.13, 0.0, "bandpass");

    // Monolith hum: three detuned sines, silent until you step inside.
    this.hum = ctx.createGain();
    this.hum.gain.value = 0;
    const humLp = ctx.createBiquadFilter();
    humLp.type = "lowpass";
    humLp.frequency.value = 600;
    this.hum.connect(humLp).connect(this.master);
    for (const [f, g] of [[98, 0.5], [98.6, 0.4], [146.8, 0.25], [196.3, 0.12]]) {
      const o = ctx.createOscillator();
      o.frequency.value = f;
      const og = ctx.createGain();
      og.gain.value = g;
      o.connect(og).connect(this.hum);
      o.start();
    }

    // Pad bus.
    this.pad = ctx.createGain();
    this.pad.gain.value = 0.05;
    this.padLp = ctx.createBiquadFilter();
    this.padLp.type = "lowpass";
    this.padLp.frequency.value = 900;
    this.pad.connect(this.padLp).connect(this.master);
    this.padLp.connect(this.verb);
    this.chordIx = 0;
    this._padTick();
    this.padTimer = setInterval(() => this._padTick(), 9000);

    document.addEventListener("visibilitychange", () => {
      if (!this.ctx) return;
      if (document.hidden) this.ctx.suspend();
      else this.ctx.resume();
    });
  }

  _noise() {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = true;
    s.loopStart = Math.random() * 2;
    return s;
  }

  _bed(freq, base, lfoRate, lfoDepth, type = "lowpass") {
    const ctx = this.ctx;
    const src = this._noise();
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = type === "bandpass" ? 0.7 : 0.5;
    const g = ctx.createGain();
    g.gain.value = base;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = lfoRate;
    const lg = ctx.createGain();
    lg.gain.value = lfoDepth;
    lfo.connect(lg).connect(g.gain);
    lfo.start();
    src.connect(f).connect(g).connect(this.master);
    src.start();
    return { gain: g, filter: f };
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.1);
  }

  // Per-frame ambience: altitude drives wind, the ring drives the hum.
  ambience({ wind = 0, hum = 0, night = 0 }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.wind.gain.gain.setTargetAtTime(0.012 + wind * 0.07, t, 0.5);
    this.wind.filter.frequency.setTargetAtTime(600 + wind * 700, t, 0.5);
    this.hum.gain.setTargetAtTime(hum * 0.16, t, 0.25);
    this.darkness = night;
    this.padLp.frequency.setTargetAtTime(1100 - night * 550, t, 1);
  }

  _padTick() {
    const ctx = this.ctx;
    const chord = PAD_CHORDS[this.chordIx++ % PAD_CHORDS.length];
    const now = ctx.currentTime;
    const n = Math.min(chord.length, 1 + this.voices);
    for (let i = 0; i < n; i++) {
      const o = ctx.createOscillator();
      o.type = i === 0 ? "sine" : "triangle";
      o.frequency.value = chord[i] * (i === 0 ? 0.5 : 1);
      o.detune.value = (Math.random() - 0.5) * 8;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(i === 0 ? 0.6 : 0.35, now + 3);
      g.gain.linearRampToValueAtTime(0, now + 10.5);
      o.connect(g).connect(this.pad);
      o.start(now);
      o.stop(now + 11);
    }
  }

  setVoices(n) {
    this.voices = n;
  }

  tone(freq, { dur = 1.2, vol = 0.25, type = "sine", when = 0, wet = true } = {}) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + when;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    g.connect(this.master);
    if (wet) g.connect(this.verb);
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.connect(g);
    o.start(t);
    o.stop(t + dur + 0.05);
    return o;
  }

  bell(freq, vol = 0.18, when = 0) {
    this.tone(freq, { vol, dur: 2.6, when });
    this.tone(freq * 2.76, { vol: vol * 0.35, dur: 1.4, when });
    this.tone(freq * 5.4, { vol: vol * 0.12, dur: 0.7, when });
  }

  // Stone note: a warm, breathy sine with an octave shadow.
  stone(freq) {
    this.tone(freq, { vol: 0.3, dur: 2.2 });
    this.tone(freq * 2, { vol: 0.08, dur: 1.4, type: "triangle" });
    this.tone(freq * 0.5, { vol: 0.12, dur: 2.4 });
  }

  _burst({ dur = 0.3, vol = 0.3, f0 = 800, f1 = 800, q = 1, type = "bandpass", when = 0 }) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + when;
    const s = this._noise();
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + Math.min(0.02, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    s.connect(f).connect(g).connect(this.master);
    s.start(t);
    s.stop(t + dur + 0.05);
  }

  clack() {
    this._burst({ dur: 0.09, vol: 0.5, f0: 1600, f1: 900, q: 3 });
    this.tone(210, { dur: 0.12, vol: 0.2, type: "triangle", wet: false });
  }

  ratchet() {
    for (let i = 0; i < 4; i++) this._burst({ dur: 0.05, vol: 0.25, f0: 5200, f1: 4200, q: 6, when: i * 0.07 });
    this.tone(880, { dur: 0.3, vol: 0.04, when: 0.28 });
  }

  wrong() {
    this.tone(155.6, { dur: 0.6, vol: 0.18, type: "triangle" });
    this.tone(146.8, { dur: 0.9, vol: 0.18, type: "triangle", when: 0.18 });
  }

  kindle(pitch = 1) {
    this._burst({ dur: 0.5, vol: 0.18, f0: 400, f1: 2400, q: 0.8 });
    this.bell(587.3 * pitch, 0.12, 0.05);
  }

  door() {
    this._burst({ dur: 0.8, vol: 0.25, f0: 300, f1: 120, q: 2, type: "lowpass" });
    this.tone(70, { dur: 0.7, vol: 0.2, wet: false });
  }

  ignite() {
    if (!this.ctx) return;
    this._burst({ dur: 2.2, vol: 0.45, f0: 180, f1: 3000, q: 0.6, type: "lowpass" });
    this._burst({ dur: 1.4, vol: 0.2, f0: 2000, f1: 500, q: 0.7, when: 0.4 });
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(49, t);
    o.frequency.linearRampToValueAtTime(55, t + 3);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.3, t + 1.2);
    g.gain.exponentialRampToValueAtTime(0.001, t + 5);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 5.1);
    [392, 493.9, 587.3, 784].forEach((f, i) => this.bell(f, 0.13, 0.5 + i * 0.22));
  }

  tide(dur = 6) {
    this._burst({ dur, vol: 0.35, f0: 260, f1: 70, q: 0.5, type: "lowpass" });
    this._burst({ dur: dur * 0.8, vol: 0.08, f0: 3000, f1: 900, q: 0.6, when: 0.5 });
  }

  finale() {
    const notes = [392, 493.9, 587.3, 784, 987.8, 1174.7, 1568];
    notes.forEach((f, i) => this.bell(f, 0.12, i * 0.35));
    [196, 293.7, 392].forEach((f) => this.tone(f, { dur: 9, vol: 0.09, when: 2.2 }));
  }
}
