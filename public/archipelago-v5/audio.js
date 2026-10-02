// Five Lights — all sound is synthesised with WebAudio (no assets, no network).
export class Sound {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.hum = null;
  }
  // called on the first click / key (and tried on gamepad press); fades sound in
  unlock() {
    try {
      if (!this.ctx) this.init();
      if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
      if (!this.faded && this.ctx.state === 'running') this.fadeIn();
      else if (!this.faded) this.ctx.resume().then(() => this.fadeIn()).catch(() => {});
    } catch (e) { /* audio unavailable */ }
  }
  fadeIn() {
    if (this.faded) return;
    this.faded = true;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(0.0001, t);
    this.master.gain.exponentialRampToValueAtTime(0.85, t + 3.0);
  }
  init() {
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = 0.0001;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 3;
    this.master.connect(comp).connect(ctx.destination);
    // shared noise buffer
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // ocean bed: two filtered noise layers breathing slowly
    this.sea = this.loopNoise('lowpass', 420, 0.7, 0.22);
    this.seaLfo(this.sea.g, 0.22, 0.09, 0.07);
    this.surf = this.loopNoise('bandpass', 900, 0.6, 0.05);
    this.seaLfo(this.surf.g, 0.05, 0.05, 0.13);
    this.wind = this.loopNoise('bandpass', 520, 0.4, 0.03);
    this.seaLfo(this.wind.g, 0.03, 0.025, 0.031);
    // wash near surfaced causeways
    this.wash = this.loopNoise('bandpass', 700, 0.5, 0.0);
    this.ready = true;
    this.nextGull = ctx.currentTime + 4;
  }
  loopNoise(type, f, q, g) {
    const ctx = this.ctx;
    const s = ctx.createBufferSource(); s.buffer = this.noise; s.loop = true;
    const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    const gn = ctx.createGain(); gn.gain.value = g;
    s.connect(fl).connect(gn).connect(this.master); s.start();
    return { s, f: fl, g: gn };
  }
  seaLfo(gainNode, base, depth, rate) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.frequency.value = rate;
    const og = ctx.createGain(); og.gain.value = depth;
    gainNode.gain.value = base;
    o.connect(og).connect(gainNode.gain); o.start();
  }
  out(pan = 0, vol = 1) {
    const ctx = this.ctx;
    const g = ctx.createGain(); g.gain.value = vol;
    if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); g.connect(p).connect(this.master); }
    else g.connect(this.master);
    return g;
  }
  burst(dest, dur, type, f, q, t0 = 0, peak = 1, attack = 0.004) {
    const ctx = this.ctx, t = ctx.currentTime + t0;
    const s = ctx.createBufferSource(); s.buffer = this.noise;
    const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl).connect(g).connect(dest);
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
    return fl;
  }
  tone(dest, type, f0, f1, dur, peak = 0.3, t0 = 0, attack = 0.005) {
    const ctx = this.ctx, t = ctx.currentTime + t0;
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest); o.start(t); o.stop(t + dur + 0.05);
    return o;
  }
  get ok() { return this.ready && this.ctx.state === 'running'; }

  // surface: 0 sand 1 grass 2 stone 3 dirt 4 wood 5 water
  step(surface, vol = 1) {
    if (!this.ok) return;
    const o = this.out((Math.random() - 0.5) * 0.15, 0.55 * vol);
    const r = 0.9 + Math.random() * 0.2;
    switch (surface) {
      case 0: this.burst(o, 0.16, 'lowpass', 1300 * r, 0.8, 0, 0.5, 0.02); break;
      case 1: this.burst(o, 0.11, 'bandpass', 2600 * r, 0.8, 0, 0.3, 0.01); this.burst(o, 0.08, 'lowpass', 500, 1, 0, 0.25); break;
      case 2: this.burst(o, 0.05, 'highpass', 2500 * r, 0.9, 0, 0.55, 0.002); this.tone(o, 'triangle', 820 * r, 600 * r, 0.05, 0.18); break;
      case 3: this.burst(o, 0.1, 'lowpass', 900 * r, 0.9, 0, 0.45, 0.008); break;
      case 4: this.tone(o, 'sine', 150 * r, 85 * r, 0.14, 0.55); this.burst(o, 0.06, 'bandpass', 700 * r, 1.4, 0, 0.35); break;
      case 5: this.burst(o, 0.22, 'bandpass', 1100 * r, 0.6, 0, 0.45, 0.02); this.burst(o, 0.3, 'lowpass', 400, 0.7, 0.03, 0.3, 0.03); break;
    }
  }
  gull(pan = 0, vol = 0.5) {
    if (!this.ok) return;
    const o = this.out(pan, vol);
    const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const t0 = i * (0.32 + Math.random() * 0.1), base = 1500 + Math.random() * 400;
      const ctx = this.ctx, t = ctx.currentTime + t0;
      const osc = ctx.createOscillator(); osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(base, t); osc.frequency.linearRampToValueAtTime(base * 1.55, t + 0.07); osc.frequency.exponentialRampToValueAtTime(base * 0.8, t + 0.28);
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2200; bp.Q.value = 2.5;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.18, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      osc.connect(bp).connect(g).connect(o); osc.start(t); osc.stop(t + 0.35);
    }
  }
  waveWash(pan = 0, vol = 1) {
    if (!this.ok) return;
    const o = this.out(pan, vol);
    const f = this.burst(o, 3.2, 'bandpass', 300, 0.7, 0, 0.7, 1.0);
    const t = this.ctx.currentTime;
    f.frequency.setValueAtTime(260, t); f.frequency.exponentialRampToValueAtTime(1400, t + 1.1); f.frequency.exponentialRampToValueAtTime(320, t + 3.1);
    this.burst(o, 2.6, 'lowpass', 300, 0.7, 0.3, 0.6, 0.8);
  }
  setWash(v) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    if (t - (this._washT || 0) < 0.2 && Math.abs(v - (this._washV || 0)) < 0.05) return;
    this._washT = t; this._washV = v;
    this.wash.g.gain.setTargetAtTime(v * 0.16, t, 0.4);
  }
  chime(pan = 0, f = 660, vol = 0.5) {
    if (!this.ok) return;
    const o = this.out(pan, vol);
    this.tone(o, 'sine', f, f, 1.8, 0.4); this.tone(o, 'sine', f * 2.01, f * 2.01, 1.0, 0.12); this.tone(o, 'triangle', f * 3.02, f * 3.02, 0.5, 0.05);
  }
  wrong(pan = 0) {
    if (!this.ok) return;
    const o = this.out(pan, 0.7);
    this.tone(o, 'sine', 110, 55, 0.5, 0.5); this.tone(o, 'square', 98, 92, 0.35, 0.05);
    this.burst(o, 0.9, 'lowpass', 900, 0.7, 0.12, 0.5, 0.05);
  }
  click(pan = 0) {
    if (!this.ok) return;
    const o = this.out(pan, 0.6);
    this.burst(o, 0.04, 'highpass', 3000, 1, 0, 0.6, 0.001); this.tone(o, 'square', 1900, 1500, 0.03, 0.06);
    this.burst(o, 0.07, 'bandpass', 900, 3, 0.05, 0.4, 0.001);
  }
  creak(pan = 0, dur = 0.5) {
    if (!this.ok) return;
    const o = this.out(pan, 0.4);
    const osc = this.tone(o, 'sawtooth', 70, 95, dur, 0.12, 0, 0.05);
    const ctx = this.ctx, l = ctx.createOscillator(), lg = ctx.createGain();
    l.frequency.value = 23; lg.gain.value = 18; l.connect(lg).connect(osc.frequency); l.start(); l.stop(ctx.currentTime + dur + 0.1);
    this.burst(o, dur, 'bandpass', 1400, 4, 0, 0.15, 0.05);
  }
  ignite(pan = 0, vol = 0.8) {
    if (!this.ok) return;
    const o = this.out(pan, vol);
    const f = this.burst(o, 1.4, 'lowpass', 200, 0.8, 0, 0.8, 0.15);
    f.frequency.exponentialRampToValueAtTime(3000, this.ctx.currentTime + 0.4);
    f.frequency.exponentialRampToValueAtTime(400, this.ctx.currentTime + 1.4);
    this.tone(o, 'sine', 70, 40, 1.2, 0.5, 0, 0.05);
  }
  crackle(pan = 0, vol = 0.3) {
    if (!this.ok) return;
    const o = this.out(pan, vol);
    for (let i = 0; i < 3; i++) if (Math.random() < 0.6) this.burst(o, 0.03, 'highpass', 1800 + Math.random() * 2500, 1, Math.random() * 0.25, 0.4, 0.001);
  }
  swell(pan = 0, notes = [262, 330, 392, 523], vol = 0.35, dur = 5) {
    if (!this.ok) return;
    const o = this.out(pan * 0.5, vol);
    notes.forEach((f, i) => {
      this.tone(o, 'sine', f, f, dur, 0.22, i * 0.12, 1.2);
      this.tone(o, 'triangle', f * 2, f * 2, dur * 0.7, 0.04, i * 0.12, 1.4);
    });
  }
  bell(pan = 0, f = 660, vol = 0.3) {
    if (!this.ok) return;
    const o = this.out(pan, vol);
    [1, 2.76, 5.4, 8.9].forEach((m, i) => this.tone(o, 'sine', f * m, f * m, 2.5 / (i + 1), 0.2 / (i + 1)));
  }
  // monolith ring drone: stones + altar
  ensureHum(n) {
    if (!this.ready || this.hum) return;
    const ctx = this.ctx;
    const g = ctx.createGain(); g.gain.value = 0; g.connect(this.master);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1200; lp.connect(g);
    const mk = (f, v) => {
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
      const og = ctx.createGain(); og.gain.value = v; o.connect(og).connect(lp); o.start();
      const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = f * 2;
      const og2 = ctx.createGain(); og2.gain.value = v * 0.3; o2.connect(og2).connect(lp); o2.start();
      return { o, o2, og };
    };
    this.hum = { g, altar: mk(196, 0.16), stones: Array.from({ length: n }, () => mk(196, 0.1)) };
  }
  setHum(freqs, vol) {
    if (!this.hum) return;
    const t = this.ctx.currentTime;
    if (t - (this._humT || 0) < 0.08) return;
    this._humT = t;
    this.hum.g.gain.setTargetAtTime(vol, t, 0.3);
    freqs.forEach((f, i) => { const s = this.hum.stones[i]; s.o.frequency.setTargetAtTime(f, t, 0.15); s.o2.frequency.setTargetAtTime(f * 2, t, 0.15); });
  }
  update(dt, night) {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    if (t > this.nextGull) {
      this.nextGull = t + 7 + Math.random() * 14 + night * 25;
      if (night < 0.8) this.gull((Math.random() - 0.5) * 1.6, 0.25 + Math.random() * 0.3);
    }
    if (t - (this._windT || 0) > 1) { this._windT = t; this.wind.g.gain.setTargetAtTime(0.03 + night * 0.025, t, 1); }
  }
}
