// All sound is synthesised with Web Audio. Positional sources (waves, gulls,
// fires, the humming stones, bells) use panners so they fade with distance.
export class Audio {
  constructor() {
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = 0;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    this.master.connect(comp); comp.connect(c.destination);
    this.sfx = c.createGain(); this.sfx.gain.value = 1; this.sfx.connect(this.master);
    this.faded = false;
    this.white = this.makeNoise(2, 'white');
    this.brown = this.makeNoise(6, 'brown');
    this.waveBuf = this.makeWaves();
    this.crackleBuf = this.makeCrackle();
    c.onstatechange = () => this.fadeIn();
    this.ambient = null;
  }
  get t() { return this.ctx.currentTime; }
  unlock() {
    if (this.ctx.state !== 'running') { const p = this.ctx.resume(); if (p && p.catch) p.catch(() => {}); }
    this.fadeIn();
  }
  fadeIn() {
    if (this.faded || this.ctx.state !== 'running') return;
    this.faded = true;
    const g = this.master.gain;
    g.cancelScheduledValues(this.t);
    g.setValueAtTime(0, this.t);
    g.linearRampToValueAtTime(0.9, this.t + 3.0);
    this.startAmbient();
  }
  makeNoise(sec, kind) {
    const c = this.ctx, n = Math.floor(c.sampleRate * sec);
    const b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
    }
    return b;
  }
  makeWaves() {
    const c = this.ctx, sec = 9, n = Math.floor(c.sampleRate * sec);
    const b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) {
      const t = i / c.sampleRate;
      last = (last + 0.04 * (Math.random() * 2 - 1)) / 1.04;
      const env = 0.18 + 0.82 * Math.pow(Math.sin(Math.PI * t / sec), 2) * (0.7 + 0.3 * Math.sin(Math.PI * 2 * t / sec * 2));
      d[i] = last * 4 * env;
    }
    return b;
  }
  makeCrackle() {
    const c = this.ctx, sec = 3, n = Math.floor(c.sampleRate * sec);
    const b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 1.2; }
    for (let k = 0; k < 70; k++) {
      const at = Math.floor(Math.random() * (n - 2000)), len = 80 + Math.floor(Math.random() * 600), a = 0.2 + Math.random() * 0.6;
      for (let j = 0; j < len; j++) d[at + j] += (Math.random() * 2 - 1) * a * Math.exp(-j / (len * 0.25));
    }
    return b;
  }
  setListener(pos, fwd) {
    const l = this.ctx.listener, t = this.t;
    if (l.positionX) {
      l.positionX.setTargetAtTime(pos.x, t, 0.05); l.positionY.setTargetAtTime(pos.y, t, 0.05); l.positionZ.setTargetAtTime(pos.z, t, 0.05);
      l.forwardX.setTargetAtTime(fwd.x, t, 0.05); l.forwardY.setTargetAtTime(fwd.y, t, 0.05); l.forwardZ.setTargetAtTime(fwd.z, t, 0.05);
      l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0;
    } else { l.setPosition(pos.x, pos.y, pos.z); l.setOrientation(fwd.x, fwd.y, fwd.z, 0, 1, 0); }
  }
  panner(pos, ref = 4, roll = 1.1, hrtf = false) {
    const p = this.ctx.createPanner();
    p.panningModel = hrtf ? 'HRTF' : 'equalpower';
    p.distanceModel = 'inverse';
    p.refDistance = ref; p.maxDistance = 400; p.rolloffFactor = roll;
    if (p.positionX) { p.positionX.value = pos[0]; p.positionY.value = pos[1]; p.positionZ.value = pos[2]; } else p.setPosition(pos[0], pos[1], pos[2]);
    p.connect(this.sfx);
    return p;
  }
  env(node, t0, a, peak, d) {
    node.gain.setValueAtTime(0.0001, t0);
    node.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + a);
    node.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
  }
  noiseShot(dest, buf, t0, dur, filterType, freq, q, peak, attack = 0.005) {
    const c = this.ctx;
    const s = c.createBufferSource(); s.buffer = buf;
    const f = c.createBiquadFilter(); f.type = filterType; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain();
    this.env(g, t0, attack, peak, dur);
    s.connect(f); f.connect(g); g.connect(dest);
    s.start(t0, Math.random() * Math.max(0, buf.duration - dur - 0.1)); s.stop(t0 + attack + dur + 0.05);
    return f;
  }
  tone(dest, type, freq, t0, a, peak, d, freqEnd = null) {
    const c = this.ctx;
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t0 + a + d);
    const g = c.createGain();
    this.env(g, t0, a, peak, d);
    o.connect(g); g.connect(dest);
    o.start(t0); o.stop(t0 + a + d + 0.05);
    return o;
  }
  // ---------------------------------------------------------------- one-shots
  bell(pos, f, vol = 1) {
    const p = this.panner(pos, 6, 1, true), t = this.t;
    [[1, 0.5], [2.0, 0.22], [2.76, 0.16], [5.4, 0.06]].forEach(([m, a]) => this.tone(p, 'sine', f * m, t, 0.004, a * vol, 2.6 / m + 0.4));
  }
  chime(pos, f, vol = 1) {
    const p = this.panner(pos, 4, 1, true), t = this.t;
    this.tone(p, 'sine', f, t, 0.003, 0.35 * vol, 1.8); this.tone(p, 'sine', f * 3.9, t, 0.002, 0.08 * vol, 0.6);
  }
  thud(pos) {
    const p = this.panner(pos, 5, 1, true), t = this.t;
    this.tone(p, 'sine', 90, t, 0.005, 0.5, 0.35, 45);
    this.noiseShot(p, this.brown, t, 0.4, 'lowpass', 300, 0.7, 0.4);
  }
  click(pos, pitch = 1) {
    const p = this.panner(pos, 4, 1, true), t = this.t;
    for (let k = 0; k < 3; k++) this.noiseShot(p, this.white, t + k * 0.09, 0.04, 'bandpass', 2400 * pitch, 3, 0.35);
    this.tone(p, 'triangle', 380 * pitch, t + 0.18, 0.002, 0.18, 0.12);
  }
  clunk(pos, vol = 1) {
    const p = this.panner(pos, 5, 1, true), t = this.t;
    this.tone(p, 'square', 110, t, 0.004, 0.15 * vol, 0.18, 70);
    this.noiseShot(p, this.white, t, 0.08, 'bandpass', 900, 2, 0.4 * vol);
  }
  grind(pos, vol = 1, dur = 1.5) {
    const p = this.panner(pos, 6, 1, true), t = this.t;
    const f = this.noiseShot(p, this.brown, t, dur, 'lowpass', 260, 1.2, 0.9 * vol, 0.15);
    f.frequency.setValueAtTime(180, t); f.frequency.linearRampToValueAtTime(420, t + dur * 0.5); f.frequency.linearRampToValueAtTime(160, t + dur);
    this.tone(p, 'sawtooth', 55, t, 0.2, 0.05 * vol, dur, 48);
  }
  ignite(pos, vol = 1) {
    const p = this.panner(pos, 6, 1, true), t = this.t;
    const f = this.noiseShot(p, this.white, t, 0.9, 'bandpass', 300, 1.2, 0.5 * vol, 0.05);
    f.frequency.setValueAtTime(250, t); f.frequency.exponentialRampToValueAtTime(2600, t + 0.7);
    this.tone(p, 'sine', 70, t, 0.02, 0.4 * vol, 0.6, 40);
  }
  fizz(pos) {
    const p = this.panner(pos, 4, 1, true);
    this.noiseShot(p, this.white, this.t, 0.7, 'highpass', 3000, 0.7, 0.25, 0.01);
  }
  shutter(pos, vol = 1) {
    const p = this.panner(pos, 5, 1, true), t = this.t;
    this.noiseShot(p, this.white, t, 0.05, 'bandpass', 1100, 2.5, 0.5 * vol);
    this.tone(p, 'sine', 210, t, 0.002, 0.25 * vol, 0.12);
    this.noiseShot(p, this.white, t + 0.12, 0.04, 'bandpass', 1500, 2.5, 0.3 * vol);
  }
  slam(pos, vol = 1) {
    const p = this.panner(pos, 8, 1, true), t = this.t;
    for (let k = 0; k < 4; k++) { this.noiseShot(p, this.white, t + k * 0.06, 0.07, 'bandpass', 800, 2, 0.6 * vol); this.tone(p, 'sine', 150, t + k * 0.06, 0.002, 0.3 * vol, 0.15); }
  }
  wash(pos) {
    const p = this.panner(pos, 14, 0.8), t = this.t;
    const f = this.noiseShot(p, this.brown, t, 4.5, 'lowpass', 500, 0.7, 1.4, 1.2);
    f.frequency.setValueAtTime(300, t); f.frequency.linearRampToValueAtTime(1400, t + 1.5); f.frequency.linearRampToValueAtTime(350, t + 5);
  }
  success(vol = 1) {
    const t = this.t;
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, k) => {
      this.tone(this.sfx, 'sine', f, t + k * 0.16, 0.01, 0.16 * vol, 2.2);
      this.tone(this.sfx, 'triangle', f / 2, t + k * 0.16, 0.02, 0.05 * vol, 1.6);
    });
  }
  beacon(pos) {
    this.ignite(pos, 1.6);
    const t = this.t;
    [261.63, 329.63, 392.0, 523.25].forEach((f, k) => this.tone(this.sfx, 'sine', f, t + 0.3 + k * 0.05, 0.4, 0.09, 4.5));
  }
  step(surface, vol = 1) {
    if (this.ctx.state !== 'running') return;
    const t = this.t, d = this.sfx, v = Math.min(1, vol) * (0.85 + Math.random() * 0.3);
    if (surface === 'wood') {
      this.tone(d, 'sine', 150 + Math.random() * 30, t, 0.003, 0.32 * v, 0.1, 90);
      this.noiseShot(d, this.white, t, 0.06, 'bandpass', 700, 2, 0.22 * v);
    } else if (surface === 'stone') {
      this.noiseShot(d, this.white, t, 0.045, 'bandpass', 2600 + Math.random() * 600, 1.4, 0.28 * v);
      this.tone(d, 'triangle', 300, t, 0.002, 0.06 * v, 0.05);
    } else if (surface === 'grass') {
      this.noiseShot(d, this.white, t, 0.12, 'bandpass', 1900, 0.8, 0.12 * v, 0.02);
    } else {
      this.noiseShot(d, this.white, t, 0.16, 'lowpass', 750, 0.6, 0.26 * v, 0.015);
      this.noiseShot(d, this.white, t + 0.02, 0.08, 'highpass', 3500, 0.5, 0.05 * v);
    }
  }
  gull(pos) {
    if (this.ctx.state !== 'running') return;
    const p = this.panner(pos, 12, 0.9, true), t = this.t;
    const n = 2 + Math.floor(Math.random() * 3);
    for (let k = 0; k < n; k++) {
      const t0 = t + k * (0.28 + Math.random() * 0.1);
      const o = this.ctx.createOscillator(); o.type = 'sawtooth';
      const f0 = 1700 + Math.random() * 500;
      o.frequency.setValueAtTime(f0, t0); o.frequency.linearRampToValueAtTime(f0 * 1.25, t0 + 0.05); o.frequency.exponentialRampToValueAtTime(f0 * 0.62, t0 + 0.24);
      const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1900; bp.Q.value = 2.5;
      const g = this.ctx.createGain(); this.env(g, t0, 0.02, 0.22, 0.23);
      o.connect(bp); bp.connect(g); g.connect(p);
      o.start(t0); o.stop(t0 + 0.3);
    }
  }
  // ---------------------------------------------------------------- loops
  loop(buf, pos, ref, gain, filter = null) {
    const c = this.ctx;
    const s = c.createBufferSource(); s.buffer = buf; s.loop = true;
    const g = c.createGain(); g.gain.value = gain;
    let node = s;
    if (filter) { const f = c.createBiquadFilter(); f.type = filter[0]; f.frequency.value = filter[1]; s.connect(f); node = f; }
    node.connect(g);
    g.connect(pos ? this.panner(pos, ref, 1.0) : this.sfx);
    s.start(this.t + Math.random() * 0.1, Math.random() * buf.duration);
    return { g, s };
  }
  waves(pos) { return this.loop(this.waveBuf, pos, 9, 0.55, ['lowpass', 900]); }
  fire(pos, gain = 0.5) { return this.loop(this.crackleBuf, pos, 4, gain, ['highpass', 180]); }
  startAmbient() {
    if (this.ambient) return;
    this.ambient = this.loop(this.brown, null, 0, 0.05, ['lowpass', 380]);
  }
  hum(pos, freqs, vol = 1) {
    const c = this.ctx;
    const g = c.createGain(); g.gain.value = 0;
    g.connect(this.panner(pos, 3, 1.1));
    const oscs = freqs.map((f) => {
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const o2 = c.createOscillator(); o2.type = 'triangle'; o2.frequency.value = f * 2;
      const g2 = c.createGain(); g2.gain.value = 0.18;
      o.connect(g); o2.connect(g2); g2.connect(g);
      o.start(); o2.start();
      return [o, o2];
    });
    return {
      set: (fs, gain) => {
        const t = this.t;
        fs.forEach((f, i) => { if (oscs[i]) { oscs[i][0].frequency.setTargetAtTime(f, t, 0.25); oscs[i][1].frequency.setTargetAtTime(f * 2, t, 0.25); } });
        g.gain.setTargetAtTime(gain * vol, t, 0.3);
      },
    };
  }
}
