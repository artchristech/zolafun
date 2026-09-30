// All sound is synthesised with WebAudio: sea, wind, footsteps, gulls, bells, hum, fire, washes.
export class Audio {
  constructor() {
    this.ctx = null;
    this.listener = { x: 0, y: 0, z: 0, yaw: 0 };
    this.ready = false;
  }
  get running() { return !!this.ctx && this.ctx.state === 'running'; }
  // Must be called from within a user gesture handler (click / key) to unlock audio.
  unlock() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this._build();
      }
      if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
      // play a silent buffer: some browsers need a source started inside the gesture
      const b = this.ctx.createBuffer(1, 1, 22050);
      const s = this.ctx.createBufferSource();
      s.buffer = b; s.connect(this.ctx.destination); s.start(0);
    } catch (e) { /* ignore */ }
  }
  _build() {
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);
    // reverb
    this.verb = ctx.createConvolver();
    const len = ctx.sampleRate * 2.6;
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    this.verb.buffer = ir;
    this.verbGain = ctx.createGain();
    this.verbGain.gain.value = 0.35;
    this.verb.connect(this.verbGain).connect(this.master);
    // noise buffer
    const nlen = ctx.sampleRate * 3;
    this.noise = ctx.createBuffer(1, nlen, ctx.sampleRate);
    const nd = this.noise.getChannelData(0);
    for (let i = 0; i < nlen; i++) nd[i] = Math.random() * 2 - 1;
    // brown-ish noise for sea
    this.brown = ctx.createBuffer(1, nlen, ctx.sampleRate);
    const bd = this.brown.getChannelData(0);
    let last = 0;
    for (let i = 0; i < nlen; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; bd[i] = last * 3.5; }

    // ambient sea: two layers with slow swells
    this.sea = this._loopNoise(this.brown, 'lowpass', 520, 0.6);
    this.seaHiss = this._loopNoise(this.noise, 'bandpass', 1400, 0.5);
    this.wind = this._loopNoise(this.noise, 'bandpass', 420, 2.5);
    this.sea.gain.gain.value = 0.35;
    this.seaHiss.gain.gain.value = 0.02;
    this.wind.gain.gain.value = 0.02;

    // monolith hum
    this.hum = ctx.createGain();
    this.hum.gain.value = 0;
    const humF = ctx.createBiquadFilter();
    humF.type = 'lowpass'; humF.frequency.value = 900;
    this.hum.connect(humF).connect(this.master);
    humF.connect(this.verb);
    this.humOsc = [];
    for (const f of [110, 110.9, 164.2, 220.6, 277.9]) {
      const o = ctx.createOscillator();
      o.type = f > 200 ? 'sine' : 'triangle';
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = f > 200 ? 0.18 : 0.35;
      o.connect(g).connect(this.hum);
      o.start();
      this.humOsc.push(o);
    }
    // fire crackle bed
    this.fireBed = this._loopNoise(this.noise, 'bandpass', 2600, 0.8);
    this.fireBed.gain.gain.value = 0;
    this.ready = true;
    this._nextCrackle = 0;
  }
  _loopNoise(buf, type, freq, q) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    src.playbackRate.value = 0.9 + Math.random() * 0.2;
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(f).connect(g).connect(this.master);
    src.start();
    return { src, f, gain: g };
  }
  setListener(x, y, z, yaw) { const l = this.listener; l.x = x; l.y = y; l.z = z; l.yaw = yaw; }
  // returns [gain, pan] for a world position
  _spatial(p, ref = 12) {
    if (!p) return [1, 0];
    const l = this.listener;
    const dx = p.x - l.x, dz = p.z - l.z, dy = (p.y ?? l.y) - l.y;
    const d = Math.sqrt(dx * dx + dz * dz + dy * dy);
    const g = ref / (ref + Math.max(0, d - 1));
    // camera right vector for yaw: forward = (-sin yaw, -cos yaw)
    const rx = Math.cos(this.listener.yaw), rz = -Math.sin(this.listener.yaw);
    const pan = d > 0.01 ? Math.max(-1, Math.min(1, (dx * rx + dz * rz) / d)) : 0;
    return [g, pan * 0.8];
  }
  _out(pos, gainV, ref, verb = 0.3) {
    const ctx = this.ctx;
    const [g, pan] = this._spatial(pos, ref);
    const gain = ctx.createGain();
    gain.gain.value = gainV * g;
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    gain.connect(p).connect(this.master);
    if (verb > 0) {
      const vg = ctx.createGain();
      vg.gain.value = verb;
      p.connect(vg).connect(this.verb);
    }
    return gain;
  }
  _noiseBurst(dest, t, dur, type, freq, q, peak, attack = 0.005, buf = null) {
    const ctx = this.ctx;
    const s = ctx.createBufferSource();
    s.buffer = buf || this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(dest);
    s.start(t, Math.random() * 2);
    s.stop(t + dur + 0.05);
    return f;
  }
  _tone(dest, t, freq, dur, type = 'sine', peak = 0.3, attack = 0.005, endFreq = null) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
    return o;
  }

  footstep(surface, vol = 1) {
    if (!this.running) return;
    const t = this.ctx.currentTime;
    const out = this._out(null, 0.5 * vol, 1, 0.05);
    const r = 0.85 + Math.random() * 0.3;
    if (surface === 'sand') {
      this._noiseBurst(out, t, 0.16, 'lowpass', 900 * r, 0.7, 0.45, 0.02);
      this._noiseBurst(out, t + 0.02, 0.1, 'bandpass', 2800 * r, 1.2, 0.08, 0.01);
    } else if (surface === 'wood') {
      this._tone(out, t, 190 * r, 0.14, 'triangle', 0.45, 0.003, 120 * r);
      this._tone(out, t, 420 * r, 0.06, 'sine', 0.12, 0.002);
      this._noiseBurst(out, t, 0.07, 'bandpass', 900 * r, 2, 0.25, 0.002);
    } else if (surface === 'stone') {
      this._noiseBurst(out, t, 0.05, 'highpass', 2600 * r, 0.8, 0.4, 0.001);
      this._tone(out, t, 95 * r, 0.07, 'sine', 0.3, 0.002, 70);
      this._noiseBurst(out, t + 0.01, 0.04, 'bandpass', 5200 * r, 3, 0.1, 0.001);
    } else {
      // grass
      this._noiseBurst(out, t, 0.13, 'bandpass', 3200 * r, 0.6, 0.12, 0.02);
      this._noiseBurst(out, t, 0.1, 'lowpass', 600 * r, 0.7, 0.18, 0.01);
    }
  }
  gull(pos) {
    if (!this.running) return;
    const t0 = this.ctx.currentTime;
    const out = this._out(pos, 0.22, 40, 0.5);
    const calls = 2 + Math.floor(Math.random() * 3);
    const base = 1300 + Math.random() * 500;
    for (let i = 0; i < calls; i++) {
      const t = t0 + i * (0.28 + Math.random() * 0.1);
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(base * 0.8, t);
      o.frequency.linearRampToValueAtTime(base * 1.35, t + 0.06);
      o.frequency.exponentialRampToValueAtTime(base * 0.7, t + 0.24);
      const f = this.ctx.createBiquadFilter();
      f.type = 'bandpass'; f.frequency.value = base * 1.6; f.Q.value = 3;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.5, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
      const vib = this.ctx.createOscillator();
      vib.frequency.value = 30;
      const vg = this.ctx.createGain();
      vg.gain.value = 40;
      vib.connect(vg).connect(o.frequency);
      o.connect(f).connect(g).connect(out);
      o.start(t); o.stop(t + 0.3);
      vib.start(t); vib.stop(t + 0.3);
    }
  }
  wash(pos, strength = 1, dur = 2.2) {
    if (!this.running) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const out = this._out(pos, 0.55 * strength, 25, 0.25);
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.Q.value = 0.6;
    f.frequency.setValueAtTime(300, t);
    f.frequency.linearRampToValueAtTime(1800, t + dur * 0.35);
    f.frequency.linearRampToValueAtTime(500, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.7, t + dur * 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(out);
    s.start(t, Math.random());
    s.stop(t + dur + 0.1);
    // fizz of foam draining
    this._noiseBurst(out, t + dur * 0.3, dur * 0.7, 'highpass', 4000, 0.5, 0.12, 0.2);
  }
  bell(pitch, pos, vol = 1) {
    if (!this.running) return;
    const t = this.ctx.currentTime;
    const out = this._out(pos, 0.35 * vol, 14, 0.6);
    const partials = [[0.5, 0.5, 3.5], [1, 1, 3], [1.19, 0.45, 1.8], [1.56, 0.35, 1.4], [2.0, 0.3, 1.2], [2.51, 0.18, 0.8], [3.01, 0.1, 0.5]];
    for (const [m, a, d] of partials) this._tone(out, t, pitch * m, d * (pitch < 500 ? 1.3 : 1), 'sine', a * 0.5, 0.002);
    this._noiseBurst(out, t, 0.03, 'highpass', 3000, 0.5, 0.2, 0.001);
  }
  chime(pitch, pos, vol = 1) {
    if (!this.running) return;
    const t = this.ctx.currentTime;
    const out = this._out(pos, 0.25 * vol, 10, 0.6);
    this._tone(out, t, pitch, 1.6, 'sine', 0.4, 0.004);
    this._tone(out, t, pitch * 2, 0.8, 'sine', 0.12, 0.004);
    this._tone(out, t, pitch * 3.01, 0.4, 'sine', 0.05, 0.004);
  }
  thud(pos) {
    if (!this.running) return;
    const t = this.ctx.currentTime;
    const out = this._out(pos, 0.5, 12, 0.3);
    this._tone(out, t, 80, 0.5, 'sine', 0.6, 0.004, 45);
    this._noiseBurst(out, t, 0.25, 'lowpass', 300, 1, 0.3, 0.004);
  }
  grind(pos, dur = 0.9) {
    if (!this.running) return;
    const t = this.ctx.currentTime;
    const out = this._out(pos, 0.45, 12, 0.3);
    const f = this._noiseBurst(out, t, dur, 'bandpass', 180, 1.5, 0.5, 0.08, this.brown);
    f.frequency.linearRampToValueAtTime(120, t + dur);
    this._tone(out, t, 55, dur, 'sawtooth', 0.05, 0.1, 48);
    this._tone(out, t + dur - 0.05, 70, 0.3, 'sine', 0.4, 0.003, 40);
  }
  click(pos, pitch = 1) {
    if (!this.running) return;
    const t = this.ctx.currentTime;
    const out = this._out(pos, 0.3, 8, 0.1);
    this._noiseBurst(out, t, 0.03, 'bandpass', 2400 * pitch, 4, 0.5, 0.001);
    this._tone(out, t, 600 * pitch, 0.04, 'square', 0.05, 0.001);
  }
  whoosh(pos, vol = 1) {
    if (!this.running) return;
    const t = this.ctx.currentTime;
    const out = this._out(pos, 0.6 * vol, 20, 0.4);
    const f = this._noiseBurst(out, t, 1.4, 'bandpass', 300, 0.8, 0.7, 0.25);
    f.frequency.linearRampToValueAtTime(1600, t + 0.5);
    f.frequency.linearRampToValueAtTime(400, t + 1.4);
    this._tone(out, t, 60, 1.2, 'sine', 0.4, 0.2, 40);
  }
  // swelling chord when a beacon lights
  fanfare(index, pos) {
    if (!this.running) return;
    const t0 = this.ctx.currentTime;
    const out = this._out(null, 0.2, 1, 0.8);
    const roots = [220, 246.9, 261.6, 293.7, 329.6];
    const r = roots[index % 5];
    const chord = [1, 1.25, 1.5, 2, 2.5];
    chord.forEach((m, i) => {
      const t = t0 + i * 0.12;
      const o = this.ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = r * m;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.25, t + 0.6);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 4.5);
      o.connect(g).connect(out);
      o.start(t); o.stop(t + 4.6);
    });
  }
  success(pos) {
    if (!this.running) return;
    const t = this.ctx.currentTime;
    const out = this._out(pos, 0.3, 12, 0.6);
    [523.3, 659.3, 784, 1046.5].forEach((f, i) => this._tone(out, t + i * 0.09, f, 1.4, 'sine', 0.3, 0.004));
  }
  crackle(pos, vol) {
    if (!this.running) return;
    const t = this.ctx.currentTime;
    const out = this._out(pos, vol, 6, 0.1);
    this._noiseBurst(out, t, 0.02 + Math.random() * 0.03, 'highpass', 1500 + Math.random() * 3000, 1, 0.5, 0.001);
  }
  finaleMusic() {
    if (!this.running) return;
    const t0 = this.ctx.currentTime + 0.5;
    const out = this._out(null, 0.18, 1, 0.9);
    const prog = [[220, 277.2, 329.6], [196, 246.9, 293.7], [174.6, 220, 261.6], [196, 246.9, 329.6], [220, 277.2, 329.6, 440]];
    prog.forEach((ch, i) => {
      const t = t0 + i * 3.2;
      ch.forEach((f, j) => {
        this._tone(out, t + j * 0.05, f, 5, 'triangle', 0.2, 1.0);
        for (let k = 0; k < 4; k++) this._tone(out, t + k * 0.8 + j * 0.2, f * 2, 1.2, 'sine', 0.08, 0.01);
      });
    });
  }
  update(dt, env) {
    if (!this.running) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const swell = 0.5 + 0.5 * Math.sin(t * 0.55) * Math.sin(t * 0.23 + 1);
    const seaTarget = (0.12 + env.seaNear * 0.38) * (0.6 + swell * 0.6);
    this.sea.gain.gain.setTargetAtTime(seaTarget, t, 0.3);
    this.seaHiss.gain.gain.setTargetAtTime(0.015 + env.seaNear * 0.05 * swell, t, 0.3);
    this.wind.gain.gain.setTargetAtTime(0.015 + env.height * 0.0015 + env.night * 0.02, t, 0.5);
    this.wind.f.frequency.setTargetAtTime(380 + Math.sin(t * 0.3) * 120, t, 0.5);
    // hum
    this.hum.gain.setTargetAtTime(env.hum * (env.humSolved ? 0.5 : 0.28), t, 0.4);
    const tune = env.humSolved ? [110, 110, 165, 220, 275] : [110, 110.9, 164.2, 220.6, 277.9];
    this.humOsc.forEach((o, i) => o.frequency.setTargetAtTime(tune[i] * (1 + Math.sin(t * 0.7 + i) * 0.002), t, 0.8));
    // fire bed + crackles
    this.fireBed.gain.gain.setTargetAtTime(env.fire * 0.05, t, 0.3);
    if (env.fire > 0.02 && t > this._nextCrackle) {
      this._nextCrackle = t + 0.04 + Math.random() * 0.25 / (0.3 + env.fire);
      this.crackle(null, 0.15 * env.fire);
    }
  }
}
