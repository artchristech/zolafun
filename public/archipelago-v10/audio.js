// Synthesised, positional sound: footsteps, sea, gulls, fire, bells and the humming stones.
export class AudioSys {
  constructor() {
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ok = !!AC;
    this.faded = false;
    this.paused = false;
    this.humVoices = { main: [], tut: [] };
    if (!this.ok) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.sfx.connect(this.master);
    this.amb = ctx.createGain();
    this.amb.gain.value = 0.9;
    this.amb.connect(this.master);
    this.humBus = { main: ctx.createGain(), tut: ctx.createGain() };
    this.humBus.main.gain.value = 0;
    this.humBus.tut.gain.value = 0;
    this.humBus.main.connect(this.sfx);
    this.humBus.tut.connect(this.sfx);
    this.sr = ctx.sampleRate;
    this.noise = this._buf(3, () => Math.random() * 2 - 1);
    this._makeBuffers();
  }
  _buf(dur, fn) {
    const n = Math.max(1, Math.floor(dur * this.sr));
    const b = this.ctx.createBuffer(1, n, this.sr);
    const d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = fn(i / this.sr, i);
    return b;
  }
  _makeBuffers() {
    const lp = (a) => { let y = 0; return (x) => (y += a * (x - y)); };
    const R = () => Math.random() * 2 - 1;
    const steps = [];
    { const f = lp(0.12); steps[0] = this._buf(0.14, (t) => f(R()) * Math.exp(-t * 28) * Math.min(1, t * 200) * 1.8); }
    { const f = lp(0.5); steps[1] = this._buf(0.12, (t) => { const x = R(); return (x - f(x)) * Math.exp(-t * 35) * 0.35; }); }
    { const f = lp(0.35); steps[2] = this._buf(0.09, (t) => f(R()) * Math.exp(-t * 90) * 0.9 + Math.sin(2 * Math.PI * 190 * t) * Math.exp(-t * 70) * 0.35); }
    steps[3] = this._buf(0.2, (t) => Math.sin(2 * Math.PI * 105 * t) * Math.exp(-t * 32) * 0.8 + Math.sin(2 * Math.PI * 233 * t) * Math.exp(-t * 45) * 0.35 + R() * Math.exp(-t * 90) * 0.18);
    steps[4] = steps[0];
    { const f = lp(0.25); steps[5] = this._buf(0.32, (t) => f(R()) * Math.min(1, t * 40) * Math.exp(-t * 11) * 1.6); }
    this.steps = steps;
    // gull: two or three falling cries
    {
      let ph = 0;
      const starts = [0, 0.42, 0.78];
      this.gullBuf = this._buf(1.2, (t) => {
        let s = 0;
        for (const t0 of starts) {
          const u = (t - t0) / 0.3;
          if (u < 0 || u > 1) continue;
          const f = 1200 + 950 * Math.pow(Math.sin(Math.PI * u), 0.5) - 350 * u;
          ph += (2 * Math.PI * f) / this.sr;
          const env = Math.pow(Math.sin(Math.PI * u), 1.5);
          s += (Math.sin(ph) + 0.45 * Math.sin(2 * ph) + 0.25 * Math.sin(3 * ph)) * env * 0.35 * (1 + 0.3 * Math.sin(2 * Math.PI * 28 * t));
        }
        return s;
      });
    }
    // fire crackle loop
    {
      const f = lp(0.04);
      const pops = [];
      for (let i = 0; i < 46; i++) pops.push({ t: Math.random() * 2.5, a: 0.2 + Math.random() * 0.8, d: 200 + Math.random() * 600 });
      this.fireBuf = this._buf(2.5, (t) => {
        let s = f(R()) * 0.6;
        for (const p of pops) {
          const u = t - p.t;
          if (u >= 0 && u < 0.03) s += R() * p.a * Math.exp(-u * p.d);
        }
        return s * 0.7;
      });
    }
    { const f = lp(0.06); this.washBuf = this._buf(2.6, (t) => f(R()) * Math.min(1, t * 2.5) * Math.exp(-Math.max(0, t - 0.5) * 1.6) * 2.2); }
  }
  // ------------------------------------------------------------ control
  unlock() {
    if (!this.ok) return;
    const go = () => {
      if (this.faded || this.paused) return;
      this.faded = true;
      const t = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setValueAtTime(0, t);
      this.master.gain.linearRampToValueAtTime(1, t + 2.5);
      this._startAmbience();
    };
    if (this.ctx.state !== 'running') {
      const p = this.ctx.resume();
      if (p && p.then) p.then(go).catch(() => {});
    } else go();
  }
  get running() {
    return this.ok && this.ctx.state === 'running';
  }
  setPaused(p) {
    if (!this.ok) return;
    this.paused = p;
    if (p) {
      if (this.ctx.state === 'running') this.ctx.suspend().catch(() => {});
    } else if (this.faded) {
      this.ctx.resume().catch(() => {});
    } else this.unlock();
  }
  listener(cam) {
    if (!this.ok) return;
    const L = this.ctx.listener;
    const p = cam.position;
    const f = cam.getWorldDirection(this._f || (this._f = cam.position.clone()));
    if (L.positionX) {
      const t = this.ctx.currentTime;
      L.positionX.setTargetAtTime(p.x, t, 0.02);
      L.positionY.setTargetAtTime(p.y, t, 0.02);
      L.positionZ.setTargetAtTime(p.z, t, 0.02);
      L.forwardX.setTargetAtTime(f.x, t, 0.02);
      L.forwardY.setTargetAtTime(f.y, t, 0.02);
      L.forwardZ.setTargetAtTime(f.z, t, 0.02);
      L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
    } else {
      L.setPosition(p.x, p.y, p.z);
      L.setOrientation(f.x, f.y, f.z, 0, 1, 0);
    }
  }
  _panner(pos, ref = 6, roll = 1.2, hrtf = true) {
    const pn = this.ctx.createPanner();
    pn.panningModel = hrtf ? 'HRTF' : 'equalpower';
    pn.distanceModel = 'inverse';
    pn.refDistance = ref;
    pn.rolloffFactor = roll;
    pn.maxDistance = 10000;
    if (pn.positionX) {
      pn.positionX.value = pos.x; pn.positionY.value = pos.y; pn.positionZ.value = pos.z;
    } else pn.setPosition(pos.x, pos.y, pos.z);
    return pn;
  }
  _out(pos, ref, roll, vol, bus) {
    const g = this.ctx.createGain();
    g.gain.value = vol;
    if (pos) g.connect(this._panner(pos, ref, roll)).connect(bus || this.sfx);
    else g.connect(bus || this.sfx);
    return g;
  }
  _shot(buf, pos, vol = 1, rate = 1, ref = 4, roll = 1.2, bus) {
    if (!this.running) return;
    const s = this.ctx.createBufferSource();
    s.buffer = buf;
    s.playbackRate.value = rate;
    s.connect(this._out(pos, ref, roll, vol, bus));
    s.start();
  }
  _tone(pos, f, type, vol, attack, decay, when = 0, ref = 6, endF = null) {
    if (!this.running) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (endF) o.frequency.exponentialRampToValueAtTime(endF, t + attack + decay);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    o.connect(g).connect(this._out(pos, ref, 1.1, 1));
    o.start(t);
    o.stop(t + attack + decay + 0.05);
  }
  _noiseBurst(pos, vol, type, f0, f1, dur, q = 1, when = 0, ref = 5) {
    if (!this.running) return;
    const t = this.ctx.currentTime + when;
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    const fl = this.ctx.createBiquadFilter();
    fl.type = type;
    fl.Q.value = q;
    fl.frequency.setValueAtTime(f0, t);
    fl.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.05, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl).connect(g).connect(this._out(pos, ref, 1.1, 1));
    s.start(t, Math.random() * 2);
    s.stop(t + dur + 0.05);
  }
  // ------------------------------------------------------------ one-shots
  footstep(surface, pos) {
    const b = this.steps[surface] || this.steps[0];
    const vol = [0.5, 0.45, 0.55, 0.6, 0.45, 0.55][surface] || 0.5;
    this._shot(b, pos, vol, 0.85 + Math.random() * 0.3, 3, 1.5);
  }
  bell(pos, f, vol = 1) {
    const parts = [[1, 1, 3.2], [2.0, 0.5, 2.2], [2.76, 0.35, 1.5], [4.07, 0.2, 1.0], [5.4, 0.12, 0.6]];
    for (const [m, a, d] of parts) this._tone(pos, f * m, 'sine', 0.22 * a * vol, 0.005, d, 0, 8);
  }
  chime(pos, vol = 0.4, step = 1) {
    const f = 660 * Math.pow(2, (step * 2) / 12);
    this._tone(pos, f, 'sine', 0.2 * vol, 0.01, 1.2, 0, 12);
    this._tone(pos, f * 1.5, 'sine', 0.12 * vol, 0.01, 1.0, 0.08, 12);
  }
  success(pos, vol = 0.6) {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      this._tone(pos, f, 'triangle', 0.16 * vol, 0.01, 1.4, i * 0.12, 10);
      this._tone(pos, f * 2, 'sine', 0.05 * vol, 0.01, 1.0, i * 0.12, 10);
    });
  }
  thud(pos, vol = 0.8) {
    this._tone(pos, 90, 'sine', 0.6 * vol, 0.005, 0.5, 0, 8, 38);
    this._noiseBurst(pos, 0.25 * vol, 'lowpass', 400, 120, 0.4);
    this._tone(pos, 180, 'square', 0.04 * vol, 0.005, 0.35, 0.05, 8, 110);
  }
  clank(pos, vol = 0.8) {
    for (const [f, a, d] of [[310, 0.3, 0.5], [737, 0.18, 0.35], [1182, 0.12, 0.25], [1650, 0.08, 0.2]]) this._tone(pos, f, 'triangle', a * vol, 0.002, d, 0, 6);
    this._noiseBurst(pos, 0.2 * vol, 'highpass', 2000, 4000, 0.08, 0.7);
  }
  click(pos, vol = 1) {
    this._noiseBurst(pos, 0.3 * vol, 'bandpass', 2400, 1800, 0.06, 2);
    this._tone(pos, 520, 'square', 0.05 * vol, 0.002, 0.08, 0, 5);
    this._noiseBurst(pos, 0.22 * vol, 'bandpass', 1500, 1200, 0.05, 2, 0.11);
  }
  ratchet(pos, vol = 1) {
    for (let i = 0; i < 4; i++) this._noiseBurst(pos, 0.25 * vol, 'bandpass', 2800, 2200, 0.04, 3, i * 0.07);
    this._tone(pos, 140, 'triangle', 0.15 * vol, 0.005, 0.3, 0.28, 5);
  }
  fizzle(pos, vol = 1) {
    this._noiseBurst(pos, 0.3 * vol, 'highpass', 3000, 900, 0.9, 0.7);
    this._tone(pos, 300, 'sine', 0.06 * vol, 0.01, 0.6, 0, 5, 120);
  }
  ignite(pos, vol = 1) {
    this._noiseBurst(pos, 0.55 * vol, 'bandpass', 250, 2600, 0.9, 0.8, 0, 10);
    this._tone(pos, 70, 'sine', 0.5 * vol, 0.02, 1.4, 0, 12, 45);
  }
  stonePress(pos, vol = 1) {
    this._noiseBurst(pos, 0.4 * vol, 'lowpass', 300, 90, 0.6, 1);
    this._tone(pos, 55, 'sine', 0.35 * vol, 0.01, 0.6, 0, 6, 45);
  }
  wash(pos, vol = 1) {
    this._shot(this.washBuf, pos, 0.8 * vol, 0.8 + Math.random() * 0.4, 9, 1.2);
  }
  gull(pos) {
    this._shot(this.gullBuf, pos, 0.45, 0.85 + Math.random() * 0.35, 14, 1.0);
  }
  finale() {
    if (!this.running) return;
    const t = this.ctx.currentTime;
    const notes = [130.81, 196.0, 261.63, 329.63, 392.0];
    notes.forEach((f, i) => {
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      const fl = this.ctx.createBiquadFilter();
      fl.type = 'lowpass';
      fl.frequency.setValueAtTime(200, t);
      fl.frequency.linearRampToValueAtTime(1800, t + 8);
      fl.frequency.linearRampToValueAtTime(400, t + 22);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.05, t + 3 + i * 0.6);
      g.gain.linearRampToValueAtTime(0.0001, t + 24);
      o.connect(fl).connect(g).connect(this.sfx);
      o.start(t);
      o.stop(t + 25);
    });
    [1046.5, 1318.5, 1568, 2093].forEach((f, i) => this._tone(null, f, 'sine', 0.06, 0.01, 2.5, 1 + i * 0.9));
  }
  // ------------------------------------------------------------ loops
  _loop(buf, pos, vol, ref, roll, bus, rate = 1) {
    const s = this.ctx.createBufferSource();
    s.buffer = buf;
    s.loop = true;
    s.playbackRate.value = rate;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    s.connect(g);
    if (pos) g.connect(this._panner(pos, ref, roll, false)).connect(bus || this.amb);
    else g.connect(bus || this.amb);
    s.start(0, Math.random() * buf.duration);
    return { s, g };
  }
  fireLoop(pos, scale = 1) {
    if (!this.ok) return;
    this._loop(this.fireBuf, pos, 0.5, 3 + scale * 2.5, 1.3, this.sfx, 0.9 + Math.random() * 0.2);
  }
  setupWaves(points) {
    if (!this.ok) return;
    this.wavePoints = points;
  }
  _startAmbience() {
    if (this._ambStarted) return;
    this._ambStarted = true;
    const ctx = this.ctx;
    // wind
    const w = this._loop(this.noise, null, 0.0, 1, 1);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 380;
    bp.Q.value = 0.6;
    w.g.disconnect();
    w.g.connect(bp).connect(this.amb);
    w.g.gain.value = 0.07;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lg = ctx.createGain();
    lg.gain.value = 0.04;
    lfo.connect(lg).connect(w.g.gain);
    lfo.start();
    // waves breaking at fixed places along the shores
    for (const p of this.wavePoints || []) {
      const s = ctx.createBufferSource();
      s.buffer = this.noise;
      s.loop = true;
      const fl = ctx.createBiquadFilter();
      fl.type = 'lowpass';
      fl.frequency.value = 500 + Math.random() * 400;
      const g = ctx.createGain();
      g.gain.value = 0.32;
      const o = ctx.createOscillator();
      o.frequency.value = 0.07 + Math.random() * 0.07;
      const og = ctx.createGain();
      og.gain.value = 0.28;
      o.connect(og).connect(g.gain);
      s.connect(fl).connect(g).connect(this._panner(p, 7, 1.4, false)).connect(this.amb);
      s.start(0, Math.random() * 3);
      o.start();
    }
  }
  // ------------------------------------------------------------ humming stones
  makeHum(list, small) {
    if (!this.ok) return;
    const key = small ? 'tut' : 'main';
    this.humVoices[key] = list.map(({ pos, f }) => {
      const o1 = this.ctx.createOscillator();
      o1.type = 'sine';
      o1.frequency.value = f;
      const o2 = this.ctx.createOscillator();
      o2.type = 'triangle';
      o2.frequency.value = f * 2;
      const g2 = this.ctx.createGain();
      g2.gain.value = 0.25;
      const g = this.ctx.createGain();
      g.gain.value = small ? 0.05 : 0.07;
      const pn = this._panner(pos, small ? 2 : 3.5, 1.4, false);
      o1.connect(g);
      o2.connect(g2).connect(g);
      g.connect(pn).connect(this.humBus[key]);
      o1.start();
      o2.start();
      return { o1, o2, g, pos };
    });
  }
  setHum(freqs, small) {
    if (!this.ok) return;
    const v = this.humVoices[small ? 'tut' : 'main'];
    const t = this.ctx.currentTime;
    freqs.forEach((f, i) => {
      if (!v[i]) return;
      v[i].o1.frequency.setTargetAtTime(f, t, 0.08);
      v[i].o2.frequency.setTargetAtTime(f * 2, t, 0.08);
    });
  }
  humSolved(main, tut) {
    if (!this.ok) return;
    const v = this.humVoices[main ? 'main' : 'tut'];
    if (!tut && !main) return;
    for (const h of v) {
      if (h.fifth) continue;
      const o = this.ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = h.o1.frequency.value * 1.5;
      const g = this.ctx.createGain();
      g.gain.value = 0.0001;
      g.gain.setTargetAtTime(0.4, this.ctx.currentTime, 1.0);
      o.connect(g).connect(h.g);
      o.start();
      h.fifth = o;
    }
  }
  humLevel(main, tut) {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    this.humBus.main.gain.setTargetAtTime(main, t, 0.25);
    this.humBus.tut.gain.setTargetAtTime(tut, t, 0.25);
  }
}
