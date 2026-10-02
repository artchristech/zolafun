// Procedural Web Audio: footsteps, sea, gulls, fire, stone hum and puzzle sounds.
export class Sound {
  constructor() {
    this.ctx = null;
    this.started = false;
    this.fires = [];
    this.hums = [];
    this.waves = [];
    this.gullTimer = 4;
    this.pending = [];
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      const c = this.ctx;
      this.master = c.createGain();
      this.master.gain.value = 0;
      this.master.connect(c.destination);
      this.sfx = c.createGain(); this.sfx.gain.value = 0.9; this.sfx.connect(this.master);
      this.amb = c.createGain(); this.amb.gain.value = 0.8; this.amb.connect(this.master);
      this.noise = this.makeNoise(2, 'white');
      this.brown = this.makeNoise(4, 'brown');
      this.crackle = this.makeCrackle(3);
      this.bed();
      for (const f of this.pending) f();
      this.pending = [];
    }
    if (this.ctx.state !== 'running') this.ctx.resume();
    if (!this.started) {
      this.started = true;
      const t = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setValueAtTime(0, t);
      this.master.gain.linearRampToValueAtTime(1, t + 2.5);
    }
  }

  get ok() { return this.ctx && this.ctx.state === 'running'; }

  setPaused(p) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(this.master.gain.value, t);
    this.master.gain.linearRampToValueAtTime(p ? 0.0001 : 1, t + 0.4);
  }

  makeNoise(sec, kind) {
    const c = this.ctx, n = Math.floor(c.sampleRate * sec);
    const buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
    }
    return buf;
  }
  makeCrackle(sec) {
    const c = this.ctx, n = Math.floor(c.sampleRate * sec);
    const buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) {
      last = (last + 0.03 * (Math.random() * 2 - 1)) / 1.03;
      d[i] = last * 2.0;
      if (Math.random() < 0.0009) {
        const len = 40 + Math.random() * 300, amp = 0.3 + Math.random() * 0.7;
        for (let k = 0; k < len && i + k < n; k++) d[i + k] += (Math.random() * 2 - 1) * amp * (1 - k / len);
      }
    }
    return buf;
  }

  panner(x, y, z, ref = 6, roll = 1.2) {
    const p = this.ctx.createPanner();
    p.panningModel = 'equalpower';
    p.distanceModel = 'inverse';
    p.refDistance = ref;
    p.maxDistance = 400;
    p.rolloffFactor = roll;
    if (p.positionX) { p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z; } else p.setPosition(x, y, z);
    return p;
  }

  listen(pos, fwd) {
    if (!this.ctx) return;
    const l = this.ctx.listener, t = this.ctx.currentTime;
    if (l.positionX) {
      l.positionX.setTargetAtTime(pos.x, t, 0.05); l.positionY.setTargetAtTime(pos.y, t, 0.05); l.positionZ.setTargetAtTime(pos.z, t, 0.05);
      l.forwardX.setTargetAtTime(fwd.x, t, 0.05); l.forwardY.setTargetAtTime(fwd.y, t, 0.05); l.forwardZ.setTargetAtTime(fwd.z, t, 0.05);
      l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0;
    } else { l.setPosition(pos.x, pos.y, pos.z); l.setOrientation(fwd.x, fwd.y, fwd.z, 0, 1, 0); }
  }

  // quiet non-positional sea bed under everything
  bed() {
    const c = this.ctx;
    const src = c.createBufferSource(); src.buffer = this.brown; src.loop = true;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420;
    const g = c.createGain(); g.gain.value = 0.12;
    src.connect(f).connect(g).connect(this.amb);
    src.start();
  }

  // a positional surf loop that swells and recedes
  addWave(x, z) {
    const run = () => {
      const c = this.ctx;
      const src = c.createBufferSource(); src.buffer = this.brown; src.loop = true;
      src.playbackRate.value = 0.8 + Math.random() * 0.4;
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
      const g = c.createGain(); g.gain.value = 0.0;
      const lfo = c.createOscillator(); lfo.frequency.value = 0.08 + Math.random() * 0.06;
      const lg = c.createGain(); lg.gain.value = 0.35;
      const base = c.createConstantSource(); base.offset.value = 0.4;
      lfo.connect(lg).connect(g.gain); base.connect(g.gain);
      const p = this.panner(x, 1, z, 8, 1.3);
      src.connect(f).connect(g).connect(p).connect(this.amb);
      src.start(c.currentTime + Math.random() * 2); lfo.start(); base.start();
      this.waves.push({ p });
    };
    if (this.ctx) run(); else this.pending.push(run);
  }

  // one wave washing over a surfacing causeway
  wash(x, z, strength = 1) {
    if (!this.ok) return;
    const c = this.ctx, t = c.currentTime;
    const src = c.createBufferSource(); src.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 0.7;
    f.frequency.setValueAtTime(400, t); f.frequency.linearRampToValueAtTime(1800, t + 1.0); f.frequency.linearRampToValueAtTime(300, t + 3.2);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.5 * strength, t + 0.8); g.gain.exponentialRampToValueAtTime(0.001, t + 3.4);
    const p = this.panner(x, 1, z, 10, 1.0);
    src.connect(f).connect(g).connect(p).connect(this.sfx);
    src.start(t); src.stop(t + 3.6);
  }

  addFire(x, y, z, big = false) {
    const make = () => {
      const c = this.ctx;
      const src = c.createBufferSource(); src.buffer = this.crackle; src.loop = true;
      src.playbackRate.value = 0.9 + Math.random() * 0.2;
      const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 180;
      const g = c.createGain(); g.gain.value = 0;
      const p = this.panner(x, y, z, big ? 14 : 5, 1.1);
      src.connect(hp).connect(g).connect(p).connect(this.amb);
      src.start();
      return g;
    };
    const f = { g: null, level: 0 };
    if (this.ctx) f.g = make(); else this.pending.push(() => { f.g = make(); f.g.gain.value = f.level * 0.9; });
    this.fires.push(f);
    return f;
  }
  setFire(f, level) {
    if (Math.abs(level - f.level) < 0.005 && f.sent) return;
    f.level = level;
    f.sent = !!f.g;
    if (f.g && this.ctx) f.g.gain.setTargetAtTime(level * 0.9, this.ctx.currentTime, 0.3);
  }

  addHum(x, y, z, ref = 3) {
    const h = { o1: null, o2: null, g: null, freq: 110, gain: 0 };
    const make = () => {
      const c = this.ctx;
      h.o1 = c.createOscillator(); h.o1.type = 'sine'; h.o1.frequency.value = h.freq;
      h.o2 = c.createOscillator(); h.o2.type = 'triangle'; h.o2.frequency.value = h.freq * 2;
      const g2 = c.createGain(); g2.gain.value = 0.18;
      h.g = c.createGain(); h.g.gain.value = h.gain;
      const p = this.panner(x, y, z, ref, 1.6);
      h.o1.connect(h.g); h.o2.connect(g2).connect(h.g);
      h.g.connect(p).connect(this.amb);
      h.o1.start(); h.o2.start();
    };
    if (this.ctx) make(); else this.pending.push(make);
    this.hums.push(h);
    return h;
  }
  setHum(h, freq, gain) {
    if (h.sent && Math.abs(h.freq - freq) < 0.01 && Math.abs(h.gain - gain) < 0.002) return;
    h.freq = freq; h.gain = gain;
    if (!h.g || !this.ctx) return;
    h.sent = true;
    const t = this.ctx.currentTime;
    h.o1.frequency.setTargetAtTime(freq, t, 0.15);
    h.o2.frequency.setTargetAtTime(freq * 2.003, t, 0.15);
    h.g.gain.setTargetAtTime(gain, t, 0.25);
  }

  step(surf, s = 1) {
    if (!this.ok) return;
    const c = this.ctx, t = c.currentTime;
    const src = c.createBufferSource(); src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = c.createBiquadFilter();
    const g = c.createGain();
    const v = (0.12 + 0.1 * s) * (0.85 + Math.random() * 0.3);
    let dur = 0.12;
    if (surf === 'sand') { f.type = 'lowpass'; f.frequency.value = 700; dur = 0.16; }
    else if (surf === 'grass') { f.type = 'bandpass'; f.frequency.value = 1400; f.Q.value = 0.6; dur = 0.13; }
    else if (surf === 'wood') {
      f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 2; dur = 0.08;
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(170 + Math.random() * 30, t); o.frequency.exponentialRampToValueAtTime(90, t + 0.12);
      const og = c.createGain(); og.gain.setValueAtTime(v * 1.4, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
      o.connect(og).connect(this.sfx); o.start(t); o.stop(t + 0.15);
    } else { f.type = 'highpass'; f.frequency.value = 2200; dur = 0.06; }
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(this.sfx);
    src.start(t, Math.random() * 1.5); src.stop(t + dur + 0.02);
  }

  gull(x, y, z) {
    if (!this.ok) return;
    const c = this.ctx;
    const p = this.panner(x, y, z, 10, 1.0);
    const n = 2 + Math.floor(Math.random() * 3);
    let t = c.currentTime;
    for (let i = 0; i < n; i++) {
      const o = c.createOscillator(); o.type = 'sawtooth';
      const f0 = 1300 + Math.random() * 300;
      o.frequency.setValueAtTime(f0 * 0.7, t); o.frequency.linearRampToValueAtTime(f0, t + 0.06); o.frequency.exponentialRampToValueAtTime(f0 * 0.62, t + 0.32);
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 3;
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.22, t + 0.04); g.gain.exponentialRampToValueAtTime(0.001, t + 0.34);
      o.connect(bp).connect(g).connect(p); o.start(t); o.stop(t + 0.36);
      t += 0.3 + Math.random() * 0.2;
    }
    p.connect(this.amb);
  }

  tone(freq, dur, vol = 0.3, type = 'sine', pos = null, partials = [1]) {
    if (!this.ok) return;
    const c = this.ctx, t = c.currentTime;
    const out = pos ? this.panner(pos.x, pos.y, pos.z, 6, 1) : null;
    if (out) out.connect(this.sfx);
    partials.forEach((m, i) => {
      const o = c.createOscillator(); o.type = type; o.frequency.value = freq * m;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol / (i + 1), t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0005, t + dur / (1 + i * 0.4));
      o.connect(g).connect(out || this.sfx); o.start(t); o.stop(t + dur + 0.05);
    });
  }

  bell(i, pos) { this.tone([523.25, 659.25, 783.99, 880, 1046.5][i % 5], 2.6, 0.28, 'sine', pos, [1, 2.76, 5.4]); }
  click(pos) { this.tone(900, 0.08, 0.2, 'square', pos); this.tone(300, 0.15, 0.25, 'triangle', pos); }
  clunk(pos) {
    if (!this.ok) return;
    this.tone(90, 0.5, 0.45, 'triangle', pos); this.tone(140, 0.25, 0.25, 'square', pos);
  }
  grind(pos, dur = 0.6) {
    if (!this.ok) return;
    const c = this.ctx, t = c.currentTime;
    const src = c.createBufferSource(); src.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 500; f.Q.value = 3;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.25, t + 0.05); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    const p = pos ? this.panner(pos.x, pos.y, pos.z, 5, 1) : null;
    src.connect(f).connect(g).connect(p || this.sfx); if (p) p.connect(this.sfx);
    src.start(t); src.stop(t + dur + 0.05);
  }
  wrong(pos) {
    if (!this.ok) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(); o.type = 'triangle';
    o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(70, t + 0.9);
    const g = c.createGain(); g.gain.setValueAtTime(0.3, t); g.gain.exponentialRampToValueAtTime(0.001, t + 1.0);
    const p = pos ? this.panner(pos.x, pos.y, pos.z, 6, 1) : null;
    o.connect(g).connect(p || this.sfx); if (p) p.connect(this.sfx);
    o.start(t); o.stop(t + 1.05);
  }
  solve(pos) {
    [0, 4, 7, 12].forEach((s, i) => setTimeout(() => this.tone(392 * Math.pow(2, s / 12), 1.8, 0.2, 'sine', pos, [1, 2]), i * 140));
  }
  ignite(pos, big = false) {
    if (!this.ok) return;
    const c = this.ctx, t = c.currentTime;
    const src = c.createBufferSource(); src.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = 'lowpass';
    f.frequency.setValueAtTime(200, t); f.frequency.exponentialRampToValueAtTime(big ? 2500 : 1600, t + 0.8);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(big ? 0.8 : 0.5, t + 0.5); g.gain.exponentialRampToValueAtTime(0.001, t + 2.4);
    const p = this.panner(pos.x, pos.y, pos.z, big ? 20 : 8, 1);
    src.connect(f).connect(g).connect(p).connect(this.sfx);
    src.start(t); src.stop(t + 2.5);
    this.tone(196, 3.5, 0.18, 'sine', null, [1, 1.5, 2]);
  }

  update(dt, listenerPos, paused) {
    if (!this.ok || paused) return;
    this.gullTimer -= dt;
    if (this.gullTimer <= 0) {
      this.gullTimer = 6 + Math.random() * 10;
      const a = Math.random() * Math.PI * 2, r = 18 + Math.random() * 30;
      this.gull(listenerPos.x + Math.cos(a) * r, listenerPos.y + 12 + Math.random() * 10, listenerPos.z + Math.sin(a) * r);
    }
  }
}
